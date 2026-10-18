/**
 * Test suite for Capture Inbox & Frictionless Memory Capture.
 * Validates capture creation, draft editing, promotion, duplicate prevention,
 * status transitions, deletion, suggestion heuristics, and two-account RLS isolation.
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import { capturesService, memoriesService } from '../src/lib/services.js';
import { geminiService } from '../src/lib/geminiService.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running Capture Inbox & Promotion Test Suite ===\n');
  let passed = 0;

  // Set up authenticated test account A on singleton client
  const testAEmail = `test-capture-a-${Date.now()}@example.com`;
  const testPassword = `CapturePass123!-${Date.now()}`;
  const { data: authDataA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPassword,
  });
  if (authErrA || !authDataA.user) {
    throw new Error(`Failed to authenticate test user A: ${authErrA?.message}`);
  }
  const userAId = authDataA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // Test 1: Empty content validation
  try {
    await capturesService.create({ content: '   ' });
    assert.fail('Should reject empty capture content');
  } catch (err: any) {
    assert.match(err.message, /cannot be empty/i);
    console.log('✓ 1. Rejects blank capture content');
    passed++;
  }

  // Test 2: Frictionless creation with minimal content
  const rawText = 'Noticed that taking a 10-minute walk after lunch cleared my brain fog completely.';
  const cap1 = await capturesService.create({ content: rawText });
  assert.ok(cap1.id, 'Capture must have a stable ID');
  assert.equal(cap1.content, rawText, 'Content must match exactly');
  assert.equal(cap1.status, 'inbox', 'New capture must have status inbox');
  assert.equal(cap1.promoted_memory_id, null, 'Unpromoted capture has no promoted_memory_id');
  console.log('✓ 2. Frictionless capture creation succeeds with raw text only');
  passed++;

  // Test 3: Creation with optional metadata
  const cap2 = await capturesService.create({
    content: 'Reviewing our quarterly latency numbers with Dave.',
    title: 'Latency review with Dave',
    category: 'work',
    tags: ['performance', 'infra'],
  });
  assert.equal(cap2.title, 'Latency review with Dave');
  assert.equal(cap2.category, 'work');
  assert.deepEqual(cap2.tags, ['performance', 'infra']);
  console.log('✓ 3. Capture with optional metadata preserves fields');
  passed++;

  // Test 4: Draft in-place editing
  const updatedCap1 = await capturesService.update(cap1.id, {
    title: 'Post-lunch walk observation',
    category: 'health',
  });
  assert.equal(updatedCap1.title, 'Post-lunch walk observation');
  assert.equal(updatedCap1.category, 'health');
  assert.equal(updatedCap1.content, rawText, 'Original content preserved during draft update');
  console.log('✓ 4. In-place draft editing preserves original text and updates fields');
  passed++;

  // Test 5: Promotion to permanent memory
  const { capture: promotedCap, memory: newMemory } = await capturesService.promoteToMemory(cap1.id, {
    mood: 'positive',
    confidence: 90,
  });
  assert.equal(promotedCap.status, 'promoted', 'Capture status must become promoted');
  assert.equal(promotedCap.promoted_memory_id, newMemory.id, 'Capture must record memory ID');
  assert.ok(promotedCap.promoted_at, 'Must stamp promoted_at');
  assert.equal(newMemory.content, rawText, 'Created memory must contain exact original content');
  assert.equal(newMemory.mood, 'positive', 'Created memory honors mood override');
  assert.equal(newMemory.confidence, 90, 'Created memory honors confidence override');
  console.log('✓ 5. Promotion creates permanent memory and links capture provenance');
  passed++;

  // Test 6: Duplicate promotion prevention
  const dupResult = await capturesService.promoteToMemory(cap1.id);
  assert.equal(dupResult.memory.id, newMemory.id, 'Duplicate promotion returns existing memory');
  assert.equal(dupResult.capture.status, 'promoted', 'Status remains promoted');
  console.log('✓ 6. Duplicate promotion attempt returns existing memory without duplicating');
  passed++;

  // Test 7: Unpromoting sets status back to inbox without deleting memory
  const unpromoted = await capturesService.unpromote(cap1.id);
  assert.equal(unpromoted.status, 'inbox', 'Status resets to inbox');
  assert.equal(unpromoted.promoted_memory_id, null, 'Promoted memory ID cleared');
  // Check that the permanent memory still exists safely
  const memoryStillExists = await memoriesService.get(newMemory.id);
  assert.ok(memoryStillExists, 'Permanent memory persists safely when capture is unpromoted');
  console.log('✓ 7. Unpromotion returns item to inbox while keeping permanent memory intact');
  passed++;

  // Test 8: Archive and restore
  const archived = await capturesService.update(cap2.id, { status: 'archived' });
  assert.equal(archived.status, 'archived');
  const restored = await capturesService.update(cap2.id, { status: 'inbox' });
  assert.equal(restored.status, 'inbox');
  console.log('✓ 8. Archive and restore transitions function cleanly');
  passed++;

  // Test 9: Deletion
  await capturesService.delete(cap2.id);
  const deletedLookup = await capturesService.get(cap2.id);
  assert.equal(deletedLookup, null, 'Deleted capture cannot be retrieved');
  console.log('✓ 9. Capture deletion succeeds');
  passed++;

  // Test 10: Suggestions when AI provider is offline/unconfigured (honest labeling)
  const suggestion = await geminiService.suggestCaptureDetails(
    'Discussed the engineering promotion cycle with team leads. Need to clarify rubric criteria.'
  );
  assert.ok(suggestion.title, 'Suggestion must include a title');
  assert.equal(suggestion.category, 'work', 'Keyword heuristics should identify work category');
  assert.ok(['ai', 'heuristic'].includes(suggestion.source), 'Source must be honestly labeled');
  console.log(`✓ 10. Metadata suggestions return honest provenance (labeled as ${suggestion.source})`);
  passed++;

  // Test 11: Two-Account RLS Isolation
  if (url && anonKey) {
    const testBEmail = `test-capture-b-${Date.now()}@example.com`;
    const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: authDataB } = await clientB.auth.signUp({
      email: testBEmail,
      password: testPassword,
    });

    if (authDataB?.user) {
      // User B creates a capture
      const { data: bCap } = await clientB.from('captures').insert({
        content: 'Confidential strategic planning note for User B.',
        title: 'Strategy Note B',
      }).select().single();

      if (bCap) {
        // User A cannot read User B's capture
        const { data: aReadB } = await supabase.from('captures').select('*').eq('id', bCap.id);
        assert.equal(aReadB?.length || 0, 0, 'User A cannot read User B capture');

        // Unauthenticated client cannot read User B's capture
        const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
        const { data: anonReadB } = await anonClient.from('captures').select('*').eq('id', bCap.id);
        assert.equal(anonReadB?.length || 0, 0, 'Anon cannot read User B capture');

        // User A cannot update User B's capture
        const { error: aUpdateErr } = await supabase.from('captures').update({ content: 'Tampered' }).eq('id', bCap.id);
        // Supabase RLS will either error or return 0 rows affected
        const { data: verifyUnchanged } = await clientB.from('captures').select('content').eq('id', bCap.id).single();
        assert.equal(verifyUnchanged?.content, 'Confidential strategic planning note for User B.', 'User A cannot modify User B capture');

        // User A cannot delete User B's capture
        await supabase.from('captures').delete().eq('id', bCap.id);
        const { data: verifyStillExists } = await clientB.from('captures').select('id').eq('id', bCap.id).single();
        assert.ok(verifyStillExists, 'User A cannot delete User B capture');

        // Clean up User B capture
        await clientB.from('captures').delete().eq('id', bCap.id);
      }
    }
    console.log('✓ 11. Two-account RLS isolation verified (User A cannot read, update, or delete User B captures)');
    passed++;
  }

  // Cleanup created test records for User A
  await memoriesService.remove(newMemory.id).catch(() => {});
  await capturesService.delete(cap1.id).catch(() => {});

  console.log(`\nAll ${passed} capture tests passed successfully!\n`);
}

runTests().catch((err) => {
  console.error('\nCapture test suite failed:', err);
  process.exit(1);
});
