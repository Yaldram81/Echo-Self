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

function keywordScore(memory: Memory, terms: string[]): number {
  const title = memory.title.toLowerCase();
  const body = memory.content.toLowerCase();
  const tagText = (memory.tags ?? []).join(' ').toLowerCase();
  const category = memory.category.toLowerCase();

  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += 4;
    if (tagText.includes(t)) score += 3;
    if (body.includes(t)) score += 2;
    if (category.includes(t)) score += 1;
  }
  return score;
}

function recencyFactor(iso: string): number {
  const ageDays = Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
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

/**
 * Rank memories by keyword relevance, boosted by recency and record confidence.
 * Returns only memories with at least one keyword hit, best first.
 */
export function retrieveMemories(question: string, memories: Memory[], limit = 8): EvidenceCandidate[] {
  const terms = expandSynonyms(extractTerms(question));
  if (terms.length === 0) return [];

  return memories
    .map((memory) => {
      const relevance = keywordScore(memory, terms);
      if (relevance === 0) return null;
      const recency = recencyFactor(memory.occurred_at);
      const trust = memory.confidence / 100;
      const score = relevance * (1 + recency * 0.4) * (0.7 + trust * 0.3);
      return { memory, relevance, recency, score };
    })
    .filter((c): c is EvidenceCandidate => c !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
    .filter((f) => f.memory_id === m.id && f.correction_note?.trim())
    .map((f) => f.correction_note.trim());
  return notes.length > 0 ? `${m.content} ${notes.join(' ')}` : m.content;
}
