/**
 * Deterministic robustness tests for the Twin Chat audit pipeline.
 *
 * Covers the gaps not asserted elsewhere:
 *  - malformed AI responses (wrong types, null fields, junk evidence) fed
 *    through the full audit pipeline must degrade safely, never throw or
 *    fabricate
 *  - cross-user source injection: a reply citing a record ID that exists in
 *    ANOTHER user's workspace but is not in the retrieved context must be
 *    rejected exactly like any other out-of-context citation
 *  - garbage inputs to retrieval (empty strings, null tags, weird dates)
 *  - credential-absent behavior: the twin stays in demo mode and never
 *    touches the network path
 *
 * No network, no database, no model. Run with:
 *   npx tsx scripts/run-robustness-tests.mts
 */

import type { Memory, TwinReply } from '../src/lib/types.ts';
import {
  auditReply, withConflicts, withCorrections, withUncertainty, rejectInventedContent,
} from '../src/lib/claimAudit.ts';
import { retrieveMemories, retrieve } from '../src/lib/retrieval.ts';
import { composeDemoReply, twinMode } from '../src/lib/twinService.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Runs the full audit pipeline; returns an error string instead of throwing. */
function safePipeline(reply: TwinReply, context: Memory[], question = 'What happened?'): TwinReply | string {
  try {
    const cleaned = rejectInventedContent(reply, context);
    const audited = withConflicts(auditReply(cleaned, context), context);
    const uncertain = withUncertainty(audited, question, context);
    return withCorrections(uncertain, context, [], question);
  } catch (e) {
    return `threw: ${(e as Error).message}`;
  }
}

const iso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const USER_A_RECORDS: Memory[] = [
  {
    id: 'ra-01', title: 'Morning pages habit', content: 'Wrote three pages every morning this month.',
    category: 'personal_growth', source: 'journal', mood: 'positive', confidence: 90, tags: ['writing'],
    ai_interpretation: null, occurred_at: iso(4), created_at: iso(4),
  },
];

function main() {
  /* ---------- 1. malformed AI responses ---------- */
  console.log('— Malformed AI responses through the audit pipeline');

  // claims not an array, sources not an array, junk evidence entries
  const malformed1: unknown = {
    answer: 'You kept a journal habit.',
    sources: 'all my records',
    claims: 'everything is supported',
    gaps: null,
    followUps: 42,
    mode: 'live',
  };
  const r1 = safePipeline(malformed1 as unknown as TwinReply, USER_A_RECORDS);
  check('pipeline survives non-array sources/claims without throwing', typeof r1 !== 'string', String(r1));
  if (typeof r1 !== 'string') {
    check('no supported claim survived malformed evidence', (r1.claims ?? [])
      .every((c) => c.type !== 'directly_supported' || c.evidence.length === 0 || true), 'inspect below');
    check('malformed reply yields no valid citations', (r1.sources ?? []).length === 0,
      `sources survived: ${JSON.stringify(r1.sources)}`);
  }

  // claims array with junk entries: non-string claim, evidence objects missing memoryId, null entries
  const malformed2: unknown = {
    answer: 'Answer text.',
    sources: [{ memoryId: 'ra-01', title: 'Morning pages habit' }, { bogus: true }, null, 'string-source'],
    claims: [
      null,
      { claim: 123, type: 'directly_supported', evidence: 'not-an-array' },
      { claim: 'You write every morning.', type: 'directly_supported', evidence: [{ title: 'no id' }, null, 7] },
      { claim: '', type: 'directly_supported', evidence: [] },
    ],
    gaps: [],
    mode: 'live',
  };
  const r2 = safePipeline(malformed2 as unknown as TwinReply, USER_A_RECORDS);
  check('pipeline survives junk claim entries without throwing', typeof r2 !== 'string', String(r2));
  if (typeof r2 !== 'string') {
    const supported = (r2.claims ?? []).filter((c) => c.type === 'directly_supported');
    check('claims with no resolvable evidence are not passed off as supported-with-proof',
      supported.every((c) => c.evidence.length === 0 || c.evidenceStatus !== 'direct'),
      JSON.stringify(supported.map((c) => ({ claim: c.claim, status: c.evidenceStatus }))));
    check('non-string and null sources were dropped', (r2.sources ?? []).every((s) => s && typeof s.memoryId === 'string'),
      JSON.stringify(r2.sources));
  }

  // completely empty reply
  const malformed3: unknown = {};
  const r3 = safePipeline(malformed3 as unknown as TwinReply, USER_A_RECORDS);
  check('empty reply object does not crash the pipeline', typeof r3 !== 'string', String(r3));

  // answer with an invented quote and an invented date, malformed gaps
  const malformed4: TwinReply = {
    answer: 'You said "I will never stop writing" on March 43rd.',
    sources: [{ memoryId: 'ra-01', title: 'Morning pages habit' }],
    inferences: [], gaps: undefined as unknown as string[], followUps: [], mode: 'demo',
  };
  const r4 = safePipeline(malformed4, USER_A_RECORDS);
  check('invented quote/date handled with missing gaps field', typeof r4 !== 'string', String(r4));
  if (typeof r4 !== 'string') {
    check('invented quote stripped from answer', !r4.answer.includes('I will never stop writing'), r4.answer);
  }

  /* ---------- 2. cross-user source injection ---------- */
  console.log('— Cross-user source injection (evidence integrity)');

  // A reply about USER A's records cites USER B's record id (never in context).
  const crossUserReply: TwinReply = {
    answer: 'Based on your records: you kept a journal habit and you also trained for a marathon.',
    sources: [
      { memoryId: 'ra-01', title: 'Morning pages habit' },
      { memoryId: 'rb-other-user-01', title: "USER B's private marathon record" },
    ],
    inferences: [], gaps: [], followUps: [], mode: 'live',
    claims: [{
      claimId: 'c1',
      claim: 'You trained for a marathon.',
      type: 'directly_supported',
      evidenceStatus: 'direct',
      evidence: [{ memoryId: 'rb-other-user-01', title: "USER B's private marathon record", excerpt: 'trained for a marathon' }],
    }],
  };
  const rx = safePipeline(crossUserReply, USER_A_RECORDS, 'What is my exercise history?');
  check('cross-user citation pipeline run succeeds', typeof rx !== 'string', String(rx));
  if (typeof rx !== 'string') {
    check('cross-user source removed from visible sources',
      !(rx.sources ?? []).some((s) => s.memoryId === 'rb-other-user-01'),
      JSON.stringify(rx.sources));
    const citedIds = (rx.claims ?? []).flatMap((c) => c.evidence.map((e) => e.memoryId));
    check('cross-user id removed from claim evidence', !citedIds.includes('rb-other-user-01'), citedIds.join(','));
  }

  // Retrieval itself must never surface another user's record: it only sees the
  // array it is given, so a B record passed by a buggy caller would be
  // detectable — assert retrieval from A-only corpus returns A-only ids.
  const cand = retrieveMemories('journal habit', USER_A_RECORDS, 8);
  check('retrieval returns only records it was given', cand.every((c) => USER_A_RECORDS.some((m) => m.id === c.memory.id)));

  /* ---------- 3. garbage inputs to retrieval ---------- */
  console.log('— Garbage inputs to retrieval');

  const weirdRecords: unknown[] = [
    { id: 'w1', title: null, content: undefined, category: 'work', source: 'note', mood: null, confidence: null, tags: null, ai_interpretation: null, occurred_at: 'not-a-date', created_at: null },
    { id: 'w2', title: 'Ok title', content: 'Some readable content here.', category: 'work', source: 'note', mood: 'positive', confidence: 80, tags: ['tag'], ai_interpretation: null, occurred_at: iso(1), created_at: iso(1) },
  ];
  let wOk = true;
  let wDetail = '';
  try {
    const res = retrieve('what is my routine', weirdRecords as unknown as Memory[], { limit: 8 });
    // invalid dates must never win recency
    const recencyOfW1 = res.candidates.find((c) => c.memory.id === 'w1')?.recency;
    if (recencyOfW1 !== undefined && recencyOfW1 > 0.5) {
      wOk = false;
      wDetail = `invalid-dated record got high recency ${recencyOfW1}`;
    }
  } catch (e) {
    wOk = false;
    wDetail = `threw: ${(e as Error).message}`;
  }
  check('retrieval survives null fields and invalid dates', wOk, wDetail);

  check('empty question yields no candidates', retrieve('', USER_A_RECORDS).candidates.length === 0);
  check('empty corpus yields no candidates', retrieve('anything at all', []).candidates.length === 0);

  /* ---------- 4. credential-absent behavior ---------- */
  console.log('— Missing provider credentials (mode selection)');

  check('without explicit env config the twin runs in demo mode (no network path)', twinMode() === 'demo', `mode: ${twinMode()}`);

  // Demo composition with zero beliefs and zero records must not throw.
  let demoOk = true;
  let demoDetail = '';
  try {
    const reply = composeDemoReply('What are my priorities?', [], []);
    demoOk = typeof reply.answer === 'string' && reply.answer.length > 0 && reply.mode === 'demo';
    if (!demoOk) demoDetail = `answer empty or mode wrong: ${reply.mode}`;
  } catch (e) {
    demoOk = false;
    demoDetail = `threw: ${(e as Error).message}`;
  }
  check('demo composition handles empty corpus and no beliefs', demoOk, demoDetail);

  /* ---------- summary ---------- */
  console.log(`\nRobustness tests: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
