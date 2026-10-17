/**
 * Evidence Graph tests. Validates edge derivation against the REAL records in
 * the database: every edge must reference existing record IDs and carry a
 * trace. Run with: npx tsx scripts/run-graph-tests.mts
 */
import { createClient } from '@supabase/supabase-js';
import {
  buildEvidenceGraph,
  filterGraph,
  emptyFilters,
  nodeRoute,
} from '../src/lib/evidenceGraph.ts';
import type { Belief, Decision, Memory } from '../src/lib/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Supabase credentials not found in environment.');
  process.exit(1);
}
const supabase = createClient(url, key);

const [{ data: memories }, { data: beliefsRaw }, { data: decisionsRaw }] = await Promise.all([
  supabase.from('memories').select('*'),
  supabase.from('beliefs').select('*'),
  supabase.from('decisions').select('*'),
]);
const { data: history } = await supabase.from('beliefs_history').select('*');

const beliefs: Belief[] = (beliefsRaw ?? []).map((b) => ({
  ...b,
  history: (history ?? []).filter((h) => h.belief_id === b.id),
}));
const decisions: Decision[] = decisionsRaw ?? [];
const mems: Memory[] = memories ?? [];

const graph = buildEvidenceGraph(mems, beliefs, decisions);

const memIds = new Set(mems.map((m) => m.id));
const beliefIds = new Set(beliefs.map((b) => b.id));
const decisionIds = new Set(decisions.map((d) => d.id));
const historyIds = new Set((history ?? []).map((h) => h.id));
const nodeIds = new Set(graph.nodes.map((n) => n.id));

// --- 1. Every edge references existing nodes ---
check('every edge references existing nodes',
  graph.edges.every((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
  graph.edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target)).slice(0, 3).map((e) => e.id).join('; '));

// --- 2. Every edge carries a non-empty trace ---
check('every edge has a non-empty trace',
  graph.edges.every((e) => e.trace.length > 10),
  graph.edges.filter((e) => e.trace.length <= 10).map((e) => e.id).join('; '));

// --- 3. Edge endpoints resolve to real record IDs ---
function endpointResolves(id: string): boolean {
  const [kind, raw] = id.split(':');
  if (kind === 'memory') return memIds.has(raw);
  if (kind === 'belief') return beliefIds.has(raw);
  if (kind === 'decision') return decisionIds.has(raw);
  if (kind === 'history') return historyIds.has(raw);
  if (kind === 'reflection') return decisionIds.has(raw);
  return false;
}
check('every edge endpoint resolves to a real record ID in the database',
  graph.edges.every((e) => endpointResolves(e.source) && endpointResolves(e.target)),
  graph.edges.filter((e) => !endpointResolves(e.source) || !endpointResolves(e.target)).slice(0, 3).map((e) => e.id).join('; '));

// --- 4. Reflection edges only where a reflection is stored ---
const decidedWithReflection = decisions.filter((d) => d.reflection);
const reflectionEdges = graph.edges.filter((e) => e.kind === 'reflection_on_decision');
check('reflection edges exist exactly for decisions that store a reflection',
  reflectionEdges.length === decidedWithReflection.length &&
  reflectionEdges.every((e) => {
    const dId = e.target.split(':')[1];
    const d = decisions.find((x) => x.id === dId);
    return d?.reflection != null;
  }),
  `${reflectionEdges.length} vs ${decidedWithReflection.length}`);

// --- 5. Belief history edges match stored rows ---
const historyEdges = graph.edges.filter((e) => e.kind === 'belief_history');
check('belief history edges exist exactly for stored history rows',
  historyEdges.length === (history ?? []).length,
  `${historyEdges.length} vs ${(history ?? []).length}`);

// --- 6. Decision-value edges only to value-kind beliefs that name the value ---
const dvEdges = graph.edges.filter((e) => e.kind === 'decision_value');
check('decision-value edges connect only to value-kind beliefs',
  dvEdges.every((e) => {
    const b = beliefs.find((x) => x.id === e.target.split(':')[1]);
    return b?.kind === 'value';
  }),
  dvEdges.map((e) => e.id).join('; '));

// --- 7. No fabricated edges: cross-check a specific real case ---
// The decided decision has values family/freedom/craft; value-beliefs in the
// database mention family (Family obligations...) and money/freedom (Money is a
// tool...). Any decision_value edge must be one of these.
const validValueEdges = new Set(
  decisions.flatMap((d) =>
    beliefs
      .filter((b) => b.kind === 'value')
      .filter((b) => {
        const text = `${b.statement} ${b.description ?? ''}`.toLowerCase();
        return d.values.some((v) => text.includes(v.toLowerCase()));
      })
      .map((b) => `decision:${d.id}|decision_value|belief:${b.id}`)
  )
);
check('decision-value edges match exactly the derivable set (no fabrication)',
  dvEdges.every((e) => validValueEdges.has(e.id)),
  dvEdges.filter((e) => !validValueEdges.has(e.id)).map((e) => e.id).join('; '));

// --- 8. Contradiction edges: verify against the known real conflict ---
// "I must earn my place by being constantly available" vs the wedding/boundaries
// record is the database's documented conflict (migration seed notes).
const mustBelief = beliefs.find((b) => b.statement.includes('must earn my place'));
check('the documented must-earn-place belief participates in a contradiction edge',
  mustBelief != null &&
  graph.edges.some((e) => e.kind === 'evidence_contradicts' && e.source === `belief:${mustBelief!.id}`),
  mustBelief?.id ?? 'belief not found');

// --- 9. Contradiction edges never hide a side: contradicts() targets are --
// excluded from support edges for the same belief/memory pair.
const supportKeys = new Set(
  graph.edges.filter((e) => e.kind === 'evidence_supports').map((e) => e.id)
);
check('no memory is both supported-by and contradicts for the same belief',
  graph.edges.filter((e) => e.kind === 'evidence_contradicts').every((e) => {
    const flipped = e.id.replace('evidence_contradicts', 'evidence_supports');
    return !supportKeys.has(flipped);
  }));

// --- 10. Filters keep edges consistent with nodes ---
const f = emptyFilters();
f.types.add('memory');
const g1 = filterGraph(graph, f);
check('type filter: only memory nodes remain, edges only between them',
  g1.nodes.every((n) => n.type === 'memory') &&
  g1.edges.every((e) => g1.nodes.some((n) => n.id === e.source) && g1.nodes.some((n) => n.id === e.target)));

const f2 = emptyFilters();
f2.from = new Date(Date.now() - 30 * 86_400_000).toISOString();
const g2 = filterGraph(graph, f2);
check('date filter: all remaining nodes are within the window',
  g2.nodes.every((n) => new Date(n.date).getTime() >= new Date(f2.from!).getTime()),
  g2.nodes.filter((n) => new Date(n.date).getTime() < new Date(f2.from!).getTime()).length + ' outliers');

// --- 11. Determinism: same inputs → identical graph ---
const again = buildEvidenceGraph(mems, beliefs, decisions);
check('determinism: rebuilding with same records yields identical edges',
  again.edges.map((e) => e.id).join() === graph.edges.map((e) => e.id).join());

// --- 12. Direct vs inferred are distinguishable and labeled ---
check('edge basis is always direct or inferred with a human label',
  graph.edges.every((e) => (e.basis === 'direct' || e.basis === 'inferred') && e.label.length > 3));

// --- 13. Direct edges trace to stored fields only ---
check('direct edges cite a stored-field trace, not a keyword method',
  graph.edges.filter((e) => e.basis === 'direct').every((e) =>
    /stored|row|reflected_at|decisions\.|beliefs_history/i.test(e.trace)),
  graph.edges.filter((e) => e.basis === 'direct' && !/stored|row|reflected_at|decisions\.|beliefs_history/i.test(e.trace)).map((e) => e.id).join('; '));

// --- 14. Node routes resolve to app routes only for memory/decision ---
check('node routes: memories and decisions deep-link, others stay in-graph',
  graph.nodes.every((n) => {
    const r = nodeRoute(n);
    if (n.type === 'memory') return r === `#/memory/${n.id.split(':')[1]}`;
    if (n.type === 'decision') return r === `#/decision/${n.id.split(':')[1]}`;
    return r === null;
  }));

// --- 15. Empty state support: empty inputs → empty graph, no crash ---
const empty = buildEvidenceGraph([], [], []);
check('empty inputs produce an empty graph with no edges',
  empty.nodes.length === 0 && empty.edges.length === 0);

console.log(`\nEvidence graph tests: ${passed} passed, ${failed} failed`);
console.log(`  (validated against ${mems.length} memories, ${beliefs.length} beliefs, ${decisions.length} decisions, ${(history ?? []).length} history rows)`);
for (const fail of failures) console.log(`  FAIL ${fail}`);
process.exit(failed === 0 ? 0 : 1);
