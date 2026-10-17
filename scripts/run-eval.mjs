/**
 * Evaluation runner for the Twin Chat audit pipeline.
 * Runs with: npx tsx scripts/run-eval.mjs
 * Uses the same retrieval + audit modules the app ships with.
 */
import { retrieveMemories } from '../src/lib/retrieval.ts';
import {
  auditReply, withConflicts, withCorrections, withUncertainty, rejectInventedContent,
} from '../src/lib/claimAudit.ts';
import { composeDemoReply } from '../src/lib/twinService.ts';
import {
  EVAL_CASES, EVAL_MEMORIES, EVAL_BELIEFS, runEvalCase, summarize,
} from '../src/lib/evalSuite.ts';

function runCase(c) {
  const corpus = c.emptyCorpus ? [] : EVAL_MEMORIES;
  const candidates = retrieveMemories(c.question, corpus, 8);
  const contextMemories = candidates.map((cand) => cand.memory);

  // Demo-mode composition, mirroring askTwin's demo path.
  let reply = composeDemoReply(c.question, corpus, EVAL_BELIEFS);

  // Simulate the invalid-citation scenarios: inject a source the model "hallucinated".
  if (c.invalidSourceInjection) {
    reply = { ...reply, sources: [...reply.sources, c.invalidSourceInjection] };
  }

  // Simulate a model inventing a quote or date inside its answer text.
  if (c.inventedContentInjection) {
    reply = { ...reply, answer: `${reply.answer}\n\n${c.inventedContentInjection}` };
  }

  const validIds = new Set(corpus.map((m) => m.id));
  const grounded = { ...reply, sources: reply.sources.filter((s) => validIds.has(s.memoryId)) };
  const cleaned = rejectInventedContent(grounded, contextMemories);
  const uncertain = withUncertainty(
    withConflicts(auditReply(cleaned, contextMemories), contextMemories),
    c.question,
    contextMemories
  );
  const audited = withCorrections(uncertain, contextMemories, c.flags ?? []);
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
