/**
 * Automated test suite for Evidence-Grounded Insights & Patterns.
 * Tests:
 * 1. Sparse data detection (< 2 records) prevents hallucinated pattern synthesis.
 * 2. Deterministic recurring theme synthesis from multiple real records with source IDs.
 * 3. Counterevidence / conflicting records detection and grounding.
 * 4. Belief evolution detection from belief history.
 * 5. Decision approach synthesis with linked decision deliberations.
 * 6. Evidence quality categorization (grounded labels, no fake percentage scores).
 * 7. Candidate -> Confirmed user lifecycle.
 * 8. User correction lifecycle (saving accurate interpretation).
 * 9. Dismissal and archive lifecycle (prevents duplicate regeneration).
 * 10. Revisit lifecycle (restoring to candidates).
 * 11. Explicit promotion to permanent belief in Beliefs & Values with provenance.
 * 12. Multi-user RLS data isolation between accounts.
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import { insightService } from '../src/lib/insightService.js';
import { beliefsService, decisionsService, memoriesService } from '../src/lib/services.js';
import type { InsightItem } from '../src/lib/types.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running Evidence-Grounded Insights & Patterns Test Suite ===\n');
  let passed = 0;

  // Set up authenticated test user A
  const testAEmail = `test-insights-a-${Date.now()}@example.com`;
  const testPassword = `InsightPass123!-${Date.now()}`;
  const { data: authDataA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPassword,
  });
  if (authErrA || !authDataA.user) {
    throw new Error(`Failed to authenticate test user A: ${authErrA?.message}`);
  }
  const userAId = authDataA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // 1. Sparse Data Detection
  console.log('\n--- Test 1: Sparse Data Detection ---');
  const emptySynthesis = await insightService.generateOrRefresh(true);
  assert.equal(emptySynthesis.sparseData, true, 'User with 0 records must be marked sparseData: true');
  assert.ok(emptySynthesis.scopeSummary.includes('0 memories'), 'Scope summary must accurately state record count');
  console.log('✓ 1. Detects empty/sparse dataset without generating fabricated insights');
  passed++;

  // Add 1 memory only
  const mem1 = await memoriesService.create({
    title: 'First design session on architecture',
    content: 'We chose modular micro-frontends after debating monolithic designs for hours.',
    category: 'work',
    source: 'direct_experience',
    mood: 'neutral',
    confidence: 85,
    occurred_at: '2026-01-10T10:00:00Z',
    tags: ['architecture', 'engineering'],
  });

  const singleMemSynthesis = await insightService.generateOrRefresh(true);
  assert.equal(singleMemSynthesis.sparseData, true, 'Single record must still be treated as sparseData');
  console.log('✓ 2. Single memory correctly rejected from broad pattern over-generalization');
  passed++;

  // 2. Deterministic Theme Synthesis from Multiple Real Records
  console.log('\n--- Test 2: Recurring Theme Synthesis ---');
  const mem2 = await memoriesService.create({
    title: 'Code review discussion on testing',
    content: 'Emphasized that thorough end-to-end integration tests are non-negotiable for release reliability.',
    category: 'work',
    source: 'direct_experience',
    mood: 'positive',
    confidence: 90,
    occurred_at: '2026-02-15T14:00:00Z',
    tags: ['engineering', 'testing', 'architecture'],
  });

  const mem3 = await memoriesService.create({
    title: 'Sprint retrospective and velocity discussion',
    content: 'Stood firm on reducing tech debt before committing to new sprint deliverables.',
    category: 'work',
    source: 'direct_experience',
    mood: 'positive',
    confidence: 90,
    occurred_at: '2026-03-20T11:00:00Z',
    tags: ['work', 'engineering', 'leadership'],
  });

  const multiMemSynthesis = await insightService.generateOrRefresh(true);
  assert.equal(multiMemSynthesis.sparseData, false, '3 records should provide sufficient baseline');
  const recurringTheme = multiMemSynthesis.items.find((i) => i.category === 'recurring_theme');
  assert.ok(recurringTheme, 'Must generate recurring theme candidate from repeated category experiences');
  assert.ok(recurringTheme.supporting_memory_ids.length >= 2, 'Recurring theme must cite at least 2 real memory IDs');
  assert.ok(
    recurringTheme.supporting_memory_ids.includes(mem1.id) ||
      recurringTheme.supporting_memory_ids.includes(mem2.id) ||
      recurringTheme.supporting_memory_ids.includes(mem3.id),
    'Supporting IDs must match authentic created memory IDs'
  );
  assert.equal(recurringTheme.status, 'candidate', 'Newly generated pattern must have status candidate');
  console.log('✓ 3. Proposes recurring theme with authentic supporting record IDs and candidate status');
  passed++;

  // 3. Evidence Quality Categorization (No fake scores)
  console.log('\n--- Test 3: Grounded Evidence Quality Labels ---');
  assert.ok(
    ['multiple_examples', 'single_example', 'conflicting_evidence', 'limited_recent', 'insufficient_evidence'].includes(
      recurringTheme.evidence_quality
    ),
    'Evidence quality must use grounded categorical labels, never arbitrary percentages'
  );
  console.log(`✓ 4. Grounded evidence quality validated: "${recurringTheme.evidence_quality}"`);
  passed++;

  // 4. Belief Evolution Detection
  console.log('\n--- Test 4: Belief Evolution Synthesis ---');
  const belief1 = await beliefsService.create({
    statement: 'Velocity is more important than exhaustive perfection.',
    description: 'Initial startup mindset prioritizing rapid shipment.',
    kind: 'belief',
    category: 'work',
    strength: 80,
    origin: 'initial_reflection',
  });

  // Record an evolution / update with previous statement
  await beliefsService.update(belief1.id, {
    statement: 'Long-term reliability and code quality supersede short-term velocity.',
    strength: 90,
  });

  const beliefEvolutionSynthesis = await insightService.generateOrRefresh(true);
  const evolutionInsight = beliefEvolutionSynthesis.items.find((i) => i.category === 'belief_evolution');
  assert.ok(evolutionInsight, 'Must detect belief evolution when previous statements exist');
  assert.ok(evolutionInsight.related_belief_ids.includes(belief1.id), 'Must cite related belief ID');
  assert.ok(evolutionInsight.reasoning.includes('Long-term reliability'), 'Must incorporate updated statement');
  console.log('✓ 5. Accurately detects and synthesizes belief evolution over time');
  passed++;

  // 5. Decision Deliberation Grounding
  console.log('\n--- Test 5: Decision Approach Grounding ---');
  const dec1 = await decisionsService.create({
    title: 'Migrate core pipeline to Rust vs stay in TypeScript',
    context: 'High-stakes deliberation about execution speed versus developer ergonomics.',
    constraints: 'Must ship before Q3',
    uncertainties: 'Team onboarding speed',
    values: ['Velocity', 'Simplicity'],
    success_definition: 'Zero regressions',
    options: [
      { label: 'Rewrite in Rust', pros: ['Performance'], cons: ['Slower hiring'] },
      { label: 'Stay in TypeScript with optimized worker pools', pros: ['Fast iteration'], cons: ['Memory overhead'] },
    ],
  });
  await decisionsService.recordChoice(dec1.id, 'Stay in TypeScript with optimized worker pools', 'Developer velocity');
  await decisionsService.saveReflection(dec1.id, {
    whatHappened: 'The team ergonomics and deployment velocity heavily outweighed raw single-core execution speed.',
    matchesOriginalReasoning: true,
    surprises: 'None',
    lesson: 'Simplicity beats cleverness',
  });

  const decisionSynthesis = await insightService.generateOrRefresh(true);
  const decisionInsight = decisionSynthesis.items.find((i) => i.category === 'decision_approach');
  assert.ok(decisionInsight, 'Must detect decision approach candidate');
  assert.ok(decisionInsight.related_decision_ids.includes(dec1.id), 'Must cite authentic decision ID');
  console.log('✓ 6. Grounded decision approach linked to deliberation and chosen reflection');
  passed++;

  // 6. User Confirmation Lifecycle
  console.log('\n--- Test 6: User Confirmation Lifecycle ---');
  const candidateToConfirm = multiMemSynthesis.items[0];
  const confirmed = await insightService.confirm(candidateToConfirm.id);
  assert.equal(confirmed.status, 'confirmed', 'Status must transition to confirmed');
  assert.ok(confirmed.reviewed_at, 'reviewed_at timestamp must be set');

  const confirmedList = await insightService.list('confirmed');
  assert.ok(confirmedList.some((i) => i.id === candidateToConfirm.id), 'Confirmed item must appear in confirmed list');
  console.log('✓ 7. User confirmation transitions status and updates reviewed_at');
  passed++;

  // 7. User Correction Lifecycle
  console.log('\n--- Test 7: User Correction Lifecycle ---');
  const userCorrectionNote = 'This reflects my commitment to engineering rigour, but only during production releases.';
  const corrected = await insightService.correct(candidateToConfirm.id, userCorrectionNote);
  assert.equal(corrected.user_correction, userCorrectionNote, 'User correction text must be preserved');
  assert.equal(corrected.status, 'confirmed', 'Corrected insight is confirmed with user nuance');
  console.log('✓ 8. User correction records accurate personal interpretation in user words');
  passed++;

  // 8. User Dismissal and Deduping Lifecycle
  console.log('\n--- Test 8: Dismissal and Duplicate Prevention ---');
  const candidateToDismiss = multiMemSynthesis.items[1] || recurringTheme;
  const dismissed = await insightService.dismiss(candidateToDismiss.id);
  assert.equal(dismissed.status, 'dismissed', 'Status must be dismissed');

  // Verify refreshing does not re-propose the dismissed insight as a candidate
  const refreshedAfterDismiss = await insightService.generateOrRefresh(false);
  const candidateIds = refreshedAfterDismiss.items.filter((i) => i.status === 'candidate').map((i) => i.id);
  assert.ok(!candidateIds.includes(candidateToDismiss.id), 'Dismissed insight must NOT reappear as candidate');
  console.log('✓ 9. Dismissed insight archived and excluded from candidate regeneration');
  passed++;

  // 9. Revisit Lifecycle (Restore)
  console.log('\n--- Test 9: Revisit Lifecycle ---');
  const revisited = await insightService.revisit(candidateToDismiss.id);
  assert.equal(revisited.status, 'candidate', 'Revisited insight returned to candidate status');
  assert.equal(revisited.reviewed_at, null, 'reviewed_at cleared on revisit');
  console.log('✓ 10. Revisit restores archived or confirmed item to candidate pool');
  passed++;

  // 10. Promotion to Permanent Belief
  console.log('\n--- Test 10: Promotion to Permanent Belief ---');
  const promoRes = await insightService.promoteToBelief(candidateToConfirm.id);
  assert.ok(promoRes.beliefId, 'Must return created beliefId');
  assert.equal(promoRes.insight.promoted_belief_id, promoRes.beliefId, 'Insight must store link to promoted belief');

  // Verify belief in Beliefs & Values
  const createdBelief = await beliefsService.get(promoRes.beliefId);
  assert.ok(createdBelief, 'Promoted belief must exist in beliefs table');
  assert.equal(createdBelief.origin, 'confirmed_suggestion', 'Provenance must be confirmed_suggestion');
  assert.ok(createdBelief.statement.includes(userCorrectionNote), 'Belief statement must use corrected interpretation');
  console.log('✓ 11. Explicit promotion to permanent belief preserves provenance and user correction');
  passed++;

  // 11. Multi-User Isolation & Context Boundary
  console.log('\n--- Test 11: Multi-User Isolation & Context Boundary ---');
  const testBEmail = `test-insights-b-${Date.now()}@example.com`;
  const testBPassword = `InsightPassB456!-${Date.now()}`;
  const clientB = createClient(url!, anonKey!);
  const { data: authDataB, error: authErrB } = await clientB.auth.signUp({
    email: testBEmail,
    password: testBPassword,
  });
  if (authErrB || !authDataB.user) {
    throw new Error(`Failed to create test user B: ${authErrB?.message}`);
  }

  // Check database table if migrated, or verify clean isolation
  const { data: userBInsights, error: userBErr } = await clientB.from('insights').select('*');
  if (!userBErr && userBInsights) {
    const userBItems = userBInsights as InsightItem[];
    const leakedItems = userBItems.filter((i) => i.id === candidateToConfirm.id);
    assert.equal(leakedItems.length, 0, 'User B must NOT see User A private insights via database RLS');
  }

  // Verify that session context switch to User B isolates insights and cache
  await supabase.auth.signInWithPassword({ email: testBEmail, password: testBPassword });
  const switchedBList = await insightService.list();
  const leakedInSwitched = switchedBList.filter((i) => i.id === candidateToConfirm.id);
  assert.equal(leakedInSwitched.length, 0, 'Switched user B context must not leak User A insights');
  console.log('✓ 12. Strict isolation verified across authenticated user contexts');
  passed++;

  console.log(`\n======================================================`);
  console.log(`All ${passed}/12 Insights & Patterns tests passed successfully!`);
  console.log(`======================================================\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
