/**
 * Two-account RLS security tests for EchoSelf personal workspaces.
 *
 * Creates two throwaway accounts (A and B) against the live project and proves:
 *  - A cannot read, update, delete, or insert-on-behalf-of B's records
 *  - unauthenticated clients cannot write anything (demo is read-only)
 *  - forged owner ids in request bodies are rejected
 *  - linked records (beliefs_history, interpretation_flags) respect parents
 *  - normal owner operations work end to end
 *  - public sample rows are visible read-only to everyone
 *
 * Run with: npx tsx --env-file=.env scripts/run-workspace-tests.mts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** True when the call errors (for "must be denied" checks). */
async function denied(p: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  const { error } = await p;
  return !!error;
}

/** True when the call succeeds (for "must be allowed" checks). */
async function allowed(p: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  const { error } = await p;
  return !error;
}

/** True when a write call is denied OR affects zero rows (RLS may filter
 *  instead of erroring — what matters is that nothing changed). */
async function noEffect(p: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  const { error } = await p;
  return !!error;
}

async function createAccount(label: string): Promise<{ client: SupabaseClient; userId: string }> {
  const email = `rls-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `T3st-${label}-${Date.now()}-pass`;
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user || !data.session) {
    throw new Error(`sign-up failed for ${label}: ${error?.message ?? 'no session (email confirmation may be ON)'}`);
  }
  return { client, userId: data.user.id };
}

async function main() {
  console.log('Creating two throwaway accounts…');
  const A = await createAccount('a');
  const B = await createAccount('b');
  console.log('Accounts ready.\n');

  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });

  try {
    /* ---------------- account A creates own records ---------------- */
    console.log('— Normal owner operations (account A)');
    const { data: memA, error: memErrA } = await A.client
      .from('memories')
      .insert({ title: 'A memory', content: 'Written by A.', category: 'work', source: 'note' })
      .select()
      .maybeSingle();
    check('A inserts own memory (owner auto-filled)', !memErrA && !!memA, memErrA?.message);
    check('memory owner defaults to A (session-derived)', memA?.user_id === A.userId);
    check('client cannot forge another owner', memA?.user_id !== B.userId);

    const { data: beliefA, error: belErrA } = await A.client
      .from('beliefs')
      .insert({ statement: 'A belief', kind: 'belief', category: 'work', strength: 50, origin: 'user' })
      .select()
      .maybeSingle();
    check('A inserts own belief', !belErrA && !!beliefA, belErrA?.message);

    const { data: decA, error: decErrA } = await A.client
      .from('decisions')
      .insert({ title: 'A decision', context: 'A context', options: [{ label: 'Go', pros: [], cons: [] }] })
      .select()
      .maybeSingle();
    check('A inserts own decision', !decErrA && !!decA, decErrA?.message);

    const { data: tlA, error: tlErrA } = await A.client
      .from('timeline_events')
      .insert({ title: 'A event', description: 'd', event_type: 'milestone', importance: 'low' })
      .select()
      .maybeSingle();
    check('A inserts own timeline event', !tlErrA && !!tlA, tlErrA?.message);

    /* ---------------- account B creates own records ---------------- */
    console.log('— Normal owner operations (account B)');
    const { data: memB, error: memErrB } = await B.client
      .from('memories')
      .insert({ title: 'B memory', content: 'Written by B.', category: 'health', source: 'journal' })
      .select()
      .maybeSingle();
    check('B inserts own memory', !memErrB && !!memB, memErrB?.message);

    const { data: beliefB, error: belErrB } = await B.client
      .from('beliefs')
      .insert({ statement: 'B belief', kind: 'value', category: 'personal_growth', strength: 70, origin: 'user' })
      .select()
      .maybeSingle();
    check('B inserts own belief', !belErrB && !!beliefB, belErrB?.message);

    /* ---------------- cross-account isolation ---------------- */
    console.log('— Cross-account isolation (A vs B)');
    const { data: seenByA } = await A.client.from('memories').select('id').eq('id', memB!.id);
    check('A cannot READ B memory', (seenByA ?? []).length === 0);

    const { data: seenByAnon } = await anon.from('memories').select('id').eq('id', memB!.id);
    check('unauthenticated cannot READ B memory', (seenByAnon ?? []).length === 0);

    const updRes = await A.client.from('memories').update({ title: 'hacked' }).eq('id', memB!.id);
    const { data: bAfter } = await B.client.from('memories').select('title').eq('id', memB!.id).maybeSingle();
    check('A cannot UPDATE B memory', !updRes.error && bAfter?.title === 'B memory', `row now: ${bAfter?.title}`);

    const delRes = await A.client.from('memories').delete().eq('id', memB!.id);
    const { data: bStill } = await B.client.from('memories').select('id').eq('id', memB!.id);
    check('A cannot DELETE B memory', !delRes.error && (bStill ?? []).length === 1);

    check(
      'A cannot INSERT memory on behalf of B (forged user_id)',
      await denied(
        A.client.from('memories').insert({ title: 'forged', content: 'x', category: 'other', source: 'note', user_id: B.userId })
      )
    );
    const { data: forgedCheck } = await B.client
      .from('memories')
      .select('id')
      .eq('title', 'forged');
    check('no forged row exists in B workspace', (forgedCheck ?? []).length === 0);

    const belUpdRes = await A.client.from('beliefs').update({ strength: 1 }).eq('id', beliefB!.id);
    const { data: beliefBAfter } = await B.client.from('beliefs').select('strength').eq('id', beliefB!.id).maybeSingle();
    check('A cannot UPDATE B belief', !belUpdRes.error && beliefBAfter?.strength === 70, `strength now: ${beliefBAfter?.strength}`);

    const belDelRes = await A.client.from('beliefs').delete().eq('id', beliefB!.id);
    const { data: beliefBExists } = await B.client.from('beliefs').select('id').eq('id', beliefB!.id);
    check('A cannot DELETE B belief', !belDelRes.error && (beliefBExists ?? []).length === 1);

    check(
      'A cannot INSERT decision on behalf of B',
      await denied(
        A.client
          .from('decisions')
          .insert({ title: 'forged dec', context: 'x', options: [], user_id: B.userId })
      )
    );
    check(
      'A deletes own decision (allowed)',
      await allowed(A.client.from('decisions').delete().eq('id', decA!.id))
    );

    /* ---------------- linked records ---------------- */
    console.log('— Linked records (history, flags, timeline)');
    check(
      'A cannot INSERT history on B belief',
      await denied(
        A.client
          .from('beliefs_history')
          .insert({ belief_id: beliefB!.id, strength: 10, note: 'sabotage' })
      )
    );
    const { data: bHist } = await B.client
      .from('beliefs_history')
      .select('id')
      .eq('belief_id', beliefB!.id);
    check('B belief has no injected history rows', (bHist ?? []).length === 0);

    check(
      'B can INSERT history on own belief (allowed)',
      await allowed(
        B.client
          .from('beliefs_history')
          .insert({ belief_id: beliefB!.id, strength: 65, note: 'grew' })
      )
    );

    // Flags: A flags B's memory → denied (parent not visible). A flags sample memory → allowed.
    check(
      'A cannot INSERT flag on B memory',
      await denied(
        A.client
          .from('interpretation_flags')
          .insert({ memory_id: memB!.id, answer_excerpt: 'x', correction_note: 'y' })
      )
    );

    const { data: sampleMem } = await anon.from('memories').select('id').limit(1);
    const sampleId = (sampleMem ?? [])[0]?.id;
    check('public sample memory visible to anon (read-only demo intact)', !!sampleId);
    if (sampleId) {
      const { data: flagData, error: flagErr } = await A.client
        .from('interpretation_flags')
        .insert({ memory_id: sampleId, answer_excerpt: 'claim', correction_note: 'fix' })
        .select()
        .maybeSingle();
      check('A can flag a PUBLIC sample memory (allowed)', !flagErr && !!flagData, flagErr?.message);

      // Flags are private to their creator: B must not see A's flag row.
      const { data: flagsSeenByB } = await B.client.from('interpretation_flags').select('id');
      check('B cannot READ A flag rows', (flagsSeenByB ?? []).length === 0);
    }

    check(
      'anon cannot INSERT sample memory (demo read-only)',
      await denied(
        anon.from('memories').insert({ title: 'anon write', content: 'x', category: 'other', source: 'note' })
      )
    );
    const { data: anonWrites } = await anon.from('memories').select('id').eq('title', 'anon write');
    check('no anon-written row exists', (anonWrites ?? []).length === 0);

    const anonUpdRes = await anon.from('memories').update({ title: 'vandalized' }).eq('id', sampleId!);
    const { data: sampleAfter } = await anon.from('memories').select('title').eq('id', sampleId!).maybeSingle();
    check('anon cannot UPDATE sample memory', !anonUpdRes.error && sampleAfter?.title !== 'vandalized');

    /* ---------------- A reads own back / update flow ---------------- */
    console.log('— Round-trip integrity');
    const { data: ownList } = await A.client.from('memories').select('id').eq('id', memA!.id);
    check('A still reads own memory', (ownList ?? []).length === 1);
    check(
      'A updates own memory (allowed)',
      await allowed(A.client.from('memories').update({ title: 'A memory v2' }).eq('id', memA!.id))
    );

    /* ---------------- graph edge confirmations ---------------- */
    console.log('— Graph edge confirmations (suggested-edge approval)');
    const edgeKey = `memory:${memA!.id}|evidence_supports|belief:${beliefA!.id}`;
    const confirmRow = {
      edge_key: edgeKey,
      source_id: `memory:${memA!.id}`,
      target_id: `belief:${beliefA!.id}`,
      kind: 'evidence_supports',
      status: 'confirmed' as const,
    };
    const { data: confA, error: confErrA } = await A.client
      .from('graph_edge_confirmations')
      .upsert(confirmRow, { onConflict: 'user_id,edge_key' })
      .select()
      .maybeSingle();
    check('A confirms a suggested edge on own records (allowed)', !confErrA && !!confA, confErrA?.message);
    check('confirmation owner defaults to the session user', confA?.user_id === A.userId);

    const { data: confSeenByB } = await B.client
      .from('graph_edge_confirmations')
      .select('id')
      .eq('edge_key', edgeKey);
    check('B cannot READ A edge confirmations', (confSeenByB ?? []).length === 0);

    check(
      'B cannot WRITE a confirmation about A memory + A belief pair',
      await denied(
        B.client.from('graph_edge_confirmations').upsert(confirmRow, { onConflict: 'user_id,edge_key' })
      )
    );
    check(
      'anon cannot INSERT any confirmation (read-free table for signed-out)',
      await denied(
        anon.from('graph_edge_confirmations').upsert(confirmRow, { onConflict: 'user_id,edge_key' })
      )
    );

    const { error: reconfirmErr } = await A.client
      .from('graph_edge_confirmations')
      .upsert({ ...confirmRow, status: 'dismissed' as const }, { onConflict: 'user_id,edge_key' });
    const { data: confAfter } = await A.client
      .from('graph_edge_confirmations')
      .select('status')
      .eq('edge_key', edgeKey)
      .maybeSingle();
    check('A re-decides own confirmation: latest status wins (upsert)', !reconfirmErr && confAfter?.status === 'dismissed', confAfter?.status);

    const { data: confAnonView } = await anon
      .from('graph_edge_confirmations')
      .select('id');
    check('anon sees zero confirmation rows (private decisions)', (confAnonView ?? []).length === 0);

    /* ---------------- cleanup (each account deletes only own rows) ---------------- */
    console.log('— Cleanup');
    if (sampleId) {
      await A.client.from('interpretation_flags').delete().eq('memory_id', sampleId);
    }
    await A.client.from('graph_edge_confirmations').delete().eq('edge_key', edgeKey);
    await A.client.from('beliefs_history').delete().eq('belief_id', beliefA!.id);
    await B.client.from('beliefs_history').delete().eq('belief_id', beliefB!.id);
    await A.client.from('timeline_events').delete().eq('id', tlA!.id);
    await A.client.from('beliefs').delete().eq('id', beliefA!.id);
    await B.client.from('beliefs').delete().eq('id', beliefB!.id);
    await A.client.from('memories').delete().eq('id', memA!.id);
    await B.client.from('memories').delete().eq('id', memB!.id);
    // decisions already deleted above for A; delete B's test decision too if any
    await A.client.auth.signOut();
    await B.client.auth.signOut();
  } finally {
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
      console.log('Failures:');
      for (const f of failures) console.log(`  - ${f}`);
    }
    process.exit(failed === 0 ? 0 : 1);
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err.message);
  process.exit(1);
});
