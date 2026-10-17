import type { Belief, Memory } from './types';
import { selectCandidatePairs, MAX_CANDIDATE_PAIRS, type StatementRef } from './relationshipCandidates';

/**
 * Model-assisted statement relationship analysis (Upgrade 3).
 *
 * Flow: lexical candidate selection (relationshipCandidates.ts) → one batched
 * call to the `relate-check` edge function (provider key server-side, per-user
 * quota) → strict coercion of results against the ids actually sent → CANDIDATE
 * rows persisted for user review. Nothing becomes an established relationship
 * without explicit user confirmation.
 *
 * Degraded state: when the provider is unavailable (not configured, offline,
 * rate-limited, error), analysis reports `unavailable` with a plain-language
 * reason. The deterministic pattern detector stays available and its narrower
 * coverage is reported — no unreviewed guess is ever presented as verified.
 *
 * Data boundary: only the user's own statement text is sent, only ids the
 * caller's record set authorizes are accepted back, and statement text is
 * untrusted data inside the prompt (the server quotes it, never obeys it).
 */

export type RelationCategory =
  | 'direct_contradiction'
  | 'possible_contradiction'
  | 'change_over_time'
  | 'context_dependent'
  | 'compatible'
  | 'insufficient_evidence';

export const RELATION_LABELS: Record<RelationCategory, string> = {
  direct_contradiction: 'Direct contradiction',
  possible_contradiction: 'Possible contradiction — needs context',
  change_over_time: 'Change over time',
  context_dependent: 'Context-dependent difference',
  compatible: 'Compatible statements',
  insufficient_evidence: 'Not enough to judge',
};

/** Categories worth surfacing; compatible/pair-noise is stored but not prominent. */
export const TENSION_CATEGORIES: RelationCategory[] = [
  'direct_contradiction',
  'possible_contradiction',
  'change_over_time',
  'context_dependent',
];

export type RelationshipSource = 'pattern' | 'model';
export type RelationshipStatus = 'candidate' | 'confirmed' | 'dismissed';

export interface RelationshipRecord {
  id: string;
  a_type: 'belief' | 'memory';
  b_type: 'belief' | 'memory';
  a_id: string;
  b_id: string;
  relation: RelationCategory;
  explanation: string;
  source: RelationshipSource;
  status: RelationshipStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface PersistedRelationshipInput {
  a: StatementRef;
  b: StatementRef;
  relation: RelationCategory;
  explanation: string;
  source: RelationshipSource;
}

export interface AnalysisOutcome {
  mode: 'model' | 'pattern_only' | 'unavailable';
  /** Plain-language statement of what ran and what did not. */
  detail: string;
  /** Model-assisted candidates, when the model leg ran. */
  relationships: PersistedRelationshipInput[];
  /** Pairs submitted for analysis. */
  analyzedPairs: number;
}

export class RelationshipUnavailableError extends Error {
  readonly kind: 'not-configured' | 'service-error' | 'rate-limited';
  readonly retryAfterSeconds?: number;
  constructor(kind: RelationshipUnavailableError['kind'], message: string, retryAfterSeconds?: number) {
    super(message);
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Strict shape check on the model's returned relationships. */
export function coerceIncomingRelationships(
  payload: unknown,
  authorizedIds: Set<string>
): PersistedRelationshipInput[] {
  const VALID = new Set<RelationCategory>([
    'direct_contradiction', 'possible_contradiction', 'change_over_time',
    'context_dependent', 'compatible', 'insufficient_evidence',
  ]);
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const out: PersistedRelationshipInput[] = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const key = typeof o.pairId === 'string' ? o.pairId : '';
    const [aId, bId] = key.split('|');
    // Every returned id must be one the caller is authorized to analyze; a
    // fabricated or foreign id is dropped, never repaired.
    if (!aId || !bId || !authorizedIds.has(aId) || !authorizedIds.has(bId)) continue;
    if (typeof o.relation !== 'string' || !VALID.has(o.relation as RelationCategory)) continue;
    if (typeof o.explanation !== 'string' || !o.explanation.trim()) continue;
    out.push({
      a: { id: aId, kind: 'belief', text: '', date: null },
      b: { id: bId, kind: 'belief', text: '', date: null },
      relation: o.relation as RelationCategory,
      explanation: o.explanation.trim().slice(0, 600),
      source: 'model',
      // matched pairId form is "aId|bId" exactly as sent
    });
  }
  return out;
}

async function callRelateCheck(
  pairs: { aId: string; bId: string; aText: string; bText: string; aDate?: string | null; bDate?: string | null; aKind?: string; bKind?: string }[]
): Promise<unknown> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/relate-check`;
  const { supabase } = await import('./supabaseClient');
  const { data: sessionData } = await supabase.auth.getSession();
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionData.session ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
      },
      body: JSON.stringify({
        pairs: pairs.map((p) => ({
          aId: p.aId, bId: p.bId,
          aText: p.aText, bText: p.bText,
          aDate: p.aDate ?? undefined, bDate: p.bDate ?? undefined,
          aKind: p.aKind, bKind: p.bKind,
        })),
      }),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new RelationshipUnavailableError('service-error', 'The analysis took too long to respond. Try again in a moment.');
    }
    throw new RelationshipUnavailableError('service-error', 'Could not reach the analysis service. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 503) {
    throw new RelationshipUnavailableError('not-configured', 'The AI provider is not configured for this project yet.');
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 86400) : undefined;
    throw new RelationshipUnavailableError('rate-limited', 'Too many analyses in a short period. Please wait and try again.', wait);
  }
  if (response.status === 401) {
    throw new RelationshipUnavailableError('service-error', 'The analysis service requires a verified session. Sign in and try again.');
  }
  if (!response.ok) {
    throw new RelationshipUnavailableError('service-error', 'The analysis service responded with an error. Please try again.');
  }
  return response.json();
}

/**
 * Runs model-assisted analysis over lexically-selected candidate pairs.
 * Statements are passed by the caller (already fetched with RLS scoping);
 * every model-returned id is validated against that same authorized set.
 */
export async function analyzeRelationships(
  beliefs: Belief[],
  memories: Memory[]
): Promise<AnalysisOutcome> {
  const candidatePairs = selectCandidatePairs(beliefs, memories);
  if (candidatePairs.length === 0) {
    return {
      mode: 'pattern_only',
      detail: 'No statement pairs share enough vocabulary to be worth analyzing.',
      relationships: [],
      analyzedPairs: 0,
    };
  }

  const authorizedIds = new Set([...beliefs.map((b) => b.id), ...memories.map((m) => m.id)]);
  const refById = new Map<string, StatementRef>();
  for (const p of candidatePairs) {
    refById.set(p.a.id, p.a);
    refById.set(p.b.id, p.b);
  }

  try {
    const payload = await callRelateCheck(
      candidatePairs.map((p) => ({
        aId: p.a.id, bId: p.b.id,
        aText: p.a.text, bText: p.b.text,
        aDate: p.a.date, bDate: p.b.date,
        aKind: p.a.kind, bKind: p.b.kind,
      }))
    );
    const coerced = coerceIncomingRelationships(payload, authorizedIds);
    const relationships: { a: StatementRef; b: StatementRef; relation: RelationCategory; explanation: string; source: RelationshipSource }[] = [];
    for (const r of coerced) {
      const a = refById.get(r.a.id);
      const b = refById.get(r.b.id);
      if (a && b) relationships.push({ a, b, relation: r.relation, explanation: r.explanation, source: 'model' });
    }
    return {
      mode: 'model',
      detail: `Model-assisted comparison ran on ${candidatePairs.length} candidate pair${candidatePairs.length === 1 ? '' : 's'} (capped at ${MAX_CANDIDATE_PAIRS}).`,
      relationships,
      analyzedPairs: candidatePairs.length,
    };
  } catch (err) {
    if (err instanceof RelationshipUnavailableError) throw err;
    throw new RelationshipUnavailableError('service-error', 'The analysis service responded with an error. Please try again.');
  }
}

/** One deterministic pattern row from the existing detector, in shared shape. */
export function patternRelationshipFromContradiction(
  c: { a: Belief; b: Belief; theme: string }
): PersistedRelationshipInput {
  return {
    a: { id: c.a.id, kind: 'belief', text: c.a.statement, date: c.a.formed_at ?? null },
    b: { id: c.b.id, kind: 'belief', text: c.b.statement, date: c.b.formed_at ?? null },
    relation: 'possible_contradiction',
    explanation: `Opposing ${c.theme} cues in the two statements (deterministic pattern match; needs context to resolve).`,
    source: 'pattern',
  };
}

export function pairKey(a: { id: string }, b: { id: string }): string {
  return [a.id, b.id].sort().join('::');
}
