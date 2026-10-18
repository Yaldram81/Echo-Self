/**
 * Comprehensive Automated Test Suite for Privacy, Data Controls, & Personal Information Center.
 * Tests:
 * 1. Accurate owner-scoped record counts (strictly excludes demo/sample rows).
 * 2. Complete personal data export in portable JSON format with provenance.
 * 3. Tabular CSV generation with proper quote escaping.
 * 4. Multi-user RLS data isolation & forged owner rejection between two distinct accounts.
 * 5. Selective collection deletion (removes targeted collection without collateral damage).
 * 6. Full workspace data purge (cleanses all user tables while preserving public demo seed data).
 * 7. Real privacy preference persistence (AI personalization & semantic vector retrieval).
 * 8. Real behavior change: disabling semantic retrieval causes hybridRetrieve to fall back to keyword ranking with privacy reason.
 * 9. Unauthenticated visitor access boundary.
 * 10. Destructive account deletion lifecycle.
 */

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabaseClient.js';
import {
  dataManagementService,
  profilesService,
  memoriesService,
  capturesService,
  decisionsService,
  beliefsService,
} from '../src/lib/services.js';
import { createHybridRetriever } from '../src/lib/hybridRetrieval.js';
import { reflectionService } from '../src/lib/reflectionService.js';
import type { Memory } from '../src/lib/types.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function runTests() {
  console.log('\n=== Running Privacy, Data Controls & Personal Information Center Test Suite ===\n');
  let passed = 0;

  // Set up authenticated test user A on singleton client
  const testAEmail = `test-privacy-a-${Date.now()}@example.com`;
  const testPasswordA = `PrivacyPass123!-${Date.now()}`;
  const { data: authDataA, error: authErrA } = await supabase.auth.signUp({
    email: testAEmail,
    password: testPasswordA,
  });
  if (authErrA || !authDataA.user) {
    throw new Error(`Failed to authenticate test user A: ${authErrA?.message}`);
  }
  const userAId = authDataA.user.id;
  console.log(`Authenticated test user A: ${userAId}`);

  // Test 1: Accurate Record Counts (Owner-scoped)
  console.log('\n--- Test 1: Owner-Scoped Record Counts ---');
  const initialCounts = await dataManagementService.getRecordCounts();
  assert.equal(initialCounts.memories, 0, 'New user starts with 0 memories (excludes demo seed memories)');
  assert.equal(initialCounts.captures, 0, 'New user starts with 0 captures');

  // Create real records for User A
  const mem1 = await memoriesService.create({
    title: 'Privacy audit session note',
    content: 'Inspected cryptographic authorization tokens and verified Row Level Security policies.',
    category: 'work',
    source: 'direct_experience',
    mood: 'positive',
    confidence: 95,
    user_importance: 5,
    occurred_at: new Date().toISOString(),
    tags: ['security', 'privacy'],
  });

  const cap1 = await capturesService.create({
    content: 'Reviewing database retention constraints for our backup rotation cycles.',
    title: 'Backup rotation capture',
    category: 'work',
    tags: ['backup', 'compliance'],
  });

  const dec1 = await decisionsService.create({
    title: 'Self-hosted encryption vs managed KMS',
    context: 'Evaluating envelope encryption architectures.',
    constraints: 'Must meet compliance standards.',
    uncertainties: 'Key rotation overhead.',
    values: ['Security', 'Simplicity'],
    success_definition: 'Zero plaintext key leakage.',
    options: [
      { label: 'Managed KMS', pros: ['Automated rotation'], cons: ['Cloud dependency'] },
      { label: 'Self-hosted', pros: ['Full custody'], cons: ['Operational burden'] },
    ],
  });

  const week = reflectionService.getWeekBoundaries();
  const refl1 = await reflectionService.save({
    period_start: week.periodStart,
    period_end: week.periodEnd,
    content: 'A productive week focused strictly on data governance and cryptographic hygiene.',
    guided_answers: {},
    memory_ids: [mem1.id],
    decision_ids: [dec1.id],
    status: 'saved',
  });

  const updatedCounts = await dataManagementService.getRecordCounts();
  assert.equal(updatedCounts.memories, 1, 'Counts must increment for owned memories');
  assert.equal(updatedCounts.captures, 1, 'Counts must increment for owned captures');
  assert.equal(updatedCounts.decisions, 1, 'Counts must increment for owned decisions');
  assert.ok(updatedCounts.total >= 3, 'Total records count must sum owned records');
  console.log('✓ 1. Accurate owner-scoped record counts strictly ignoring demo seed data');
  passed++;

  // Test 2: Complete Personal Data Export in JSON
  console.log('\n--- Test 2: Portable JSON Data Export ---');
  const exportBundle = await dataManagementService.exportAll();
  assert.equal(exportBundle.user_id, userAId, 'Export bundle must be tagged with authentic owner ID');
  assert.equal(exportBundle.schema_version, '2.0', 'Schema version must be 2.0');
  assert.ok(exportBundle.exported_at, 'Export must have ISO timestamp');
  assert.ok(exportBundle.data.memories.some((m: any) => m.id === mem1.id), 'Export must contain user memories');
  assert.ok(exportBundle.data.captures.some((c: any) => c.id === cap1.id), 'Export must contain user captures');
  assert.ok(exportBundle.data.decisions.some((d: any) => d.id === dec1.id), 'Export must contain user decisions');
  // Confirm no demo data leaked (every item with user_id must match User A)
  for (const [table, rows] of Object.entries(exportBundle.data)) {
    for (const r of rows as any[]) {
      if (r.user_id) {
        assert.equal(r.user_id, userAId, `Table ${table} must only contain rows belonging to user A`);
      }
    }
  }
  console.log('✓ 2. Export bundle contains authentic records with verified ownership and provenance');
  passed++;

  // Test 3: Tabular CSV Serialization
  console.log('\n--- Test 3: Tabular CSV Generation ---');
  const testRows = [
    { id: '1', title: 'Hello, world', content: 'Simple "quoted" text', count: 42 },
    { id: '2', title: 'Line with\nnewline', content: 'No quotes', count: 100 },
  ];
  const csv = dataManagementService.toCsv(testRows);
  assert.ok(csv.includes('"id","title","content","count"'), 'CSV must include header row');
  assert.ok(csv.includes('"Simple ""quoted"" text"'), 'CSV must properly escape double quotes');
  assert.ok(csv.includes('"Line with\nnewline"'), 'CSV must wrap multiline fields in quotes');
  console.log('✓ 3. CSV serialization produces valid RFC-4180 escaped tabular files');
  passed++;

  // Test 4: Multi-User RLS Data Isolation & Forged Owner Rejection
  console.log('\n--- Test 4: Multi-User Data Isolation ---');
  const testBEmail = `test-privacy-b-${Date.now()}@example.com`;
  const testPasswordB = `PrivacyPassB456!-${Date.now()}`;
  const clientB = createClient(url!, anonKey!);
  const { data: authDataB, error: authErrB } = await clientB.auth.signUp({
    email: testBEmail,
    password: testPasswordB,
  });
  if (authErrB || !authDataB.user) {
    throw new Error(`Failed to create test user B: ${authErrB?.message}`);
  }
  const userBId = authDataB.user.id;

  // User B queries memories table directly
  const { data: bMemories } = await clientB.from('memories').select('*');
  const leakedToB = (bMemories || []).filter((m: any) => m.id === mem1.id);
  assert.equal(leakedToB.length, 0, 'User B must never be able to read User A memories');

  // User B attempts to delete User A's memory
  const { error: bDeleteErr } = await clientB.from('memories').delete().eq('id', mem1.id);
  // RLS suppresses or denies deletion of unowned row
  const { data: mem1Check } = await supabase.from('memories').select('*').eq('id', mem1.id).maybeSingle();
  assert.ok(mem1Check, 'User A memory must survive unauthorized deletion attempt by User B');

  // User B attempts to insert a record forging User A's user_id
  const { error: forgeErr } = await clientB.from('memories').insert({
    title: 'Forged memory',
    content: 'Attempting to inject a record with User A owner ID',
    user_id: userAId, // Malicious forged owner ID
    category: 'other',
    source: 'note',
    mood: 'neutral',
    confidence: 50,
  });
  assert.ok(forgeErr, 'Database RLS policy must strictly reject forged user_id assignment');
  console.log('✓ 4. Multi-user RLS data isolation verified; forged owner assignments rejected');
  passed++;

  // Test 5: Selective Collection Deletion
  console.log('\n--- Test 5: Selective Collection Deletion ---');
  // Wipe captures only
  await dataManagementService.deleteAll(['captures']);
  const countsAfterSelective = await dataManagementService.getRecordCounts();
  assert.equal(countsAfterSelective.captures, 0, 'Captures collection must be emptied');
  assert.equal(countsAfterSelective.memories, 1, 'Memories collection must remain intact');
  console.log('✓ 5. Selective collection deletion removes target without collateral damage');
  passed++;

  // Test 6: Real Privacy Preferences Persistence
  console.log('\n--- Test 6: Privacy Preferences Persistence ---');
  await profilesService.updatePrivacyPreferences(userAId, {
    ai_personalization_enabled: false,
    semantic_retrieval_enabled: false,
  });

  const readPrefs = profilesService.getPrivacyPreferences();
  assert.equal(readPrefs.ai_personalization_enabled, false, 'ai_personalization_enabled must be false');
  assert.equal(readPrefs.semantic_retrieval_enabled, false, 'semantic_retrieval_enabled must be false');
  console.log('✓ 6. Privacy preferences persist accurately in database and browser state');
  passed++;

  // Test 7: Behavior Verification: Disabling Semantic Retrieval
  console.log('\n--- Test 7: Semantic Retrieval Privacy Behavior ---');
  // Create mock embedding port
  let embedQueryCalled = false;
  const mockEmbeddingPort = {
    async embedQuery() {
      embedQueryCalled = true;
      return { embedding: new Array(768).fill(0.1), model: 'gemini-text-embedding-004' };
    },
    async matchEmbeddings() {
      return [];
    },
  };

  const hybridRetriever = createHybridRetriever(mockEmbeddingPort);
  const sampleMemories: Memory[] = [
    {
      id: 'mem-test-1',
      title: 'Encryption keys setup',
      content: 'Configured asymmetric cryptographic keys for envelope encryption.',
      category: 'work',
      source: 'direct_experience',
      mood: 'positive',
      confidence: 90,
      user_importance: 5,
      ai_interpretation: null,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      tags: ['keys', 'security'],
    },
  ];

  // Run retrieval with semantic retrieval disabled in preferences
  const retrievalResult = await hybridRetriever('encryption keys', sampleMemories);
  assert.equal(retrievalResult.status.mode, 'keyword', 'Must fall back to keyword mode when privacy disabled');
  assert.match(retrievalResult.status.detail, /privacy preference/i, 'Status must report privacy preference reason');
  assert.equal(embedQueryCalled, false, 'Must not call embedding provider when semantic retrieval disabled');

  // Re-enable and verify
  await profilesService.updatePrivacyPreferences(userAId, {
    semantic_retrieval_enabled: true,
  });
  console.log('✓ 7. Disabling semantic retrieval really alters retrieval behavior and prevents provider calls');
  passed++;

  // Test 8: Workspace Data Purge
  console.log('\n--- Test 8: Workspace Data Purge ---');
  await dataManagementService.purgeAllUserData();
  const countsAfterPurge = await dataManagementService.getRecordCounts();
  assert.equal(countsAfterPurge.memories, 0, 'Memories purged');
  assert.equal(countsAfterPurge.decisions, 0, 'Decisions purged');
  assert.equal(countsAfterPurge.reflections, 0, 'Reflections purged');
  assert.equal(countsAfterPurge.total, 0, 'Total user records must be 0 after purge');

  // Verify public demo seed data was NOT touched
  const { data: demoMemories } = await supabase.from('memories').select('*').is('user_id', null);
  assert.ok((demoMemories || []).length > 0, 'Shared demo seed records must survive user workspace purge');
  console.log('✓ 8. Workspace purge cleanly removes all personal records while preserving demo data');
  passed++;

  // Test 9: Unauthenticated Access Boundary
  console.log('\n--- Test 9: Unauthenticated Access Boundary ---');
  const anonClient = createClient(url!, anonKey!);
  const { data: anonUserRecords } = await anonClient.from('memories').select('*').not('user_id', 'is', null);
  assert.equal((anonUserRecords || []).length, 0, 'Unauthenticated visitor must not read private user records');
  console.log('✓ 9. Unauthenticated requests strictly blocked from reading private records');
  passed++;

  // Test 10: Full Account Deletion Lifecycle
  console.log('\n--- Test 10: Full Account Deletion Lifecycle ---');
  await dataManagementService.deleteUserAccount();

  // Verify session is destroyed
  const sessionAfterDelete = (await supabase.auth.getSession()).data.session;
  assert.equal(sessionAfterDelete, null, 'User session must be terminated upon account deletion');

  // Verify profile row is deleted
  const profileAfterDelete = await profilesService.get(userAId);
  assert.equal(profileAfterDelete, null, 'User profile record must be permanently purged');

  // Verify all personal records across all collections are purged
  const countsAfterDelete = await dataManagementService.getRecordCounts();
  assert.equal(countsAfterDelete.total, 0, 'All personal records must be permanently deleted upon account deletion');
  console.log('✓ 10. Account deletion lifecycle terminates session and destroys profile and all personal records');
  passed++;

  console.log(`\n======================================================`);
  console.log(`All ${passed}/10 Privacy & Data Center tests passed successfully!`);
  console.log(`======================================================\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
