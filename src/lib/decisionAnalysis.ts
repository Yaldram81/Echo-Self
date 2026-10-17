import type { Belief, Decision, Memory } from './types';

/**
 * Deterministic decision analysis engine.
 *
 * Transparent and reproducible: every score traces to the user's stated value
 * weights and to identifiable records. Classifications are labeled explicit
 * (user-authored pros/cons) or inferred (keyword match, with rationale) and can
 * be overridden by the user. Missing evidence is UNKNOWN, never for/against.
 * Scores are preference alignment, not probability of success.
 */

export const ANALYSIS_VERSION = 'dm-2';

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
}

export interface OptionAlignment {
  label: string;
  /**
   * Preference alignment in [-1, 1]. Normalized by the option's own classified
   * evidence so options with different amounts of evidence are comparable.
   * 0 with unknownCount > 0 means "not assessable", not "neutral".
   */
  score: number;
  /** True when no evidence classified for/against this option. */
  insufficientEvidence: boolean;
  values: ValueAlignmentResult[];
  classifications: MemoryClassification[];
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
  weightSensitivities: WeightSensitivity[];
  constraintStatuses: ConstraintStatus[];
  contradictions: string[];
  missingInformation: string[];
  experiments: string[];
  evidenceLimitations: string[];
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
const FOR_SIGNALS = /\b(chose|choosing|glad|relieved|clearer|declined|said no to|protect|boundar|rest|freedom|preferr)\w*/i;
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
    return { classification: 'for', rationale: `Inferred "for": the record mentions ${value} and this option ("${thisShares.slice(0, 2).join(', ')}") with favorable language ("${(hay.match(FOR_SIGNALS) ?? ['signal'])[0]}"). Keyword inference — correct it if wrong.` };
  }
  if (thisShares.length > 0 && AGAINST_SIGNALS.test(hay)) {
    return { classification: 'against', rationale: `Inferred "against": the record mentions ${value} and this option ("${thisShares.slice(0, 2).join(', ')}") with negative language ("${(hay.match(AGAINST_SIGNALS) ?? ['signal'])[0]}"). Keyword inference — correct it if wrong.` };
  }
  if (thisShares.length === 0 && otherShares.length > 0) {
    return { classification: 'neutral', rationale: `The record mentions ${value} but is about a different option ("${otherShares.slice(0, 2).join(', ')}") — not counted for or against this one.` };
  }
  if (thisShares.length > 0) {
    return { classification: 'neutral', rationale: `The record mentions ${value} and this option, but neither direction nor consequence — treated as neutral, not supportive.` };
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
          rationale: 'You listed this as a pro of the option — an explicit assessment, not inferred.',
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
          rationale: 'You listed this as a con of the option — an explicit assessment, not inferred.',
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
    const alignmentNote =
      touching.length === 0 && explicitItems.filter((e) => e.value === value).length === 0
        ? `No recorded memories or explicit pros/cons mention "${value}" — alignment on this value is unknown, not favorable.`
        : supporting === 0 && contradicting === 0
          ? `Records mentioning "${value}" carry no clear direction for this option (${unknownCount} unresolved) — counted as unknown, not as support.`
          : `${supporting} item${supporting === 1 ? '' : 's'} point toward this option on ${value}${contradicting > 0 ? `, ${contradicting} point away` : ''}${unknownCount > 0 ? `, ${unknownCount} unresolved` : ''}.`;

    valueResults.push({ value, weight, supportingMemories: supporting, contradictingMemories: contradicting, unknownMemories: unknownCount, alignmentNote });
  }

  // Normalized: net weighted signal divided by the option's own classified
  // weight mass, so a 2-1 split scores the same regardless of pile size and
  // options with unequal evidence are comparable. All-unknown → 0 + flagged.
  const net = valueResults.reduce(
    (acc, v) => acc + (v.supportingMemories - v.contradictingMemories) * v.weight, 0
  );
  const classifiedMass = valueResults.reduce(
    (acc, v) => acc + (v.supportingMemories + v.contradictingMemories) * v.weight, 0
  );
  const score = classifiedMass > 0 ? Math.max(-1, Math.min(1, net / classifiedMass)) : 0;

  return {
    label: optionLabel,
    score,
    insufficientEvidence: classifiedMass === 0,
    values: valueResults,
    classifications,
  };
}

export function preferredOption(alignments: OptionAlignment[]): string | null {
  const assessable = alignments.filter((a) => !a.insufficientEvidence);
  if (assessable.length === 0) return null;
  const best = assessable.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score <= 0) return null;
  // A preference is only named when it is strictly ahead of the others.
  const tied = assessable.filter((a) => a.score === best.score);
  return tied.length > 1 ? null : best.label;
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
        note: 'No stored record bears on this constraint — the mirror does not assume it holds or fails for any option.',
      };
    }
    const blocking = matching.filter((m) => /\b(cannot|can't|impossible|refused|declined|no longer)\b/i.test(`${m.title} ${m.content}`));
    if (blocking.length > 0) {
      return {
        constraint: clause,
        status: 'evidence_against' as const,
        note: `"${blocking[0].title}" records something that may conflict with this constraint. Review it — this is a flag, not a verdict.`,
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
      `You say "${b.statement}", yet "${m.title}" shows you giving that freedom away — worth naming before you decide.`,
  },
  {
    pattern: /\bmoney|\bscoreboard|\bstatus\b/i,
    message: (b, m) =>
      `Your stance — "${b.statement}" — is in tension with "${m.title}", where money or status clearly weighed on you.`,
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
      out.push(`"${value}" is listed as a value in this decision, but no recorded memory mentions it — the analysis cannot weigh it.`);
    }
  }

  return out.slice(0, 5);
}

export function findMissingInformation(decision: Decision, memories: Memory[]): string[] {
  const gaps: string[] = [];

  if (!decision.constraints || decision.constraints.trim() === '') {
    gaps.push('You have not recorded any constraints — hard limits often change which options are real.');
  }
  if (!decision.uncertainties || decision.uncertainties.trim() === '') {
    gaps.push('No uncertainties recorded. Naming what you do not know is where experiments come from.');
  }
  if (decision.values.length === 0) {
    gaps.push('No personal values linked to this decision, so value alignment cannot be assessed.');
  }
  if (!decision.success_definition || decision.success_definition.trim() === '') {
    gaps.push('No definition of success — without one, any outcome can be rationalized.');
  }
  if (decision.options.every((o) => (o.pros ?? []).length === 0 && (o.cons ?? []).length === 0)) {
    gaps.push('None of the options carry your own pros and cons — the analysis would rely entirely on keyword inference over memories.');
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
      gaps.push(`Your records don't show that you've asked ${otherPartyMention[1]} directly what they want — the decision currently runs on your assumption.`);
    }
  }

  return gaps;
}

export function suggestExperiments(decision: Decision): string[] {
  const out: string[] = [];

  for (const gap of findMissingInformation(decision, [])) {
    if (gap.includes('constraints')) {
      out.push('Write down your three hardest constraints in one sentence each — the real option set often shrinks or grows.');
    }
    if (gap.includes('uncertainties')) {
      out.push('List what you cannot control about each option; anything controllable becomes an experiment candidate.');
    }
    if (gap.includes('definition of success')) {
      out.push('Draft a one-sentence definition of what a good outcome looks like a year from now, before choosing.');
    }
  }

  if (decision.options.length === 2) {
    out.push(`Run a time-boxed trial of "${decision.options[0].label}" for one week — a journal entry comparing it to your usual routine gives real evidence instead of imagined pros and cons.`);
  }
  out.push('Write the "front page" test: imagine this choice is announced in the news in six months. Which option would you still defend? Record the answer as a memory.');
  out.push('Ask one person who appears in your records for their view, and log the conversation as evidence for the twin.');

  return out.slice(0, 5);
}

const METHOD_EXPLANATION = [
  'Method: each option is scored by preference alignment only. Every memory related to the decision is classified per value as for / against / neutral / unknown; explicit pros and cons you wrote count as explicit assessments, keyword-matched memories as inferred (each with its rationale, correctable by you).',
  'Score: (weighted for − weighted against) ÷ (weighted for + weighted against), clamped to [-1, 1]. An option with no directional evidence scores 0 and is flagged "insufficient evidence" — that is unknown, not neutral. Weights come from your sliders and nothing else.',
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
      : 'No recorded memories bear on this decision yet — the analysis below is built almost entirely from what is missing.';
  const contradictionLine =
    contradictions.length > 0
      ? ` It also surfaces ${contradictions.length} tension${contradictions.length === 1 ? '' : 's'} between your stated priorities and your records.`
      : '';
  const preferred = preferredOption(alignments);
  const preferredLine = preferred
    ? ` At the current weights, "${preferred}" leads on alignment.`
    : ' At the current weights, no option leads clearly — either the evidence is missing, the options tie, or every assessed option nets negative.';
  const sensitivityLine =
    sensitivities.length > 0
      ? ` The lead is weight-sensitive: nudging ${sensitivities.map((s) => `"${s.value}"`).join(' or ')} by 0.1 changes the preferred option, so treat the ranking as unsettled.`
      : '';
  return `${decision.title}: ${evidenceLine} The stated values in play are ${valueList}.${contradictionLine}${preferredLine}${sensitivityLine} Alignment reflects preference weighting you control — it is not a prediction of how either option will turn out.`;
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
  const sensitivities = findWeightSensitivities(decision, memories, relevant, overrides);
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
    preferredOption: preferredOption(optionAlignments),
    weightSensitivities: sensitivities,
    constraintStatuses,
    contradictions,
    missingInformation: missing,
    experiments,
    evidenceLimitations: [
      'This analysis is generated from keyword matching over your records — it cannot read implication, irony, or context you did not write down.',
      'Value alignment scores reflect how you weighted your own values, not how likely any outcome is. The engine is not scientifically validated.',
      'Memories you have not recorded are invisible here; absence of evidence is not evidence of absence — missing evidence is reported as unknown.',
      'Constraint checks flag possible conflicts in your records; they never certify that an option satisfies a constraint.',
    ],
  };
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
    `CONSTRAINTS\n${report.constraintStatuses.map((c) => `- [${c.status}] ${c.constraint} — ${c.note}`).join('\n') || '- none recorded'}`
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
