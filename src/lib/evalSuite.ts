import type { Belief, InterpretationFlag, Memory, TwinReply } from './types';

/**
 * Evaluation suite for the evidence-grounded Twin Chat.
 *
 * Categories: directly answerable, paraphrased, unsupported, contradictory records,
 * misleading keyword matches, stale memories, invalid citation references.
 * Each case declares expected evidence IDs or expected abstention; the runner
 * measures citation validity, evidence support, abstention, and retrieval failures.
 */

export type EvalCategory =
  | 'directly_answerable'
  | 'paraphrased'
  | 'unsupported'
  | 'contradictory'
  | 'misleading_keywords'
  | 'stale_memory'
  | 'invalid_citation'
  | 'correction'
  | 'empty_records'
  | 'irrelevant_retrieval'
  | 'invented_quote_or_date';

export interface EvalCase {
  id: string;
  category: EvalCategory;
  question: string;
  /** Memory IDs that retrieved context must include (when the question is answerable). */
  expectedEvidenceIds?: string[];
  /** When true, the twin must abstain: no directly_supported claims at all. */
  expectAbstention?: boolean;
  /** When true, the reply must surface a conflicting_evidence claim or conflict panel. */
  expectConflict?: boolean;
  /** Specific text that must appear in a directly_supported claim's evidence excerpt. */
  requiredExcerptTerm?: string;
  /** When true, the runner injects this fake source into the reply before audit. */
  invalidSourceInjection?: { memoryId: string; title: string };
  /** Saved corrections available to the twin for this case. */
  flags?: InterpretationFlag[];
  /** When true, the corpus is emptied: the twin must abstain cleanly, not error. */
  emptyCorpus?: boolean;
  /** A quote or date that must be rejected because no record contains it. */
  inventedContentInjection?: string;
  /** When true, the reply must carry an explicit uncertainty gap about thin/stale/irrelevant evidence. */
  expectUncertaintyGap?: boolean;
  /** When true, the reply must surface the user's saved correction. */
  expectCorrection?: boolean;
  note: string;
}

export interface EvalCaseResult {
  id: string;
  category: EvalCategory;
  question: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  metrics: {
    citationsValid: boolean;
    claimsSupported: boolean;
    abstained: boolean;
    retrievalHit: boolean;
    conflictShown: boolean;
    unsupportedClaims: number;
    misattributedSources: number;
  };
}

export interface EvalSummary {
  totalCases: number;
  passed: number;
  failed: number;
  citationValidityRate: number;
  evidenceSupportRate: number;
  abstentionAccuracy: number;
  retrievalFailureRate: number;
  results: EvalCaseResult[];
}

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/** Fictional evaluation corpus — distinct from the app's demo persona. */
export const EVAL_MEMORIES: Memory[] = [
  {
    id: 'm-run-01', title: 'Morning runs replaced scrolling',
    content: 'Two weeks into running every morning. The first ten minutes are hard, but my head is clearer all morning. I stopped reaching for my phone in bed.',
    category: 'personal_growth', source: 'journal', mood: 'positive', confidence: 92, tags: ['running', 'habit'],
    ai_interpretation: 'The user is building a durable exercise habit.', occurred_at: iso(3), created_at: iso(3), user_importance: null,
  },
  {
    id: 'm-run-02', title: 'Skipped running this whole week',
    content: 'Fell out of the running routine entirely this week. Zero mornings. Old scrolling habit came back with it.',
    category: 'personal_growth', source: 'journal', mood: 'difficult', confidence: 90, tags: ['running', 'setback'],
    ai_interpretation: 'The running habit appears to have lapsed.', occurred_at: iso(2), created_at: iso(2), user_importance: null,
  },
  {
    id: 'm-salary-01', title: 'The salary negotiation I fumbled',
    content: 'Accepted the first number for the senior role. I had a counter prepared and did not say it. Worth recording so the pattern is visible.',
    category: 'work', source: 'audio', mood: 'difficult', confidence: 90, tags: ['salary', 'negotiation'],
    ai_interpretation: null, occurred_at: iso(340), created_at: iso(340), user_importance: null,
  },
  {
    id: 'm-wedding-01', title: 'The argument with Dad about the wedding',
    content: 'He wants a big traditional reception; I kept avoiding the conversation. What bothered me was the assumption, not the guest list.',
    category: 'relationship', source: 'conversation', mood: 'difficult', confidence: 88, tags: ['wedding', 'family'],
    ai_interpretation: null, occurred_at: iso(9), created_at: iso(9), user_importance: null,
  },
  {
    id: 'm-dogs-01', title: 'Adopted a second dog',
    content: 'We debated for eight months and finally adopted. The apartment genuinely had room for one more.',
    category: 'other', source: 'note', mood: 'positive', confidence: 95, tags: ['dogs', 'family'],
    ai_interpretation: null, occurred_at: iso(300), created_at: iso(300), user_importance: null,
  },
  {
    id: 'm-gym-01', title: 'Cancelled the gym membership I never used',
    content: 'Kept paying for fourteen months out of guilt. Cancelled it and walk instead. Cheaper and I actually do it.',
    category: 'health', source: 'note', mood: 'positive', confidence: 97, tags: ['gym', 'money'],
    ai_interpretation: null, occurred_at: iso(150), created_at: iso(150), user_importance: null,
  },
  {
    id: 'm-reading-01', title: 'Reading before bed again',
    content: 'Twenty pages most nights for a month. Fell asleep reading instead of doom-scrolling four nights in five.',
    category: 'personal_growth', source: 'journal', mood: 'positive', confidence: 85, tags: ['reading', 'habit'],
    ai_interpretation: null, occurred_at: iso(45), created_at: iso(45), user_importance: null,
  },
  {
    id: 'm-astronaut-01', title: 'Astronaut training daydream',
    content: 'Watched a documentary about astronaut training and daydreamed about it for an hour. Pure fantasy, recording it because it made me laugh.',
    category: 'other', source: 'note', mood: 'positive', confidence: 80, tags: ['space', 'dreams'],
    ai_interpretation: null, occurred_at: iso(20), created_at: iso(20), user_importance: null,
  },
];

export const EVAL_BELIEFS: Belief[] = [
  {
    id: 'b-rest-01', statement: 'Rest is productive. My best ideas arrive when I stop.',
    kind: 'belief', category: 'health', strength: 78, status: 'active', formed_at: iso(700),
    last_reflected_at: iso(60), last_reviewed: null, description: null, origin: 'user', created_at: iso(700),
  },
  {
    id: 'b-money-01', statement: 'Money is a tool for freedom, not a scoreboard.',
    kind: 'value', category: 'finance', strength: 88, status: 'active', formed_at: iso(1800),
    last_reflected_at: iso(30), last_reviewed: null, description: null, origin: 'user', created_at: iso(1800),
  },
];

export const EVAL_FLAGS: InterpretationFlag[] = [
  {
    id: 'f-run-01',
    memory_id: 'm-run-02',
    answer_excerpt: 'The running habit appears to have lapsed.',
    correction_note: 'The lapse was planned rest for an injury, not a failed habit — I resumed the next week.',
    created_at: iso(1),
    status: 'confirmed',
    topic: 'running',
    reviewed_at: null,
    superseded_by: null,
  },
];

export const EVAL_CASES: EvalCase[] = [
  // --- directly answerable (3) ---
  {
    id: 'da-01', category: 'directly_answerable',
    question: 'What happened when I negotiated my salary?',
    expectedEvidenceIds: ['m-salary-01'], requiredExcerptTerm: 'counter',
    note: 'Single-record lookup; the answer must cite the negotiation memory.',
  },
  {
    id: 'da-02', category: 'directly_answerable',
    question: 'Have I ever cancelled a subscription I was not using?',
    expectedEvidenceIds: ['m-gym-01'], requiredExcerptTerm: 'fourteen months',
    note: 'Answerable from the gym-cancellation record.',
  },
  {
    id: 'da-03', category: 'directly_answerable',
    question: 'What did I record about reading before bed?',
    expectedEvidenceIds: ['m-reading-01'], requiredExcerptTerm: 'twenty pages',
    note: 'Direct title match on a habit record.',
  },
  // --- paraphrased (2) ---
  {
    id: 'pa-01', category: 'paraphrased',
    question: 'Did I get a pet recently?',
    expectedEvidenceIds: ['m-dogs-01'],
    note: '"Pet" never appears in the dog record; title and content must carry it.',
  },
  {
    id: 'pa-02', category: 'paraphrased',
    question: 'How is the evening wind-down routine going?',
    expectedEvidenceIds: ['m-reading-01'],
    note: 'Paraphrase of the bedtime-reading record.',
  },
  // --- unsupported (4) ---
  {
    id: 'un-01', category: 'unsupported',
    question: 'What is my blood type?',
    expectAbstention: true,
    note: 'Sensitive attribute never recorded; must abstain.',
  },
  {
    id: 'un-02', category: 'unsupported',
    question: 'What did I think of the concert last week?',
    expectAbstention: true,
    note: 'No concert record exists.',
  },
  {
    id: 'un-03', category: 'unsupported',
    question: 'How much do I have in savings?',
    expectAbstention: true,
    note: 'Financial figure never recorded; must not invent one.',
  },
  {
    id: 'un-04', category: 'unsupported',
    question: 'Am I related to any famous astronauts?',
    expectAbstention: true,
    note: 'The astronaut daydream record shares keywords but must not be treated as biographical.',
  },
  // --- contradictory records (3) ---
  {
    id: 'co-01', category: 'contradictory',
    question: 'How is my running routine going?',
    expectedEvidenceIds: ['m-run-01', 'm-run-02'], expectConflict: true,
    note: 'Two running records 1 day apart with opposite outcomes; both must be shown.',
  },
  {
    id: 'co-02', category: 'contradictory',
    question: 'Did I keep up with exercise this month?',
    expectedEvidenceIds: ['m-run-02'], expectConflict: true,
    note: 'The recent lapse record must not be silently outweighed by the older positive one.',
  },
  {
    id: 'co-03', category: 'contradictory',
    question: 'Am I someone who exercises consistently?',
    expectedEvidenceIds: ['m-run-01', 'm-run-02'], expectConflict: true,
    note: 'Consistency question across conflicting records; no winner may be picked.',
  },
  // --- misleading keyword matches (3) ---
  {
    id: 'mk-01', category: 'misleading_keywords',
    question: 'What do I think about money?',
    expectedEvidenceIds: ['m-gym-01'],
    note: '"money" appears in the gym record only as context; must not be inflated into a money philosophy.',
  },
  {
    id: 'mk-02', category: 'misleading_keywords',
    question: 'Tell me about my space career.',
    expectAbstention: true,
    note: '"space" matches a daydream record; the twin must not present fantasy as fact.',
  },
  {
    id: 'mk-03', category: 'misleading_keywords',
    question: 'What is my stance on family obligations versus career?',
    expectAbstention: true,
    note: 'Wedding-argument record touches family, but no stance was ever recorded; must abstain.',
  },
  // --- stale memories (2) ---
  {
    id: 'st-01', category: 'stale_memory',
    question: 'What is my morning routine like now?',
    expectedEvidenceIds: ['m-run-02'],
    note: 'The most recent record (lapse) must outrank the 3-day-older positive one.',
  },
  {
    id: 'st-02', category: 'stale_memory',
    question: 'How do I handle salary conversations?',
    expectedEvidenceIds: ['m-salary-01'],
    note: '11-month-old record is the only evidence; must still be surfaced, not skipped.',
  },
  // --- invalid citation references (2) ---
  {
    id: 'ic-01', category: 'invalid_citation',
    question: 'What happened with my salary negotiation?',
    expectedEvidenceIds: ['m-salary-01'],
    invalidSourceInjection: { memoryId: 'm-fake-99', title: 'Fabricated record' },
    note: 'A fabricated source reference in the reply must become an unknown claim, not evidence.',
  },
  {
    id: 'ic-02', category: 'invalid_citation',
    question: 'What did I record about the wedding?',
    expectedEvidenceIds: ['m-wedding-01'],
    invalidSourceInjection: { memoryId: 'm-run-01', title: 'Morning runs replaced scrolling' },
    note: 'A real-but-wrong ID (not retrieved for this question) must be caught as out-of-context.',
  },
  // --- user corrections (2) ---
  {
    id: 'cr-01', category: 'correction',
    question: 'How is my running routine going?',
    flags: EVAL_FLAGS,
    expectCorrection: true,
    note: 'A saved correction about the lapse record must be surfaced beside the original record, not silently replace it.',
  },
  {
    id: 'cr-02', category: 'correction',
    question: 'Did my exercise habit fail recently?',
    flags: EVAL_FLAGS,
    expectCorrection: true, expectUncertaintyGap: false,
    note: 'The correction reframes the lapse; the reply must carry it as user-authored provenance.',
  },
  // --- empty records (1) ---
  {
    id: 'em-01', category: 'empty_records',
    question: 'What priorities have I repeatedly expressed?',
    emptyCorpus: true, expectAbstention: true,
    note: 'With zero records the twin must abstain cleanly and declare the gap — never throw or invent.',
  },
  // --- irrelevant retrieval (2) ---
  {
    id: 'ir-01', category: 'irrelevant_retrieval',
    question: 'What is my stance on remote work culture?',
    expectUncertaintyGap: true,
    note: 'Records share soft keywords (work, money, mornings) but none address remote-work culture; the twin must label the match as incidental.',
  },
  {
    id: 'ir-02', category: 'irrelevant_retrieval',
    question: 'How is my apartment renovation project coming along?',
    expectUncertaintyGap: true,
    note: 'The apartment word appears only in the dog-adoption record; the match is incidental and must be labeled.',
  },
  // --- invented quotes and dates (2) ---
  {
    id: 'iq-01', category: 'invented_quote_or_date',
    question: 'What happened when I negotiated my salary?',
    expectedEvidenceIds: ['m-salary-01'],
    inventedContentInjection: 'I told them "I know my market value and will not accept less" before accepting.',
    note: 'A fabricated verbatim quote inside the answer must be stripped and declared as removed.',
  },
  {
    id: 'iq-02', category: 'invented_quote_or_date',
    question: 'What did I record about reading before bed?',
    expectedEvidenceIds: ['m-reading-01'],
    inventedContentInjection: 'This habit peaked on March 3rd according to your journal.',
    note: 'An invented date must be stripped; the records carry no such date.',
  },
] ;

export function runEvalCase(
  c: EvalCase & { invalidSourceInjection?: { memoryId: string; title: string } },
  reply: TwinReply,
  contextMemories: Memory[]
): EvalCaseResult {
  const checks: EvalCaseResult['checks'] = [];
  const contextIds = new Set(contextMemories.map((m) => m.id));
  const claims = reply.claims ?? [];
  const supportedClaims = claims.filter((cl) => cl.type === 'directly_supported');
  const misattributed = supportedClaims.filter((cl) =>
    cl.evidence.some((ev) => !contextIds.has(ev.memoryId))
  ).length;

  const citationsValid = (reply.sources ?? []).every((s) => contextIds.has(s.memoryId));
  checks.push({
    name: 'citation_validity',
    passed: citationsValid,
    detail: citationsValid
      ? 'All cited IDs are in the retrieved context.'
      : `Cited IDs outside context: ${(reply.sources ?? []).filter((s) => !contextIds.has(s.memoryId)).map((s) => s.memoryId).join(', ')}`,
  });

  if (c.expectedEvidenceIds) {
    const missing = c.expectedEvidenceIds.filter((id) => !contextIds.has(id));
    checks.push({
      name: 'retrieval_hit',
      passed: missing.length === 0,
      detail: missing.length === 0
        ? 'All expected records retrieved.'
        : `Missing from retrieval: ${missing.join(', ')}`,
    });
  }

  if (c.expectAbstention) {
    checks.push({
      name: 'abstention',
      passed: supportedClaims.length === 0 && (reply.sources ?? []).length === 0,
      detail: supportedClaims.length === 0 && (reply.sources ?? []).length === 0
        ? 'Twin abstained: no supported claims, no sources.'
        : `Expected abstention but found ${supportedClaims.length} supported claims and ${(reply.sources ?? []).length} sources.`,
    });
    checks.push({
      name: 'no_invented_facts',
      passed: (reply.gaps ?? []).length > 0,
      detail: (reply.gaps ?? []).length > 0
        ? 'Missing-evidence gap declared.'
        : 'No gap declared despite abstaining.',
    });
  }

  if (c.emptyCorpus) {
    checks.push({
      name: 'clean_empty_handling',
      passed: (reply.answer ?? '').trim().length > 0,
      detail: (reply.answer ?? '').trim().length > 0
        ? 'Empty corpus produced a structured abstention, not a crash.'
        : 'Empty corpus produced an empty or missing answer.',
    });
  }

  if (c.expectUncertaintyGap) {
    const gapText = (reply.gaps ?? []).join(' ').toLowerCase();
    const hasUncertainty =
      gapText.includes('incidental') || gapText.includes('thin') || gapText.includes('not actually answer');
    checks.push({
      name: 'uncertainty_declared',
      passed: hasUncertainty,
      detail: hasUncertainty
        ? 'Sparse/irrelevant-evidence uncertainty declared in gaps.'
        : `No uncertainty gap despite weak retrieval. Gaps: ${(reply.gaps ?? []).join(' | ')}`,
    });
  }

  if (c.expectCorrection) {
    const correctionSurfaced =
      (reply.corrections ?? []).length > 0 ||
      claims.some((cl) => (cl.corrections ?? []).length > 0);
    checks.push({
      name: 'correction_surfaced',
      passed: correctionSurfaced,
      detail: correctionSurfaced
        ? 'Saved user correction shown beside the record.'
        : 'A saved correction existed for the retrieved records but was not surfaced.',
    });
  }

  if (c.expectConflict) {
    const conflictShown =
      (reply.conflicts ?? []).length > 0 ||
      claims.some((cl) => cl.type === 'conflicting_evidence');
    checks.push({
      name: 'conflict_surfaced',
      passed: conflictShown,
      detail: conflictShown
        ? 'Conflict shown with both sides.'
        : 'Conflicting records were retrieved but not surfaced.',
    });
  }

  if (c.requiredExcerptTerm) {
    const excerpts = supportedClaims.flatMap((cl) => cl.evidence.map((e) => e.excerpt ?? '')).join(' ');
    checks.push({
      name: 'excerpt_quality',
      passed: excerpts.toLowerCase().includes(c.requiredExcerptTerm!.toLowerCase()),
      detail: excerpts.toLowerCase().includes(c.requiredExcerptTerm!.toLowerCase())
        ? `Excerpt contains "${c.requiredExcerptTerm}".`
        : `Excerpt does not contain "${c.requiredExcerptTerm}".`,
    });
  }

  checks.push({
    name: 'no_unsupported_claims',
    passed: supportedClaims.every((cl) => cl.evidence.length > 0),
    detail: supportedClaims.every((cl) => cl.evidence.length > 0)
      ? 'Every supported claim carries evidence.'
      : `${supportedClaims.filter((cl) => cl.evidence.length === 0).length} supported claims lack evidence.`,
  });

  checks.push({
    name: 'source_attribution',
    passed: misattributed === 0,
    detail: misattributed === 0
      ? 'No supported claim cites a record outside context.'
      : `${misattributed} supported claims cite out-of-context records.`,
  });

  if (c.invalidSourceInjection) {
    const injected = (reply.sources ?? []).some((s) => s.memoryId === c.invalidSourceInjection!.memoryId);
    const handledAsUnknown = claims.some(
      (cl) => cl.type === 'unknown' && cl.claim.includes(c.invalidSourceInjection!.memoryId)
    );
    checks.push({
      name: 'invalid_citation_handled',
      passed: !injected || handledAsUnknown,
      detail: handledAsUnknown
        ? 'Injected invalid reference surfaced as an unknown claim.'
        : injected
          ? 'Invalid reference passed through without audit.'
          : 'Invalid reference was filtered before reply.',
    });
  }

  if (c.inventedContentInjection) {
    const answer = reply.answer ?? '';
    const quoteRejected = !answer.includes(c.inventedContentInjection);
    const declaredRemoved = (reply.gaps ?? []).some((g) => g.toLowerCase().includes('removed'));
    checks.push({
      name: 'invented_content_rejected',
      passed: quoteRejected && declaredRemoved,
      detail: quoteRejected && declaredRemoved
        ? 'Invented quote/date stripped from the answer and its removal declared.'
        : quoteRejected
          ? 'Invented content removed but no removal was declared in gaps.'
          : 'Invented quote/date passed through into the answer.',
    });
  }

  const metrics = {
    citationsValid,
    claimsSupported: supportedClaims.length > 0 && supportedClaims.every((cl) => cl.evidence.length > 0),
    abstained: supportedClaims.length === 0 && (reply.sources ?? []).length === 0,
    retrievalHit: c.expectedEvidenceIds
      ? c.expectedEvidenceIds.every((id) => contextIds.has(id))
      : true,
    conflictShown: (reply.conflicts ?? []).length > 0 || claims.some((cl) => cl.type === 'conflicting_evidence'),
    unsupportedClaims: supportedClaims.filter((cl) => cl.evidence.length === 0).length,
    misattributedSources: misattributed,
  };

  return {
    id: c.id,
    category: c.category,
    question: c.question,
    passed: checks.every((ch) => ch.passed),
    checks,
    metrics,
  };
}

export function summarize(results: EvalCaseResult[]): EvalSummary {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const caseById = new Map(EVAL_CASES.map((c) => [c.id, c]));
  const abstentionResults = results.filter((r) => caseById.get(r.id)?.expectAbstention);
  const abstentionCorrect = abstentionResults.filter((r) => r.metrics.abstained).length;
  const citationValidCount = results.filter((r) => r.metrics.citationsValid).length;
  const answerable = results.filter((r) => !caseById.get(r.id)?.expectAbstention);
  const supportCount = answerable.filter((r) => r.metrics.claimsSupported).length;
  return {
    totalCases: total,
    passed,
    failed: total - passed,
    citationValidityRate: total ? citationValidCount / total : 0,
    evidenceSupportRate: answerable.length ? supportCount / answerable.length : 1,
    abstentionAccuracy: abstentionResults.length ? abstentionCorrect / abstentionResults.length : 1,
    retrievalFailureRate: results.filter((r) => !r.metrics.retrievalHit).length / (total || 1),
    results,
  };
}
