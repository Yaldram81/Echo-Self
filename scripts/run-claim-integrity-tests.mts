/**
 * Claim-integrity test runner: pushes simulated model output — fabricated ids,
 * invented quotes, overreach, cross-user attempts — through the same audit
 * chain askTwin uses (retrieve → sanitize → reject invented content → audit →
 * conflicts → uncertainty → corrections) and asserts conservative outcomes.
 * Run with: npx tsx scripts/run-claim-integrity-tests.mts
 */
import { retrieveMemories } from '../src/lib/retrieval.ts';
import {
  auditReply, withConflicts, withCorrections, withUncertainty, rejectInventedContent,
  claimOverreaches, findUnverifiedQuotes,
} from '../src/lib/claimAudit.ts';
import {
  INTEGRITY_CASES, INTEGRITY_MEMORIES, INTEGRITY_FLAGS,
} from '../src/lib/claimIntegritySuite.ts';
import type { Memory, TwinReply } from '../src/lib/types.ts';

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

/** The exact live-mode audit chain from askTwin (twinService.ts), minus the network call. */
function auditChain(reply: TwinReply, question: string, allMemories: Memory[], context: Memory[]) {
  const validIds = new Set(allMemories.map((m) => m.id));
  const grounded: TwinReply = {
    ...reply,
    sources: reply.sources.filter((s) => validIds.has(s.memoryId)),
  };
  const cleaned = rejectInventedContent(grounded, context);
  const audited = withConflicts(
    auditReply(cleaned, context),
    context
  );
  const uncertain = withUncertainty(audited, question, context);
  return withCorrections(uncertain, context, INTEGRITY_FLAGS);
}

for (const c of INTEGRITY_CASES) {
  console.log(`\n— ${c.id}: ${c.description}`);
  const corpus = c.id === 'iv-empty' ? [] : INTEGRITY_MEMORIES;
  const candidates = retrieveMemories(c.question, corpus, 8);
  const context = candidates.map((cand) => cand.memory);
  const audited = auditChain(c.reply, c.question, corpus, context);

  const claims = audited.claims ?? [];
  const target = claims.find((cl) => cl.claim.toLowerCase().includes(c.expectClaim.contains.toLowerCase()));

  if (c.expectClaim.type === 'absent') {
    check('claim is absent from audited reply', !target, target?.type ?? 'present');
  } else {
    check(`claim exists with type ${c.expectClaim.type}`, !!target && target.type === c.expectClaim.type,
      target ? `found type ${target.type}` : 'claim not found');
  }

  if (target && c.expectClaim.type !== 'absent') {
    // The model's own "direct" label must never survive without audited evidence.
    if (target.type === 'directly_supported') {
      check('supported claim carries evidence', target.evidence.length > 0);
      check('evidence status is calibrated (not unverified direct)', target.evidenceStatus === 'direct' || target.evidenceStatus === 'partial');
    } else {
      check('claim was not left as confidently supported', true);
    }
    check('claim has a response-local id', typeof target.claimId === 'string' && target.claimId.length > 0);

    if (c.expectVerbatimExcerpt && target.evidence.length > 0) {
      const mem = INTEGRITY_MEMORIES.find((m) => m.id === target.evidence[0]?.memoryId);
      check('excerpt is verbatim from the record text',
        !!mem && target.evidence.length > 0 &&
        target.evidence.every((e) => mem.content.includes(e.excerpt) || mem.title.includes(e.excerpt)),
        target.evidence.length === 0
          ? 'claim carried no verified evidence (downgraded, nothing fabricated shown)'
          : target.evidence.map((e) => e.excerpt).join(' | '));
      check('model-supplied fabricated excerpt did not survive',
        !target.evidence.some((e) => e.excerpt.includes('I know my market value')));
    }
    if (c.expectEvidenceRejected) {
      check('fabricated/invalid source is not cited as evidence',
        !audited.sources.some((s) => s.memoryId === c.expectEvidenceRejected) &&
        !claims.some((cl) => cl.type === 'directly_supported' && cl.evidence.some((e) => e.memoryId === c.expectEvidenceRejected)),
        audited.sources.map((s) => s.memoryId).join(','));
    }
    if (c.expectUncertainty) {
      const declared = (audited.gaps ?? []).length > 0 || !!target.uncertainty || target.evidenceStatus === 'partial' || target.evidenceStatus === 'conflicting';
      check('uncertainty is declared (gap, claim note, or non-direct status)', declared,
        `gaps=${(audited.gaps ?? []).length} uncertainty=${target.uncertainty ?? 'none'} status=${target.evidenceStatus}`);
    }
  }

  if (c.expectNoOutOfContextSources) {
    const ctxIds = new Set(context.map((m) => m.id));
    check('no out-of-context sources survive', audited.sources.every((s) => ctxIds.has(s.memoryId)));
  }
}

/* ------------------------- unit checks on the audit helpers ------------------------- */
console.log('\n— Audit helper units —');
{
  const salary = INTEGRITY_MEMORIES.find((m) => m.id === 'ci-salary-01')!;
  check('claimOverreaches flags causality on one record', claimOverreaches('Running made you stop scrolling because of this.', 1));
  check('claimOverreaches flags trait claims on thin evidence', claimOverreaches('You are someone who always fumbles negotiations.', 1));
  check('claimOverreaches allows 3-record trait claims', !claimOverreaches('You are someone who keeps habits.', 3));
  check('claimOverreaches flags psychological diagnosis', claimOverreaches('You have ADHD.', 5));
  check('findUnverifiedQuotes rejects fabricated quotes', findUnverifiedQuotes('You said "I know my market value"', [`${salary.title} ${salary.content}`]).length === 1);
  check('findUnverifiedQuotes passes genuine quotes', findUnverifiedQuotes('You "had a counter prepared"', [`${salary.title} ${salary.content}`]).length === 0);
}

/* ------------------------- malformed model output ------------------------- */
console.log('\n— Malformed model output —');
{
  // The live path sanitizes claims; malformed shapes must not crash or mislead.
  const malformed: TwinReply = {
    answer: 'Some answer text.',
    sources: [{ memoryId: 'ci-salary-01', title: 'x' }],
    inferences: [],
    gaps: [],
    followUps: [],
    mode: 'live',
    claims: [
      { claimId: 'x1', claim: '', type: 'directly_supported', evidenceStatus: 'direct', evidence: [] },
      { claimId: 'x2', claim: 'Completely unrelated bakery weather patterns', type: 'nonsense' as never, evidenceStatus: 'banana' as never, evidence: [{ memoryId: 'ci-salary-01', title: '', excerpt: '' }] },
    ],
  };
  const context = retrieveMemories('salary negotiation', INTEGRITY_MEMORIES, 8).map((c) => c.memory);
  const out = auditChain(malformed, 'salary negotiation', INTEGRITY_MEMORIES, context);
  check('empty claim text is dropped or downgraded, never shown as supported',
    (out.claims ?? []).every((cl) => cl.type !== 'directly_supported' || cl.evidence.length > 0));
  check('invalid type/status do not crash the audit', (out.claims ?? []).every((cl) => typeof cl.claim === 'string'));
  check('invalid-type claim is not presented as a supported fact',
    !(out.claims ?? []).some((cl) => cl.claim.includes('bakery weather') && cl.type === 'directly_supported'));
}

console.log(`\nClaim-integrity tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
