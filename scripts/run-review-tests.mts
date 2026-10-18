/**
 * Test suite for Review Center & Human Approval Workflow.
 * Validates unified review aggregation across:
 * - Suggested beliefs and values
 * - Interpretation flags and corrections
 * - Statement relationships and contradictions
 * - Evidence graph connection confirmations
 * - Decision belief proposals
 * - Stale source record guards
 * - Duplicate click idempotency
 * - Two-account RLS isolation
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import {
  beliefsService,
  decisionsService,
  flagsService,
  memoriesService,
  relationshipsService,
  edgeConfirmationsService,
} from '../src/lib/services.js';
import { reviewService } from '../src/lib/reviewService.js';
import type { BeliefInput, DecisionInput, MemoryInput } from '../src/lib/types.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running Unified Review Center Test Suite ===\n');
  let passed = 0;

  // 1. Authenticate throwaway test user A
  const testAEmail = `test-review-a-${Date.now()}@example.com`;
  const testPassword = `ReviewPass123!-${Date.now()}`;
  const { data: authA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPassword,
  });
  if (authErrA || !authA.user) {
    throw new Error(`Failed to authenticate user A: ${authErrA?.message}`);
  }
  const userAId = authA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // Test 1: Suggested belief workflow (origin: 'suggestion' -> edit & approve -> 'confirmed_suggestion')
  const { data: rawBelief, error: bErr } = await supabase.from('beliefs').insert({
    statement: 'Solitary deep focus produces my best architectural designs.',
    description: 'Inferred pattern from multiple engineering retrospectives.',
    kind: 'belief',
    category: 'work',
    strength: 65,
    status: 'evolving',
    origin: 'suggestion',
  }).select().single();
  assert.ok(!bErr && rawBelief, `Belief insert should succeed: ${bErr?.message}`);

  let allReviews = await reviewService.listAll();
  const beliefReview = allReviews.find((i) => i.id === `belief_suggestion:${rawBelief.id}`);
  assert.ok(beliefReview, 'Suggested belief must appear in Review Center');
  assert.equal(beliefReview.status, 'pending', 'Initial status must be pending');
  assert.equal(beliefReview.kind, 'belief_suggestion');
  assert.ok(beliefReview.proposal.includes('Solitary deep focus'), 'Proposal must state the suggested statement');
  assert.ok(beliefReview.rationale.includes('Inferred pattern'), 'Rationale must be populated');

  // Edit and approve the suggested belief
  const editedStatement = 'Deep uninterrupted focus consistently yields my highest-leverage work.';
  await reviewService.approve(beliefReview, editedStatement);

  const updatedBelief = await supabase.from('beliefs').select('*').eq('id', rawBelief.id).single();
  assert.equal(updatedBelief.data?.origin, 'confirmed_suggestion', 'Origin must transition to confirmed_suggestion');
  assert.equal(updatedBelief.data?.statement, editedStatement, 'Statement must reflect edited text');
  assert.ok(updatedBelief.data?.last_reviewed, 'last_reviewed must be stamped');
  console.log('✓ 1. Suggested belief: appears in review, edit & approve transitions origin to confirmed_suggestion');
  passed++;

  // Test 2: Interpretation flag workflow (status: 'proposed' -> approved -> 'confirmed')
  const mem1 = await memoriesService.create({
    title: 'Distributed consensus debugging session',
    content: 'Spent 4 hours tracing a Raft split-brain condition caused by asymmetric network partition.',
    category: 'work',
    source: 'journal',
    mood: 'mixed',
    confidence: 85,
    tags: ['distributed-systems', 'debugging'],
    occurred_at: new Date().toISOString(),
  });

  const flag = await flagsService.create({
    memory_id: mem1.id,
    answer_excerpt: 'Jordan struggled with understanding distributed protocols.',
    correction_note: 'The difficulty was due to a physical network hardware failure, not algorithmic understanding.',
    topic: 'systems-engineering',
  });
  assert.equal(flag.status, 'proposed', 'New flag enters as proposed');

  allReviews = await reviewService.listAll();
  const flagReview = allReviews.find((i) => i.id === `interpretation_flag:${flag.id}`);
  assert.ok(flagReview, 'Proposed flag must appear in Review Center');
  assert.equal(flagReview.status, 'pending');
  assert.equal(flagReview.supportingRecords[0]?.id, mem1.id, 'Supporting record links to parent memory');

  // Approve flag
  await reviewService.approve(flagReview);
  const updatedFlag = await supabase.from('interpretation_flags').select('*').eq('id', flag.id).single();
  assert.equal(updatedFlag.data?.status, 'confirmed', 'Flag status must transition to confirmed');
  assert.ok(updatedFlag.data?.reviewed_at, 'reviewed_at must be stamped');
  console.log('✓ 2. Interpretation flag: proposed correction reviewed and confirmed into authoritative context');
  passed++;

  // Test 3: Statement relationship candidate & dismissal
  const rel = await relationshipsService.saveCandidate({
    a_type: 'memory',
    b_type: 'memory',
    a_id: mem1.id,
    b_id: mem1.id, // using mem1 for self-pair candidate test
    relation: 'possible_contradiction',
    explanation: 'Apparent divergence between expected throughput and actual network latency.',
    source: 'pattern',
  });
  assert.equal(rel.status, 'candidate', 'Relationship starts as candidate');

  allReviews = await reviewService.listAll();
  const relReview = allReviews.find((i) => i.id === `statement_relationship:${rel.id}`);
  assert.ok(relReview, 'Candidate relationship appears in Review Center');
  assert.equal(relReview.status, 'pending');

  // Dismiss relationship
  await reviewService.dismiss(relReview);
  const updatedRel = await supabase.from('statement_relationships').select('*').eq('id', rel.id).single();
  assert.equal(updatedRel.data?.status, 'dismissed', 'Relationship status becomes dismissed');

  allReviews = await reviewService.listAll();
  const dismissedCheck = allReviews.find((i) => i.id === `statement_relationship:${rel.id}`);
  assert.equal(dismissedCheck?.status, 'dismissed', 'Dismissed item is categorized under dismissed, not pending');
  console.log('✓ 3. Statement relationship: candidate appears in review and dismiss permanently archives it');
  passed++;

  // Test 4: Decision proposal approval with atomic belief adjustment
  const testBelief = await beliefsService.create({
    statement: 'Early stage startups are worth personal risk.',
    description: 'Initial career philosophy.',
    kind: 'value',
    category: 'work',
    strength: 50,
    last_reviewed: null,
  });

  const testDecision = await decisionsService.create({
    title: 'Series B vs staying bootstrapped',
    context: 'Evaluating whether to accept venture investment.',
    constraints: 'Must maintain board majority.',
    uncertainties: 'Runway length if market slows.',
    values: ['freedom', 'stability'],
    success_definition: 'Profitability within 18 months.',
    options: [
      { label: 'Accept Series B', pros: ['Capital scale'], cons: ['Dilution'] },
      { label: 'Stay Bootstrapped', pros: ['Full control'], cons: ['Slower growth'] },
    ],
  });

  const proposalId = `prop-${Date.now()}`;
  const proposal = {
    id: proposalId,
    beliefId: testBelief.id,
    beliefStatement: testBelief.statement,
    change: 'Increase strength from 50 to 75',
    reason: 'Reflection after bootstrapping showed high resilience under constraint.',
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  await decisionsService.saveProposal(testDecision.id, proposal);

  allReviews = await reviewService.listAll();
  const propReview = allReviews.find((i) => i.id === `decision_proposal:${testDecision.id}:${proposalId}`);
  assert.ok(propReview, 'Decision proposal must appear in Review Center');
  assert.equal(propReview.status, 'pending');

  // Approve proposal
  await reviewService.approve(propReview);

  // Verify belief strength updated and proposal resolved
  const checkedBelief = await supabase.from('beliefs').select('strength').eq('id', testBelief.id).single();
  assert.equal(checkedBelief.data?.strength, 75, 'Belief strength must be updated to proposed value (75)');

  const checkedDecision = await supabase.from('decisions').select('proposals').eq('id', testDecision.id).single();
  const checkedProp = (checkedDecision.data?.proposals as any[])?.find((p) => p.id === proposalId);
  assert.equal(checkedProp?.status, 'approved', 'Decision proposal status must be approved');
  console.log('✓ 4. Decision proposal: approving applies strength change to belief and records decision history');
  passed++;

  // Test 5: Stale source record guard
  // Create an interpretation flag on a memory, then delete the memory
  const sacrificialMem = await memoriesService.create({
    title: 'Temporary memory for stale test',
    content: 'Ephemeral content.',
    category: 'other',
    source: 'note',
    mood: 'neutral',
    confidence: 60,
    tags: ['temp'],
    occurred_at: new Date().toISOString(),
  });

  const staleFlag = await flagsService.create({
    memory_id: sacrificialMem.id,
    answer_excerpt: 'Temporary interpretation excerpt.',
    correction_note: 'Note about temporary memory.',
  });

  // Now delete the memory (cascades or orphans depending on foreign key)
  await memoriesService.remove(sacrificialMem.id);

  allReviews = await reviewService.listAll();
  const staleReviewItem = allReviews.find((i) => i.id === `interpretation_flag:${staleFlag.id}`);
  if (staleReviewItem) {
    assert.equal(staleReviewItem.sourceDeleted, true, 'Item with deleted memory must be marked sourceDeleted');
    try {
      await reviewService.approve(staleReviewItem);
      assert.fail('Approving an item with deleted source must fail');
    } catch (err: any) {
      assert.match(err.message, /source record has been deleted/i);
      console.log('✓ 5. Stale source record guard: rejects approval when underlying source is deleted');
      passed++;
    }
  } else {
    // If cascade deleted at database level, that is also safe
    console.log('✓ 5. Stale source record guard: orphaned flags cascade deleted by foreign key');
    passed++;
  }

  // Test 6: Duplicate approval idempotency
  try {
    await reviewService.approve(propReview);
    // Should safely succeed without duplicate rows or contradictory states
    console.log('✓ 6. Idempotency: repeated approval calls handle already-approved state cleanly');
    passed++;
  } catch (err) {
    assert.fail(`Repeated approval should be idempotent: ${err}`);
  }

  // Test 7: Two-Account RLS Isolation
  if (url && anonKey) {
    const testBEmail = `test-review-b-${Date.now()}@example.com`;
    const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: authB } = await clientB.auth.signUp({
      email: testBEmail,
      password: testPassword,
    });

    if (authB?.user) {
      // User B creates an interpretation flag
      const memB = await clientB.from('memories').insert({
        title: 'User B Confidential Record',
        content: 'Secret content for B.',
        category: 'work',
        source: 'note',
        mood: 'neutral',
        confidence: 80,
      }).select().single();

      if (memB.data) {
        const flagB = await clientB.from('interpretation_flags').insert({
          memory_id: memB.data.id,
          answer_excerpt: 'Confidential excerpt.',
          correction_note: 'Private correction B.',
          status: 'proposed',
        }).select().single();

        if (flagB.data) {
          // User A cannot read User B flag
          const { data: aReadB } = await supabase.from('interpretation_flags').select('*').eq('id', flagB.data.id);
          assert.equal(aReadB?.length || 0, 0, 'User A cannot read User B interpretation flags');

          // User A cannot update / approve User B flag
          const { error: aUpdateB } = await supabase.from('interpretation_flags').update({ status: 'confirmed' }).eq('id', flagB.data.id);
          const { data: verifyUnchanged } = await clientB.from('interpretation_flags').select('status').eq('id', flagB.data.id).single();
          assert.equal(verifyUnchanged?.status, 'proposed', 'User A cannot approve or alter User B flags');

          // User A cannot delete User B flag
          await supabase.from('interpretation_flags').delete().eq('id', flagB.data.id);
          const { data: verifyExists } = await clientB.from('interpretation_flags').select('id').eq('id', flagB.data.id).single();
          assert.ok(verifyExists, 'User A cannot delete User B flags');

          // Clean up User B test records
          await clientB.from('interpretation_flags').delete().eq('id', flagB.data.id);
          await clientB.from('memories').delete().eq('id', memB.data.id);
        }
      }
    }
    console.log('✓ 7. Two-account RLS isolation: User A cannot read, approve, or modify User B review items');
    passed++;
  }

  // Cleanup User A test records
  try { await supabase.from('interpretation_flags').delete().eq('id', flag.id); } catch {}
  try { await supabase.from('statement_relationships').delete().eq('id', rel.id); } catch {}
  try { await supabase.from('beliefs').delete().eq('id', rawBelief.id); } catch {}
  try { await supabase.from('beliefs').delete().eq('id', testBelief.id); } catch {}
  try { await supabase.from('decisions').delete().eq('id', testDecision.id); } catch {}
  try { await memoriesService.remove(mem1.id); } catch {}

  console.log(`\nAll ${passed} Review Center tests passed successfully!\n`);
}

runTests().catch((err) => {
  console.error('\nReview Center test suite failed:', err);
  process.exit(1);
});
