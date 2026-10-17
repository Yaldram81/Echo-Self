import type { Belief, Memory } from './types';

/**
 * Candidate pair selection for model-assisted relationship analysis.
 *
 * The model is never asked to compare every memory with every other memory.
 * A cheap lexical pre-filter narrows the space to pairs worth analyzing:
 * statements that share at least one domain term. Everything else would be
 * "compatible" by construction and would only burn provider cost.
 *
 * Deterministic and testable with no network, no database, no model.
 */

export const MAX_CANDIDATE_PAIRS = 24;

export interface StatementRef {
  id: string;
  kind: 'belief' | 'memory';
  text: string;
  date: string | null;
}

export interface CandidatePair {
  a: StatementRef;
  b: StatementRef;
  /** Shared terms that made this pair a candidate (explanation + tests). */
  shared: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'have', 'has', 'had', 'was', 'were',
  'been', 'being', 'will', 'would', 'could', 'should', 'shall', 'must', 'may',
  'might', 'does', 'did', 'done', 'from', 'into', 'about', 'their', 'there',
  'they', 'them', 'then', 'than', 'when', 'what', 'which', 'where', 'while',
  'your', 'yours', 'mine', 'myself', 'itself', 'himself', 'herself', 'ourselves',
  'over', 'under', 'after', 'before', 'because', 'though', 'although', 'since',
  'very', 'just', 'also', 'some', 'such', 'only', 'more', 'most', 'much', 'many',
  'even', 'ever', 'never', 'always', 'still', 'again', 'once', 'here', 'near',
  'really', 'quite', 'rather', 'often', 'sometimes', 'usually', 'generally',
]);

const MIN_TERM_LEN = 4;

export function statementTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= MIN_TERM_LEN && !STOP_WORDS.has(t))
    )
  );
}

/** Statements eligible for relationship analysis, in a stable order. */
export function collectStatements(beliefs: Belief[], memories: Memory[]): StatementRef[] {
  const out: StatementRef[] = [];
  for (const b of beliefs) {
    if (b.origin !== 'user' && b.origin !== 'confirmed_suggestion') continue;
    out.push({ id: b.id, kind: 'belief', text: b.statement, date: b.formed_at ?? null });
  }
  for (const m of memories) {
    out.push({ id: m.id, kind: 'memory', text: `${m.title}. ${m.content}`, date: m.occurred_at ?? null });
  }
  return out;
}

/**
 * Selects pairs sharing at least one term, earliest-first, capped at
 * MAX_CANDIDATE_PAIRS. Deterministic: same input, same pairs, same order.
 * Duplicate pairs (same two ids in either order) are emitted once.
 */
export function selectCandidatePairs(beliefs: Belief[], memories: Memory[]): CandidatePair[] {
  const statements = collectStatements(beliefs, memories);
  const termsBy = new Map<StatementRef, string[]>(statements.map((s) => [s, statementTerms(s.text)]));

  const pairs: CandidatePair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < statements.length && pairs.length < MAX_CANDIDATE_PAIRS; i++) {
    for (let j = i + 1; j < statements.length && pairs.length < MAX_CANDIDATE_PAIRS; j++) {
      const a = statements[i];
      const b = statements[j];
      const shared = termsBy.get(a)!.filter((t) => termsBy.get(b)!.includes(t));
      if (shared.length === 0) continue;
      const key = [a.id, b.id].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b, shared: shared.slice(0, 5) });
    }
  }
  return pairs;
}
