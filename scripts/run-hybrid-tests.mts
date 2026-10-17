/**
 * Hybrid retrieval test suite (Upgrade 1).
 *
 * Deterministic tests over synthetic fixtures with a scripted EmbeddingPort
 * (no network). Covers:
 *  - RRF fusion of keyword + semantic legs, and keyword-priority preservation
 *  - semantic-only discovery (low lexical overlap) improves paraphrase recall
 *  - fallback: embedding failures/unavailability degrade to keyword mode
 *  - cross-user vectors are never reachable through the port contract
 *  - mode reporting is explicit and honest
 * Run with: npx tsx scripts/run-hybrid-tests.mts
 */
import {
  createHybridRetriever, rrfFuse, RRF_K, SEMANTIC_WEIGHT, KEYWORD_WEIGHT,
  type EmbeddingPort,
} from '../src/lib/hybridRetrieval.ts';
import { retrieve } from '../src/lib/retrieval.ts';
import type { Memory } from '../src/lib/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function mem(id: string, title: string, content: string, tags: string[] = []): Memory {
  return {
    id, title, content,
    category: 'personal_growth', source: 'journal', mood: 'positive',
    confidence: 80, tags, ai_interpretation: null,
    occurred_at: new Date('2026-10-01T12:00:00Z').toISOString(),
    created_at: new Date('2026-10-01T12:00:00Z').toISOString(),
    user_importance: null,
  };
}

/* ------------------------------ fixtures ------------------------------ */

// sim-* records use words that share NO lexical overlap with the questions
// below — they are only reachable through the semantic leg.
const FIXTURES: Memory[] = [
  mem('hyb-exact', 'Salary negotiation notes', 'Accepted the first offer without saying my counter number.', ['salary', 'work']),
  mem('hyb-sem', 'Drawer ritual', 'Put the phone in a drawer and opened a novel instead. Sleep improved within a week.', ['books']),
  mem('hyb-other', 'Tax paperwork day', 'Filed the quarterly paperwork and organized receipts.', ['admin']),
];

/** Scripted port: maps questions/records to fixed neighbor lists. */
function fakePort(mapping: Record<string, string[]>, opts: { fail?: boolean } = {}): EmbeddingPort {
  return {
    async embedQuery(question) {
      if (opts.fail) throw new Error('provider down');
      return { embedding: [0.1, 0.2], model: 'text-embedding-004' };
    },
    async matchEmbeddings(query, model, limit) {
      if (opts.fail) throw new Error('match failed');
      void query; void model; void limit;
      // Look up by the most recent question seen — the harness passes the id
      // through the query key indirectly, so we track it via closure below.
      return [];
    },
  };
}

/** A port that returns the scripted neighbor ids for the current question. */
function scriptedPort(neighbors: (question: string) => string[], opts: { fail?: boolean } = {}): EmbeddingPort {
  let lastQuestion = '';
  const inner = fakePort({}, opts);
  return {
    embedQuery: async (q) => {
      lastQuestion = q;
      return inner.embedQuery(q);
    },
    matchEmbeddings: async (query, model, limit) => {
      if (opts.fail) throw new Error('match failed');
      void query; void model;
      return neighbors(lastQuestion).slice(0, limit).map((id, i) => ({ memoryId: id, similarity: 0.9 - i * 0.1 }));
    },
  };
}

/* ------------------------------ RRF unit ------------------------------ */
console.log('\n— RRF fusion —');
{
  const fused = rrfFuse(['a', 'b', 'c'], ['b', 'd']);
  check('doc in both legs outscores doc in one', fused.get('b')! > fused.get('a')! && fused.get('b')! > fused.get('d')!);
  check('higher rank scores higher within one leg', fused.get('a')! > fused.get('c')!);
  const k1 = 1 / (RRF_K + 1);
  const k2 = 1 / (RRF_K + 2);
  check('formula matches Σ w/(k+rank)', Math.abs(fused.get('b')! - (KEYWORD_WEIGHT * k2 + SEMANTIC_WEIGHT * k1)) < 1e-9);
  const empty = rrfFuse([], []);
  check('empty legs fuse to empty', empty.size === 0);
  const det1 = [...rrfFuse(['a', 'b'], ['c']).entries()];
  const det2 = [...rrfFuse(['a', 'b'], ['c']).entries()];
  check('RRF is deterministic', JSON.stringify(det1) === JSON.stringify(det2));
}

/* --------------------------- hybrid behavior --------------------------- */
console.log('\n— Hybrid retrieval behavior —');
{
  // Paraphrase recovery: "wind down" question, semantic leg finds hyb-sem.
  const port = scriptedPort((q) => (q.includes('unplug') ? ['hyb-sem'] : []));
  const hybridRetrieve = createHybridRetriever(port);
  const { result, status } = await hybridRetrieve('How do I unplug in the evening?', FIXTURES, { now: Date.now() });
  const ids = result.candidates.filter((c) => !c.isNearDuplicateOf).map((c) => c.memory.id);
  check('semantic-only record is surfaced by hybrid retrieval', ids.includes('hyb-sem'), ids.join(','));
  check('mode reported as hybrid', status.mode === 'hybrid' && status.semanticUsed === true);
  const semCand = result.candidates.find((c) => c.memory.id === 'hyb-sem');
  check('semantic-only candidate honestly explains its provenance',
    (semCand?.reason ?? '').includes('semantic similarity'), semCand?.reason);

  // Exact keyword question still works, keyword leg still primary.
  const exact = await hybridRetrieve('salary negotiation', FIXTURES, { now: Date.now() });
  check('exact keyword question retrieves the exact record',
    exact.result.candidates[0]?.memory.id === 'hyb-exact', exact.result.candidates[0]?.memory.id);

  // Fallback: provider down → keyword mode, results still returned.
  const downPort = scriptedPort(() => [], { fail: true });
  const down = createHybridRetriever(downPort);
  const fb = await down('salary negotiation', FIXTURES, { now: Date.now() });
  check('embedding failure degrades to keyword mode', fb.status.mode === 'keyword');
  check('keyword results still returned during fallback',
    fb.result.candidates.some((c) => c.memory.id === 'hyb-exact'));

  // No rows indexed yet → keyword mode with a clear detail.
  const emptyPort = scriptedPort(() => []);
  const emptyRun = await createHybridRetriever(emptyPort)('salary', FIXTURES, { now: Date.now() });
  check('no semantic rows → keyword mode', emptyRun.status.mode === 'keyword');
  check('mode detail explains semantic absence', emptyRun.status.detail.length > 0);

  // Cross-user: neighbor ids outside the caller-supplied corpus are dropped.
  const leakPort = scriptedPort(() => ['hyb-sem', 'fx-USER-B-PRIVATE-01']);
  const leak = await createHybridRetriever(leakPort)('unplug', FIXTURES, { now: Date.now() });
  check('semantic neighbors outside the caller corpus are filtered out',
    !leak.result.candidates.some((c) => c.memory.id === 'fx-USER-B-PRIVATE-01'),
    leak.result.candidates.map((c) => c.memory.id).join(','));
  check('fusion never introduces unauthorized records',
    leak.result.candidates.every((c) => FIXTURES.some((m) => m.id === c.memory.id)));

  // Hybrid ranking beats keyword-only for the paraphrase case.
  const keywordOnly = retrieve('How do I unplug in the evening?', FIXTURES, { now: Date.now() });
  check('keyword-only baseline misses the semantically-related record',
    !keywordOnly.candidates.some((c) => c.memory.id === 'hyb-sem'),
    keywordOnly.candidates.map((c) => c.memory.id).join(','));
}

console.log(`\nHybrid retrieval tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
