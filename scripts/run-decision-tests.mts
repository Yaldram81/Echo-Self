/**
 * Deterministic engine tests for the Decision Mirror.
 * Run with: npx tsx scripts/run-decision-tests.mts
 */
import {
  ANALYSIS_VERSION,
  analysisInputHash,
  buildAnalysisSnapshot,
  findRelevantMemories,
  analyzeOptionValues,
  analyzeDecision,
  preferredOption,
  rankOptions,
  findWeightSensitivities,
  findStabilityRanges,
  assessConstraints,
  extractCounterevidence,
  explainRanking,
  buildBeliefProposal,
  findAffectedBeliefs,
  isSnapshotStale,
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

// --- 18. Input hash + snapshot: traceable to inputs, stale on any change ---
{
  const mems = [
    memory('h1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('h2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
    memory('h4', 'Staying gave security', 'Staying in the current role gave me security; relieved.'),
  ];
  const d = decision();
  const overrides = {};
  const hash1 = analysisInputHash(d, mems, overrides);
  const hash2 = analysisInputHash(d, mems, overrides);
  check('snapshot: identical inputs produce an identical hash', hash1 === hash2, `${hash1} vs ${hash2}`);

  const rep = analyzeDecision(d, mems, beliefs);
  check('snapshot: report carries the same input hash the builder records',
    rep.inputHash === hash1, `${rep.inputHash} vs ${hash1}`);
  const snap = buildAnalysisSnapshot(d, mems, beliefs, overrides, rep);
  check('snapshot: snapshot records version, hash, weights, and evidence ids',
    snap.engineVersion === ANALYSIS_VERSION && snap.inputHash === hash1 &&
    Object.keys(snap.inputs.valueWeights).length === 2 &&
    snap.inputs.evidenceMemoryIds.length >= 1, JSON.stringify(snap.inputs));

  // Acceptance gate: change ONE weight → mathematically consistent staleness.
  const changedWeights = { ...d, value_weights: { freedom: 0.7, security: 0.5 } };
  check('snapshot: changing one weight makes the stored snapshot stale',
    isSnapshotStale(snap, changedWeights, mems, overrides));
  check('snapshot: unchanged inputs keep the snapshot fresh',
    !isSnapshotStale(snap, d, mems, overrides));

  // A weight change must also change the score deterministically.
  const before = analyzeOptionValues('Take the offer', d, mems, []).score;
  const after = analyzeOptionValues('Take the offer', changedWeights, mems, []).score;
  check('snapshot: a weight change recalculates from real inputs (score follows)',
    before !== after, `before=${before} after=${after}`);

  // New evidence also stales the snapshot.
  const moreMems = [...mems, memory('h3', 'Offer risked security', 'The offer put my security at risk; I dreaded it.')];
  check('snapshot: a new relevant record makes the snapshot stale',
    isSnapshotStale(snap, d, moreMems, overrides));

  // A user correction stales it too.
  check('snapshot: a user correction makes the snapshot stale',
    isSnapshotStale(snap, d, mems, { 'd-test:Take the offer:freedom:h1': 'against' as const }));

  // Missing/foreign snapshot is stale; snapshot survives JSON round-trip (DB shape).
  check('snapshot: missing snapshot counts as stale', isSnapshotStale(null, d, mems, overrides));
  const roundTrip = JSON.parse(JSON.stringify(snap)) as typeof snap;
  check('snapshot: snapshot survives a JSON round-trip (database shape)',
    !isSnapshotStale(roundTrip, d, mems, overrides));
}

// --- 19. Ranking stability: sweep range is consistent with the leader ---
{
  // Option A: pro on freedom, con on security. B: the mirror image. The leader
  // then depends on the freedom/security weight split.
  const d = decision({ value_weights: { freedom: 0.9, security: 0.1 } });
  const mems = [
    memory('r1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('r2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
    memory('r3', 'Staying gave security', 'Staying in the current role gave me security; relieved.'),
    memory('r4', 'Staying cost freedom', 'Staying in the current role cost me freedom; I avoided change.'),
  ];
  const relevant = findRelevantMemories(d, mems);
  const ranges = findStabilityRanges(d, mems, relevant);
  const freedomRange = ranges.find((r) => r.value === 'freedom');
  check('stability: a range is produced for each value when a leader exists',
    ranges.length === 2, JSON.stringify(ranges));
  check('stability: leader leads across its swept range, including the current weight',
    !!freedomRange && freedomRange.leader === 'Take the offer' &&
    freedomRange.low <= 0.9 && 0.9 <= freedomRange.high,
    JSON.stringify(freedomRange));
  // The range bounds must be reproducible: at low-ε and high+step the leader changes.
  if (freedomRange) {
    const dLow = { ...d, value_weights: { ...d.value_weights, freedom: Math.max(0, freedomRange.low - 0.05) } };
    const leaderLow = preferredOption(d.options.map((o) => analyzeOptionValues(o.label, dLow, mems, relevant)));
    check('stability: just below the range the leader changes',
      leaderLow !== freedomRange!.leader, `${leaderLow} at ${freedomRange!.low - 0.05}`);
  }
  // A narrow range is reported as such (span recorded honestly).
  check('stability: spans lie within [0, 1]',
    ranges.every((r) => r.span >= 0 && r.span <= 1), JSON.stringify(ranges.map((r) => r.span)));
}

// --- 20. Edge cases: no options, one option, no values, all-zero weights, constraints disqualify ---
{
  const mems = [memory('m1', 'Offer gave freedom', 'The offer gave me freedom; glad.')];

  const noOptions = decision({ options: [] });
  const repNoOptions = analyzeDecision(noOptions, mems, beliefs);
  check('edge: no options means no alignments and no leader',
    repNoOptions.optionAlignments.length === 0 && repNoOptions.preferredOption === null);

  const oneOption = decision({ options: [OFFER] });
  const repOne = analyzeDecision(oneOption, mems, beliefs);
  check('edge: one option still yields a traceable score and can be the leader',
    repOne.optionAlignments.length === 1 && repOne.preferredOption === 'Take the offer' &&
    repOne.optionAlignments[0].trace.lines.length === 2,
    JSON.stringify(repOne.optionAlignments.map((a) => a.score)));

  const noValues = decision({ values: [], value_weights: {} });
  const repNoValues = analyzeDecision(noValues, mems, beliefs);
  check('edge: no values → incompleteness stated, no leader',
    repNoValues.optionAlignments.every((a) => a.incompleteness !== null) &&
    repNoValues.preferredOption === null, JSON.stringify(repNoValues.optionAlignments.map((a) => a.incompleteness)));

  const zeroWeights = decision({ value_weights: { freedom: 0, security: 0 } });
  const repZero = analyzeDecision(zeroWeights, mems, beliefs);
  check('edge: all-zero weights → incompleteness stated, not a neutral 0',
    repZero.optionAlignments.every((a) => a.incompleteness !== null && a.score === 0) &&
    repZero.preferredOption === null);

  // A blocking constraint is flagged, not silently dropped (disqualification is
  // surfaced for the user; the engine never removes options on its own).
  const constrained = decision({ constraints: 'Must stay within driving distance of family.' });
  const blocking = [memory('b9', 'The distance rule', 'I refused any job that moves me farther from family; no relocations.')];
  const statuses = assessConstraints(constrained, blocking);
  check('edge: a disqualifying constraint is flagged evidence_against',
    statuses.length === 1 && statuses[0].status === 'evidence_against', JSON.stringify(statuses));
}

// --- 21. Invalid/stale saved analysis and reopening after an outcome ---
{
  const mems = [memory('m1', 'Offer gave freedom', 'The offer gave me freedom; glad.')];
  const d = decision();

  // A snapshot saved by an older engine version is stale even with identical inputs.
  const oldEngine = { ...buildAnalysisSnapshot(d, mems, beliefs, {}, analyzeDecision(d, mems, beliefs)), engineVersion: 'dm-3' };
  check('edge: a snapshot from an older engine version is stale',
    isSnapshotStale(oldEngine, d, mems, {}));

  // Reopening clears the choice but the analysis inputs remain reproducible.
  const decided = decision({ status: 'decided' as const, chosen_option: 'Take the offer', decided_at: new Date().toISOString(), reflection: { whatHappened: 'Fine.', matchesOriginalReasoning: true, surprises: '', lesson: '' } });
  const snapshotWhileDecided = buildAnalysisSnapshot(decided, mems, beliefs, {}, analyzeDecision(decided, mems, beliefs));
  const reopened: Decision = { ...decided, status: 'unresolved', chosen_option: null, rationale: null, decided_at: null, reflection: null, reflected_at: null };
  check('edge: reopening after an outcome keeps the analysis reproducible (status is not an input)',
    !isSnapshotStale(snapshotWhileDecided, reopened, mems, {}));

  // The user-edited analysis path never fabricates a generated report.
  const edited = decision({ analysis_edited: true, analysis: { summary: 'My own words.', options: [], contradictions: [], missingInformation: [], experiments: [] } });
  const repEdited = analyzeDecision(edited, mems, beliefs);
  check('edge: an edited analysis still computes a fresh report when asked, without overwriting the user text',
    repEdited.summary.length > 0 && edited.analysis!.summary === 'My own words.');
}

// --- 22. dm-5: coverage disclosure and the comparability gate ---
{
  const d = decision({ value_weights: { freedom: 0.6, security: 0.6 } });
  // Both options assessed on freedom (netting 0); only A assessed on security (for).
  // Full: A = 0.6/1.8 = 1/3 > B = 0, but on common values both tie at 0 → withheld.
  const mems = [
    memory('g1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('g2', 'Offer freedom drained', 'The offer left me exhausted and resentful about freedom.'),
    memory('g3', 'Offer gave security', 'The offer gave me security; relieved.'),
    memory('g4', 'Staying gave freedom', 'Staying in the current role gave me freedom; glad.'),
    memory('g5', 'Staying freedom drained', 'Staying in the current role left me exhausted about freedom.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  check('coverage: an option with directional evidence on both values reports both',
    a.coverage.assessedValues.length === 2 && a.coverage.unassessedValues.length === 0,
    JSON.stringify(a.coverage));
  check('coverage: an option with evidence on one value marks the other unassessed',
    b.coverage.assessedValues.includes('freedom') && b.coverage.unassessedValues.includes('security'),
    JSON.stringify(b.coverage));

  const gate = rankOptions([a, b]);
  check('comparability: differing coverage triggers the gate (common values computed)',
    gate.commonValues.length === 1 && gate.commonValues[0] === 'freedom', JSON.stringify(gate));
  check('comparability: full-score lead not confirmed on common values is withheld with a reason',
    gate.preferred === null && gate.withheld !== null && gate.withheld.includes('security'),
    JSON.stringify(gate));
}

// --- 23. dm-5: gate names the leader when common-dimension comparison agrees ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0.5 } });
  // A: freedom for + security for (full = 1). B: freedom 1-for-1-against (full = 0).
  // Common values (freedom): A = 1 > B = 0 → agree → named with disclosure.
  const mems = [
    memory('h1a', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('h2a', 'Offer security kept', 'The offer kept my security intact; relieved.'),
    memory('h3a', 'Staying gave freedom', 'Staying in the current role gave me freedom; glad.'),
    memory('h4a', 'Staying freedom drained', 'Staying in the current role left me exhausted about freedom.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  const gate = rankOptions([a, b]);
  check('comparability: leader named when common-dimension comparison agrees',
    gate.preferred === 'Take the offer' && gate.withheld === null,
    JSON.stringify(gate));
  check('comparability: disclosure names the coverage difference',
    gate.disclosure !== null && gate.disclosure.includes('security'), gate.disclosure ?? 'none');
}

// --- 24. dm-5: gate withheld when common-dimension leader differs from full leader ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  // A leads full only because of security (B never assessed on it); on common freedom, B ties.
  const mems = [
    memory('i1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('i2', 'Offer security risk', 'The offer put my security at risk; I dreaded it.'),
    memory('i3', 'Staying gave freedom', 'Staying in the current role kept my freedom; glad.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  // Full: A = (1 + −1×0)/1 = 1, B = 1 → actually tie. Make A clearly ahead full: add a pro.
  const aWithPro = analyzeOptionValues('Take the offer', { ...d, options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] }, mems, []);
  const b2 = analyzeOptionValues('Stay in current role', { ...d, options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] }, mems, []);
  const gate = rankOptions([aWithPro, b2]);
  // Common values: both = 1 → tie on common → withheld.
  check('comparability: full-score lead not confirmed on common values is withheld',
    gate.preferred === null && gate.withheld !== null, JSON.stringify(gate));
  void a; void b;
}

// --- 25. dm-5: identical coverage keeps the simple ranking ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [
    memory('j1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('j2', 'Staying freedom drain', 'Staying in the current role traded freedom for exhaustion; resentful.'),
    memory('j3', 'Offer security risk', 'The offer put my security at risk; I dreaded it.'),
    memory('j4', 'Staying security good', 'Staying gave me security; relieved.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const b = analyzeOptionValues('Stay in current role', d, mems, []);
  check('coverage: both options assessed on both values',
    a.coverage.assessedValues.length === 2 && b.coverage.assessedValues.length === 2, JSON.stringify([a.coverage, b.coverage]));
  const gate = rankOptions([a, b]);
  // Full: A = (1 + −1)/2 = 0, B = (−1 + 1)/2 = 0 → tie, no leader. With a pro on A:
  void gate;
  const d2 = { ...d, options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] };
  const a2 = analyzeOptionValues('Take the offer', d2, mems, []);
  const b2 = analyzeOptionValues('Stay in current role', d2, mems, []);
  const gate2 = rankOptions([a2, b2]);
  // A full = (1+1−1)/3 = 0.333; B = (−1+1)/2 = 0. Common = same values → A leads, named, no disclosure.
  check('comparability: same coverage → straightforward ranking, no gate disclosure',
    gate2.preferred === 'Take the offer' && gate2.disclosure === null && gate2.withheld === null,
    JSON.stringify(gate2));
}

// --- 26. dm-5: snapshot records coverage, common values, withheld reason ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [
    memory('s1a', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('s2a', 'Staying gave freedom', 'Staying in the current role kept my freedom; glad.'),
  ];
  const rep = analyzeDecision(d, mems, beliefs);
  const snap = buildAnalysisSnapshot(d, mems, beliefs, {}, rep);
  check('snapshot: coverage per option recorded',
    Array.isArray(snap.inputs.coverage) && snap.inputs.coverage!.length === 2 &&
    snap.inputs.coverage!.every((c) => c.assessedValues.includes('freedom')),
    JSON.stringify(snap.inputs.coverage));
  check('snapshot: common assessed values recorded',
    snap.inputs.commonAssessedValues!.includes('freedom'), JSON.stringify(snap.inputs.commonAssessedValues));
  check('snapshot: withheld reason recorded when ranking withheld',
    snap.inputs.withheldRanking === rep.ranking.withheld, `${snap.inputs.withheldRanking}`);
  check('snapshot: approved classifications recorded (empty here)',
    snap.inputs.approvedClassifications !== undefined && Object.keys(snap.inputs.approvedClassifications!).length === 0,
    JSON.stringify(snap.inputs.approvedClassifications));
}

// --- 27. dm-5: changed weight produces the mathematically expected score change ---
{
  const d = decision({ value_weights: { freedom: 0.5, security: 0.5 } });
  const mems = [
    memory('k1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('k2', 'Offer risked security', 'The offer put my security at risk; I dreaded it.'),
  ];
  // Option A: freedom for (1), security against (−1). mass = 0.5 + 0.5 = 1, net = 0.5 − 0.5 = 0.
  const base = analyzeOptionValues('Take the offer', d, mems, []);
  check('weight math: 0.5/0.5 split with symmetric evidence scores 0',
    base.score === 0, `got ${base.score}`);
  // freedom = 0.8: net = 1×0.8 + (−1)×0.5 = 0.3; mass = 0.8 + 0.5 = 1.3; score = 0.3/1.3.
  const d2 = { ...d, value_weights: { freedom: 0.8, security: 0.5 } };
  const after = analyzeOptionValues('Take the offer', d2, mems, []);
  const expected = (1 * 0.8 + (-1) * 0.5) / (0.8 + 0.5);
  check('weight math: raising freedom to 0.8 yields (0.8−0.5)/(0.8+0.5)',
    Math.abs(after.score - expected) < 1e-9, `got ${after.score}, expected ${expected}`);
  // freedom = 1, security = 0: score must be exactly 1.
  const d3 = { ...d, value_weights: { freedom: 1, security: 0 } };
  const full = analyzeOptionValues('Take the offer', d3, mems, []);
  check('weight math: weight 1/0 scores exactly 1', full.score === 1, `got ${full.score}`);
}

// --- 28. dm-5: inferred counts are separated from user-provided judgments ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [memory('n1a', 'Offer gave freedom', 'The offer gave me freedom; glad.')];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  const line = a.values.find((v) => v.value === 'freedom')!;
  check('origins: keyword-only evidence reports inferredCount 1, userProvidedCount 0',
    line.inferredCount === 1 && line.userProvidedCount === 0, JSON.stringify(line));
  // After a correction the same record is user-provided.
  const corrected = analyzeOptionValues('Take the offer', d, mems, [], { 'd-test:Take the offer:freedom:n1a': 'against' as const });
  const line2 = corrected.values.find((v) => v.value === 'freedom')!;
  check('origins: after correction the judgment counts as user-provided',
    line2.userProvidedCount === 1 && line2.inferredCount === 0, JSON.stringify(line2));
  // Explicit pros count as user-provided.
  const d2 = { ...d, options: [{ label: 'Take the offer', pros: ['more freedom in schedule'], cons: [] }, STAY] };
  const explicit = analyzeOptionValues('Take the offer', d2, [], []);
  const line3 = explicit.values.find((v) => v.value === 'freedom')!;
  check('origins: explicit pros count as user-provided',
    line3.userProvidedCount === 1 && line3.inferredCount === 0, JSON.stringify(line3));
}

// --- 29. dm-5: sparse and empty evidence under dm-5 shapes ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const a = analyzeOptionValues('Take the offer', d, [], []);
  check('sparse: no evidence → everything unassessed, insufficient flag',
    a.insufficientEvidence && a.coverage.assessedValues.length === 0 &&
    a.coverage.unassessedValues.length === 2, JSON.stringify(a.coverage));
  const gate = rankOptions([a]);
  check('sparse: single insufficient option produces no leader and no withheld reason',
    gate.preferred === null && gate.withheld === null && gate.commonValues.length === 0,
    JSON.stringify(gate));
  // One-sided sparse: A has evidence, B has none → no defensible comparison.
  const b = analyzeOptionValues('Stay in current role', d, [memory('sp1', 'Offer gave freedom', 'The offer gave me freedom; glad.')], []);
  const gate2 = rankOptions([a, b]);
  check('sparse: option with no evidence cannot be ranked against one with evidence',
    gate2.preferred === null, JSON.stringify(gate2));
  void gate2.withheld;
}

// --- 30. dm-5: contradictory records under the gate keep netting out ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  const mems = [
    memory('cc1', 'Offer gave freedom', 'The offer gave me freedom; glad.'),
    memory('cc2', 'Offer drained', 'The offer left me exhausted and resentful about freedom.'),
  ];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  check('contradictions: 1-for-1-against still scores 0 under dm-5',
    a.score === 0 && !a.insufficientEvidence, `score=${a.score}`);
  const gate = rankOptions([a, { ...a, label: 'Stay in current role', coverage: { ...a.coverage } }]);
  check('contradictions: identical mirrored options tie under the gate',
    gate.preferred === null, JSON.stringify(gate));
}

// --- 31. dm-5: constraints that disqualify remain flagged, never silently ranked ---
{
  const d = decision({ constraints: 'Must not lose healthcare coverage.' });
  const blocking = [memory('dq1', 'The coverage rule', 'I cannot accept any role without healthcare coverage; refused the last one.')];
  const statuses = assessConstraints(d, blocking);
  check('constraints: disqualifying evidence flags evidence_against under dm-5',
    statuses.length === 1 && statuses[0].status === 'evidence_against', JSON.stringify(statuses));
  // The engine never removes the option; the flag is the mechanism.
  const rep = analyzeDecision(d, blocking, beliefs);
  check('constraints: options are never auto-removed, only flagged',
    rep.optionAlignments.length === 2 && rep.constraintStatuses[0].status === 'evidence_against',
    JSON.stringify(rep.constraintStatuses));
}

// --- 32. dm-5: inferred ratings are never fabricated into scores ---
{
  const d = decision({ value_weights: { freedom: 1, security: 0 } });
  // A record that mentions freedom with no direction: stays neutral/unknown, contributes nothing.
  const mems = [memory('f1a', 'Offer schedule', 'The offer schedule mentioned freedom in passing.')];
  const a = analyzeOptionValues('Take the offer', d, mems, []);
  check('no fabrication: directionless mention contributes nothing to net or mass',
    a.score === 0 && a.insufficientEvidence, `score=${a.score} flagged=${a.insufficientEvidence}`);
  const line = a.values.find((v) => v.value === 'freedom')!;
  check('no fabrication: the value is marked unassessed, unknown not zero',
    line.supportingMemories === 0 && line.contradictingMemories === 0 &&
    a.coverage.unassessedValues.includes('freedom'), JSON.stringify(line));
}

console.log(`\nDecision engine tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
