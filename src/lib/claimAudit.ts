import type {
  AnswerClaim,
  ClaimEvidence,
  EvidenceConflict,
  EvidenceCorrection,
  EvidenceStatus,
  InterpretationFlag,
  Memory,
  SourceRef,
  TwinReply,
} from './types';
import { expandSynonyms } from './retrieval';

/**
 * Claim audit: verifies that every claim in a twin reply is actually supported by
 * the text of records retrieved for THIS request — not merely that cited IDs exist.
 *
 * A claim counts as "directly supported" only when its key terms overlap the
 * user-authored text (or title) of a supplied record. AI-generated interpretations
 * are never treated as user evidence and cannot back a supported claim.
 *
 * Two separate checks run per claim:
 *  A. Source validity (deterministic): the cited ID exists in the retrieved
 *     context, and every excerpt is verbatim from the stored record text.
 *  B. Claim support (deterministic): the claim's key terms overlap the record's
 *     user-authored text, the claim does not overreach into causality or
 *     personality traits on thin evidence, and it carries the correction or
 *     conflict when one exists for its records.
 */

const MIN_OVERLAP = 2;

const STOP_WORDS = new Set([
  'what', 'have', 'with', 'this', 'that', 'your', 'from', 'about', 'into', 'over',
  'does', 'were', 'when', 'these', 'those', 'there', 'their', 'which', 'would',
  'could', 'should', 'where', 'will', 'shall', 'been', 'being', 'more', 'most',
  'very', 'also', 'after', 'before', 'while', 'other', 'whether', 'recorded',
  'records', 'memory', 'evidence', 'twin', 'says', 'said', 'show', 'shows',
  'point', 'points', 'toward', 'against', 'between', 'states', 'stated', 'hold',
  'held', 'consistent', 'inconsistent', 'tension', 'conflict', 'conflicts',
  'conflicting', 'support', 'supports', 'rather', 'than', 'them', 'then',
  'because', 'since', 'based', 'downgrade', 'strong', 'weak', 'strength',
]);

/** Terms that identify the substantive content of a claim; pure numbers count too. */
export function claimTerms(claim: string): string[] {
  return claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => (t.length > 3 && !STOP_WORDS.has(t)) || /^\d+$/.test(t));
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

/**
 * Verbatim excerpt from a record's user-authored text, choosing the window with the
 * most claim-term occurrences. Falls back to the opening of the text when support
 * comes from the title alone (still verbatim, still the user's words).
 */
export function excerptFor(claim: string, memory: Memory, maxLen = 160): string | null {
  const text = memory.content;
  const lower = text.toLowerCase();
  const titleLower = memory.title.toLowerCase();
  const terms = claimTerms(claim);
  const inBody = terms.filter((t) => lower.includes(t));
  if (inBody.length === 0) {
    // Title-only support: fall back to the opening of the user's text.
    return titleTermsHit(terms, titleLower) ? text.slice(0, maxLen).trim() + (text.length > maxLen ? '…' : '') : null;
  }
  const bodyTerms = inBody;
  let bestIdx = 0;
  let bestHits = -1;
  const step = 20;
  for (let i = 0; i < lower.length; i += step) {
    const window = lower.slice(i, i + maxLen);
    let hits = 0;
    for (const t of bodyTerms) hits += countOccurrences(window, t);
    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = i;
    }
  }
  const start = Math.max(0, bestIdx - step);
  const end = Math.min(text.length, start + maxLen);
  const snippet = text.slice(start, end).trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + snippet + suffix;
}

function titleTermsHit(terms: string[], titleLower: string): boolean {
  return terms.some((t) => titleLower.includes(t));
}

/**
 * Records whose user-authored text actually overlaps the claim's key terms.
 * Multi-term claims need at least MIN_OVERLAP matching terms; short claims (1–2
 * terms) count as supported with a single hit to avoid false negatives.
 */
export function findSupportingRecords(claim: string, memories: Memory[]): Memory[] {
  const terms = claimTerms(claim);
  if (terms.length === 0) return [];
  const threshold = terms.length < MIN_OVERLAP ? 1 : MIN_OVERLAP;
  return memories.filter((m) => {
    const hay = `${m.title} ${m.content}`.toLowerCase();
    const hits = terms.filter((t) => hay.includes(t)).length;
    return hits >= threshold;
  });
}

/* ---------------- claim-support heuristics (deterministic) ---------------- */

/** Causal framing that turns correlation or a single event into an explanation. */
const CAUSAL_RE =
  /\b(because of this|caused by|leads? to|led to|that'?s why|which is why|made (you|me|him|her|them)|the reason (you|I|i) )\b/i;

/** Single-example leaps to stable traits or permanent characterizations. */
const TRAIT_RE =
  /\b(you are (a|an|always|someone who)|you'?re (a|an|always|someone who)|i am (a|an|always|someone who)|have always been|is a habit of yours|defines you|your personality)\b/i;

/** Absolute generalizations that thin evidence cannot establish. */
const ABSOLUTE_RE = /\b(always|never|every time|in every|without exception|constantly|each time)\b/i;

/** Psychological/clinical overreach: states or diagnoses the user's mind. */
const PSYCH_RE =
  /\b(you have (adhd|depression|anxiety|ocd|ptsd)|diagnos\w*|neurotic|avoidant attachment|self-?sabotag\w*|trauma response|your subconscious)\b/i;

/** Present-progressive identity/activity assertions a single past record can't establish. */
const PROGRESSIVE_RE = /\b(you are|i am|you're)\s+\w+ing\b/i;

/** True when the claim's wording outruns what thin evidence could establish. */
export function claimOverreaches(claim: string, evidenceCount: number): boolean {
  if (evidenceCount === 0) return false;
  if (PSYCH_RE.test(claim)) return true;
  if (TRAIT_RE.test(claim) && evidenceCount < 3) return true;
  if (CAUSAL_RE.test(claim) && evidenceCount < 3) return true;
  if (ABSOLUTE_RE.test(claim) && evidenceCount < 3) return true;
  if (PROGRESSIVE_RE.test(claim) && evidenceCount < 3) return true;
  return false;
}

/**
 * Guard against weak keyword matches: a question whose terms barely overlap a
 * single record (no title/tag hit and only one incidental body term) is treated
 * as unsupported. Uses the same synonym expansion as retrieval.
 */
export function isWeakMatch(question: string, memories: Memory[]): boolean {
  const terms = expandSynonyms(claimTerms(question));
  if (terms.length === 0) return true;
  for (const m of memories) {
    const titleWords = m.title.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    const tagText = (m.tags ?? []).join(' ').toLowerCase();
    const body = m.content.toLowerCase();
    const titleHit = terms.some((t) => titleWords.some((w) => w === t || w.startsWith(t)));
    const tagHit = terms.some((t) => tagText.includes(t));
    const bodyHits = terms.filter((t) => body.includes(t)).length;
    if (titleHit || bodyHits >= 2 || (tagHit && bodyHits >= 1)) return false;
  }
  return true;
}

const CONFLICT_DIMENSIONS: { label: string; forward: RegExp; reverse: RegExp }[] = [
  {
    label: 'one record states an obligation while the other records declining or opting out',
    forward: /\bobligat|\bduty\b|\bmust\b|\bsupposed to\b|\bhave to\b/i,
    reverse: /\bsaid no\b|\bdeclin|\bcancel|\bwalked away\b|\bnot obliged\b|\bchoose to\b/i,
  },
  {
    label: 'one records constant availability while the other records protecting personal time',
    forward: /\balways available\b|\bevery evening\b|\bnever say no\b/i,
    reverse: /\bevenings are\b|\bsaid no\b|\bboundar|\bwithout a laptop\b|\bno to\b/i,
  },
  {
    label: 'one frames money or status as the goal while the other records rejecting that framing',
    forward: /\bscoreboard\b|\bstatus\b|\bclimb\b|\btitle\b|\bsalary\b/i,
    reverse: /\bnot a scoreboard\b|\btool for freedom\b|\bsaid no\b|\bfirst time declining money\b/i,
  },
  {
    label: 'one records a habit holding while the other records the same habit lapsing',
    forward: /\bevery morning\b|\bstreak\b|\bmost nights\b|\btook hold\b/i,
    reverse: /\bfell out\b|\bzero mornings\b|\bskipped\b|\blapsed\b|\bold .{0,20}came back\b/i,
  },
];

function classifyConflict(a: Memory, b: Memory): string | null {
  const textA = `${a.title} ${a.content}`;
  const textB = `${b.title} ${b.content}`;
  for (const d of CONFLICT_DIMENSIONS) {
    if ((d.forward.test(textA) && d.reverse.test(textB)) ||
        (d.forward.test(textB) && d.reverse.test(textA))) {
      const newer = new Date(a.occurred_at) >= new Date(b.occurred_at) ? a : b;
      return `These records pull in opposite directions: ${d.label}. Note the dates — "${newer.title}" is more recent.`;
    }
  }
  return null;
}

function evidenceSide(m: Memory) {
  return {
    memoryId: m.id,
    title: m.title,
    occurred_at: m.occurred_at,
    excerpt: m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content,
  };
}

/**
 * Pair up records retrieved for one request whose text pulls in opposite
 * directions. Both sides are returned with dates; no winner is chosen.
 */
export function findConflictingPairs(memories: Memory[]): EvidenceConflict[] {
  const out: EvidenceConflict[] = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const reason = classifyConflict(memories[i], memories[j]);
      if (reason) out.push({ a: evidenceSide(memories[i]), b: evidenceSide(memories[j]), explanation: reason });
    }
  }
  return out.slice(0, 3);
}

/**
 * Audits a reply's claims against the retrieved records, running two distinct
 * checks:
 *
 * A. Source validity — a cited ID must exist in the retrieved context for this
 *    request (authorization and deletion are handled upstream by RLS and by the
 *    caller passing only records the user may see). An ID outside context
 *    becomes an unknown claim, never evidence.
 *
 * B. Claim support — the record's user-authored text must actually overlap the
 *    claim's key terms. The model's own "supported"/"direct" label is advisory
 *    only: here the audit decides. Overreach (causality, traits, psychological
 *    claims on thin evidence) and ignored conflicts downgrade the status.
 *
 * Every excerpt is re-derived verbatim from the stored record — a model-supplied
 * excerpt that does not match the record is replaced, never shown.
 *
 * Claims present on the reply are audited directly by their own text; when a
 * reply carries no claims (demo mode), each source becomes one audited claim
 * keyed on its record title.
 */
export function auditReply(reply: TwinReply, contextMemories: Memory[]): TwinReply {
  const claims: AnswerClaim[] = [];
  let claimCounter = 0;
  const nextId = () => `c${++claimCounter}`;

  const auditedSources: SourceRef[] = [];
  const seenSources = new Set<string>();
  for (const s of reply.sources) {
    if (seenSources.has(s.memoryId)) continue;
    seenSources.add(s.memoryId);
    auditedSources.push(s);
  }

  const ctxIds = new Set(contextMemories.map((m) => m.id));
  const hasModelClaims = Array.isArray(reply.claims) && reply.claims.length > 0;

  const auditOne = (
    rawText: string,
    modelEvidence: Array<{ memoryId: string; excerpt?: string; relation?: string }>,
    fallbackTitle?: string
  ): AnswerClaim => {
    const id = nextId();
    // A fabricated quote inside the claim text is stripped up front — never
    // shown attached to a genuine source, whether or not evidence verifies.
    const contextCorpus = contextMemories.map((m) => `${m.title} ${m.content}`);
    const badQuotes = findUnverifiedQuotes(rawText, contextCorpus);
    let text = rawText;
    let fabricatedQuote = false;
    for (const q of badQuotes) {
      text = text.split(`“${q}”`).join('[unverified quote removed]').split(`"${q}"`).join('[unverified quote removed]');
      fabricatedQuote = true;
    }

    // A. source validity: every cited record must be in this request's context.
    const validEvidence = modelEvidence.filter((e) => ctxIds.has(e.memoryId));
    const outOfContext = modelEvidence.length - validEvidence.length;

    if (validEvidence.length === 0 && modelEvidence.length > 0) {
      // Cited something, but none of it was supplied for this request.
      return {
        claimId: id,
        claim: text,
        type: 'unknown',
        evidenceStatus: 'insufficient',
        uncertainty: 'The cited record(s) could not be retrieved for this question, so nothing about them is asserted.',
        evidence: [],
      };
    }

    // B. claim support: does the record's user text actually overlap the claim?
    const evidence: ClaimEvidence[] = [];
    for (const e of validEvidence) {
      const mem = contextMemories.find((m) => m.id === e.memoryId)!;
      const supporting = findSupportingRecords(text, [mem]);
      const supported = supporting.length > 0 || (fallbackTitle === mem.title && findSupportingRecords(fallbackTitle, [mem]).length > 0);
      // Re-derive the excerpt from the record itself; never show model text.
      const excerpt = supported ? excerptFor(text, mem) ?? excerptFor(fallbackTitle ?? text, mem) : null;
      if (supported && excerpt) {
        evidence.push({ memoryId: mem.id, title: mem.title, excerpt, relation: e.relation });
      }
    }

    if (evidence.length === 0) {
      return {
        claimId: id,
        claim: text,
        type: 'interpretation',
        evidenceStatus: 'insufficient',
        uncertainty: fabricatedQuote
          ? 'The claim contained a quote that appears in no record — the quote was removed and no record text supports the rest.'
          : 'No record text overlaps this statement, so it is treated as interpretation, not fact.',
        evidence: [],
      };
    }

    let type: AnswerClaim['type'] = 'directly_supported';
    let evidenceStatus: EvidenceStatus = 'direct';
    let uncertainty: string | undefined;
    let basis: string | undefined;

    if (fabricatedQuote) {
      type = 'interpretation';
      evidenceStatus = 'partial';
      uncertainty = 'The claim contained a quote that appears in no record — the quote was removed and the claim downgraded.';
      basis = 'Fabricated quotation detected during audit.';
      return { claimId: id, claim: text, type, evidenceStatus, uncertainty, basis, evidence };
    }

    const conflictingPair = conflictsForMemories(evidence.map((e) => e.memoryId), contextMemories);
    if (conflictingPair) {
      type = 'conflicting_evidence';
      evidenceStatus = 'conflicting';
      uncertainty = 'Records retrieved for this question pull in opposite directions — both are shown without a winner.';
      basis = conflictingPair.explanation;
    } else if (claimOverreaches(text, evidence.length)) {
      type = 'interpretation';
      evidenceStatus = 'partial';
      uncertainty = 'The evidence records related events, but they do not by themselves establish this as fact — treated as interpretation.';
      basis = 'Claim language suggests causality, a diagnosis, or a stable trait; the records only show what happened.';
    } else if (evidence.length < modelEvidence.length - outOfContext || outOfContext > 0) {
      evidenceStatus = 'partial';
      uncertainty = 'Some cited records could not be verified against their text for this claim.';
    }

    return { claimId: id, claim: text, type, evidenceStatus, uncertainty, basis, evidence };
  };

  if (hasModelClaims) {
    for (const mc of reply.claims!) {
      if (!mc.claim.trim()) continue;
      claims.push(auditOne(mc.claim, mc.evidence ?? []));
    }
  } else {
    for (const s of auditedSources) {
      const mem = contextMemories.find((m) => m.id === s.memoryId);
      if (!mem) {
        claims.push({
          claimId: nextId(),
          claim: `Cited a record ("${s.title}") that was not supplied in the retrieved context for this question.`,
          type: 'unknown',
          evidenceStatus: 'insufficient',
          uncertainty: 'The cited record could not be retrieved for this question, so nothing about it is asserted.',
          evidence: [],
        });
        continue;
      }
      claims.push(auditOne(s.title, [{ memoryId: s.memoryId }], s.title));
    }
  }

  // Sources stay only when the audit verified them against record text.
  const verifiedIds = new Set(
    claims.filter((c) => c.type === 'directly_supported' || c.type === 'conflicting_evidence')
      .flatMap((c) => c.evidence.map((e) => e.memoryId))
  );
  const verifiedSources = auditedSources.filter((s) => verifiedIds.has(s.memoryId));

  return { ...reply, sources: verifiedSources, claims };
}

/**
 * Conflict check for a claim's evidence: a claim is conflicting when ANY of its
 * cited records has a conflicting counterpart in the retrieved context — even
 * if the counterpart's text did not support the claim itself. Counterevidence
 * must not be silently omitted.
 */
function conflictsForMemories(ids: string[], contextMemories: Memory[]): EvidenceConflict | null {
  for (const id of ids) {
    const anchor = contextMemories.find((m) => m.id === id);
    if (!anchor) continue;
    for (const other of contextMemories) {
      if (other.id === anchor.id) continue;
      const reason = classifyConflict(anchor, other);
      if (reason) return { a: evidenceSide(anchor), b: evidenceSide(other), explanation: reason };
    }
  }
  return null;
}


/** Merge conflicts detected in the retrieved context into the reply. */
export function withConflicts(reply: TwinReply, contextMemories: Memory[]): TwinReply {
  const conflicts = findConflictingPairs(contextMemories);
  return conflicts.length > 0 ? { ...reply, conflicts } : reply;
}

/* ---------------- user corrections (side-by-side, never overwriting) ---------------- */

/**
 * Attach saved user corrections to a reply: relevant corrections are shown
 * beside the records they amend (both sides, no winner picked), and claims
 * resting on a corrected record carry the correction as provenance.
 */
export function withCorrections(
  reply: TwinReply,
  contextMemories: Memory[],
  flags: InterpretationFlag[]
): TwinReply {
  const ctxIds = new Set(contextMemories.map((m) => m.id));
  const relevant = flags.filter((f) => ctxIds.has(f.memory_id) && f.correction_note?.trim());
  if (relevant.length === 0) return reply;

  const memById = new Map(contextMemories.map((m) => [m.id, m]));
  const corrections: EvidenceCorrection[] = relevant.map((f) => ({
    memoryId: f.memory_id,
    memoryTitle: memById.get(f.memory_id)?.title ?? 'Record',
    correction: f.correction_note.trim(),
    recordedAt: f.created_at,
  }));

  const claims = reply.claims?.map((c) => {
    const claimFlags = relevant.filter((f) => c.evidence.some((e) => e.memoryId === f.memory_id));
    if (claimFlags.length === 0) return c;
    return {
      ...c,
      corrections: claimFlags,
      evidenceStatus: 'partial' as EvidenceStatus,
      basis: c.basis ?? 'A later correction from you qualifies this record — see the note beside it.',
    };
  });

  return { ...reply, corrections, claims: claims ?? reply.claims };
}

/* ---------------- invented quote / date rejection ---------------- */

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUOTE_RE = /[“«]([^“«»]{8,400})[”»]|"([^"]{8,400})"/g;

/** Quoted passages in `text` that appear verbatim in none of the corpus strings. */
export function findUnverifiedQuotes(text: string, corpus: string[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(QUOTE_RE)) {
    const quote = m[1] ?? m[2];
    if (!quote) continue;
    const n = normalizeForMatch(quote).replace(/[.,!?;:]$/, '');
    if (n.length < 8) continue;
    if (!corpus.some((c) => normalizeForMatch(c).includes(n))) out.push(quote);
  }
  return out;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const DATE_RE =
  /\b(\d{4})-(\d{2})-(\d{2})\b|\b(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

interface FoundDate {
  text: string;
  iso?: string;
  month?: number;
  day?: number;
}

function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    if (m[1]) {
      out.push({ text: m[0], iso: m[1] });
    } else if (m[4]) {
      const month = MONTH_NAMES[m[4].toLowerCase()];
      const day = parseInt(m[5], 10);
      if (month && day >= 1 && day <= 31) out.push({ text: m[0], month, day });
    }
  }
  return out;
}

/**
 * Dates in `text` that no record supports: not the date of a retrieved record,
 * and not written anywhere in the user-authored corpus.
 */
export function findUnverifiedDates(text: string, memories: Memory[], corpus: string[]): string[] {
  const corpusNorm = corpus.map(normalizeForMatch).join('\n');
  const isoDates = new Set(memories.map((m) => m.occurred_at.slice(0, 10)));
  return findDates(text)
    .filter((d) => {
      if (d.iso) return !isoDates.has(d.iso) && !corpusNorm.includes(d.iso);
      if (d.month === undefined || d.day === undefined) return true;
      const dayMatch = memories.some((m) => {
        const dt = new Date(m.occurred_at);
        return dt.getMonth() + 1 === d.month && dt.getDate() === d.day;
      });
      if (dayMatch) return false;
      const names = Object.keys(MONTH_NAMES).filter((k) => MONTH_NAMES[k] === d.month);
      return !names.some((n) => corpusNorm.includes(`${n} ${d.day}`));
    })
    .map((d) => d.text);
}

/**
 * Remove invented quotes and dates from a reply's answer text and declare the
 * removal as a gap. Anything the records do not verbatim contain is rejected,
 * not shown as evidence. Citation IDs were already validated upstream; this
 * guards the words and dates themselves.
 */
export function rejectInventedContent(
  reply: TwinReply,
  contextMemories: Memory[],
  extraUserText: string[] = []
): TwinReply {
  const corpus = [...contextMemories.map((m) => `${m.title} ${m.content}`), ...extraUserText];
  let answer = reply.answer;
  const removed: string[] = [];

  const badQuotes = findUnverifiedQuotes(answer, corpus);
  for (const q of badQuotes) {
    answer = answer.split(`“${q}”`).join('[unverified quote removed]');
    answer = answer.split(`"${q}"`).join('[unverified quote removed]');
  }
  if (badQuotes.length > 0) {
    removed.push(
      `${badQuotes.length} quoted passage${badQuotes.length === 1 ? '' : 's'} that appear${badQuotes.length === 1 ? 's' : ''} in no record`
    );
  }

  const badDates = findUnverifiedDates(answer, contextMemories, corpus);
  for (const d of badDates) answer = answer.split(d).join('[unverified date removed]');
  if (badDates.length > 0) {
    removed.push(`${badDates.length} date${badDates.length === 1 ? '' : 's'} the records do not support`);
  }

  if (removed.length === 0) return reply;
  return {
    ...reply,
    answer,
    gaps: Array.from(new Set([...reply.gaps, `Removed ${removed.join(' and ')} — they were not found in your records, so they are not shown as evidence.`])),
  };
}

/* ---------------- explicit uncertainty for sparse / stale / irrelevant retrieval ---------------- */

/**
 * Declare uncertainty when the evidence base is thin: no matches, very few
 * matches, only old records, or matches that share mere incidental keywords
 * with the question.
 */
export function withUncertainty(reply: TwinReply, question: string, contextMemories: Memory[]): TwinReply {
  const gaps = new Set(reply.gaps);
  if (contextMemories.length === 0) {
    gaps.add('No records matched this question at all — the topic may simply not be recorded.');
  } else {
    if (contextMemories.length === 1) {
      gaps.add('Only one record matched — the evidence base for this answer is thin.');
    }
    const newest = contextMemories
      .map((m) => new Date(m.occurred_at).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    const ageDays = (Date.now() - newest) / 86_400_000;
    if (ageDays > 180) {
      gaps.add(
        `The most recent matching record is about ${Math.round(ageDays / 30)} months old — your thinking may have moved on since.`
      );
    }
    if (isWeakMatch(question, contextMemories)) {
      gaps.add('The matching records share only incidental keywords with the question — they may not actually answer it.');
    }
  }
  return { ...reply, gaps: Array.from(gaps) };
}
