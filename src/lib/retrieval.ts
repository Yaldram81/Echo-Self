import type { Belief, InterpretationFlag, Memory } from './types';

export interface EvidenceCandidate {
  memory: Memory;
  relevance: number;
  recency: number;
  score: number;
}

export interface ConflictPair {
  belief: Belief;
  memories: Memory[];
}

const STOP_WORDS = new Set([
  'what', 'have', 'with', 'this', 'that', 'your', 'from', 'about', 'into', 'over',
  'does', 'were', 'them', 'then', 'than', 'when', 'which', 'there', 'their',
  'would', 'could', 'should', 'where', 'seem', 'seems', 'think', 'thinking',
  'mine', 'myself', 'been', 'being', 'some', 'more', 'most', 'also', 'very',
  'did', 'the', 'and', 'for', 'last', 'week', 'someone', 'get', 'how', 'who',
  'am', 'was', 'are', 'our', 'out', 'all', 'any', 'not', 'but', 'yet', 'ago',
]);

export function extractTerms(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/** Invalid or missing dates must never look like the most recent records. */
function timestampOf(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function recencyFactor(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageDays = Math.max(0, (Date.now() - t) / 86_400_000);
  return Math.max(0, 1 - ageDays / 365);
}

/** Lightweight paraphrase bridging: question terms expanded to record vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  pet: ['dog', 'cat', 'adopt'],
  wind: ['reading', 'bed', 'sleep'],
  evening: ['night', 'bed'],
  workout: ['gym', 'running'],
  exercise: ['running', 'gym'],
  exercises: ['running', 'gym'],
  consistent: ['routine', 'habit', 'streak'],
  consistently: ['routine', 'habit', 'streak'],
  subscription: ['membership'],
  negotiate: ['salary', 'counter'],
  raise: ['salary', 'counter'],
  finance: ['money'],
};

export function expandSynonyms(terms: string[]): string[] {
  const out = [...terms];
  for (const t of terms) {
    for (const syn of SYNONYMS[t] ?? []) {
      if (!out.includes(syn)) out.push(syn);
    }
  }
  return out;
}

/* ============================ query intent ============================ */

export type RetrievalIntent =
  | 'current_state'
  | 'historical_period'
  | 'repeated_pattern'
  | 'decision_rationale'
  | 'belief_value'
  | 'contradiction_change'
  | 'general';

interface IntentRule {
  intent: RetrievalIntent;
  re: RegExp;
  weight: number;
}

/**
 * Intent rules are deliberately conservative: a single weak keyword match must
 * not force an intent. Weight 1 patterns are hints, weight 2–3 are strong
 * signals. When the best score is below MIN_INTENT_SCORE the query falls back
 * to 'general' — the previous behavior.
 */
const INTENT_RULES: IntentRule[] = [
  { intent: 'current_state', weight: 3, re: /\b(currently|right now|these days|at the moment|where do i stand|how am i doing|what do i (currently|now)\b|like now|so far)\b/i },
  { intent: 'historical_period', weight: 3, re: /\b(when did|what happened|back (then|in)|in (january|…|20\d\d)|\b20\d\d\b|last (year|month|week|decade)|past (year|month|week|decade)|used to be)\b/i },
  { intent: 'repeated_pattern', weight: 2, re: /\b(pattern|repeatedly|often|usually|habit|consisten\w*|tend to|frequently|keep (up|doing)|every time)\b/i },
  { intent: 'decision_rationale', weight: 2, re: /\b(why did i|what made me|chose|choosing|decided|decision|rationale|trade.?off|reasons? (for|behind))\b/i },
  { intent: 'belief_value', weight: 2, re: /\b(believe|belief|beliefs|value[sd]?|principle|stand for|matter[s]? most|important to me|core values?)\b/i },
  { intent: 'contradiction_change', weight: 2, re: /\b(conflict|contradict\w*|disagree|inconsisten\w*|changed|shift\w*|evolv\w*|over time|no longer|still)\b/i },
];

const MIN_INTENT_SCORE = 2;

export interface DetectedIntent {
  intent: RetrievalIntent;
  confidence: number;
  /** Which rule patterns fired, for explainability. */
  matched: string[];
}

export function detectIntent(question: string): DetectedIntent {
  const scores = new Map<RetrievalIntent, { score: number; matched: string[] }>();
  for (const rule of INTENT_RULES) {
    const matches = Array.from(question.matchAll(new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`)));
    if (matches.length === 0) continue;
    const cur = scores.get(rule.intent) ?? { score: 0, matched: [] };
    cur.score += rule.weight * matches.length;
    for (const m of matches) cur.matched.push(m[0].toLowerCase());
    scores.set(rule.intent, cur);
  }
  let best: { intent: RetrievalIntent; score: number; matched: string[] } | null = null;
  for (const [intent, v] of scores) {
    if (!best || v.score > best.score) best = { intent, score: v.score, matched: v.matched };
  }
  if (!best || best.score < MIN_INTENT_SCORE) {
    return { intent: 'general', confidence: 0.25, matched: best?.matched ?? [] };
  }
  return { intent: best.intent, confidence: Math.min(1, best.score / 3), matched: best.matched };
}

/* ======================= query period extraction ======================= */

export interface QueryPeriod {
  label: string;
  startMs: number;
  endMs: number;
}

const DAY = 86_400_000;

/** Extracts an explicit time window from the question, if one is stated. */
export function parseQueryPeriod(question: string, now = Date.now()): QueryPeriod | null {
  const q = question.toLowerCase();
  const unitDays: Record<string, number> = { day: 1, days: 1, week: 7, weeks: 7, month: 31, months: 31, year: 365, years: 365 };

  let m = q.match(/\b(?:last|past)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/);
  if (m) {
    const days = parseInt(m[1], 10) * unitDays[m[2]];
    return { label: `the ${m[1]} ${m[2].replace(/s$/, '')}s before now`.replace('s before now', 's').replace(/ss$/, 's'), startMs: now - days * DAY, endMs: now };
  }
  m = q.match(/\b(?:last|past)\s+(week|month|year|decade)\b/);
  if (m) {
    const days = unitDays[`${m[1]}s`] ?? (m[1] === 'decade' ? 3650 : 30);
    return { label: `the last ${m[1]}`, startMs: now - days * DAY, endMs: now };
  }
  m = q.match(/\bin\s+(20\d\d)\b/) ?? q.match(/\b(20\d\d)\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    return { label: String(year), startMs: new Date(Date.UTC(year, 0, 1)).getTime(), endMs: new Date(Date.UTC(year + 1, 0, 1)).getTime() };
  }
  if (/\bthis year\b/.test(q)) {
    const d = new Date(now);
    return { label: 'this year', startMs: new Date(d.getFullYear(), 0, 1).getTime(), endMs: now };
  }
  return null;
}

/* ========================== ranking weights ========================== */

export interface RetrievalWeights {
  /** Field weights for token hits (title > tag > body > category). */
  title: number;
  tag: number;
  body: number;
  category: number;
  /** Bonus for an exact multi-word phrase from the question appearing in text. */
  phrase: number;
  /** Multiplier range for query-dependent recency: score × (1 + recency × w). */
  recency: number;
  /** Reliability multiplier range from record confidence: 0.7 + trust × 0.3. */
  confidenceFloor: number;
  confidenceSpan: number;
  /** Additive boost when a saved user correction on the record matches. */
  correction: number;
}

/**
 * One configurable place for every ranking weight. No hidden bonuses: the
 * weights are exported, documented, and overridable per call. A record's
 * confidence is a reliability signal only — it never substitutes for
 * user-assigned importance (no such field exists yet).
 */
export const DEFAULT_WEIGHTS: RetrievalWeights = {
  title: 4,
  tag: 3,
  body: 2,
  category: 1,
  phrase: 6,
  recency: 0.4,
  confidenceFloor: 0.7,
  confidenceSpan: 0.3,
  correction: 2,
};

/* ====================== per-candidate explanation ====================== */

export interface CandidateSignals {
  titleHits: string[];
  tagHits: string[];
  categoryHits: string[];
  bodyHits: string[];
  /** Expanded synonym terms that matched — wording the record itself uses. */
  synonymHits: string[];
  /** A multi-word phrase from the question appears in the record text. */
  phraseMatch: boolean;
  /** A saved user correction on this record shares terms with the question. */
  correctionMatch: boolean;
  /** Match came only through weak or incidental overlap. */
  incidentalOnly: boolean;
}

export interface ScoredCandidate {
  memory: Memory;
  rank: number;
  /** Keyword/phrase strength only — how strongly the record matches the words. */
  relevance: number;
  /** Query-dependent temporal factor (0 when the query is time-agnostic). */
  recency: number;
  /**
   * Final ranking score. This is a RELEVANCE score — how well the record
   * matches the question. It is not the factual confidence of the record
   * (memory.confidence) and not a probability that the record is true.
   */
  score: number;
  signals: CandidateSignals;
  /** Concise plain-language reason this record was selected. */
  reason: string;
  /** When deduplicated: the id of the stronger near-duplicate kept in the list. */
  isNearDuplicateOf?: string;
}

export interface RetrievalResult {
  intent: DetectedIntent;
  /** Explicit time window parsed from the question, when present. */
  period: QueryPeriod | null;
  candidates: ScoredCandidate[];
  /**
   * Opposing records among the candidates, for pattern/preference/decision
   * questions. Empty when the intent gives no reason to look for counterevidence.
   */
  counterevidence: ScoredCandidate[];
}

/* ============================ scoring core ============================ */

function questionPhrases(question: string): string[] {
  // Consecutive non-stopword bigrams/trigrams from the original wording.
  const raw = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const bigram = `${raw[i]} ${raw[i + 1]}`;
    if (STOP_WORDS.has(raw[i]) || STOP_WORDS.has(raw[i + 1])) continue;
    out.push(bigram);
    if (i < raw.length - 2 && !STOP_WORDS.has(raw[i + 2])) out.push(`${bigram} ${raw[i + 2]}`);
  }
  return out;
}

interface ScoreInput {
  memory: Memory;
  question: string;
  terms: string[];
  originalTerms: string[];
  phrases: string[];
  weights: RetrievalWeights;
  intent: DetectedIntent;
  period: QueryPeriod | null;
  corrections: InterpretationFlag[];
}

function temporalFactor(input: Pick<ScoreInput, 'period' | 'memory'> & { intent: DetectedIntent }): { recency: number; note: string | null } {
  const { intent, period, memory } = input;
  if (intent.intent === 'historical_period' && period) {
    const t = timestampOf(memory.occurred_at);
    const inPeriod = Number.isFinite(t) && t >= period.startMs && t <= period.endMs;
    return { recency: inPeriod ? 1 : 0.1, note: inPeriod ? `within ${period.label}` : `outside ${period.label}` };
  }
  if (intent.intent === 'belief_value') {
    // Timeless: an explicit old statement of a value must not lose to a recent
    // incidental mention. No recency preference either way.
    return { recency: 0, note: 'timeless query — recency not applied' };
  }
  const r = recencyFactor(memory.occurred_at);
  const note = intent.intent === 'current_state' ? 'current-state query favors recent records' : null;
  return { recency: r, note };
}

function scoreCandidate(input: ScoreInput): ScoredCandidate {
  const { memory, terms, originalTerms, phrases, weights, corrections } = input;
  const title = memory.title.toLowerCase();
  const body = memory.content.toLowerCase();
  const tagText = (memory.tags ?? []).join(' ').toLowerCase();
  const category = memory.category.toLowerCase();

  // Only CONFIRMED corrections rank as user text; proposed/superseded/dismissed
  // stay history and never move a score.
  const notes = corrections
    .filter((f) => f.memory_id === memory.id && f.status === 'confirmed' && f.correction_note?.trim())
    .map((f) => f.correction_note.trim());
  const correctedBody = notes.length > 0 ? `${body} ${notes.join(' ').toLowerCase()}` : body;

  const inTitle = terms.filter((t) => title.includes(t));
  const inTags = terms.filter((t) => tagText.includes(t));
  const inCategory = terms.filter((t) => category.includes(t));
  const inBody = terms.filter((t) => correctedBody.includes(t));
  const synonymHits = originalTerms.length > 0
    ? terms.filter((t) => !originalTerms.includes(t) && (title.includes(t) || correctedBody.includes(t)))
    : [];

  let relevance =
    inTitle.length * weights.title +
    inTags.length * weights.tag +
    inCategory.length * weights.category +
    inBody.length * weights.body;

  const phraseMatch = phrases.some((p) => correctedBody.includes(p) || title.includes(p));
  if (phraseMatch) relevance += weights.phrase;

  const correctionMatch = notes.length > 0 && terms.some((t) => notes.join(' ').toLowerCase().includes(t));
  if (correctionMatch) relevance += weights.correction;

  const { recency, note: timeNote } = temporalFactor(input);
  const trust = memory.confidence / 100;
  const score = relevance * (1 + recency * weights.recency) * (weights.confidenceFloor + trust * weights.confidenceSpan);

  // Incidental: matched only generic body words, no title/tag/category anchor.
  const incidentalOnly = inTitle.length === 0 && inTags.length === 0 && inCategory.length === 0 && inBody.length <= 1;

  const matchedFields = [
    inTitle.length > 0 ? `title (${inTitle.slice(0, 3).join(', ')})` : null,
    inTags.length > 0 ? `tags (${inTags.slice(0, 3).join(', ')})` : null,
    inCategory.length > 0 ? `category (${inCategory.slice(0, 2).join(', ')})` : null,
    inBody.length > 0 ? `text (${inBody.slice(0, 3).join(', ')})` : null,
  ].filter(Boolean);

  const reasonParts = [
    `matched ${matchedFields.join(', ') || 'nothing'}`,
    phraseMatch ? 'contains an exact phrase from your question' : null,
    synonymHits.length > 0 ? `reached via related wording (${synonymHits.slice(0, 3).join(', ')})` : null,
    correctionMatch ? 'carries your saved correction on this topic' : null,
    timeNote,
    incidentalOnly ? 'weak/incidental overlap — treat with caution' : null,
  ].filter(Boolean);

  return {
    memory,
    rank: 0,
    relevance,
    recency,
    score,
    signals: { titleHits: inTitle, tagHits: inTags, categoryHits: inCategory, bodyHits: inBody, synonymHits, phraseMatch, correctionMatch, incidentalOnly },
    reason: `${reasonParts.join('; ')}. Relevance ${relevance} → ranking score ${score.toFixed(2)} (relevance only — record confidence ${memory.confidence}/100 is a separate reliability field).`,
    isNearDuplicateOf: undefined,
  };
}

/* ============================ correction scoping ============================ */

/**
 * Corrections that may act as authoritative user context: status 'confirmed'
 * with non-empty note text. Proposed, superseded, and dismissed corrections
 * are history — they never influence retrieval, ranking, or answers.
 */
export function activeCorrections(flags: InterpretationFlag[]): InterpretationFlag[] {
  return flags.filter((f) => f.status === 'confirmed' && !!f.correction_note?.trim());
}

/**
 * Topic check: does a correction bear on this question? A correction counts as
 * relevant when the question's terms (or an exact question phrase) appear in
 * the correction's note or its user-supplied topic tag. This keeps a
 * correction about one event from being applied to unrelated topics; the
 * record-level relevance gate (the memory must itself be retrieved) still
 * applies on top.
 */
export function correctionTouchesTopic(
  flag: InterpretationFlag,
  terms: string[],
  phrases: string[]
): boolean {
  const hay = `${flag.correction_note} ${flag.topic ?? ''}`.toLowerCase();
  return phrases.some((p) => hay.includes(p)) || terms.some((t) => hay.includes(t));
}

function tokensOf(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

const DUPLICATE_CONTENT_THRESHOLD = 0.75;

/**
 * Marks near-duplicate records: same normalized title, or content-token
 * Jaccard ≥ 0.75 against an already-kept candidate. The higher-scored record
 * is kept; the duplicate stays in the result flagged, not deleted — the
 * original records are never altered.
 */
function markNearDuplicates(candidates: ScoredCandidate[]): void {
  const kept: ScoredCandidate[] = [];
  const keptTitles = new Set<string>();
  for (const c of candidates) {
    const title = c.memory.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const dupOf = kept.find((k) => {
      if (k.memory.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim() === title) return true;
      return jaccard(tokensOf(k.memory.content), tokensOf(c.memory.content)) >= DUPLICATE_CONTENT_THRESHOLD;
    });
    if (dupOf) {
      c.isNearDuplicateOf = dupOf.memory.id;
    } else {
      kept.push(c);
      keptTitles.add(title);
    }
  }
}

/* =========================== counterevidence =========================== */

/**
 * Material opposition signals. Different wording alone never counts: a record
 * is opposing only when it carries negation/lapse/opt-out language, or the
 * user's own saved correction contradicts the frame.
 */
const OPPOSING_RE = /\b(not|never|no longer|stopped|quit|gave up|fell out|skipped|lapsed|cancelled|canceled|declined|said no|turned down|avoided|regret|dread|fail(?:ed|ure|ing)?|zero)\b/i;
const HOLDING_RE = /\b(every (day|morning|week)|streak|kept up|consistent|on track|resumed|back to|held|maintained|still (going|doing))\b/i;

const COUNTEREVIDENCE_INTENTS: RetrievalIntent[] = [
  'repeated_pattern',
  'decision_rationale',
  'belief_value',
  'contradiction_change',
];

/**
 * Among the already-relevant candidates, find records that materially oppose
 * the question's frame — for pattern, preference, decision, and change
 * questions. A negatively framed question ("did I fail…") flips the polarity
 * and surfaces records showing the habit holding. `supplement` supplies
 * additional corpus records (not keyword-relevant enough to rank) that are
 * still scanned when they share a category with the top candidates — opposing
 * evidence often uses different words from the question. Returns at most
 * `limit`, strongest first. Corrections count as the user's own
 * counter-statement.
 */
export function retrieveCounterevidence(
  question: string,
  candidates: ScoredCandidate[],
  flags: InterpretationFlag[] = [],
  limit = 3,
  supplement: Memory[] = []
): ScoredCandidate[] {
  const negativeFramed = OPPOSING_RE.test(question);
  const opposite = negativeFramed ? HOLDING_RE : OPPOSING_RE;
  const out: ScoredCandidate[] = [];
  const seen = new Set(candidates.map((c) => c.memory.id));
  const scan = (c: ScoredCandidate, via: string) => {
    const text = `${c.memory.title} ${c.memory.content}`;
    const notes = flags
      .filter((f) => f.memory_id === c.memory.id && f.status === 'confirmed' && f.correction_note?.trim())
      .map((f) => f.correction_note.trim());
    const correctionOpposes = notes.length > 0 && opposite.test(notes.join(' '));
    if (opposite.test(text) || correctionOpposes) {
      const how = opposite.test(text) ? via : 'your saved correction on this record pulls against the question’s frame';
      out.push({ ...c, reason: `Counterevidence: ${how}. ${c.reason}` });
    }
  };
  for (const c of candidates) {
    if (c.isNearDuplicateOf) continue;
    scan(c, 'recorded language pulls against the question’s frame');
  }
  for (const m of supplement) {
    if (seen.has(m.id)) continue;
    scan(
      {
        memory: m,
        rank: 0,
        relevance: 0,
        recency: recencyFactor(m.occurred_at),
        score: 0,
        signals: { titleHits: [], tagHits: [], categoryHits: [], bodyHits: [], synonymHits: [], phraseMatch: false, correctionMatch: false, incidentalOnly: false },
        reason: 'found by a counterevidence scan of records in the same category that keyword ranking alone would not have surfaced',
      },
      'same-category record whose language pulls against the question’s frame'
    );
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ============================== main entry ============================== */

export interface RetrieveOptions {
  flags?: InterpretationFlag[];
  limit?: number;
  weights?: Partial<RetrievalWeights>;
  now?: number;
}

/**
 * Context-aware retrieval over the supplied records. Only records passed in
 * are ever considered — access control happens upstream (RLS-scoped queries),
 * and the fictional demo dataset is kept separate by the callers that supply
 * only sample rows to signed-out visitors.
 *
 * Pipeline: intent detection → term expansion → per-candidate scoring with
 * explainable signals → near-duplicate marking → counterevidence for
 * pattern/preference/decision/change questions.
 */
export function retrieve(question: string, memories: Memory[], options: RetrieveOptions = {}): RetrievalResult {
  const { flags = [], limit = 8, now = Date.now() } = options;
  const weights: RetrievalWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const intent = detectIntent(question);
  const period = parseQueryPeriod(question, now);
  const originalTerms = extractTerms(question);
  const terms = expandSynonyms(originalTerms);
  const phrases = questionPhrases(question);

  if (terms.length === 0 || memories.length === 0) {
    return { intent, period, candidates: [], counterevidence: [] };
  }

  const candidates = memories
    .map((memory) =>
      scoreCandidate({ memory, question, terms, originalTerms, phrases, weights, intent, period, corrections: flags })
    )
    .filter((c) => c.relevance > 0)
    .sort((a, b) => b.score - a.score);

  markNearDuplicates(candidates);

  const ranked = candidates
    .filter((c) => !c.isNearDuplicateOf)
    .slice(0, limit)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Duplicates of ranked records keep their reference; duplicates beyond the
  // limit are simply not surfaced.
  const rankedIds = new Set(ranked.map((c) => c.memory.id));
  const flagged = candidates
    .filter((c) => c.isNearDuplicateOf && rankedIds.has(c.isNearDuplicateOf))
    .map((c, i) => ({ ...c, rank: ranked.length + i + 1 }));

  const result: RetrievalResult = {
    intent,
    period,
    candidates: [...ranked, ...flagged],
    counterevidence: [],
  };
  if (COUNTEREVIDENCE_INTENTS.includes(intent.intent)) {
    // Opposing evidence often uses different words from the question. For
    // negatively framed questions, also scan same-category records that
    // keyword ranking alone would never have surfaced.
    const negativeFramed = OPPOSING_RE.test(question);
    let supplement: Memory[] = [];
    if (negativeFramed) {
      const rankedIds = new Set(result.candidates.map((c) => c.memory.id));
      const topCategories = new Set(result.candidates.slice(0, 3).map((c) => c.memory.category));
      supplement = memories.filter(
        (m) => !rankedIds.has(m.id) && topCategories.has(m.category) && HOLDING_RE.test(`${m.title} ${m.content}`)
      );
    }
    result.counterevidence = retrieveCounterevidence(question, result.candidates, flags, 3, supplement);
  }
  return result;
}

/**
 * Backwards-compatible entry point used by Twin Chat and the eval suite:
 * ranks memories by relevance, boosted by query-dependent recency and record
 * confidence. Returns only memories with at least one keyword hit, best first,
 * near-duplicates excluded.
 */
export function retrieveMemories(question: string, memories: Memory[], limit = 8): EvidenceCandidate[] {
  const result = retrieve(question, memories, { limit });
  return result.candidates
    .filter((c) => !c.isNearDuplicateOf)
    .map((c) => ({ memory: c.memory, relevance: c.relevance, recency: c.recency, score: c.score }));
}

const CONFLICT_HINTS: { pattern: RegExp; opposite: RegExp }[] = [
  { pattern: /\bmust\b|\bhave to\b|\bobligat|\bduty\b|\bsupposed to\b/i, opposite: /\bdon'?t have to\b|\bno obligation\b|\bfree to\b|\bchoose to\b|\bnot obliged\b/i },
  { pattern: /\balways\b|\bconstantly\b|\bevery day\b|\bnever\b/i, opposite: /\bsometimes\b|\boccasionally\b|\brarely\b|\bno longer\b|\bnot always\b/i },
  { pattern: /\bworth\b|\bearn\b|\bdeserve\b|\bprove\b/i, opposite: /\bwithout earning\b|\bno need to prove\b|\binherent\b|\balready enough\b/i },
  { pattern: /\bscoreboard\b|\bstatus\b|\bsuccess is\b/i, opposite: /\bfreedom\b|\bnot a scoreboard\b|\btool\b/i },
];

/** Find beliefs whose evidence cuts against their statement, for conflict questions. */
export function findBeliefConflicts(beliefs: Belief[], memories: Memory[]): ConflictPair[] {
  const results: ConflictPair[] = [];

  for (const belief of beliefs) {
    if (belief.status === 'active' && belief.strength >= 80) continue;

    const statement = belief.statement.toLowerCase();
    const hintHit = CONFLICT_HINTS.some(
      (h) => h.pattern.test(statement) || h.opposite.test(statement)
    );

    const supporting: Memory[] = [];
    const contradicting: Memory[] = [];
    for (const m of memories) {
      const hay = `${m.title} ${m.content}`.toLowerCase();
      const words = statement.split(/\W+/).filter((w) => w.length > 4);
      const overlap = words.filter((w) => hay.includes(w)).length;
      if (overlap === 0) continue;
      const sharesTheme =
        hintHit ||
        CONFLICT_HINTS.some((h) => h.opposite.test(hay) && h.pattern.test(statement));
      (sharesTheme || overlap >= 2 ? contradicting : supporting).push(m);
    }

    if (contradicting.length > 0) {
      results.push({ belief, memories: contradicting.slice(0, 3) });
    }
  }

  return results;
}

export function formatMemoryForContext(m: Memory): string {
  return [
    `[${m.id}] "${m.title}" — ${new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, category: ${m.category}, source: ${m.source}, confidence: ${m.confidence}/100, tags: ${(m.tags ?? []).join(', ') || 'none'}`,
    `USER TEXT: ${m.content}`,
    `TWIN INTERPRETATION (AI-generated, not user-authored): ${m.ai_interpretation ?? 'none'}`,
  ].join('\n');
}

/**
 * A record's user-authored text plus any correction notes the user saved
 * against it. Corrections are the user's own words and rank alongside the
 * original content; the original record is never modified.
 */
export function userTextWithCorrections(m: Memory, flags: InterpretationFlag[]): string {
  const notes = flags
    .filter((f) => f.memory_id === m.id && f.status === 'confirmed' && f.correction_note?.trim())
    .map((f) => f.correction_note.trim());
  return notes.length > 0 ? `${m.content} ${notes.join(' ')}` : m.content;
}
