/**
 * Live-model evaluation for semantic claim verification (Upgrade 4).
 *
 * Env-gated: runs ONLY when a real provider key is configured
 * (GEMINI_API_KEY / GOOGLE_API_KEY, matching what the twin-chat edge function
 * reads). With no key it reports 0 checks, 0 passed and exits 0 with a SKIP
 * notice — it is never substituted with mocked success.
 *
 * Measures BOTH error directions on a labeled synthetic set:
 *   - false approvals: reviewer says supported/partially_supported for a case
 *     whose truth is contradicted/unsupported
 *   - false rejections: reviewer says contradicted/unsupported/unable for a
 *     case whose truth is supported
 * reported with denominators (the size of each truth class).
 *
 * Run: npx tsx --env-file=.env scripts/run-claim-review-live-eval.mts
 */

import {
  CLAIM_REVIEW_SYSTEM,
  buildReviewUserTurn,
  coerceReviewResults,
  REVIEW_LABELS,
} from '../src/lib/claimReviewShared.ts';

interface LabeledCase {
  id: string;
  question: string;
  claim: string;
  truth: 'supported' | 'unsupported';
  sourceText: string;
  counterevidence?: string;
  expectLabel?: string;
  note?: string;
}

/* Labeled synthetic corpus. `truth` is ground truth about whether the cited
 * record text actually supports the claim's meaning. */
const CASES: LabeledCase[] = [
  {
    id: 'plain-supported',
    question: 'Did I go running last week?',
    claim: 'You went for a 5k run last Tuesday.',
    truth: 'supported',
    sourceText: 'Went for my usual 5k run around the park on Tuesday morning. Felt slow but finished.',
  },
  {
    id: 'valid-but-irrelevant',
    question: 'How is my training going?',
    claim: 'You have been consistently improving your race pace this month.',
    truth: 'unsupported',
    sourceText: 'Cooked a big pot of lentil soup today. Also reorganized the garage shelves.',
  },
  {
    id: 'fabricated-quote-substance',
    question: 'What did I say about my sister?',
    claim: 'You called your sister "the most generous person I know".',
    truth: 'unsupported',
    sourceText: 'Had lunch with my sister. We talked about her new job and the garden.',
  },
  {
    id: 'psych-inference-unsupported',
    question: 'Why did I avoid the party?',
    claim: 'You avoided the party because you have social anxiety.',
    truth: 'unsupported',
    sourceText: 'Skipped the neighborhood party tonight. Wanted to finish the book instead.',
  },
  {
    id: 'contradicted',
    question: 'Am I a morning person?',
    claim: 'You consistently wake up at 5am feeling refreshed.',
    truth: 'unsupported',
    sourceText: 'Slept in again until 10:30. Mornings are brutal for me, always have been.',
    counterevidence: 'Tried the 5am club for a week and felt wrecked. Not for me.',
  },
  {
    id: 'stale-memory',
    question: 'Do I drink coffee?',
    claim: 'You drink three coffees a day.',
    truth: 'unsupported',
    sourceText: 'Third coffee today. The afternoon slump is real.',
    note: 'record is over a year old and a later record says coffee was cut out',
    counterevidence: 'Day 30 without coffee. Sleeping better and no more afternoon crashes.',
  },
  {
    id: 'general-on-single-event',
    question: 'What are my habits?',
    claim: 'You always journal in the evening.',
    truth: 'unsupported',
    sourceText: 'Journaled tonight before bed for the first time in a while.',
  },
  {
    id: 'plain-supported-2',
    question: 'What did I work on?',
    claim: 'You spent the weekend building a bookshelf for the living room.',
    truth: 'supported',
    sourceText: 'Spent the whole weekend building the oak bookshelf for the living room. It finally fits.',
  },
  {
    id: 'partial-overreach',
    question: 'How is my Spanish learning?',
    claim: 'You are fluent in Spanish.',
    truth: 'unsupported',
    sourceText: 'Finished lesson 3 of the Spanish app today. Can order food in a restaurant now.',
    expectLabel: 'partially_supported',
    note: 'graded as unsupported truth (fluency not established) but partially_supported is an acceptable near-miss that still rejects the strong claim',
  },
];

function hasKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

async function reviewOnce(c: LabeledCase, model: string, key: string): Promise<string> {
  const userTurn = buildReviewUserTurn(c.question, [
    {
      claimId: 'k1',
      claim: c.claim,
      claimType: 'directly_supported',
      sources: [{ id: 'm1', title: 'Record', text: c.sourceText }],
      counterevidence: c.counterevidence
        ? [{ id: 'm2', title: 'Later record', text: c.counterevidence }]
        : undefined,
    },
  ]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CLAIM_REVIEW_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512, temperature: 0 },
      }),
    });
    if (!res.ok) throw new Error(`provider ${res.status}`);
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('malformed provider output');
    const parsed = coerceReviewResults(JSON.parse(text.slice(start, end + 1)), new Set(['k1']));
    return parsed[0]?.label ?? 'unable_to_assess';
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!hasKey()) {
    console.log('SKIP: no AI provider key configured — live claim-review eval not run (0 passed, 0 failed).');
    console.log('0 passed, 0 failed');
    return;
  }
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;
  const model = process.env.TWIN_REVIEW_MODEL || 'gemini-2.5-flash';

  let passed = 0;
  let failed = 0;
  // Denominator-tracked error accounting.
  const supportedCases = CASES.filter((c) => c.truth === 'supported');
  const unsupportedCases = CASES.filter((c) => c.truth === 'unsupported');
  let falseApprovals = 0;
  let falseRejections = 0;

  for (const c of CASES) {
    let label: string;
    try {
      label = await reviewOnce(c, model, key);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${c.id} — provider call failed: ${err instanceof Error ? err.message : 'unknown'}`);
      continue;
    }
    const approving = label === 'supported' || label === 'partially_supported';
    const correct = label === (c.expectLabel ?? (c.truth === 'supported' ? 'supported' : 'unsupported'));
    // Near-miss policy: on truth-unsupported cases, any non-approving label is
    // acceptable (conservatism is safe); only approvals count as false approvals.
    const ok = c.truth === 'unsupported' ? !approving : label === 'supported';
    if (ok) {
      passed += 1;
      console.log(`  ok   ${c.id} → ${label}${c.note ? ` (${c.note})` : ''}`);
    } else {
      failed += 1;
      if (c.truth === 'unsupported' && approving) falseApprovals += 1;
      if (c.truth === 'supported' && !approving) falseRejections += 1;
      console.error(`  FAIL ${c.id} → ${label}${c.note ? ` (${c.note})` : ''}`);
    }
  }

  console.log('');
  console.log(`False approvals: ${falseApprovals} / ${unsupportedCases.length} unsupported-truth cases approved`);
  console.log(`False rejections: ${falseRejections} / ${supportedCases.length} supported-truth cases rejected`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
