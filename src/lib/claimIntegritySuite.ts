import type { AnswerClaim, InterpretationFlag, Memory, TwinReply } from './types';

/** Model-supplied evidence reference: only the ID is required; the rest is ignored by audit. */
type ModelEvidence = { memoryId: string; title?: string; excerpt?: string; relation?: string };

/**
 * Claim-integrity fixtures: fictional records and model-output simulations for
 * verifying that the audit pipeline cannot present fabricated or weakly related
 * citations as established fact.
 */

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export function integrityMemory(
  id: string,
  title: string,
  content: string,
  opts: { tags?: string[]; category?: Memory['category']; daysAgo?: number } = {}
): Memory {
  return {
    id,
    title,
    content,
    category: opts.category ?? 'personal_growth',
    source: 'journal',
    mood: 'neutral',
    confidence: 85,
    tags: opts.tags ?? [],
    ai_interpretation: null,
    occurred_at: iso(opts.daysAgo ?? 10),
    created_at: iso(opts.daysAgo ?? 10),
    user_importance: null,
  };
}

export const INTEGRITY_MEMORIES: Memory[] = [
  integrityMemory(
    'ci-run-01',
    'Morning runs replaced scrolling',
    'Two weeks into running every morning. The first ten minutes are hard, but my head is clearer all morning. I stopped reaching for my phone in bed.',
    { tags: ['running', 'habit'], daysAgo: 5 }
  ),
  integrityMemory(
    'ci-run-02',
    'Skipped running this whole week',
    'Fell out of the running routine entirely this week. Zero mornings. Old scrolling habit came back with it.',
    { tags: ['running', 'setback'], daysAgo: 2 }
  ),
  integrityMemory(
    'ci-salary-01',
    'The salary negotiation I fumbled',
    'Accepted the first number for the senior role. I had a counter prepared and did not say it. Worth recording so the pattern is visible.',
    { category: 'work', tags: ['salary', 'negotiation'], daysAgo: 340 }
  ),
  integrityMemory(
    'ci-dogs-01',
    'Adopted a second dog',
    'We debated for eight months and finally adopted. The apartment genuinely had room for one more.',
    { category: 'other', tags: ['dogs', 'family'], daysAgo: 300 }
  ),
  integrityMemory(
    'ci-astronaut-01',
    'Astronaut training daydream',
    'Watched a documentary about astronaut training and daydreamed about it for an hour. Pure fantasy, recording it because it made me laugh.',
    { category: 'other', tags: ['space', 'dreams'], daysAgo: 20 }
  ),
];

export const INTEGRITY_FLAGS: InterpretationFlag[] = [
  {
    id: 'ci-flag-01',
    memory_id: 'ci-run-02',
    answer_excerpt: 'The running habit appears to have lapsed.',
    correction_note: 'The lapse was planned rest for an injury, not a failed habit — I resumed the next week.',
    created_at: iso(1),
    status: 'confirmed',
    topic: 'running',
    reviewed_at: null,
    superseded_by: null,
  },
];

/** A simulated model reply with fully controlled claim text, labels, and evidence. */
export function modelReply(
  answer: string,
  claims: Array<Omit<Partial<AnswerClaim>, 'evidence'> & { claim: string; evidence?: ModelEvidence[] }>,
  sources: Array<{ memoryId: string; title: string }>,
  opts: { gaps?: string[]; inferences?: string[] } = {}
): TwinReply {
  return {
    answer,
    sources,
    inferences: opts.inferences ?? [],
    gaps: opts.gaps ?? [],
    followUps: [],
    mode: 'live',
    claims: claims.map((c, i) => ({
      claimId: c.claimId ?? `mc${i + 1}`,
      claim: c.claim,
      type: c.type ?? 'directly_supported',
      evidenceStatus: c.evidenceStatus ?? 'direct',
      basis: c.basis,
      uncertainty: c.uncertainty,
      evidence: (c.evidence ?? []) as AnswerClaim['evidence'],
      corrections: c.corrections,
    })),
  };
}

export interface IntegrityCase {
  id: string;
  description: string;
  question: string;
  /** Raw model output entering askTwin's live audit path. */
  reply: TwinReply;
  /** Expected type of the claim containing this substring (or 'absent' if it must be gone). */
  expectClaim: { contains: string; type: string };
  /** When true, the claim's excerpt must be verbatim from the record (never model text). */
  expectVerbatimExcerpt?: boolean;
  /** When true, the reply must not cite this record as evidence for the claim. */
  expectEvidenceRejected?: string;
  /** When true, the reply must declare uncertainty in gaps or claim uncertainty. */
  expectUncertainty?: boolean;
  /** When true, no record outside the question's retrieval context may be cited. */
  expectNoOutOfContextSources?: boolean;
}

export const INTEGRITY_CASES: IntegrityCase[] = [
  {
    id: 'iv-direct',
    description: 'Directly supported claim with a genuine quote survives as directly_supported',
    question: 'What happened when I negotiated my salary?',
    reply: modelReply(
      'You accepted the first number and did not say your counter [ci-salary-01].',
      [{ claim: 'You accepted the first number and did not say your counter.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-salary-01' }] }],
      [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled' }]
    ),
    expectClaim: { contains: 'accepted the first number', type: 'directly_supported' },
    expectVerbatimExcerpt: true,
  },
  {
    id: 'iv-partial',
    description: 'Claim that only partly matches record text becomes partial, not direct',
    question: 'How is my running routine going?',
    reply: modelReply(
      'Your records show a morning running habit and a recent lapse [ci-run-01] [ci-run-02].',
      [{ claim: 'You run every morning without exception.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-run-01' }, { memoryId: 'ci-run-02' }] }],
      [{ memoryId: 'ci-run-01', title: 'Morning runs replaced scrolling' }]
    ),
    expectClaim: { contains: 'run every morning', type: 'conflicting_evidence' },
    expectUncertainty: true,
  },
  {
    id: 'iv-weak-citation',
    description: 'Valid citation that does not support the claim is not treated as evidence',
    question: 'What do I think about dogs?',
    reply: modelReply(
      'You negotiated carefully about dogs [ci-salary-01].',
      [{ claim: 'You negotiated carefully about dogs.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-salary-01' }] }],
      [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled' }]
    ),
    expectClaim: { contains: 'negotiated carefully about dogs', type: 'unknown' },
    expectEvidenceRejected: 'ci-salary-01',
  },
  {
    id: 'iv-conflict',
    description: 'Contradictory records surface as conflicting, both shown',
    question: 'How is my running going?',
    reply: modelReply(
      'Records differ on running [ci-run-01] [ci-run-02].',
      [{ claim: 'Your running habit is consistent.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-run-01' }, { memoryId: 'ci-run-02' }] }],
      [
        { memoryId: 'ci-run-01', title: 'Morning runs replaced scrolling' },
        { memoryId: 'ci-run-02', title: 'Skipped running this whole week' },
      ]
    ),
    expectClaim: { contains: 'running habit is consistent', type: 'conflicting_evidence' },
    expectUncertainty: true,
  },
  {
    id: 'iv-outdated',
    description: 'Claim built on a 340-day-old record carries uncertainty',
    question: 'How do I handle salary conversations?',
    reply: modelReply(
      'You accepted the first number last time [ci-salary-01].',
      [{ claim: 'You accept the first number in every salary conversation.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-salary-01' }] }],
      [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled' }]
    ),
    expectClaim: { contains: 'accept the first number', type: 'interpretation' },
    expectUncertainty: true,
  },
  {
    id: 'iv-psych',
    description: 'Unsupported psychological generalization is downgraded',
    question: 'Tell me about my mind.',
    reply: modelReply(
      'You have ADHD tendencies [ci-run-01].',
      [{ claim: 'You have ADHD based on your scrolling habit.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-run-01' }] }],
      [{ memoryId: 'ci-run-01', title: 'Morning runs replaced scrolling' }]
    ),
    expectClaim: { contains: 'ADHD', type: 'unknown' },
    expectUncertainty: true,
  },
  {
    id: 'iv-fake-id',
    description: 'Fabricated source ID becomes an unknown claim, never evidence',
    question: 'What happened with the salary negotiation?',
    reply: modelReply(
      'You accepted the first number [ci-salary-01] and your boss praised you [ci-fake-99].',
      [{ claim: 'Your boss praised you after the negotiation.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-fake-99' }] }],
      [{ memoryId: 'ci-fake-99', title: 'Boss praise (invented)' }]
    ),
    expectClaim: { contains: 'boss praised you', type: 'unknown' },
    expectEvidenceRejected: 'ci-fake-99',
  },
  {
    id: 'iv-fake-quote',
    description: 'Fabricated quote inside claim evidence is replaced by the real record text',
    question: 'What happened when I negotiated my salary?',
    reply: modelReply(
      'You said "I know my market value" [ci-salary-01].',
      [{
        claim: 'You told them "I know my market value and will not accept less".',
        type: 'directly_supported',
        evidenceStatus: 'direct',
        evidence: [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled', excerpt: 'I know my market value and will not accept less' }],
      }],
      [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled' }]
    ),
    expectClaim: { contains: 'unverified quote removed', type: 'interpretation' },
    expectVerbatimExcerpt: true,
    expectUncertainty: true,
  },
  {
    id: 'iv-fake-date',
    description: 'Fabricated date in the answer is stripped and declared',
    question: 'What did I record about reading before bed?',
    reply: modelReply(
      'This habit peaked on March 3rd according to your journal.',
      [],
      []
    ),
    expectClaim: { contains: 'peaked on March', type: 'absent' },
    expectUncertainty: true,
  },
  {
    id: 'iv-correction',
    description: 'Relevant correction record downgrades the claim to partial',
    question: 'Did my running habit fail?',
    reply: modelReply(
      'Your running habit failed this week [ci-run-02].',
      [{ claim: 'Your running habit failed this week.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-run-02' }] }],
      [{ memoryId: 'ci-run-02', title: 'Skipped running this whole week' }]
    ),
    expectClaim: { contains: 'running habit failed', type: 'conflicting_evidence' },
    expectUncertainty: true,
  },
  {
    id: 'iv-irrelevant',
    description: 'Lexically similar but irrelevant evidence does not support the claim',
    question: 'What is my stance on space careers?',
    reply: modelReply(
      'You are training to be an astronaut [ci-astronaut-01].',
      [{ claim: 'You are training to be an astronaut.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-astronaut-01' }] }],
      [{ memoryId: 'ci-astronaut-01', title: 'Astronaut training daydream' }]
    ),
    expectClaim: { contains: 'training to be an astronaut', type: 'interpretation' },
    expectUncertainty: true,
  },
  {
    id: 'iv-empty',
    description: 'Empty context: every citation is rejected, nothing asserted as fact',
    question: 'What are my priorities?',
    reply: modelReply(
      'You value freedom above all [ci-dogs-01].',
      [{ claim: 'You value freedom above all.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-dogs-01' }] }],
      [{ memoryId: 'ci-dogs-01', title: 'Adopted a second dog' }]
    ),
    expectClaim: { contains: 'value freedom', type: 'unknown' },
    expectEvidenceRejected: 'ci-dogs-01',
  },
  {
    id: 'iv-cross-user',
    description: 'Cross-user source access attempt is rejected outside context',
    question: 'What is in my private notes?',
    reply: modelReply(
      'Your private note says you ran a marathon [ci-other-user-01].',
      [{ claim: 'You ran a marathon.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-other-user-01' }] }],
      [{ memoryId: 'ci-other-user-01', title: 'Someone else\'s private record' }]
    ),
    expectClaim: { contains: 'ran a marathon', type: 'unknown' },
    expectEvidenceRejected: 'ci-other-user-01',
  },
  {
    id: 'iv-causal',
    description: 'Causality overstatement on a single event is downgraded to interpretation',
    question: 'Why did I stop scrolling?',
    reply: modelReply(
      'Running caused you to stop scrolling [ci-run-01].',
      [{ claim: 'Running made you stop scrolling because of this.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-run-01' }] }],
      [{ memoryId: 'ci-run-01', title: 'Morning runs replaced scrolling' }]
    ),
    expectClaim: { contains: 'made you stop scrolling', type: 'conflicting_evidence' },
    expectUncertainty: true,
  },
  {
    id: 'iv-trait',
    description: 'Single example turned into a stable personality trait is downgraded',
    question: 'What am I like with money?',
    reply: modelReply(
      'You are someone who fumbles negotiations [ci-salary-01].',
      [{ claim: 'You are someone who always fumbles negotiations.', type: 'directly_supported', evidenceStatus: 'direct', evidence: [{ memoryId: 'ci-salary-01' }] }],
      [{ memoryId: 'ci-salary-01', title: 'The salary negotiation I fumbled' }]
    ),
    expectClaim: { contains: 'someone who always fumbles', type: 'unknown' },
    expectUncertainty: true,
  },
];
