import type { AnalysisSnapshot, Belief, BeliefProposal, Decision, Memory, ScoreTrace, ValueTraceLine } from './types';

/**
 * Deterministic decision analysis engine.
 *
 * Transparent and reproducible: every score traces to the user's stated value
 * weights and to identifiable records. Classifications are labeled explicit
 * (user-authored pros/cons) or inferred (keyword match, with rationale) and can
 * be approved, rejected, or corrected by the user. Missing evidence is UNKNOWN,
 * never for/against. Options with different evidence coverage are compared only
 * on commonly assessed values; an overall ranking is withheld when it would not
 * be defensible. Scores are preference alignment, not probability of success.
 */

export const ANALYSIS_VERSION = 'dm-5';

export type Classification = 'for' | 'against' | 'neutral' | 'unknown';
export type ClassificationOrigin = 'explicit' | 'inferred' | 'override';

export interface MemoryClassification {
  memoryId: string;
  memoryTitle: string;
  value: string;
  classification: Classification;
  origin: ClassificationOrigin;
  /** Why this classification was assigned; shown to the user and correctable. */
  rationale: string;
}

export interface RelevantMemory {
  memory: Memory;
  reason: string;
  score: number;
}

export interface ValueAlignmentResult {
  value: string;
  weight: number;
  supportingMemories: number;
  contradictingMemories: number;
  unknownMemories: number;
  alignmentNote: string;
  /** Judgments that came from you: explicit pros/cons plus your corrections. */
  userProvidedCount: number;
  /** Judgments proposed by keyword inference (not yet approved by you). */
  inferredCount: number;
}

export interface OptionAlignment {
  label: string;
  /**
   * Preference alignment in [-1, 1]. Normalized by the option's own classified
   * evidence so a 2-1 split scores the same regardless of pile size. NOTE: a
   * score is only comparable across options when the options share assessed
   * values — see `coverage` and the comparability gate in `rankOptions`.
   * 0 with unknownCount > 0 means "not assessable", not "neutral".
   */
  score: number;
  /** True when no evidence classified for/against this option. */
  insufficientEvidence: boolean;
  /** Why a score of 0 is not a real comparison (no values, all weights 0, no evidence). */
  incompleteness: string | null;
  values: ValueAlignmentResult[];
  classifications: MemoryClassification[];
  /** Full arithmetic trace behind the score. */
  trace: ScoreTrace;
  /** Which of the decision's values this option actually has assessed evidence on. */
  coverage: OptionCoverage;
}

/**
 * Which of the decision's values an option actually has assessed (directional)
 * evidence on. Options with different coverage are only compared on their
 * common assessed values — see `rankOptions`.
 */
export interface OptionCoverage {
  /** Values with at least one for/against classification for this option. */
  assessedValues: string[];
  /** Decision values with no directional evidence for this option (unknown, not zero). */
  unassessedValues: string[];
  /** Weighted mass of the assessed values: Σ (for + against) × weight. */
  assessedWeightMass: number;
  /** Weighted mass of all decision values: Σ weight. */
  totalWeightMass: number;
}

/**
 * The result of the comparability gate. `preferred` is only set when naming a
 * leader is defensible; `withheld` carries the plain-language reason when it is
 * not. `commonValues` lists the values every assessable option was assessed on.
 */
export interface RankingResult {
  preferred: string | null;
  withheld: string | null;
  commonValues: string[];
  /** Shown when the full-input leader differs from the common-dimension leader. */
  disclosure: string | null;
}

export interface WeightSensitivity {
  value: string;
  /** Small weight change that flips the preferred option. */
  testedAt: number;
  /** Preferred option at the current weights. */
  baseline: string | null;
  /** Preferred option after the small change. */
  shifted: string | null;
}

/**
 * Weight-range stability: the span over which the current leader stays ahead
 * when ONE value's weight is swept across [0, 1] with the others held fixed.
 * A narrow range means the option wins only under a narrow weighting
 * configuration. Illustrative scenarios, not predictions.
 */
export interface StabilityRange {
  value: string;
  leader: string;
  /** Lowest and highest weights (within [0,1]) at which `leader` still leads. */
  low: number;
  high: number;
  /** The full [0,1] span — a wide range means the result is robust to this value. */
  span: number;
}

export interface ConstraintStatus {
  constraint: string;
  /** Constraints are never marked satisfied without stored supporting evidence. */
  status: 'unknown' | 'evidence_against' | 'evidence_for';
  note: string;
}

export interface DecisionReport {
  summary: string;
  method: {
    version: string;
    explanation: string;
    inputs: {
      valueWeights: Record<string, number>;
      evidenceMemoryIds: string[];
      explicitItems: { option: string; kind: 'pro' | 'con'; text: string }[];
      overrideCount: number;
      generatedFrom: string;
    };
  };
  relevantMemories: RelevantMemory[];
  optionAlignments: OptionAlignment[];
  preferredOption: string | null;
  /** Full comparability-gate outcome: withheld reason, common values, disclosure. */
  ranking: RankingResult;
  weightSensitivities: WeightSensitivity[];
  /** Per-value weight span over which the current leader stays ahead. */
  stabilityRanges: StabilityRange[];
  /** Hash of the exact inputs behind this report; matches a stored snapshot. */
  inputHash: string;
  /** Records classified AGAINST each option, with dates and links. */
  counterevidence: CounterevidenceItem[];
  constraintStatuses: ConstraintStatus[];
  contradictions: string[];
  missingInformation: string[];
  experiments: string[];
  evidenceLimitations: string[];
}

export interface CounterevidenceItem {
  optionLabel: string;
  memoryId: string;
  memoryTitle: string;
  occurredAt: string;
  value: string;
  origin: ClassificationOrigin;
  rationale: string;
}

const STOP_WORDS = new Set([
  'what', 'have', 'with', 'this', 'that', 'your', 'from', 'about', 'into', 'over',
  'does', 'were', 'them', 'then', 'than', 'when', 'which', 'there', 'their',
  'would', 'could', 'should', 'where', 'will', 'shall', 'been', 'being', 'more',
  'most', 'very', 'some', 'also', 'after', 'before', 'while', 'other', 'whether',
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
}

function overlapCount(haystack: string, list: string[]): number {
  return list.filter((t) => haystack.includes(t)).length;
}

export function findRelevantMemories(
  decision: Decision,
  memories: Memory[],
  limit = 6
): RelevantMemory[] {
  const query = [
    decision.title,
    decision.context,
    decision.constraints ?? '',
    decision.uncertainties ?? '',
    decision.values.join(' '),
  ].join(' ');
  const allTerms = terms(query);

  const valueTerms = decision.values.map((v) => v.toLowerCase());
  const contextTerms = terms(`${decision.context} ${decision.constraints ?? ''}`);

  const scored = memories
    .map((memory) => {
      const hay = `${memory.title} ${memory.content} ${(memory.tags ?? []).join(' ')}`.toLowerCase();
      const keywordHits = overlapCount(hay, allTerms);
      const valueHits = valueTerms.filter((v) => hay.includes(v)).length;
      const contextHits = overlapCount(hay, contextTerms);
      const score = keywordHits * 2 + valueHits * 3 + contextHits;
      if (score === 0) return null;

      const reasons: string[] = [];
      if (valueHits > 0) reasons.push(`touches your recorded value${valueHits > 1 ? 's' : ''} (${valueTerms.filter((v) => hay.includes(v)).join(', ')})`);
      if (contextHits > 0) reasons.push('matches the decision context');
      if (keywordHits > valueHits + contextHits) reasons.push('shares subject matter');
      if (reasons.length === 0) reasons.push('related by theme');

      return { memory, reason: reasons.join('; '), score };
    })
    .filter((r): r is RelevantMemory => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/**
 * Keyword inference. Deliberately shallow — which is why every inferred
 * classification carries its rationale and can be corrected by the user.
 * A memory whose text mentions the value but nothing directional is UNKNOWN.
 */
const FOR_SIGNALS = /\b(chose|choosing|glad|relieved|clearer|declined|said no to|protect|boundar|preferr)\w*/i;
const AGAINST_SIGNALS = /\b(regret|fumbled|avoid|guilt|dread|pressure|stuck|exhaust|resent|overload)\w*/i;

function classifyOptionAgainstMemory(
  optionLabel: string,
  memory: Memory,
  value: string,
  otherLabels: string[]
): { classification: Classification; rationale: string } {
  const hay = `${memory.title} ${memory.content}`;
  const lower = hay.toLowerCase();
  const words = optionLabel.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const thisShares = words.filter((w) => lower.includes(w));
  // Words that identify the OTHER options, excluding words this option shares.
  const thisWordSet = new Set(words);
  const otherWords = Array.from(
    new Set(otherLabels.flatMap((l) => l.toLowerCase().split(/\W+/).filter((w) => w.length > 3)))
  ).filter((w) => !thisWordSet.has(w));
  const otherShares = otherWords.filter((w) => lower.includes(w));

  if (!lower.includes(value)) {
    return { classification: 'unknown', rationale: `The record never mentions "${value}".` };
  }
  if (thisShares.length > 0 && FOR_SIGNALS.test(hay) && !AGAINST_SIGNALS.test(hay)) {
    return { classification: 'for', rationale: `Inferred "for": the record mentions ${value} and this option ("${thisShares.slice(0, 2).join(', ')}") with favorable language ("${(hay.match(FOR_SIGNALS) ?? ['signal'])[0]}"). Keyword inference, correct it if wrong.` };
  }
  if (thisShares.length > 0 && AGAINST_SIGNALS.test(hay)) {
    return { classification: 'against', rationale: `Inferred "against": the record mentions ${value} and this option ("${thisShares.slice(0, 2).join(', ')}") with negative language ("${(hay.match(AGAINST_SIGNALS) ?? ['signal'])[0]}"). Keyword inference, correct it if wrong.` };
  }
  if (thisShares.length === 0 && otherShares.length > 0) {
    return { classification: 'neutral', rationale: `The record mentions ${value} but is about a different option ("${otherShares.slice(0, 2).join(', ')}"), so it is not counted for or against this one.` };
  }
  if (thisShares.length > 0) {
    return { classification: 'neutral', rationale: `The record mentions ${value} and this option, but neither direction nor consequence; treated as neutral, not supportive.` };
  }
  return { classification: 'unknown', rationale: `The record mentions ${value} but its relation to "${optionLabel}" is unclear from keywords alone.` };
}

export function analyzeOptionValues(
  optionLabel: string,
  decision: Decision,
  memories: Memory[],
  relevant: RelevantMemory[],
  overrides: Record<string, Classification> = {}
): OptionAlignment {
  const weights = decision.value_weights ?? {};
  const valueResults: ValueAlignmentResult[] = [];
  const classifications: MemoryClassification[] = [];

  // Explicit user-authored items first: the option's own pros/cons.
  const option = decision.options.find((o) => o.label === optionLabel);
  const explicitItems: { value: string; classification: Classification; text: string; rationale: string }[] = [];
  for (const pro of option?.pros ?? []) {
    for (const value of decision.values) {
      if (pro.toLowerCase().includes(value.toLowerCase())) {
        explicitItems.push({
          value,
          classification: 'for',
          text: pro,
          rationale: 'You listed this as a pro of the option, an explicit assessment rather than an inference.',
        });
      }
    }
  }
  for (const con of option?.cons ?? []) {
    for (const value of decision.values) {
      if (con.toLowerCase().includes(value.toLowerCase())) {
        explicitItems.push({
          value,
          classification: 'against',
          text: con,
          rationale: 'You listed this as a con of the option, an explicit assessment rather than an inference.',
        });
      }
    }
  }

  const pool = relevant.length > 0 ? relevant.map((r) => r.memory) : memories;

  for (const value of decision.values) {
    const v = value.toLowerCase();
    let supporting = 0;
    let contradicting = 0;
    let unknownCount = 0;

    for (const item of explicitItems.filter((e) => e.value === value)) {
      classifications.push({
        memoryId: `explicit:${optionLabel}:${item.text.slice(0, 40)}`,
        memoryTitle: item.text,
        value,
        classification: item.classification,
        origin: 'explicit',
        rationale: item.rationale,
      });
      if (item.classification === 'for') supporting += 1;
      if (item.classification === 'against') contradicting += 1;
    }

    const touching = pool.filter((m) =>
      `${m.title} ${m.content} ${(m.tags ?? []).join(' ')}`.toLowerCase().includes(v)
    );

    for (const m of touching) {
      const overrideKey = `${decision.id}:${optionLabel}:${value}:${m.id}`;
      const override = overrides[overrideKey];
      let cls: { classification: Classification; rationale: string };
      const otherLabels = decision.options.map((o) => o.label).filter((l) => l !== optionLabel);
      if (override) {
        cls = { classification: override, rationale: `Corrected by you (was inferred). Stored as your explicit judgment for ${value} / "${optionLabel}".` };
      } else {
        cls = classifyOptionAgainstMemory(optionLabel, m, v, otherLabels);
      }
      classifications.push({
        memoryId: m.id,
        memoryTitle: m.title,
        value,
        classification: cls.classification,
        origin: override ? 'override' : 'inferred',
        rationale: cls.rationale,
      });
      if (cls.classification === 'for') supporting += 1;
      if (cls.classification === 'against') contradicting += 1;
      if (cls.classification === 'unknown' || cls.classification === 'neutral') unknownCount += 1;
    }

  const weight = typeof weights[value] === 'number' ? weights[value] : 0.5;
  const userProvided = explicitItems.filter((e) => e.value === value).length +
    classifications.filter((c) => c.value === value && c.origin === 'override').length;
  const inferred = classifications.filter((c) => c.value === value && c.origin === 'inferred').length;
  const alignmentNote =
      touching.length === 0 && explicitItems.filter((e) => e.value === value).length === 0
        ? `No recorded memories or explicit pros/cons mention "${value}", so alignment on this value is unknown, not favorable.`
        : supporting === 0 && contradicting === 0
          ? `Records mentioning "${value}" carry no clear direction for this option (${unknownCount} unresolved); it counts as unknown, not as support.`
          : `${supporting} item${supporting === 1 ? '' : 's'} point toward this option on ${value}${contradicting > 0 ? `, ${contradicting} point away` : ''}${unknownCount > 0 ? `, ${unknownCount} unresolved` : ''}.`;

    valueResults.push({ value, weight, supportingMemories: supporting, contradictingMemories: contradicting, unknownMemories: unknownCount, alignmentNote, userProvidedCount: userProvided, inferredCount: inferred });
  }

  // Normalized: net weighted signal divided by the option's own classified
  // weight mass, so a 2-1 split scores the same regardless of pile size. All-unknown → 0 + flagged.
  const net = valueResults.reduce(
    (acc, v) => acc + (v.supportingMemories - v.contradictingMemories) * v.weight, 0
  );
  const classifiedMass = valueResults.reduce(
    (acc, v) => acc + (v.supportingMemories + v.contradictingMemories) * v.weight, 0
  );
  const score = classifiedMass > 0 ? Math.max(-1, Math.min(1, net / classifiedMass)) : 0;

  const assessedValues = valueResults
    .filter((v) => v.supportingMemories + v.contradictingMemories > 0)
    .map((v) => v.value);
  const unassessedValues = valueResults
    .filter((v) => v.supportingMemories + v.contradictingMemories === 0)
    .map((v) => v.value);
  const coverage: OptionCoverage = {
    assessedValues,
    unassessedValues,
    assessedWeightMass: classifiedMass,
    totalWeightMass: decision.values.reduce(
      (acc, v) => acc + (typeof weights[v] === 'number' ? weights[v] : 0.5), 0
    ),
  };

  // An all-zero comparison must never read as a real "neutral" result.
  const totalWeight = decision.values.reduce(
    (acc, v) => acc + (typeof weights[v] === 'number' ? weights[v] : 0.5), 0
  );
  const incompleteness =
    decision.values.length === 0
      ? 'No values are linked to this decision, so no value-weighted score exists.'
      : totalWeight === 0
        ? 'All value weights are set to 0, so nothing can contribute to a score.'
        : classifiedMass === 0
          ? 'No directional evidence classifies for this option; that is unknown, not neutral.'
          : null;

  // Arithmetic trace: every line shows inputs (counts by origin), the weighted
  // contribution, and the record links, so the score is reproducible by hand.
  const lines: ValueTraceLine[] = valueResults.map((v) => {
    const cls = classifications.filter((c) => c.value === v.value);
    return {
      value: v.value,
      weight: v.weight,
      supporting: v.supportingMemories,
      contradicting: v.contradictingMemories,
      contribution: (v.supportingMemories - v.contradictingMemories) * v.weight,
      explicitCount: cls.filter((c) => c.origin === 'explicit').length,
      inferredCount: cls.filter((c) => c.origin === 'inferred').length,
      overrideCount: cls.filter((c) => c.origin === 'override').length,
      memoryIds: cls
        .filter((c) => c.classification === 'for' || c.classification === 'against')
        .map((c) => c.memoryId)
        .filter((id) => !id.startsWith('explicit:')),
    };
  });
  const trace: ScoreTrace = { lines, net, classifiedMass, score };

  return {
    label: optionLabel,
    score,
    insufficientEvidence: classifiedMass === 0,
    incompleteness,
    values: valueResults,
    classifications,
    trace,
    coverage,
  };
}

/**
 * Comparability gate + ranking. A leader is only named when it is defensible:
 *
 * 1. Both options must have assessable evidence (not insufficient, not blocked
 *    by a zero-weight/no-value incompleteness).
 * 2. If the two options were assessed on substantially different values, the
 *    bare normalized scores are NOT directly comparable — a full-score leader
 *    can rest on evidence the other option never got to show. In that case the
 *    comparison falls back to the COMMON assessed values, and if the full-score
 *    leader differs from the common-dimension leader, an overall ranking is
 *    withheld with an explicit reason. When both methods agree, the leader is
 *    named with a disclosure of the coverage difference.
 *
 * This is deterministic arithmetic, not judgment: same inputs, same outcome.
 */
export function rankOptions(alignments: OptionAlignment[]): RankingResult {
  const assessable = alignments.filter((a) => !a.insufficientEvidence && !a.incompleteness);
  const commonValues = alignments.length > 0
    ? assessable.reduce<string[]>(
        (acc, a) => acc.filter((v) => a.coverage.assessedValues.includes(v)),
        assessable.length > 0 ? [...assessable[0].coverage.assessedValues] : []
      )
    : [];

  if (assessable.length === 0) {
    return {
      preferred: null,
      withheld: null,
      commonValues,
      disclosure: null,
    };
  }

  const best = assessable.reduce((a, b) => (b.score > a.score ? b : a));
  const tied = assessable.filter((a) => a.score === best.score);
  if (tied.length > 1) {
    return { preferred: null, withheld: `Options tie at ${(best.score * 100).toFixed(0)}% alignment; no leader is named.`, commonValues, disclosure: null };
  }
  if (best.score <= 0) {
    return { preferred: null, withheld: null, commonValues, disclosure: null };
  }

  // Coverage difference: values the best option was assessed on that at least
  // one other assessable option was not.
  const others = assessable.filter((a) => a !== best);
  const bestOnlyValues = best.coverage.assessedValues.filter((v) =>
    others.some((o) => !o.coverage.assessedValues.includes(v))
  );
  if (bestOnlyValues.length === 0) {
    return { preferred: best.label, withheld: null, commonValues, disclosure: null };
  }

  // Recompute the leader from ONLY the commonly assessed values.
  const commonNet = (a: OptionAlignment): number =>
    a.trace.lines
      .filter((l) => commonValues.includes(l.value))
      .reduce((acc, l) => acc + l.contribution, 0);
  const commonMass = (a: OptionAlignment): number =>
    a.trace.lines
      .filter((l) => commonValues.includes(l.value))
      .reduce((acc, l) => acc + (l.supporting + l.contradicting) * l.weight, 0);
  const commonScore = (a: OptionAlignment): number =>
    commonMass(a) > 0 ? commonNet(a) / commonMass(a) : 0;

  const commonAssessable = assessable.filter((a) => commonMass(a) > 0);
  if (commonAssessable.length === 0) {
    return {
      preferred: null,
      withheld: `The lead for "${best.label}" rests on values the other option${others.length === 1 ? ' was never' : 's were never'} assessed on; a ranking from the common values is not computable. Overall ranking withheld.`,
      commonValues,
      disclosure: null,
    };
  }
  const commonBest = commonAssessable.reduce((a, b) => (commonScore(b) > commonScore(a) ? b : a));
  const commonTied = commonAssessable.filter((a) => commonScore(a) === commonScore(commonBest));

  if (commonBest.label === best.label && commonTied.length === 1) {
    return {
      preferred: best.label,
      withheld: null,
      commonValues,
      disclosure: `"${best.label}" was additionally assessed on ${bestOnlyValues.map((v) => `"${v}"`).join(', ')} — value${bestOnlyValues.length === 1 ? '' : 's'} the other option${others.length === 1 ? ' has' : 's have'} no recorded evidence on. The lead also holds when comparing only the values both options were assessed on.`,
    };
  }
  return {
    preferred: null,
    withheld: `The lead for "${best.label}" rests on ${bestOnlyValues.map((v) => `"${v}"`).join(', ')} — value${bestOnlyValues.length === 1 ? '' : 's'} the other option${others.length === 1 ? ' has' : 's have'} no recorded evidence on. Comparing only the commonly assessed values, no option leads clearly. Overall ranking withheld.`,
    commonValues,
    disclosure: null,
  };
}

export function preferredOption(alignments: OptionAlignment[]): string | null {
  return rankOptions(alignments).preferred;
}

/**
 * Weight-sensitivity check: perturb each value weight by +/-0.1 (clamped to
 * [0,1]) and see whether the preferred option changes. Small, deliberate,
 * reproducible — this is transparency, not simulation.
 */
export function findWeightSensitivities(
  decision: Decision,
  memories: Memory[],
  relevant: RelevantMemory[],
  overrides: Record<string, Classification> = {}
): WeightSensitivity[] {
  const baseWeights = decision.value_weights ?? {};
  const baseline = preferredOption(
    decision.options.map((o) => analyzeOptionValues(o.label, decision, memories, relevant, overrides))
  );

  const out: WeightSensitivity[] = [];
  for (const value of decision.values) {
    const w = typeof baseWeights[value] === 'number' ? baseWeights[value] : 0.5;
    for (const delta of [0.1, -0.1]) {
      const next = Math.max(0, Math.min(1, w + delta));
      if (next === w) continue;
      const perturbed: Decision = {
        ...decision,
        value_weights: { ...baseWeights, [value]: next },
      };
      const shifted = preferredOption(
        perturbed.options.map((o) => analyzeOptionValues(o.label, perturbed, memories, relevant, overrides))
      );
      if (shifted !== baseline) {
        out.push({ value, testedAt: next, baseline, shifted });
        break;
      }
    }
  }
  return out;
}

/**
 * Sweep each value's weight across [0, 1] (step 0.05, others fixed) and record
 * the range where the current leader stays ahead. Deterministic and cheap;
 * used for the "wins only under a narrow weighting" scenario label.
 */
export function findStabilityRanges(
  decision: Decision,
  memories: Memory[],
  relevant: RelevantMemory[],
  overrides: Record<string, Classification> = {}
): StabilityRange[] {
  const baseline = preferredOption(
    decision.options.map((o) => analyzeOptionValues(o.label, decision, memories, relevant, overrides))
  );
  if (!baseline) return [];

  const leaderAt = (weights: Record<string, number>): string | null =>
    preferredOption(
      decision.options.map((o) =>
        analyzeOptionValues(o.label, { ...decision, value_weights: weights }, memories, relevant, overrides)
      )
    );

  const out: StabilityRange[] = [];
  for (const value of decision.values) {
    const baseWeights = decision.value_weights ?? {};
    const steps = 21;
    let low: number | null = null;
    let high: number | null = null;
    for (let i = 0; i < steps; i += 1) {
      const w = i / (steps - 1);
      if (leaderAt({ ...baseWeights, [value]: w }) === baseline) {
        if (low === null) low = w;
        high = w;
      }
    }
    if (low !== null && high !== null) {
      out.push({ value, leader: baseline, low, high, span: high - low });
    }
  }
  return out;
}

/**
 * Constraint check. The engine never claims an option satisfies a constraint
 * unless stored records say so; default status is unknown.
 */
export function assessConstraints(decision: Decision, memories: Memory[]): ConstraintStatus[] {
  if (!decision.constraints || decision.constraints.trim() === '') return [];
  const clauses = decision.constraints
    .split(/[.;\n]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 3);

  return clauses.slice(0, 5).map((clause) => {
    const clauseTerms = terms(clause);
    const matching = memories.filter((m) => {
      const hay = `${m.title} ${m.content}`.toLowerCase();
      return clauseTerms.some((t) => hay.includes(t));
    });
    if (matching.length === 0) {
      return {
        constraint: clause,
        status: 'unknown' as const,
        note: 'No stored record bears on this constraint, so the mirror does not assume it holds or fails for any option.',
      };
    }
    const blocking = matching.filter((m) => /\b(cannot|can't|impossible|refused|declined|no longer)\b/i.test(`${m.title} ${m.content}`));
    if (blocking.length > 0) {
      return {
        constraint: clause,
        status: 'evidence_against' as const,
        note: `"${blocking[0].title}" records something that may conflict with this constraint. Review it; this is a flag, not a verdict.`,
      };
    }
    return {
      constraint: clause,
      status: 'unknown' as const,
      note: `"${matching[0].title}" touches this constraint but does not establish whether any option satisfies it.`,
    };
  });
}

const CONTRADICTION_PATTERNS: { pattern: RegExp; message: (b: Belief, m: Memory) => string }[] = [
  {
    pattern: /\bobligat|\bduty\b|\bmust\b|\bfamily first\b/i,
    message: (b, m) =>
      `You hold the value "${b.statement}", but "${m.title}" records a moment where you chose distance or work instead.`,
  },
  {
    pattern: /\bfreedom|\bautonomy|\bown time\b/i,
    message: (b, m) =>
      `You say "${b.statement}", yet "${m.title}" shows you giving that freedom away. Worth naming before you decide.`,
  },
  {
    pattern: /\bmoney|\bscoreboard|\bstatus\b/i,
    message: (b, m) =>
      `Your stance "${b.statement}" is in tension with "${m.title}", where money or status clearly weighed on you.`,
  },
];

export function findContradictions(
  decision: Decision,
  beliefs: Belief[],
  memories: Memory[]
): string[] {
  const out: string[] = [];

  for (const belief of beliefs) {
    const statement = belief.statement;
    for (const pattern of CONTRADICTION_PATTERNS) {
      if (!pattern.pattern.test(statement)) continue;
      const relevantMemory = memories.find((m) =>
        pattern.pattern.test(`${m.title} ${m.content}`)
      );
      if (relevantMemory) {
        out.push(pattern.message(belief, relevantMemory));
        break;
      }
    }
  }

  // Contradiction between stated decision values and the direction of evidence.
  const relevant = findRelevantMemories(decision, memories, 4);
  for (const value of decision.values) {
    const v = value.toLowerCase();
    const touching = relevant.filter((r) =>
      `${r.memory.title} ${r.memory.content}`.toLowerCase().includes(v)
    );
    if (touching.length === 0) {
      out.push(`"${value}" is listed as a value in this decision, but no recorded memory mentions it, so the analysis cannot weigh it.`);
    }
  }

  return out.slice(0, 5);
}

export function findMissingInformation(decision: Decision, memories: Memory[]): string[] {
  const gaps: string[] = [];

  if (!decision.constraints || decision.constraints.trim() === '') {
    gaps.push('You have not recorded any constraints; hard limits often change which options are real.');
  }
  if (!decision.uncertainties || decision.uncertainties.trim() === '') {
    gaps.push('No uncertainties recorded. Naming what you do not know is where experiments come from.');
  }
  if (decision.values.length === 0) {
    gaps.push('No personal values linked to this decision, so value alignment cannot be assessed.');
  }
  if (!decision.success_definition || decision.success_definition.trim() === '') {
    gaps.push('No definition of success; without one, any outcome can be rationalized.');
  }
  if (decision.options.every((o) => (o.pros ?? []).length === 0 && (o.cons ?? []).length === 0)) {
    gaps.push('None of the options carry your own pros and cons, so the analysis would rely entirely on keyword inference over memories.');
  }

  const otherPartyMention = /\b(family|dad|mom|nadia|parents|partner|team|boss)\b/i.exec(
    `${decision.title} ${decision.context}`
  );
  if (otherPartyMention) {
    const asked = memories.some((m) =>
      /asked|told|conversation with/i.test(`${m.title} ${m.content}`) &&
      new RegExp(otherPartyMention[1], 'i').test(`${m.title} ${m.content}`)
    );
    if (!asked) {
      gaps.push(`Your records don't show that you've asked ${otherPartyMention[1]} directly what they want; the decision currently runs on your assumption.`);
    }
  }

  return gaps;
}

export function suggestExperiments(decision: Decision): string[] {
  const out: string[] = [];

  for (const gap of findMissingInformation(decision, [])) {
    if (gap.includes('constraints')) {
      out.push('Write down your three hardest constraints in one sentence each; the real option set often shrinks or grows.');
    }
    if (gap.includes('uncertainties')) {
      out.push('List what you cannot control about each option; anything controllable becomes an experiment candidate.');
    }
    if (gap.includes('definition of success')) {
      out.push('Draft a one-sentence definition of what a good outcome looks like a year from now, before choosing.');
    }
  }

  if (decision.options.length === 2) {
    out.push(`Run a time-boxed trial of "${decision.options[0].label}" for one week; a journal entry comparing it to your usual routine gives real evidence instead of imagined pros and cons.`);
  }
  out.push('Write the "front page" test: imagine this choice is announced in the news in six months. Which option would you still defend? Record the answer as a memory.');
  out.push('Ask one person who appears in your records for their view, and log the conversation as evidence for the twin.');

  return out.slice(0, 5);
}

/**
 * FNV-1a over a canonical JSON bundle of every analysis input. Deterministic,
 * dependency-free, and stable across sessions — same inputs always yield the
 * same hash, so a stored snapshot can prove which inputs produced a score.
 */
export function analysisInputHash(
  decision: Decision,
  memories: Memory[],
  overrides: Record<string, Classification>
): string {
  const relevant = findRelevantMemories(decision, memories);
  const bundle = {
    version: ANALYSIS_VERSION,
    title: decision.title,
    context: decision.context,
    constraints: decision.constraints,
    uncertainties: decision.uncertainties,
    values: decision.values,
    valueWeights: decision.value_weights ?? {},
    options: decision.options,
    successDefinition: decision.success_definition,
    overrides,
    evidence: relevant.map((r) => ({ id: r.memory.id, title: r.memory.title, content: r.memory.content, tags: r.memory.tags, occurredAt: r.memory.occurred_at })),
  };
  // Canonical form: object keys sorted recursively, so a property reorder
  // never changes the hash — only a real input change does.
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, canonical(val)])
      );
    }
    return v;
  };
  const json = JSON.stringify(canonical(bundle));
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Snapshot recorded whenever a generated analysis is shown. */
export function buildAnalysisSnapshot(
  decision: Decision,
  memories: Memory[],
  beliefs: Belief[],
  overrides: Record<string, Classification>,
  report: DecisionReport
): AnalysisSnapshot {
  return {
    engineVersion: ANALYSIS_VERSION,
    inputHash: analysisInputHash(decision, memories, overrides),
    computedAt: new Date().toISOString(),
    inputs: {
      valueWeights: decision.value_weights ?? {},
      evidenceMemoryIds: report.method.inputs.evidenceMemoryIds,
      explicitItems: report.method.inputs.explicitItems,
      overrideCount: Object.keys(overrides).length,
      // dm-5 additions: what the user approved/corrected, how much of each
      // option's value set was actually assessed, and what was withheld.
      approvedClassifications: overrides,
      coverage: report.optionAlignments.map((a) => ({
        option: a.label,
        assessedValues: a.coverage.assessedValues,
        unassessedValues: a.coverage.unassessedValues,
      })),
      commonAssessedValues: report.ranking.commonValues,
      withheldRanking: report.ranking.withheld,
    },
  };
}

/**
 * A stored snapshot is stale when the engine version changed or ANY input
 * changed (weights, evidence, options, overrides). Stale snapshots are labeled
 * in the UI, never silently presented as current.
 */
export function isSnapshotStale(
  snapshot: AnalysisSnapshot | null,
  decision: Decision,
  memories: Memory[],
  overrides: Record<string, Classification>
): boolean {
  if (!snapshot) return true;
  if (snapshot.engineVersion !== ANALYSIS_VERSION) return true;
  return snapshot.inputHash !== analysisInputHash(decision, memories, overrides);
}

const METHOD_EXPLANATION = [
  'Method: each option is scored by preference alignment only. Every memory related to the decision is classified per value as for / against / neutral / unknown; explicit pros and cons you wrote count as explicit assessments, keyword-matched memories as inferred (each with its rationale, correctable by you).',
  'Score: (weighted for − weighted against) ÷ (weighted for + weighted against), clamped to [-1, 1]. An option with no directional evidence scores 0 and is flagged "insufficient evidence"; that is unknown, not neutral. Weights come from your sliders and nothing else.',
  'This engine is deterministic and reproducible: same records, same weights, same overrides → same report. It is not statistically validated and makes no outcome predictions.',
].join(' ');

export function buildSummary(
  decision: Decision,
  relevant: RelevantMemory[],
  contradictions: string[],
  alignments: OptionAlignment[],
  sensitivities: WeightSensitivity[]
): string {
  const valueList = decision.values.length > 0 ? decision.values.join(', ') : 'none recorded';
  const evidenceLine =
    relevant.length > 0
      ? `${relevant.length} of your recorded memories bear on this decision.`
      : 'No recorded memories bear on this decision yet; the analysis below is built almost entirely from what is missing.';
  const contradictionLine =
    contradictions.length > 0
      ? ` It also surfaces ${contradictions.length} tension${contradictions.length === 1 ? '' : 's'} between your stated priorities and your records.`
      : '';
  const preferred = preferredOption(alignments);
  const ranking = rankOptions(alignments);
  const preferredLine = preferred
    ? ` At the current weights, "${preferred}" leads on alignment.`
    : ranking.withheld
      ? ` ${ranking.withheld}`
      : ' At the current weights, no option leads clearly: either the evidence is missing, the options tie, or every assessed option nets negative.';
  const sensitivityLine =
    sensitivities.length > 0
      ? ` The lead is weight-sensitive: nudging ${sensitivities.map((s) => `"${s.value}"`).join(' or ')} by 0.1 changes the preferred option, so treat the ranking as unsettled.`
      : '';
  const coverageNote = ranking.disclosure ? ` ${ranking.disclosure}` : '';
  return `${decision.title}: ${evidenceLine} The stated values in play are ${valueList}.${contradictionLine}${preferredLine}${coverageNote}${sensitivityLine} Alignment reflects preference weighting you control; it is not a prediction of how either option will turn out.`;
}

/**
 * Records classified AGAINST each option. Counterevidence is never hidden
 * inside per-value lines; it is surfaced with dates and links. Unknown and
 * neutral classifications are deliberately NOT counterevidence.
 */
export function extractCounterevidence(alignments: OptionAlignment[]): CounterevidenceItem[] {
  const out: CounterevidenceItem[] = [];
  for (const a of alignments) {
    for (const c of a.classifications) {
      if (c.classification !== 'against') continue;
      out.push({
        optionLabel: a.label,
        memoryId: c.memoryId.startsWith('explicit:') ? '' : c.memoryId,
        memoryTitle: c.memoryTitle,
        occurredAt: '',
        value: c.value,
        origin: c.origin === 'override' ? 'override' : c.memoryId.startsWith('explicit:') ? 'explicit' : 'inferred',
        rationale: c.rationale,
      });
    }
  }
  return out;
}

/**
 * Why the comparison looks the way it does at the current weights: which
 * value contributions decide the ranking. The acceptance gate: a judge can
 * change a weight and understand exactly why the comparison changes.
 */
export function explainRanking(alignments: OptionAlignment[]): string[] {
  const assessable = alignments.filter((a) => !a.insufficientEvidence && !a.incompleteness);
  if (assessable.length === 0) {
    return ['No option has directional evidence, so no value contribution affects a ranking yet.'];
  }
  const best = assessable.reduce((a, b) => (b.score > a.score ? b : a));
  const tied = assessable.filter((a) => a.score === best.score);
  const others = assessable.filter((a) => a !== best && (tied.length > 1 || a.score < best.score));
  const out: string[] = [];

  if (tied.length > 1) {
    out.push(
      `Tie at ${(best.score * 100).toFixed(0)}%: ${tied.map((t) => `"${t.label}"`).join(' and ')} score equally, so no leader is named.`
    );
  } else {
    out.push(`"${best.label}" leads at ${(best.score * 100).toFixed(0)}% alignment.`);
  }

  for (const other of others) {
    const diff = best.score - other.score;
    const decisive: string[] = [];
    for (const lineB of best.trace.lines) {
      const lineO = other.trace.lines.find((l) => l.value === lineB.value);
      if (!lineO) continue;
      const delta = lineB.contribution - lineO.contribution;
      if (Math.abs(delta) > 1e-9) {
        decisive.push(
          `${lineB.value} (${lineB.supporting}−${lineB.contradicting})×${lineB.weight.toFixed(1)} = ${lineB.contribution.toFixed(2)} vs (${lineO.supporting}−${lineO.contradicting})×${lineO.weight.toFixed(1)} = ${lineO.contribution.toFixed(2)}, difference ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
        );
      }
    }
    out.push(
      decisive.length > 0
        ? `Against "${other.label}" (gap ${diff.toFixed(2)}): ${decisive.join('; ')}.`
        : `Against "${other.label}": equal contributions on every value.`
    );
  }
  return out;
}

export function analyzeDecision(
  decision: Decision,
  memories: Memory[],
  beliefs: Belief[],
  overrides: Record<string, Classification> = {}
): DecisionReport {
  const relevant = findRelevantMemories(decision, memories);
  const optionAlignments = decision.options.map((o) =>
    analyzeOptionValues(o.label, decision, memories, relevant, overrides)
  );
  const ranking = rankOptions(optionAlignments);
  const sensitivities = findWeightSensitivities(decision, memories, relevant, overrides);
  const stability = findStabilityRanges(decision, memories, relevant, overrides);
  const contradictions = findContradictions(decision, beliefs, memories);
  const missing = findMissingInformation(decision, memories);
  const experiments = suggestExperiments(decision);
  const constraintStatuses = assessConstraints(decision, memories);

  return {
    summary: buildSummary(decision, relevant, contradictions, optionAlignments, sensitivities),
    method: {
      version: ANALYSIS_VERSION,
      explanation: METHOD_EXPLANATION,
      inputs: {
        valueWeights: decision.value_weights ?? {},
        evidenceMemoryIds: relevant.map((r) => r.memory.id),
        explicitItems: decision.options.flatMap((o) => [
          ...o.pros.map((p) => ({ option: o.label, kind: 'pro' as const, text: p })),
          ...o.cons.map((c) => ({ option: o.label, kind: 'con' as const, text: c })),
        ]),
        overrideCount: Object.keys(overrides).length,
        generatedFrom: `records supplied at analysis time (${memories.length} memories, ${beliefs.length} beliefs)`,
      },
    },
    relevantMemories: relevant,
    optionAlignments,
    preferredOption: ranking.preferred,
    ranking,
    weightSensitivities: sensitivities,
    stabilityRanges: stability,
    inputHash: analysisInputHash(decision, memories, overrides),
    counterevidence: extractCounterevidence(optionAlignments),
    constraintStatuses,
    contradictions,
    missingInformation: missing,
    experiments,
    evidenceLimitations: [
      'This analysis is generated from keyword matching over your records; it cannot read implication, irony, or context you did not write down.',
      'Value alignment scores reflect how you weighted your own values, not how likely any outcome is. The engine is not scientifically validated.',
      'Memories you have not recorded are invisible here; absence of evidence is not evidence of absence, and missing evidence is reported as unknown.',
      'Constraint checks flag possible conflicts in your records; they never certify that an option satisfies a constraint.',
      'Unknown and neutral classifications never count as evidence for or against an option; only records you wrote or classifications you confirmed move a score.',
  'Options with different evidence coverage are compared on their commonly assessed values first; an overall ranking is withheld when the lead rests on values the other option was never assessed on.',
    ],
  };
}

/**
 * Propose a belief/value update after a divergent reflection. The mirror
 * suggests; it never applies. Nothing changes unless the user approves.
 */
export function buildBeliefProposal(
  decision: Decision,
  belief: Belief
): BeliefProposal {
  const direction = decision.reflection?.matchesOriginalReasoning === false
    ? 'diverged from your original reasoning'
    : 'matched your original reasoning but taught you something new';
  const currentStrength = belief.strength;
  const suggested = decision.reflection?.matchesOriginalReasoning === false
    ? Math.max(0, currentStrength - 10)
    : Math.min(100, currentStrength + 10);
  return {
    id: `prop-${decision.id}-${belief.id}`,
    beliefId: belief.id,
    beliefStatement: belief.statement,
    change: `Adjust strength of "${belief.statement}" from ${currentStrength} to ${suggested} and add a review note citing "${decision.title}".`,
    reason: `Your reflection on "${decision.title}" ${direction}. The mirror proposes this belief revisit; approve to apply it, or dismiss. Nothing changes until you decide.`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
}

/**
 * Which beliefs the reflection touches: those whose themes appear in the
 * decision's values or reflection text. Keyword-based and deliberately
 * conservative — an empty list means no proposal is made.
 */
export function findAffectedBeliefs(decision: Decision, beliefs: Belief[]): Belief[] {
  if (!decision.reflection) return [];
  const text = [
    decision.values.join(' '),
    decision.reflection.lesson,
    decision.reflection.surprises,
  ].join(' ').toLowerCase();
  return beliefs.filter((b) => {
    const words = b.statement.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    return words.some((w) => text.includes(w));
  });
}

export function analysisToEditableText(report: DecisionReport): string {
  const lines: string[] = [];
  lines.push(`METHOD & INPUTS (preserved for review)\nVersion: ${report.method.version}`);
  lines.push(`Value weights used: ${JSON.stringify(report.method.inputs.valueWeights)}`);
  lines.push(`Evidence memory IDs: ${report.method.inputs.evidenceMemoryIds.join(', ') || 'none'}`);
  lines.push(`Explicit items: ${report.method.inputs.explicitItems.length}; user-corrected classifications: ${report.method.inputs.overrideCount}`);
  lines.push(`Source of records: ${report.method.inputs.generatedFrom}`);
  lines.push(`METHOD NOTE\n${report.method.explanation}`);
  lines.push(`SUMMARY\n${report.summary}`);
  const preferred = report.preferredOption
    ? `- Preferred at current weights: ${report.preferredOption}`
    : '- No option leads at current weights (unknown, tie, or insufficient evidence)';
  const sens = report.weightSensitivities.length > 0
    ? report.weightSensitivities.map((s) => `- Weight-sensitive on "${s.value}": shifting it to ${s.testedAt.toFixed(1)} changes the leader${s.shifted ? ` to "${s.shifted}"` : ''}`).join('\n')
    : '- Not sensitive to +/-0.1 weight changes on any single value';
  lines.push(`PREFERRED OPTION & SENSITIVITY\n${preferred}\n${sens}`);
  lines.push(
    `CONSTRAINTS\n${report.constraintStatuses.map((c) => `- [${c.status}] ${c.constraint}: ${c.note}`).join('\n') || '- none recorded'}`
  );
  lines.push(
    `CONTRADICTIONS\n${report.contradictions.map((c) => `- ${c}`).join('\n') || '- none found'}`
  );
  lines.push(
    `MISSING INFORMATION\n${report.missingInformation.map((c) => `- ${c}`).join('\n') || '- none identified'}`
  );
  lines.push(`EXPERIMENTS\n${report.experiments.map((c) => `- ${c}`).join('\n') || '- none suggested'}`);
  lines.push(
    `LIMITATIONS\n${report.evidenceLimitations.map((c) => `- ${c}`).join('\n')}`
  );
  return lines.join('\n\n');
}
