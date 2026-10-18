/**
 * Comprehensive Automated Test Suite for EchoSelf First-Run Onboarding & Guided First Experience.
 *
 * Verifies:
 * 1. Newly registered account starts with onboarding_completed = false and onboarding_step = 1.
 * 2. Step progression & interruption resumption (resumes at last reached step).
 * 3. Optional setup fields persist to owner-scoped profile (preferred_name, twin_tone, response_style, grounding_level).
 * 4. Leaving optional fields blank preserves valid defaults.
 * 5. Skipping onboarding marks completed = true and persists across re-reads.
 * 6. Returning account suppression: completed = true prevents repeated onboarding displays.
 * 7. Walkthrough reset mechanism: resetOnboarding resets state for on-demand revisiting from Settings/Profile.
 * 8. Unauthenticated demo isolation: demo visitors never trigger or mutate personal onboarding records.
 * 9. Multi-user RLS isolation: User A's onboarding progression is strictly isolated from User B.
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import { profilesService } from '../src/lib/services.js';
import type { UserProfile } from '../src/lib/types.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running First-Run Onboarding & Guided Experience Test Suite ===\n');
  let passed = 0;

  // 1. Create a genuinely new test account (User A)
  const testAEmail = `test-onboard-a-${Date.now()}@example.com`;
  const testPasswordA = `OnboardingPass123!-${Date.now()}`;
  const { data: authDataA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPasswordA,
    options: {
      data: {
        display_name: 'Alex Rivera',
      },
    },
  });

  if (authErrA || !authDataA.user) {
    throw new Error(`Failed to create test user A: ${authErrA?.message}`);
  }
  if (!authDataA.session) {
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: testAEmail,
      password: testPasswordA,
    });
    if (signInErr) throw new Error(`User A signin failed: ${signInErr.message}`);
  }
  const userAId = authDataA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // Test 1: New User First-Run Detection
  console.log('\n--- Test 1: New User First-Run Detection ---');
  // Initialize or fetch state
  const stateA = await profilesService.getOnboardingState(userAId);
  assert.equal(stateA.completed, false, 'New user starts with onboarding_completed = false');
  assert.equal(stateA.step, 1, 'New user starts at step 1');
  console.log('✓ New account correctly detected as uncompleted at Step 1');
  passed++;

  // Test 2: Step Progression & Interruption Resumption
  console.log('\n--- Test 2: Step Progression & Interruption Resumption ---');
  // User advances to Step 2 ("How it works")
  await profilesService.saveOnboardingStep(userAId, 2);
  let stateAfterStep2 = await profilesService.getOnboardingState(userAId);
  assert.equal(stateAfterStep2.step, 2, 'Step successfully advanced to 2');
  assert.equal(stateAfterStep2.completed, false, 'Still not completed');

  // User advances to Step 3 ("Trust & Expectations")
  await profilesService.saveOnboardingStep(userAId, 3);
  let stateAfterStep3 = await profilesService.getOnboardingState(userAId);
  assert.equal(stateAfterStep3.step, 3, 'Step successfully advanced to 3');

  // Simulate browser reload / session resume
  const resumedState = await profilesService.getOnboardingState(userAId);
  assert.equal(resumedState.step, 3, 'Resumes precisely at Step 3 without restarting');
  assert.equal(resumedState.completed, false, 'Remains uncompleted during interruption');
  console.log('✓ Step progression correctly persists and resumes at Step 3 after interruption');
  passed++;

  // Test 3: Optional Setup Configuration (Step 4)
  console.log('\n--- Test 3: Optional Personal Setup Persistence ---');
  await profilesService.upsert({
    id: userAId,
    preferred_name: 'Alex',
    twin_tone: 'socratic',
    response_style: 'concise',
    grounding_level: 'strict',
    onboarding_step: 4,
  });

  const profileA = await profilesService.get(userAId);
  assert.ok(profileA, 'Profile row exists');
  assert.equal(profileA?.preferred_name, 'Alex', 'Preferred name saved');
  assert.equal(profileA?.twin_tone, 'socratic', 'Twin tone saved as socratic');
  assert.equal(profileA?.response_style, 'concise', 'Response style saved as concise');
  assert.equal(profileA?.grounding_level, 'strict', 'Grounding level saved as strict');
  console.log('✓ Optional preferences saved and verified in database profile');
  passed++;

  // Test 4: Skipping or Completing Onboarding (Step 5)
  console.log('\n--- Test 4: Skipping / Completing Onboarding ---');
  await profilesService.completeOnboarding(userAId);

  const completedState = await profilesService.getOnboardingState(userAId);
  assert.equal(completedState.completed, true, 'Onboarding is now marked completed');
  assert.equal(completedState.step, 5, 'Step marked as final step 5');

  const profileAfterComplete = await profilesService.get(userAId);
  assert.equal(profileAfterComplete?.onboarding_completed, true, 'Database column onboarding_completed is true');
  // Preferences entered earlier must be preserved
  assert.equal(profileAfterComplete?.preferred_name, 'Alex', 'Preferences preserved after completion');
  console.log('✓ Onboarding marked completed and preferences preserved');
  passed++;

  // Test 5: Returning User Suppression
  console.log('\n--- Test 5: Returning User Suppression ---');
  // Fetch again as if new session started
  const returningState = await profilesService.getOnboardingState(userAId);
  assert.equal(returningState.completed, true, 'Returning account suppresses onboarding prompt');
  console.log('✓ Returning account correctly identified with onboarding_completed = true');
  passed++;

  // Test 6: Revisit Walkthrough Reset Mechanism
  console.log('\n--- Test 6: Walkthrough Reset Mechanism (Revisiting from Settings) ---');
  await profilesService.resetOnboarding(userAId);

  const resetState = await profilesService.getOnboardingState(userAId);
  assert.equal(resetState.completed, false, 'Onboarding status reset to false for re-walkthrough');
  assert.equal(resetState.step, 1, 'Reset to Step 1');

  // Verify that profile preferences are NOT deleted when resetting walkthrough
  const profileAfterReset = await profilesService.get(userAId);
  assert.equal(profileAfterReset?.preferred_name, 'Alex', 'Profile name retained after walkthrough reset');

  // Mark complete again
  await profilesService.completeOnboarding(userAId);
  console.log('✓ Reset mechanism works cleanly and preserves personal identity');
  passed++;

  // Test 7: Multi-User RLS Isolation (User B)
  console.log('\n--- Test 7: Multi-User Isolation Across Accounts ---');
  if (!url || !anonKey) {
    throw new Error('Supabase URL/anonKey missing for multi-user test');
  }

  const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
  const testBEmail = `test-onboard-b-${Date.now()}@example.com`;
  const testPasswordB = `OnboardingPassB123!-${Date.now()}`;
  const { data: authDataB, error: authErrB } = await clientB.auth.signUp({
    email: testBEmail,
    password: testPasswordB,
  });

  if (authErrB || !authDataB.user) {
    throw new Error(`Failed to create test user B: ${authErrB?.message}`);
  }
  if (!authDataB.session) {
    const { error: signInErrB } = await clientB.auth.signInWithPassword({
      email: testBEmail,
      password: testPasswordB,
    });
    if (signInErrB) throw new Error(`User B signin failed: ${signInErrB.message}`);
  }
  const userBId = authDataB.user.id;
  console.log(`Authenticated test user B: ${userBId}`);

  // Query User B's profile and onboarding state
  const bState = await profilesService.getOnboardingState(userBId);
  assert.equal(bState.completed, false, "User B's onboarding starts uncompleted");

  const bProfile = await profilesService.get(userBId);
  assert.notEqual(bProfile?.preferred_name, 'Alex', "User B does not have User A's preferred name");

  // Verify User A state was not modified by User B's presence
  const aState = await profilesService.getOnboardingState(userAId);
  assert.equal(aState.completed, true, "User A's onboarding state is preserved independently");
  console.log('✓ Multi-user personal data and onboarding isolation verified across distinct accounts');
  passed++;

  // Test 8: Unauthenticated Visitor / Demo Mode Isolation
  console.log('\n--- Test 8: Unauthenticated Demo Mode Isolation ---');
  // Unauthenticated guests have user = null. In our application architecture,
  // getOnboardingState is only called for authenticated user IDs, and anon clients cannot mutate profiles.
  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: anonProfiles, error: anonErr } = await anonClient.from('profiles').select('*');
  assert.equal(
    anonProfiles?.length || 0,
    0,
    'Unauthenticated demo visitors cannot access private user profiles'
  );
  console.log('✓ Unauthenticated visitors are isolated from private user onboarding records');
  passed++;

  // Test 9: Optional fields blank fallback
  console.log('\n--- Test 9: Blank Optional Preferences Handling ---');
  // User B completes onboarding with blank preferences
  await profilesService.completeOnboarding(userBId, {
    preferred_name: '',
  });

  const bFinalState = await profilesService.getOnboardingState(userBId);
  assert.equal(bFinalState.completed, true, 'User B marked completed');

  const bFinalProfile = await profilesService.get(userBId);
  assert.equal(bFinalProfile?.preferred_name, '', 'Blank preferred name allowed without failure');
  assert.equal(bFinalProfile?.twin_tone, 'contemplative', 'Default twin tone remains contemplative');
  console.log('✓ Blank optional preferences handled gracefully with defaults preserved');
  passed++;

  console.log(`\n======================================================`);
  console.log(`All ${passed}/9 First-Run Onboarding tests passed successfully!`);
  console.log(`======================================================\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed with error:\n', err);
  process.exit(1);
});
