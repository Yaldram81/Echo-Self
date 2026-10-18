/**
 * Automated test suite for Reflection Workspace & Weekly Review.
 * Validates:
 * 1. Empty week handling & quiet prompts (no hallucinated events).
 * 2. Period calculation across month and year boundaries.
 * 3. Week with multiple memories (filtered by period, grounded prompts with links).
 * 4. Decision deliberations and outcome reflections in period summary.
 * 5. Reflection creation and idempotent save (preventing duplicate records).
 * 6. Reopening and editing an existing reflection for a period.
 * 7. Timeline milestone integration upon reflection save.
 * 8. Proposing a belief update through approval workflow (origin: 'suggestion').
 * 9. Validation rules (rejecting empty reflection content).
 * 10. Multi-user RLS data isolation between accounts.
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import { reflectionService } from '../src/lib/reflectionService.js';
import { memoriesService, decisionsService, beliefsService, timelineService } from '../src/lib/services.js';
import type { ReflectionItem } from '../src/lib/types.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running Reflection Workspace & Weekly Review Test Suite ===\n');
  let passed = 0;

  // Set up authenticated test user A
  const testAEmail = `test-refl-a-${Date.now()}@example.com`;
  const testPassword = `ReflectPass123!-${Date.now()}`;
  const { data: authDataA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPassword,
  });
  if (authErrA || !authDataA.user) {
    throw new Error(`Failed to authenticate test user A: ${authErrA?.message}`);
  }
  const userAId = authDataA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // Test 1: Empty week summary and quiet prompts
  console.log('\n--- Test 1: Empty Week Handling ---');
  const pastWeekDate = new Date('2025-05-14T10:00:00Z');
  const emptyWeek = reflectionService.getWeekBoundaries(pastWeekDate);
  const emptySummary = await reflectionService.summarizePeriod(emptyWeek.periodStart, emptyWeek.periodEnd);
  assert.equal(emptySummary.isEmpty, true, 'Week with no records must report isEmpty: true');
  assert.equal(emptySummary.memories.length, 0, 'No memories should be found');
  assert.equal(emptySummary.decisions.length, 0, 'No decisions should be found');

  const emptyPrompts = reflectionService.generatePrompts(emptySummary);
  assert.ok(emptyPrompts.length > 0, 'Should offer quiet fallback prompts');
  assert.ok(emptyPrompts.every((p) => p.sourceType === 'general'), 'Prompts must not invent fake memory links');
  console.log('✓ 1. Empty week returns quiet state and general prompts without fabricating records');
  passed++;

  // Test 2: Period calculations across month and year boundaries
  console.log('\n--- Test 2: Boundary Calculations (Month and Year) ---');
  // Month boundary: e.g. Oct 28, 2026 is a Wednesday -> Monday Oct 26 to Sunday Nov 1
  const monthCrossDate = new Date('2026-10-28T12:00:00Z');
  const monthBoundaries = reflectionService.getWeekBoundaries(monthCrossDate);
  assert.ok(monthBoundaries.periodLabel.includes('Oct') && monthBoundaries.periodLabel.includes('Nov'),
    'Label must span across months: ' + monthBoundaries.periodLabel);

  // Year boundary: e.g. Dec 30, 2026 is a Wednesday -> Monday Dec 28, 2026 to Sunday Jan 3, 2027
  const yearCrossDate = new Date('2026-12-30T12:00:00Z');
  const yearBoundaries = reflectionService.getWeekBoundaries(yearCrossDate);
  assert.ok(yearBoundaries.periodLabel.includes('2026') && yearBoundaries.periodLabel.includes('2027'),
    'Label must span across years: ' + yearBoundaries.periodLabel);
  console.log('✓ 2. Period calculation cleanly handles month and year boundary crossings');
  passed++;

  // Test 3: Week with multiple memories (grounded prompts with links)
  console.log('\n--- Test 3: Period with Recorded Memories ---');
  const targetWeek = reflectionService.getWeekBoundaries(); // Current week
  const midWeek = new Date(new Date(targetWeek.periodStart).getTime() + 2 * 86400000); // Wednesday of target week

  const mem1 = await memoriesService.create({
    title: 'Architectural refactoring sprint review',
    content: 'Successfully decomposed the monolithic router into modular domain modules.',
    category: 'work',
    source: 'direct_experience',
    mood: 'positive',
    confidence: 90,
    user_importance: 5,
    occurred_at: new Date(midWeek.getTime() - 3600000).toISOString(),
    tags: ['architecture', 'engineering'],
  });

  const mem2 = await memoriesService.create({
    title: 'Dispute over delivery deadline with stakeholder',
    content: 'Tense exchange regarding timeline expectations and scope creep.',
    category: 'work',
    source: 'direct_experience',
    mood: 'difficult',
    confidence: 80,
    user_importance: 4,
    occurred_at: new Date(midWeek.getTime() + 3600000).toISOString(),
    tags: ['work', 'stakeholders'],
  });

  // Memory outside target week (should be excluded)
  const memOutside = await memoriesService.create({
    title: 'Early January note',
    content: 'Unrelated note from earlier in the year.',
    category: 'personal',
    source: 'note',
    mood: 'neutral',
    confidence: 70,
    occurred_at: new Date(new Date(targetWeek.periodStart).getTime() - 14 * 86400000).toISOString(),
    tags: ['note'],
  });

  const targetSummary = await reflectionService.summarizePeriod(targetWeek.periodStart, targetWeek.periodEnd);
  assert.equal(targetSummary.memories.length, 2, 'Only memories within the period must be included');
  assert.ok(targetSummary.memories.some((m) => m.id === mem1.id));
  assert.ok(targetSummary.memories.some((m) => m.id === mem2.id));
  assert.ok(!targetSummary.memories.some((m) => m.id === memOutside.id), 'Outside memory excluded');

  const groundedPrompts = reflectionService.generatePrompts(targetSummary);
  assert.ok(groundedPrompts.some((p) => p.sourceId === mem1.id), 'Must generate prompt referencing high importance memory');
  assert.ok(groundedPrompts.some((p) => p.sourceId === mem2.id), 'Must generate prompt referencing difficult mood memory');
  console.log('✓ 3. Accurately scopes memories to period and generates grounded questions with links');
  passed++;

  // Test 4: Decision deliberations in period summary
  console.log('\n--- Test 4: Decisions & Outcome Reflections ---');
  const dec1 = await decisionsService.create({
    title: 'Adopt strict micro-services vs modular monolith',
    context: 'Architecture review for scale.',
    constraints: 'Small team of 4 engineers.',
    uncertainties: 'DevOps operational overhead.',
    values: ['Simplicity', 'Reliability'],
    success_definition: 'Zero outages and clear boundaries.',
    options: [
      { label: 'Modular Monolith', pros: ['Fast deployment'], cons: ['Shared runtime'] },
      { label: 'Microservices', pros: ['Independent scale'], cons: ['Deployment complexity'] },
    ],
  });
  await decisionsService.recordChoice(dec1.id, 'Modular Monolith', 'Team size makes simplicity paramount.');
  await decisionsService.saveReflection(dec1.id, {
    whatHappened: 'The monolith allowed us to ship on time without distributed tracing headaches.',
    matchesOriginalReasoning: true,
    surprises: 'None',
    lesson: 'Match architecture to team size.',
  });

  const updatedSummary = await reflectionService.summarizePeriod(targetWeek.periodStart, targetWeek.periodEnd);
  assert.ok(updatedSummary.decisions.some((d) => d.id === dec1.id), 'Decided deliberation must appear in period summary');
  console.log('✓ 4. Decisions and outcome reflections integrated into period summary');
  passed++;

  // Test 5: Reflection creation & idempotent save
  console.log('\n--- Test 5: Reflection Creation & Idempotency ---');
  const initialReflection = await reflectionService.save({
    period_start: targetWeek.periodStart,
    period_end: targetWeek.periodEnd,
    content: 'A pivotal week: modular refactoring stabilized the codebase and the stakeholder friction taught me to align early on milestones.',
    guided_answers: {
      [`prompt-mem-${mem1.id}`]: 'The architecture overhaul cleared our tech debt.',
    },
    memory_ids: [mem1.id, mem2.id],
    decision_ids: [dec1.id],
    status: 'saved',
  });
  assert.ok(initialReflection.id, 'Must return a stable reflection ID');
  assert.equal(initialReflection.status, 'saved');

  // Attempt duplicate save for same period (idempotent upsert)
  const duplicateSave = await reflectionService.save({
    period_start: targetWeek.periodStart,
    period_end: targetWeek.periodEnd,
    content: 'Updated reflection: modular refactoring stabilized our team velocity.',
    status: 'saved',
  });
  assert.equal(duplicateSave.id, initialReflection.id, 'Duplicate save for same period must update existing record');
  assert.equal(duplicateSave.content, 'Updated reflection: modular refactoring stabilized our team velocity.');
  console.log('✓ 5. Reflection saved and idempotently updated without creating duplicate records');
  passed++;

  // Test 6: Reopening and retrieving by period
  console.log('\n--- Test 6: Reopening by Period ---');
  const retrieved = await reflectionService.getByPeriod(targetWeek.periodStart, targetWeek.periodEnd);
  assert.ok(retrieved, 'Should retrieve saved reflection for period');
  assert.equal(retrieved.id, initialReflection.id);
  assert.equal(retrieved.content, 'Updated reflection: modular refactoring stabilized our team velocity.');
  console.log('✓ 6. Reopened and loaded existing reflection for the period');
  passed++;

  // Test 7: Timeline milestone event integration
  console.log('\n--- Test 7: Timeline Milestone Integration ---');
  const timelineEvents = await timelineService.list();
  const reflectionMilestone = timelineEvents.find(
    (e) => e.event_type === 'milestone' && e.title.includes('Weekly Review')
  );
  assert.ok(reflectionMilestone, 'Saving reflection must automatically create timeline milestone');
  assert.ok(reflectionMilestone.description.includes('modular refactoring'), 'Milestone must excerpt reflection content');
  console.log('✓ 7. Timeline milestone created upon reflection persistence');
  passed++;

  // Test 8: Proposing a belief update through human approval workflow
  console.log('\n--- Test 8: Proposing a Belief Update ---');
  const proposalResult = await reflectionService.proposeBeliefFromReflection(initialReflection.id, {
    statement: 'Modular simplicity beats premature distributed complexity.',
    rationale: 'Lesson solidified from our architecture deliberation this week.',
    kind: 'belief',
  });
  assert.ok(proposalResult.beliefId, 'Must return created belief suggestion ID');

  const createdBelief = await beliefsService.get(proposalResult.beliefId);
  assert.ok(createdBelief, 'Belief must exist in database');
  assert.equal(createdBelief.origin, 'suggestion', 'Must enter as pending suggestion for human approval');
  assert.equal(createdBelief.statement, 'Modular simplicity beats premature distributed complexity.');
  console.log('✓ 8. Proposes belief update through approval workflow without silently altering active beliefs');
  passed++;

  // Test 9: Validation rule (rejects empty reflection content)
  console.log('\n--- Test 9: Content Validation ---');
  try {
    await reflectionService.save({
      period_start: targetWeek.periodStart,
      period_end: targetWeek.periodEnd,
      content: '   ',
      guided_answers: {},
    });
    assert.fail('Should reject empty content');
  } catch (err: any) {
    assert.match(err.message, /write a reflection/i);
    console.log('✓ 9. Validates and rejects blank reflection submissions');
    passed++;
  }

  // Test 10: Multi-user context isolation
  console.log('\n--- Test 10: Multi-User Context Isolation ---');
  const testBEmail = `test-refl-b-${Date.now()}@example.com`;
  const testBPassword = `ReflectPassB456!-${Date.now()}`;
  const clientB = createClient(url!, anonKey!);
  const { data: authDataB, error: authErrB } = await clientB.auth.signUp({
    email: testBEmail,
    password: testBPassword,
  });
  if (authErrB || !authDataB.user) {
    throw new Error(`Failed to create test user B: ${authErrB?.message}`);
  }

  // Switch active session to User B
  await supabase.auth.signInWithPassword({ email: testBEmail, password: testBPassword });
  const userBReflections = await reflectionService.list();
  const leakedItems = userBReflections.filter((r) => r.id === initialReflection.id);
  assert.equal(leakedItems.length, 0, 'User B must not see User A private reflections');

  const userBSummary = await reflectionService.getByPeriod(targetWeek.periodStart, targetWeek.periodEnd);
  assert.equal(userBSummary, null, 'User B must not see User A period reflection');
  console.log('✓ 10. Multi-user context and RLS boundaries strictly isolate personal reviews');
  passed++;

  // Cleanup created test records
  await memoriesService.remove(mem1.id).catch(() => {});
  await memoriesService.remove(mem2.id).catch(() => {});
  await memoriesService.remove(memOutside.id).catch(() => {});
  await decisionsService.remove(dec1.id).catch(() => {});
  await beliefsService.remove(proposalResult.beliefId).catch(() => {});
  await reflectionService.remove(initialReflection.id).catch(() => {});

  console.log(`\n======================================================`);
  console.log(`All ${passed}/10 Reflection Workspace tests passed successfully!`);
  console.log(`======================================================\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
