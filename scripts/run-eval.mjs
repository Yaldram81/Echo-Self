/**
 * Evaluation runner for the Twin Chat audit pipeline.
 * Runs with: node scripts/run-eval.mjs (after tsc, or via tsx)
 * Uses the same retrieval + audit modules the app ships with.
 */
import { retrieveMemories } from '../src/lib/retrieval.ts';
import { auditReply, withConflicts } from '../src/lib/claimAudit.ts';
import { composeDemoReply } from '../src/lib/twinService.ts';
import {
  EVAL_CASES, EVAL_MEMORIES, EVAL_BELIEFS, runEvalCase, summarize,
} from '../src/lib/evalSuite.ts';

function runCase(c) {
  const candidates = retrieveMemories(c.question, EVAL_MEMORIES, 8);
  const contextMemories = candidates.map((cand) => cand.memory);

  // Demo-mode composition, mirroring askTwin's demo path.
  let reply = composeDemoReply(c.question, EVAL_MEMORIES, EVAL_BELIEFS);

  // Simulate the invalid-citation scenarios: inject a source the model "hallucinated".
  if (c.invalidSourceInjection) {
    reply = { ...reply, sources: [...reply.sources, c.invalidSourceInjection] };
  }

  const validIds = new Set(EVAL_MEMORIES.map((m) => m.id));
  const grounded = { ...reply, sources: reply.sources.filter((s) => validIds.has(s.memoryId)) };
  const audited = withConflicts(auditReply(grounded, contextMemories), contextMemories);
  return runEvalCase(c, audited, contextMemories);
}

const results = EVAL_CASES.map(runCase);
const summary = summarize(results);

console.log('\n=== EchoSelf Twin Chat evaluation ===');
console.log(`Cases: ${summary.totalCases}  passed: ${summary.passed}  failed: ${summary.failed}`);
console.log(`Citation validity:    ${(summary.citationValidityRate * 100).toFixed(0)}%`);
console.log(`Evidence support:     ${(summary.evidenceSupportRate * 100).toFixed(0)}% (answerable cases)`);
console.log(`Abstention accuracy:  ${(summary.abstentionAccuracy * 100).toFixed(0)}%`);
console.log(`Retrieval failures:   ${(summary.retrievalFailureRate * 100).toFixed(0)}%`);

for (const r of summary.results) {
  const mark = r.passed ? 'PASS' : 'FAIL';
  console.log(`\n[${mark}] ${r.id} (${r.category}) — "${r.question}"`);
  for (const ch of r.checks) {
    if (!ch.passed) console.log(`    ✗ ${ch.name}: ${ch.detail}`);
  }
}

process.exit(summary.failed === 0 ? 0 : 1);
