import type { Belief, ClaimType, InterpretationFlag, Memory, SourceRef, TwinReply } from './types';
import { findBeliefConflicts, formatMemoryForContext, retrieveMemories } from './retrieval';
import { createHybridRetriever } from './hybridRetrieval';
import { embeddingPort } from './memoryEmbeddingService';
import {
  auditReply,
  withConflicts,
  withCorrections,
  withUncertainty,
  withSemanticReview,
  rejectInventedContent,
  isWeakMatch,
} from './claimAudit';

/**
 * Twin service abstraction.
 *
 *  - live: calls the `twin-chat` edge function, which holds the provider key
 *    server-side and grounds the model in DB records. Never falls back silently
 *    to fabricated content — a live failure surfaces as an error.
 *  - demo: composes a structured reply locally from the user's actual records.
 *    Always labeled as a sample conversation; never pretends to be a model.
 */

export type TwinMode = 'live' | 'demo' | 'unconfigured';

/** Demo mode unless the env var is present and explicitly 'false'. */
export function twinMode(): TwinMode {
  const flag = typeof import.meta.env?.VITE_TWIN_DEMO_MODE === 'string'
    ? import.meta.env.VITE_TWIN_DEMO_MODE
    : 'true';
  return flag === 'false' ? 'live' : 'demo';
}

export class TwinUnavailableError extends Error {
  readonly kind: 'not-configured' | 'service-error' | 'rate-limited';
  /** Seconds the server asked the client to wait before retrying (429 only). */
  readonly retryAfterSeconds?: number;
  constructor(kind: 'not-configured' | 'service-error' | 'rate-limited', message: string, retryAfterSeconds?: number) {
    super(message);
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Strict shape check on the whole reply arriving from the edge function.
 * Anything malformed is dropped or coerced rather than repaired into something
 * misleading: only plain-string text, arrays, and string evidence IDs survive.
 * Excerpts are NOT trusted from the wire — the client audit re-derives them.
 */
export function coerceIncomingReply(payload: unknown): TwinReply | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.answer !== 'string') return null;
  const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const claims = sanitizeIncomingClaims(obj.claims);
  return {
    answer: obj.answer,
    sources: Array.isArray(obj.sources)
      ? obj.sources.filter(
          (s): s is SourceRef =>
            !!s && typeof s === 'object' && typeof (s as { memoryId?: unknown }).memoryId === 'string'
        )
      : [],
    inferences: isStrArr(obj.inferences) ? obj.inferences : [],
    gaps: isStrArr(obj.gaps) ? obj.gaps : [],
    followUps: isStrArr(obj.followUps) ? obj.followUps : [],
    mode: 'live',
    claims,
  };
}

/**
 * Strict shape check on model-derived claims arriving from the edge function.
 * Anything malformed is dropped rather than repaired into something misleading:
 * only plain-string claim text and string evidence IDs survive. Excerpts are
 * NOT trusted from the wire — the client audit re-derives them from records.
 */
function sanitizeIncomingClaims(raw: unknown): TwinReply['claims'] {
  if (!Array.isArray(raw)) return undefined;
  const claims: NonNullable<TwinReply['claims']> = [];
  for (const rc of raw) {
    if (!rc || typeof rc !== 'object') continue;
    const obj = rc as Record<string, unknown>;
    if (typeof obj.claim !== 'string' || !obj.claim.trim()) continue;
    const VALID_TYPES = ['directly_supported', 'interpretation', 'conflicting_evidence', 'unknown'];
    const type = typeof obj.type === 'string' && VALID_TYPES.includes(obj.type)
      ? (obj.type as ClaimType)
      : 'interpretation';
    const evidence = Array.isArray(obj.evidence)
      ? obj.evidence
          .filter((e): e is { memoryId: string } =>
            !!e && typeof e === 'object' && typeof (e as { memoryId?: unknown }).memoryId === 'string')
          .map((e) => ({ memoryId: e.memoryId, title: '', excerpt: '' }))
      : [];
    claims.push({ claimId: `c${claims.length + 1}`, claim: obj.claim.trim(), type, evidenceStatus: 'insufficient', evidence });
  }
  return claims.length > 0 ? claims : undefined;
}

async function askLive(question: string): Promise<TwinReply> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twin-chat`;
  // Dynamic import: keeps the Supabase client out of non-Vite runtimes that
  // import this module for its pure functions (the eval suite).
  const { supabase } = await import('./supabaseClient');
  const { data: sessionData } = await supabase.auth.getSession();
  let response: Response;
  const controller = new AbortController();
  // A hung provider must not leave the user staring at a spinner forever.
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionData.session
          ? { Authorization: `Bearer ${sessionData.session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new TwinUnavailableError('service-error', 'The twin service took too long to respond. Please try again in a moment.');
    }
    throw new TwinUnavailableError('service-error', 'Could not reach the twin service. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 503) {
    throw new TwinUnavailableError('not-configured', 'The AI provider is not configured for this project yet.');
  }
  if (response.status === 429) {
    // Server-enforced quota: honor the Retry-After header when present.
    const retryAfter = Number(response.headers.get('Retry-After'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 86400) : undefined;
    let message = 'You are asking twin questions faster than allowed. Please wait a moment and try again.';
    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      if (typeof body.message === 'string' && body.message.trim()) message = body.message;
    } catch {
      // keep default message
    }
    throw new TwinUnavailableError('rate-limited', message, wait);
  }
  if (response.status === 401) {
    throw new TwinUnavailableError('service-error', 'The twin service requires a verified session. Sign in and try again.');
  }
  if (!response.ok) {
    throw new TwinUnavailableError('service-error', 'The twin service responded with an error. Please try again.');
  }

  const payload: unknown = await response.json();
  const reply = coerceIncomingReply(payload);
  if (!reply) {
    throw new TwinUnavailableError('service-error', 'The twin returned an unexpected response. Please try again.');
  }
  // Semantic review (layer 2) is normalized here: malformed review payloads
  // become unreviewed, never verified.
  return withSemanticReview(reply);
}

function validateSources(reply: TwinReply, contextMemories: Memory[]): TwinReply {
  const validIds = new Set(contextMemories.map((m) => m.id));
  const sources = reply.sources.filter((s) => validIds.has(s.memoryId));
  const idToTitle = new Map(contextMemories.map((m) => [m.id, m.title]));
  return {
    ...reply,
    sources: sources.map((s) => ({ memoryId: s.memoryId, title: idToTitle.get(s.memoryId) ?? s.title })),
  };
}

/* ------------------------------ demo mode ------------------------------ */

function composeDemoReply(question: string, memories: Memory[], beliefs: Belief[]): TwinReply {
  const q = question.toLowerCase();
  const candidates = retrieveMemories(question, memories, 8);
  const hits = candidates.map((c) => c.memory);

  // Question-type routing, answered strictly from records.
  if (/\bconflict|contradict|disagree|inconsist/.test(q)) {
    const conflicts = findBeliefConflicts(beliefs, memories);
    if (conflicts.length === 0) {
      return {
        answer:
          'I don\'t find a clear conflict between your recorded beliefs in the sample records. Some beliefs are marked "evolving" or "revisited," which signals movement rather than contradiction. Ask what has changed in your thinking for that view.',
        sources: [],
        inferences: [],
        gaps: ['Conflict detection here is keyword-based over the sample records only.'],
        followUps: ['What has changed in my thinking over time?'],
        mode: 'demo',
      };
    }
    const lines: string[] = [];
    const sources: SourceRef[] = [];
    for (const c of conflicts.slice(0, 2)) {
      lines.push(
        `Your ${c.belief.kind}, "${c.belief.statement}" (${c.belief.status}, strength ${c.belief.strength}/100), sits in tension with records like:`
      );
      for (const m of c.memories) {
        lines.push(`• "${m.title}": ${m.content.split('. ')[0]}.`);
        sources.push({ memoryId: m.id, title: m.title });
      }
    }
    return {
      answer: lines.join('\n\n'),
      sources,
      inferences: [
        'Interpretation: the tension is usually between an older stated rule and newer recorded behavior; the records move faster than the belief statement.',
      ],
      gaps: ['Sample records may not include the belief reflections that would settle this.'],
      followUps: ['Which memories support your interpretation?'],
      mode: 'demo',
    };
  }

  if (/\bover time|changed|shift|evolv|used to\b/.test(q)) {
    const withHistory = beliefs
      .filter((b) => (b.history?.length ?? 0) >= 2)
      .slice(0, 3);
    if (withHistory.length === 0) {
      return {
        answer:
          'The sample records don\'t include enough belief reflections to trace a change over time yet. Beliefs with two or more recorded reflections would let me show a before-and-after.',
        sources: [],
        inferences: [],
        gaps: ['No belief history snapshots with multiple points in the sample data.'],
        followUps: ['What priorities have I repeatedly expressed?'],
        mode: 'demo',
      };
    }
    const lines = withHistory.map((b) => {
      const h = b.history!;
      return `• "${b.statement}" (${b.status}): strength went from ${h[0].strength} to ${h[h.length - 1].strength} across ${h.length} reflections. Latest note: "${h[h.length - 1].note}"`;
    });
    return {
      answer: lines.join('\n\n'),
      sources: [],
      inferences: ['Interpretation: declining strengths suggest beliefs being questioned, not abandoned; they are being renegotiated.'],
      gaps: ['Reflection notes are short; the reasons for each shift are only partly recorded.'],
      followUps: ['Where do my recorded beliefs conflict?'],
      mode: 'demo',
    };
  }

  if (/\bpriorit|repeatedly|value|matter most|important/.test(q)) {
    const valueBeliefs = beliefs.filter((b) => b.kind === 'value' || b.strength >= 84).slice(0, 3);
    if (valueBeliefs.length === 0) {
      return {
        answer: 'The sample records include no strong values or priorities yet, so I would rather not guess.',
        sources: [],
        inferences: [],
        gaps: ['No high-strength beliefs recorded in the sample data.'],
        followUps: ['What experiences seem relevant to my current challenge?'],
        mode: 'demo',
      };
    }
    const lines = valueBeliefs.map(
      (b) => `• "${b.statement}": a ${b.kind} you hold at ${b.strength}/100 (${b.status}).`
    );
    const tagCounts = new Map<string, number>();
    for (const m of memories) for (const t of m.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    lines.push(
      `In the records themselves, the recurring themes are: ${topTags.map(([t, n]) => `${t} (${n} memories)`).join(', ')}.`
    );
    return {
      answer: lines.join('\n\n'),
      sources: [],
      inferences: ['Interpretation: tags with the most memories are treated as recurring priorities; this is frequency, not proof of importance.'],
      gaps: ['Strength scores are self-reported; they may not reflect current weight.'],
      followUps: ['What has changed in my thinking over time?'],
      mode: 'demo',
    };
  }

  if (hits.length === 0 || isWeakMatch(question, hits)) {
    return {
      answer:
        'I don\'t find recorded evidence touching that in the sample records. My answers stay grounded in what\'s actually logged, so I\'d rather say nothing than invent. Add a memory or a belief and ask me again.',
      sources: [],
      inferences: [],
      gaps: hits.length === 0
        ? ['No sample record shares keywords with this question.']
        : ['The closest records share only incidental keywords with this question; that is not the same as answering it.'],
      followUps: [],
      mode: 'demo',
    };
  }

  const top = hits.slice(0, 3);
  const lines = top.map((m) => `• "${m.title}" (${new Date(m.occurred_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${m.category.replace('_', ' ')}): ${m.content.split('. ')[0]}.`);
  const answer = `Based on ${hits.length} matching record${hits.length === 1 ? '' : 's'} in the sample data, the most relevant evidence is:\n\n${lines.join('\n')}`;
  return {
    answer,
    sources: top.map((m) => ({ memoryId: m.id, title: m.title })),
    inferences: [
      'Interpretation: these records were selected because their titles, tags, and text overlap with your question; the connection between them is mine, not something you wrote.',
    ],
    gaps: ['Relevance here is keyword-based; the sample reply cannot read between the lines.'],
    followUps: ['Which memories support your interpretation?'],
    mode: 'demo',
  };
}

const hybridRetrieve = createHybridRetriever(embeddingPort);

export async function askTwin(
  question: string,
  memories: Memory[],
  beliefs: Belief[],
  corrections: InterpretationFlag[] = []
): Promise<{ reply: TwinReply; contextMemories: Memory[] }> {
  if (twinMode() === 'live') {
    // Hybrid retrieval: keyword leg (always) + semantic leg (server-side
    // embeddings, ownership-scoped). Any embedding failure degrades to the
    // keyword engine and the active mode is reported, never silently claimed.
    const { result: hybridResult, status } = await hybridRetrieve(question, memories, { flags: corrections, limit: 8 });
    const contextMemories = hybridResult.candidates.filter((c) => !c.isNearDuplicateOf).map((c) => c.memory);
    const reply = await askLive(question);
    // Audit against the records retrieved for THIS request: claim-level support,
    // invented quote/date rejection, and conflicts. Failure surfaces, never fabricates.
    const cleaned = rejectInventedContent(reply, contextMemories);
    const audited = withConflicts(
      auditReply(validateSources(cleaned, memories), contextMemories),
      contextMemories
    );
    const uncertain = withUncertainty(audited, question, contextMemories);
    const corrected = withCorrections(uncertain, contextMemories, corrections, question);
    if (!status.semanticUsed) {
      corrected.gaps = [
        ...(corrected.gaps ?? []),
        status.mode === 'keyword'
          ? 'Semantic retrieval was unavailable for this question; records were matched by keywords only.'
          : 'No semantically indexed records matched yet; matching was keyword-only.',
      ];
    }
    return { reply: corrected, contextMemories };
  }

  // demo mode: local composition from real records
  const candidates = retrieveMemories(question, memories, 8);
  const contextMemories = candidates.map((c) => c.memory);
  const reply = composeDemoReply(question, memories, beliefs);
  const validIds = new Set(memories.map((m) => m.id));
  const grounded: TwinReply = {
    ...reply,
    sources: reply.sources.filter((s) => validIds.has(s.memoryId)),
  };
  const cleaned = rejectInventedContent(grounded, contextMemories);
  const uncertain = withUncertainty(
    withConflicts(auditReply(cleaned, contextMemories), contextMemories),
    question,
    contextMemories
  );
  return {
    // Demo replies are never semantically reviewed: state that explicitly.
    reply: withSemanticReview(withCorrections(uncertain, contextMemories, corrections, question)),
    contextMemories,
  };
}

export { formatMemoryForContext, composeDemoReply };
