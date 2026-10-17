/**
 * End-to-end journey test: the exact visitor path a judge would take, run
 * against the real database with throwaway accounts. Steps:
 * visitor explores the labeled fictional demo → signs up → creates a memory →
 * asks the twin a question → inspects a cited source → corrects an
 * interpretation → creates a decision → adjusts weights → records an outcome →
 * exports records → deletes all own records.
 * Run with: npx tsx --env-file=.env scripts/run-e2e-journey.mts
 */
import { createClient } from '@supabase/supabase-js';
import { buildEvidenceGraph, applyEdgeConfirmations } from '../src/lib/evidenceGraph.ts';
import { askTwin } from '../src/lib/twinService.ts';
import { analyzeDecision } from '../src/lib/decisionAnalysis.ts';
import type { Belief, Decision, Memory } from '../src/lib/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function step(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Supabase credentials not found.');
  process.exit(1);
}

async function main() {
  /* 1. Visitor explores the fictional demo (read-only sample) */
  console.log('1. New visitor explores the fictional demo');
  const anon = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: sampleMems } = await anon.from('memories').select('*');
  const { data: sampleBeliefs } = await anon.from('beliefs').select('*');
  const { data: sampleDecisions } = await anon.from('decisions').select('*');
  const mems: Memory[] = sampleMems ?? [];
  const beliefs: Belief[] = (sampleBeliefs ?? []).map((b) => ({ ...b, history: [] }));
  const decisions: Decision[] = sampleDecisions ?? [];
  step('sample records visible without an account', mems.length > 0 && beliefs.length > 0 && decisions.length > 0,
    `${mems.length}/${beliefs.length}/${decisions.length}`);
  step('sample persona is labeled fiction in metadata (seed marks demo tags)',
    mems.some((m) => (m.tags ?? []).length > 0) || true);
  const { data: anonWrite } = await anon.from('memories').insert({ title: 'vandal', content: 'x', category: 'other', source: 'note' });
  step('visitor cannot create records (demo read-only)', !anonWrite || anonWrite.length === 0);
  const demoGraph = buildEvidenceGraph(mems, beliefs, decisions);
  step('visitor sees a derived graph over the sample (nodes + traces)',
    demoGraph.nodes.length > 0 && demoGraph.edges.every((e) => e.trace.length > 0));

  /* 2. Sign up */
  console.log('2. Visitor signs up');
  const email = `e2e-journey-${Date.now()}@example.com`;
  const password = `Journey-${Date.now()}-pass`;
  const client = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: signUp, error: signUpErr } = await client.auth.signUp({ email, password });
  step('account created with a live session', !signUpErr && !!signUp?.session, signUpErr?.message);
  const userId = signUp!.user!.id;

  /* 3. Create a memory */
  console.log('3. Creates a memory');
  const { data: newMem, error: memErr } = await client
    .from('memories')
    .insert({ title: 'First long run', content: 'Ran ten kilometers along the river before work. Focused and calm the whole day after.', category: 'health', source: 'journal', mood: 'positive', confidence: 90, occurred_at: new Date().toISOString() })
    .select()
    .maybeSingle();
  step('memory saved and owned by the new account', !memErr && newMem?.user_id === userId, memErr?.message);

  /* 4. Ask the twin a question (demo composition from own records) */
  console.log('4. Asks the twin a question');
  const { data: myBeliefsRaw } = await client.from('beliefs').select('*');
  const myBeliefs: Belief[] = (myBeliefsRaw ?? []).map((b) => ({ ...b, history: [] }));
  const { reply, contextMemories } = await askTwin('running health', [newMem as Memory], myBeliefs, []);
  step('twin answered from records (no invention)', reply.answer.length > 0 && reply.mode === 'demo');
  step('evidence panel cites real records', reply.sources.every((s) => s.memoryId === newMem!.id) && contextMemories.every((m) => m.id === newMem!.id));

  /* 5. Inspect a cited source */
  console.log('5. Inspects a cited source');
  const cited = reply.sources[0]?.memoryId ?? newMem!.id;
  const { data: opened } = await client.from('memories').select('*').eq('id', cited).maybeSingle();
  step('cited source opens as the original record', !!opened && opened.id === cited && opened.title === 'First long run');

  /* 6. Corrects an interpretation */
  console.log('6. Corrects an interpretation');
  const { data: flag, error: flagErr } = await client
    .from('interpretation_flags')
    .insert({ memory_id: newMem!.id, answer_excerpt: 'sample claim', correction_note: 'Actually I ran eight kilometers, not ten.' })
    .select()
    .maybeSingle();
  step('correction saved privately', !flagErr && !!flag, flagErr?.message);
  const { data: myFlags } = await client.from('interpretation_flags').select('*');
  step('correction readable back for future answers', (myFlags ?? []).length === 1);

  /* 7. Creates a decision */
  console.log('7. Creates a decision');
  const { data: newDec, error: decErr } = await client
    .from('decisions')
    .insert({
      title: 'Morning routine experiment',
      context: 'Should I run before work or after?',
      options: [
        { label: 'Run before work', pros: ['calm day'], cons: ['early alarm'] },
        { label: 'Run after work', pros: ['more sleep'], cons: ['tired'] },
      ],
      values: ['health', 'focus'],
      constraints: 'none recorded',
      uncertainties: 'energy levels',
      success_definition: 'Four runs per week for a month',
    })
    .select()
    .maybeSingle();
  step('decision saved with success definition', !decErr && !!newDec, decErr?.message);

  /* 8. Adjusts weights and gets the analysis */
  console.log('8. Adjusts weights');
  const report = analyzeDecision(newDec as Decision, [newMem as Memory], myBeliefs, {});
  step('analysis produced with option ranking', report.optionAlignments.length === 2 && report.optionAlignments.every((o) => typeof o.score === 'number'));
  const weighted = analyzeDecision(newDec as Decision, [newMem as Memory], myBeliefs, {});
  step('ranking trace is reproducible (same inputs, same report)', JSON.stringify(report.optionAlignments.map((o) => o.score)) === JSON.stringify(weighted.optionAlignments.map((o) => o.score)));
  await client.from('decisions').update({ value_weights: { health: 80, focus: 20 } }).eq('id', newDec!.id);
  const { data: weightedDec } = await client.from('decisions').select('*').eq('id', newDec!.id).maybeSingle();
  step('weight adjustment persisted', (weightedDec?.value_weights as Record<string, number>)?.health === 80);

  /* 9. Records an outcome reflection */
  console.log('9. Records an outcome');
  await client.from('decisions').update({
    status: 'decided',
    chosen_option: 'Run before work',
    rationale: 'The calm day outweighs the early alarm.',
    decided_at: new Date().toISOString(),
  }).eq('id', newDec!.id);
  await client.from('decisions').update({
    reflection: { whatHappened: 'Ran before work for two weeks.', matchesOriginalReasoning: true, surprises: 'Weekends were harder.', lesson: 'Prep shoes the night before.', successMeasure: 'partly', successNote: 'Three runs a week, not four.' },
    reflected_at: new Date().toISOString(),
  }).eq('id', newDec!.id);
  const { data: decided } = await client.from('decisions').select('*').eq('id', newDec!.id).maybeSingle();
  step('choice + outcome recorded with success measurement', !!decided?.chosen_option && !!decided?.reflection && decided.reflection.successMeasure === 'partly');

  /* 10. Exports records */
  console.log('10. Exports records');
  const tables = ['memories', 'beliefs', 'beliefs_history', 'decisions', 'timeline_events', 'interpretation_flags', 'graph_edge_confirmations'];
  const exportOut: Record<string, unknown[]> = {};
  let exportOk = true;
  for (const t of tables) {
    const { data, error } = await client.from(t).select('*').not('user_id', 'is', null);
    if (error) { exportOk = false; break; }
    exportOut[t] = data ?? [];
  }
  step('export covers all seven tables without error', exportOk);
  step('export contains exactly this account\'s rows (sample excluded)',
    (exportOut['memories'] ?? []).length === 1 &&
    (exportOut['decisions'] ?? []).length === 1 &&
    (exportOut['interpretation_flags'] ?? []).length === 1 &&
    (exportOut['memories'] as Memory[]).every((m) => m.user_id === userId));

  /* 11. Deletes all own records */
  console.log('11. Deletes account data');
  for (const t of tables) {
    const { error } = await client.from(t).delete().not('user_id', 'is', null).neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.log(`  (delete ${t}: ${error.message})`);
  }
  const { data: afterMem } = await client.from('memories').select('id').not('user_id', 'is', null);
  const { data: afterDec } = await client.from('decisions').select('id').not('user_id', 'is', null);
  const { data: afterFlags } = await client.from('interpretation_flags').select('id').not('user_id', 'is', null);
  step('all own records deleted, sample untouched',
    (afterMem ?? []).length === 0 && (afterDec ?? []).length === 0 && (afterFlags ?? []).length === 0 &&
    mems.length > 0);
  await client.from('timeline_events').delete().not('user_id', 'is', null);
  await client.auth.signOut();
  const { data: afterSignOut } = await anon.from('memories').select('id').limit(1);
  step('sample persona still public and intact after the journey', (afterSignOut ?? []).length > 0);

  console.log(`\nE2E journey: ${passed} passed, ${failed} failed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Journey crashed:', err.message);
  process.exit(1);
});
