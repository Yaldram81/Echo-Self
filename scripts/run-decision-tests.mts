/**
 * Deterministic engine tests for the Decision Mirror.
 * Run with: npx tsx scripts/run-decision-tests.mts
 */
import {
  findRelevantMemories,
  analyzeOptionValues,
  analyzeDecision,
  preferredOption,
  findWeightSensitivities,
  assessConstraints,
  extractCounterevidence,
  explainRanking,
  buildBeliefProposal,
  findAffectedBeliefs,
} from '../src/lib/decisionAnalysis.ts';
import type { Decision, Memory, Belief } from '../src/lib/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function memory(id: string, title: string, content: string, tags: string[] = []): Memory {
  return {
    id, title, content, tags,
    category: 'personal_growth', source: 'journal', mood: 'neutral', confidence: 90,
    ai_interpretation: null, occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
  };
}

const OFFER = { label: 'Take the offer', pros: [], cons: [] };
const STAY = { label: 'Stay in current role', pros: [], cons: [] };

function decision(patch: Partial<Decision> = {}): Decision {
  return {
    id: 'd-test',
    title: 'Job offer test',
    context: 'small startup offer versus staying in my current role',
    status: 'unresolved',
    options: [OFFER, STAY],
    chosen_option: null,
    created_at: new Date().toISOString(), decided_at: null,
    constraints: null, uncertainties: null,
    values: ['freedom', 'security'],
    success_definition: null,
    analysis: null, analysis_edited: false,
    value_weights: { freedom: 0.5, security: 0.5 },
    classification_overrides: {},
    rationale: null, reflection: null, reflected_at: null,
    ...patch,
  };
}

const beliefs: Belief[] = [];

// --- 1. Equal options: symmetric evidence yields equal scores and no leader ---
{
  const d = decision();
  const sym = [
    memory('s1', 'Freer with the offer', 'The offer schedule gave me freedom; glad.'),
    memory('s2', 'Freer staying', 'Staying in the current role kept my freedom; glad.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, sym, []);
  const b = analyzeOptionValues('Stay in current role', d, sym, []);
  check('equal options: symmetric evidence yields equal scores', a.score === b.score, `got ${a.score} vs ${b.score}`);
  check('equal options: no preferred option on a tie', preferredOption([a, b]) === null, `got ${preferredOption([a, b])}`);
}

// --- 2. Normalization: ratio, not pile size ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const base = [
    memory('n1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('n2', 'Offer freedom again', 'Chose the offer for freedom; relieved.'),
    memory('n3', 'Offer freedom drained', 'The offer promised freedom but left me exhausted and resentful.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, base, []);
  check('normalization: two-for-one split scores 1/3, not pile-dependent',
    Math.abs(a.score - 1 / 3) < 1e-9, `got ${a.score}`);
  const doubled = [
    ...base,
    memory('n4', 'Offer freedom four', 'The offer schedule gave me freedom; glad again.'),
    memory('n5', 'Offer freedom five', 'The offer kept giving me freedom; glad.'),
    memory('n6', 'Offer freedom drain two', 'The offer traded freedom for exhaustion; resentful.'),
  ];
  const a2 = analyzeOptionValues('Take the offer', d, doubled, []);
  check('normalization: adding same-ratio evidence does not inflate the score',
    Math.abs(a2.score - a.score) < 1e-9, `got ${a.score} then ${a2.score}`);
}

// --- 3. Missing evidence is unknown, never support ---
{
  const d = decision({ values: ['freedom', 'adventure'], value_weights: { freedom: 0.5, adventure: 0.9 } });
  const empty: Memory[] = [];
  const a = analyzeOptionValues('Take the offer', d, empty, []);
  check('missing evidence: score is 0 and flagged insufficient',
    a.score === 0 && a.insufficientEvidence, `score=${a.score} flagged=${a.insufficientEvidence}`);
  const rep = analyzeDecision(d, empty, beliefs);
  check('missing evidence: report names no preferred option', rep.preferredOption === null, `got ${rep.preferredOption}`);
  check('missing evidence: summary says no option leads rather than endorsing one',
    /no option leads/i.test(rep.summary), rep.summary);
}

// --- 4. Contradictory evidence nets out and is reported ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mixed = [
    memory('c1', 'Loved the offer', 'The offer schedule gave me freedom; glad and clearer.'),
    memory('c2', 'Regret the offer', 'The offer months left me exhausted and resentful about freedom.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mixed, []);
  check('contradictory evidence: one for and one against nets to 0',
    a.score === 0 && !a.insufficientEvidence, `score=${a.score} flagged=${a.insufficientEvidence}`);
  const rep = analyzeDecision(d, mixed, beliefs);
  const cls = rep.optionAlignments[0].classifications;
  check('contradictory evidence: classifications carry rationales for both sides',
    cls.filter((c) => c.classification === 'for').length >= 1 &&
    cls.filter((c) => c.classification === 'against').length >= 1,
    JSON.stringify(cls.map((c) => [c.classification, c.rationale.slice(0, 50)])));
}

// --- 5. Zero and extreme weights ---
{
  const d = decision({ value_weights: { freedom: 0, security: 0 } });
  const rep = analyzeDecision(d, [], beliefs);
  check('zero weights: no directional score anywhere, no leader',
    rep.preferredOption === null && rep.optionAlignments.every((a) => a.score === 0),
    `leader=${rep.preferredOption} scores=${rep.optionAlignments.map((a) => a.score)}`);

  const d2 = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems2 = [
    memory('p1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('p2', 'Raise at work', 'A solid raise at the current role made the future feel secure; relieved.'),
  ];
  const rep2 = analyzeDecision(d2, mems2, beliefs);
  const take = rep2.optionAlignments.find((a) => a.label === 'Take the offer')!;
  const stay = rep2.optionAlignments.find((a) => a.label === 'Stay in current role')!;
  check('extreme weights: all weight on freedom favors the option with freedom evidence',
    take.score > stay.score && rep2.preferredOption === 'Take the offer',
    `take=${take.score} stay=${stay.score} leader=${rep2.preferredOption}`);
}

// --- 6. Weight changes flip the leader and are flagged ---
{
  // Option A: pro on freedom, con on security. Option B: the mirror image.
  // At 0.5/0.5 both score 0 (no leader); any 0.1 nudge produces a leader.
  const d = decision({
    value_weights: { freedom: 0.5, security: 0.5 },
  });
  const mems = [
    memory('w1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('w2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
    memory('w3', 'Staying gave security', 'Staying in the current role gave me security; relieved.'),
    memory('w4', 'Staying cost freedom', 'Staying in the current role cost me freedom; I avoided change.'),
  ];
  const s = findWeightSensitivities(d, mems, findRelevantMemories(d, mems));
  check('weight sensitivity: a 0.1 nudge changes the preferred option and is flagged',
    s.length > 0, `sensitivities=${JSON.stringify(s.map((x) => [x.value, x.baseline, x.shifted]))}`);
}

// --- 7. Overrides are honored and recorded ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [memory('m1', 'Mornings', 'Chose to guard deep-work mornings; felt clearer and glad.', ['freedom'])];
  const overrides = { 'd-test:Take the offer:freedom:m1': 'against' as const };
  const a = analyzeOptionValues('Take the offer', d, mems, [], overrides);
  const entry = a.classifications.find((c) => c.memoryId === 'm1');
  check('overrides: user correction is honored and labeled',
    entry?.origin === 'override' && entry.classification === 'against', JSON.stringify(entry));
  const unoverridden = analyzeOptionValues('Take the offer', d, mems, []);
  check('overrides: without a correction the same record is inferred, not overridden',
    unoverridden.classifications.find((c) => c.memoryId === 'm1')?.origin === 'inferred');
}

// --- 8. Constraints: never satisfied without evidence ---
{
  const d = decision({ constraints: 'Must not lose healthcare coverage. Must stay within driving distance of family.' });
  const unrelated = [memory('u1', 'A quiet weekend', 'Read and walked; nothing else happened.')];
  const statuses = assessConstraints(d, unrelated);
  check('constraints: no evidence means unknown, never satisfied',
    statuses.length === 2 && statuses.every((c) => c.status === 'unknown'), JSON.stringify(statuses));
  const withEvidence = [...unrelated, memory('u2', 'The distance rule', 'I refused any job that moves me farther from family; no relocations.')];
  const statuses2 = assessConstraints(d, withEvidence);
  check('constraints: blocking language in a record flags evidence_against',
    statuses2.some((c) => c.status === 'evidence_against'), JSON.stringify(statuses2.map((c) => c.status)));
}

// --- 9. Reproducibility: identical inputs produce identical reports ---
{
  const mems = [
    memory('w1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('w2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
    memory('w3', 'Staying gave security', 'Staying in the current role gave me security; relieved.'),
    memory('w4', 'Staying cost freedom', 'Staying in the current role cost me freedom; I avoided change.'),
  ];
  const d = decision();
  const r1 = analyzeDecision(d, mems, beliefs);
  const r2 = analyzeDecision(d, mems, beliefs);
  check('reproducibility: same inputs give identical reports',
    r1.summary === r2.summary && r1.preferredOption === r2.preferredOption &&
    r1.optionAlignments[0].score === r2.optionAlignments[0].score);
  const d3 = { ...d, value_weights: { ...d.value_weights, freedom: 0.7 } };
  const r3 = analyzeDecision(d3, mems, beliefs);
  check('reproducibility: changed weights change the report deterministically',
    r1.optionAlignments[0].score !== r3.optionAlignments[0].score,
    `${r1.optionAlignments[0].score} vs ${r3.optionAlignments[0].score}`);
}

// --- 10. Method snapshot is preserved ---
{
  const d = decision({ options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] });
  const rep = analyzeDecision(d, [], beliefs);
  check('method: report records version, weights, evidence ids, explicit items',
    rep.method.version.length > 0 &&
    Object.keys(rep.method.inputs.valueWeights).length === 2 &&
    rep.method.inputs.explicitItems.length >= 1 &&
    rep.method.explanation.includes('deterministic'));
}

// --- 11. Explicit vs inferred distinction is preserved ---
{
  const d = decision({ options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] });
  const a = analyzeOptionValues('Take the offer', d, [], []);
  const explicit = a.classifications.filter((c) => c.origin === 'explicit');
  const inferred = a.classifications.filter((c) => c.origin === 'inferred');
  check('explicit assessments: user pros are classified explicitly with rationale',
    explicit.length === 1 && explicit[0].classification === 'for' && explicit[0].rationale.includes('explicit'),
    JSON.stringify(explicit));
  check('explicit assessments: inferred list stays empty without memories',
    inferred.length === 0, JSON.stringify(inferred));
}

// --- 12. A record about one option is not counted for the other ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [
    memory('x1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('x2', 'Staying gave freedom', 'Staying in the current role kept my freedom; glad.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  check('cross-option evidence: each option counts only its own supporting record',
    a.score === 1 && b.score === 1, `a=${a.score} b=${b.score}`);
}

// --- 13. Score trace: arithmetic reproduces the reported score exactly ---
{
  const d = decision({ value_weights: { freedom: 0.8, security: 0.3 } });
  const mems = [
    memory('t1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('t2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
    memory('t3', 'Staying gave security', 'Staying in the current role gave me security; relieved.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const t = a.trace;
  const sumNet = t.lines.reduce((acc, l) => acc + l.contribution, 0);
  const sumMass = t.lines.reduce((acc, l) => acc + (l.supporting + l.contradicting) * l.weight, 0);
  check('trace: per-line contributions sum to the recorded net',
    Math.abs(sumNet - t.net) < 1e-9, `${sumNet} vs ${t.net}`);
  check('trace: per-line mass sums to the recorded classified mass',
    Math.abs(sumMass - t.classifiedMass) < 1e-9, `${sumMass} vs ${t.classifiedMass}`);
  check('trace: net/mass equals the reported score',
    Math.abs(t.net / t.classifiedMass - t.score) < 1e-9, `${t.net}/${t.classifiedMass} vs ${t.score}`);
  const freedomLine = t.lines.find((l) => l.value === 'freedom')!;
  check('trace: each line records its origin counts and record links',
    freedomLine.inferredCount >= 1 && freedomLine.memoryIds.includes('t1'), JSON.stringify(freedomLine));
}

// --- 14. Zero weights contribute nothing to net or mass ---
{
  const d = decision({ value_weights: { freedom: 0, security: 1 } });
  const mems = [
    memory('z1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('z2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const freedomLine = a.trace.lines.find((l) => l.value === 'freedom')!;
  check('zero weights: a value with weight 0 contributes 0 to net and mass',
    freedomLine.weight === 0 && freedomLine.contribution === 0 &&
    (freedomLine.supporting + freedomLine.contradicting) * freedomLine.weight === 0,
    JSON.stringify(freedomLine));
  // Score is driven only by the weighted value: 1 against × 1 / mass 1 = -1
  check('zero weights: score comes solely from the weighted value',
    a.score === -1, `got ${a.score}`);
}

// --- 15. Ties and changed weights: explainer names the decisive values ---
{
  const d = decision({ value_weights: { freedom: 0.5, security: 0.5 } });
  const mems = [
    memory('e1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('e2', 'Staying gave freedom', 'Staying in the current role kept my freedom; glad.'),
    memory('e3', 'Staying gave security', 'Staying gave me security; relieved.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  const lines = explainRanking([a, b]);
  check('ties: explainer reports the tie instead of a leader',
    lines.some((l) => /tie/i.test(l)), lines.join(' | '));
  const d2 = decision({ value_weights: { freedom: 0.9, security: 0.1 } });
  const mems2 = [
    memory('e1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('e2', 'Staying gave freedom', 'Staying in the current role kept my freedom; glad.'),
    memory('e3', 'Staying gave security', 'Staying gave me security; relieved.'),
    memory('e4', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
  ];
  const a2 = analyzeOptionValues('Take the offer', d2, mems2, []);
  const b2 = analyzeOptionValues('Stay in current role', d2, mems2, []);
  const lines2 = explainRanking([a2, b2]);
  check('changed weights: explainer names the decisive value arithmetic',
    lines2.some((l) => /leads/i.test(l)) && lines2.some((l) => /×0\.9/.test(l) || /gap/.test(l)),
    lines2.join(' | '));
}

// --- 16. Counterevidence: only directional-against items, with origin ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [
    memory('ce1', 'Offer drained', 'The offer left me exhausted and resentful about freedom.'),
    memory('ce2', 'Unclear mention', 'The offer schedule mentioned freedom in passing.'),
    memory('ce3', 'Offer great', 'The offer gave me freedom; glad.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const ce = extractCounterevidence([a]);
  check('counterevidence: only against-classified records appear',
    ce.length === 1 && ce[0].memoryId === 'ce1' && ce[0].origin === 'inferred',
    JSON.stringify(ce));
  check('counterevidence: unknown/neutral records are never included',
    !ce.some((c) => c.memoryId === 'ce2' || c.memoryId === 'ce3'), JSON.stringify(ce.map((c) => c.memoryId)));
}

// --- 17. Proposal generation and affected-belief matching ---
{
  const d = decision({
    status: 'decided' as const,
    chosen_option: 'Take the offer',
    reflection: { whatHappened: 'It went badly.', matchesOriginalReasoning: false, surprises: '', lesson: 'I underestimated how much security matters to me.' },
  });
  const beliefList = [
    { id: 'b1', statement: 'Security matters more than novelty', kind: 'belief' as const, status: 'active' as const, formed_at: new Date().toISOString(), description: null, origin: 'user' as const, last_reviewed: null, id2: undefined, category: 'work', strength: 60, last_reflected_at: new Date().toISOString(), history: [] },
    { id: 'b2', statement: 'Remote work suits me', kind: 'belief' as const, status: 'active' as const, formed_at: new Date().toISOString(), description: null, origin: 'user' as const, last_reviewed: null, category: 'work', strength: 60, last_reflected_at: new Date().toISOString(), history: [] },
  ] as unknown as Belief[];
  const affected = findAffectedBeliefs(d, beliefList);
  check('proposals: only beliefs sharing themes with the reflection are affected',
    affected.length === 1 && affected[0].id === 'b1', JSON.stringify(affected.map((b) => b.id)));
  if (affected.length === 1) {
    const p = buildBeliefProposal(d, affected[0]);
    check('proposals: divergent reflection proposes a strength decrease',
      p.status === 'pending' && /from 60 to 50/.test(p.change), p.change);
  }
  const noReflection = decision();
  check('proposals: no reflection means no affected beliefs',
    findAffectedBeliefs(noReflection, beliefList).length === 0);
}

console.log(`\nDecision engine tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
