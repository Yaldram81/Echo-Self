import type { Belief, Memory } from './types';

/**
 * Contradiction detection between a user's recorded beliefs.
 *
 * Deliberately conservative: only flags pairs whose statements contain opposing
 * cues from the same or adjacent life areas, and attaches real source memories.
 * It never decides which statement is true — both are shown with their dates
 * and the user resolves the tension themselves.
 */

interface Cue {
  positive: RegExp;
  negative: RegExp;
  theme: string;
}

const CUES: Cue[] = [
  {
    theme: 'availability',
    positive: /\b(must be|always) available\b|\bconstantly available\b|\bearn my place\b|\bnever say no\b/i,
    negative: /\bnot (be )?available\b|\bsay no\b|\bboundar\w+|\bdecline\b|\brest is\b|\bno longer available\b/i,
  },
  {
    theme: 'money',
    positive: /\bmoney is\b.*\b(scoreboard|status|success)\b|\bwealth (is|means)\b/i,
    negative: /\bmoney is\b.*\b(tool|freedom|not a scoreboard)\b|\bscoreboard\b/i,
  },
  {
    theme: 'work',
    positive: /\bvisibility matters\b|\btitle\b|\bbig room\b|\blead(ing|ership) (is|means)\b/i,
    negative: /\bsmall room\b|\bsmall team\b|\bdeep work\b|\bvisibility (overrated|doesn'?t)\b/i,
  },
  {
    theme: 'family',
    positive: /\bfamily (comes|comes first|obligation)\b|\bobligation outweighs\b|\bfamily first\b/i,
    negative: /\bboundar\w+ with family\b|\bnot (my )?obligation\b|\bchoose my own\b/i,
  },
  {
    theme: 'rest',
    positive: /\brest is (lazy|unproductive|indulgent)\b|\bgrind\b|\bno days off\b/i,
    negative: /\brest is productive\b|\bstop\b|\bpausing\b|\bunstructured time\b/i,
  },
];

function matchesCue(statement: string, cue: Cue): 'positive' | 'negative' | null {
  const p = cue.positive.test(statement);
  const n = cue.negative.test(statement);
  if (p && !n) return 'positive';
  if (n && !p) return 'negative';
  return null;
}

export function findBeliefContradictions(
  beliefs: Belief[],
  memories: Memory[]
): { a: Belief; b: Belief; theme: string; supportingMemories: Memory[] }[] {
  const confirmed = beliefs.filter(
    (b) => b.origin === 'user' || b.origin === 'confirmed_suggestion'
  );
  const out: { a: Belief; b: Belief; theme: string; supportingMemories: Memory[] }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      const a = confirmed[i];
      const b = confirmed[j];
      for (const cue of CUES) {
        const sideA = matchesCue(a.statement, cue);
        const sideB = matchesCue(b.statement, cue);
        if (sideA && sideB && sideA !== sideB) {
          const key = cue.theme;
          if (seen.has(key)) continue;
          seen.add(key);

          const terms = a.statement
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 4);
          const supportingMemories = memories
            .filter((m) => {
              const hay = `${m.title} ${m.content}`.toLowerCase();
              return terms.some((t) => hay.includes(t)) || cue.negative.test(hay) || cue.positive.test(hay);
            })
            .slice(0, 3);

          out.push({ a, b, theme: cue.theme, supportingMemories });
        }
      }
    }
  }

  return out;
}
