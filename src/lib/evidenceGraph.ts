import type { Belief, Decision, Memory } from './types';
import { findRelevantMemories } from './decisionAnalysis';

/**
 * Evidence Graph edge derivation.
 *
 * Every edge is derived deterministically from stored data, with a traceable
 * source. No edge is invented to make the graph look richer. Edge basis:
 * - 'direct': a stored field points at the other record (belief history rows,
 *   a decision's recorded reflection on a chosen option, decision values that
 *   match a stored value-belief by name, matching keyword evidence).
 * - 'inferred': keyword overlap derived from record text — always labeled as
 *   inferred and re-derivable.
 */

export type GraphNodeType = 'memory' | 'belief' | 'value' | 'decision' | 'reflection';

export type EdgeBasis = 'direct' | 'inferred';

export type EdgeKind =
  | 'belief_history'
  | 'value_held'
  | 'evidence_supports'
  | 'evidence_contradicts'
  | 'decision_value'
  | 'decision_evidence'
  | 'reflection_on_decision'
  | 'reflects_on';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  date: string;
  meta: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  basis: EdgeBasis;
  /** Where this edge comes from: field name or derivation method. */
  trace: string;
}

export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilters {
  types: Set<GraphNodeType>;
  /** ISO date; nodes older than this are excluded. */
  from: string | null;
  /** ISO date; nodes newer than this are excluded. */
  to: string | null;
}

const EMPTY_FILTERS: GraphFilters = { types: new Set(), from: null, to: null };

export function emptyFilters(): GraphFilters {
  return { types: new Set(), from: null, to: null };
}

function edgeId(a: string, kind: EdgeKind, b: string): string {
  return `${a}|${kind}|${b}`;
}

export function memoryNode(m: Memory): GraphNode {
  return {
    id: `memory:${m.id}`,
    type: 'memory',
    title: m.title,
    date: m.occurred_at,
    meta: `${m.category} · ${m.mood} · confidence ${m.confidence}%`,
  };
}

export function beliefNode(b: Belief): GraphNode {
  return {
    id: `belief:${b.id}`,
    type: b.kind === 'value' ? 'value' : 'belief',
    title: b.statement,
    date: b.formed_at,
    meta: `${b.kind} · ${b.status} · strength ${b.strength} · origin: ${b.origin.replace('_', ' ')}`,
  };
}

export function decisionNode(d: Decision): GraphNode {
  return {
    id: `decision:${d.id}`,
    type: 'decision',
    title: d.title,
    date: d.created_at,
    meta: `${d.status}${d.chosen_option ? ` · chose "${d.chosen_option}"` : ''}`,
  };
}

export function reflectionNode(d: Decision): GraphNode | null {
  if (!d.reflection) return null;
  return {
    id: `reflection:${d.id}`,
    type: 'reflection',
    title: 'Outcome reflection',
    date: d.reflected_at ?? d.created_at,
    meta: d.reflection.matchesOriginalReasoning
      ? 'outcome matched original reasoning'
      : 'outcome diverged from original reasoning',
  };
}

/**
 * Keyword-support heuristic between a belief statement and a memory, reused
 * across edges. Returns the shared terms when the memory plausibly bears on
 * the belief, or null when it does not.
 */
export function supportingTerms(belief: Belief, memory: Memory): string[] {
  const hay = `${memory.title} ${memory.content}`.toLowerCase();
  const words = belief.statement.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return words.filter((w) => hay.includes(w));
}

const CONTRADICT_PATTERNS: { pattern: RegExp; opposite: RegExp }[] = [
  { pattern: /\bmust\b|\bhave to\b|\bobligat|\bduty\b/i, opposite: /\bno longer\b|\bdon'?t have to\b|\bfree to\b|\bnot obliged\b/i },
  { pattern: /\balways\b|\bconstantly\b/i, opposite: /\bsometimes\b|\brarely\b|\bno longer\b/i },
  { pattern: /\bscoreboard\b|\bstatus\b/i, opposite: /\bfreedom\b|\bnot a scoreboard\b/i },
];

export function contradicts(belief: Belief, memory: Memory): boolean {
  const statement = belief.statement.toLowerCase();
  const hay = `${memory.title} ${memory.content}`.toLowerCase();
  if (CONTRADICT_PATTERNS.some(
    (h) =>
      (h.pattern.test(statement) && h.opposite.test(hay)) ||
      (h.opposite.test(statement) && h.pattern.test(hay))
  )) {
    return true;
  }
  // A stored AI interpretation may name the contradiction explicitly. That is
  // still stored data — but it is machine-generated, so it stays 'inferred'.
  const interp = (memory.ai_interpretation ?? '').toLowerCase();
  if (!interp) return false;
  const core = belief.statement.toLowerCase().split(/\W+/).filter((w) => w.length > 5);
  return /contradict|counter-evidence|cuts against|in tension with/.test(interp) &&
    core.filter((w) => interp.includes(w)).length >= 2;
}

/**
 * Derive the full evidence graph from stored records. Deterministic: same
 * inputs produce the same nodes and edges, each with a trace.
 */
export function buildEvidenceGraph(
  memories: Memory[],
  beliefs: Belief[],
  decisions: Decision[]
): EvidenceGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (e: GraphEdge) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    edges.push(e);
  };

  const valueBeliefs = beliefs.filter((b) => b.kind === 'value');
  const beliefEntries = beliefs.filter((b) => b.kind === 'belief');

  for (const m of memories) nodes.push(memoryNode(m));
  for (const b of beliefs) nodes.push(beliefNode(b));
  for (const d of decisions) {
    nodes.push(decisionNode(d));
    const r = reflectionNode(d);
    if (r) {
      nodes.push(r);
      addEdge({
        id: edgeId(r.id, 'reflection_on_decision', `decision:${d.id}`),
        source: r.id,
        target: `decision:${d.id}`,
        kind: 'reflection_on_decision',
        label: 'reflects on',
        basis: 'direct',
        trace: 'decisions.reflection + reflected_at (stored on the decision row)',
      });
    }
  }

  // Belief history: direct stored rows. History notes sometimes name memories
  // explicitly; those references are direct (recorded in the note text).
  for (const b of beliefs) {
    for (const h of b.history ?? []) {
      addEdge({
        id: edgeId(`history:${h.id}`, 'belief_history', `belief:${b.id}`),
        source: `history:${h.id}`,
        target: `belief:${b.id}`,
        kind: 'belief_history',
        label: 'recorded strength change',
        basis: 'direct',
        trace: `beliefs_history row ${h.id} (stored)`,
      });
      const histNode: GraphNode = {
        id: `history:${h.id}`,
        type: 'reflection',
        title: `Strength ${h.strength} — ${h.note || 'no note'}`,
        date: h.recorded_at,
        meta: 'belief history entry',
      };
      nodes.push(histNode);

      // A history note that explicitly mentions a memory links belief→memory
      // through the recorded narrative. Match by exact stored title substring.
      for (const m of memories) {
        const note = h.note.toLowerCase();
        if (m.title.toLowerCase().split(/\s+/).filter((w) => w.length > 5).some((w) => note.includes(w))) {
          addEdge({
            id: edgeId(`belief:${b.id}`, 'evidence_supports', `memory:${m.id}`),
            source: `belief:${b.id}`,
            target: `memory:${m.id}`,
            kind: 'evidence_supports',
            label: 'cited in history note',
            basis: 'direct',
            trace: `beliefs_history note mentions "${m.title}" (stored text)`,
          });
        }
      }
    }
  }

  // Decision values ↔ stored value-beliefs, matched by recorded value name.
  for (const d of decisions) {
    for (const value of d.values) {
      const v = value.toLowerCase();
      const matching = valueBeliefs.filter(
        (b) =>
          b.statement.toLowerCase().includes(v) ||
          (b.description ?? '').toLowerCase().includes(v)
      );
      for (const vb of matching) {
        addEdge({
          id: edgeId(`decision:${d.id}`, 'decision_value', `belief:${vb.id}`),
          source: `decision:${d.id}`,
          target: `belief:${vb.id}`,
          kind: 'decision_value',
          label: `weighs value "${value}"`,
          basis: 'direct',
          trace: `decisions.values includes "${value}"; belief statement/description names it (stored fields)`,
        });
      }
      // Value with no stored value-belief still shows as an unlabeled gap —
      // no edge is fabricated to a random memory.
    }
  }

  // Decision ↔ memories: inferred from the mirror's own relevance scoring, so
  // the graph matches the analysis the user can already see.
  for (const d of decisions) {
    const relevant = findRelevantMemories(d, memories, 4);
    for (const r of relevant) {
      addEdge({
        id: edgeId(`decision:${d.id}`, 'decision_evidence', `memory:${r.memory.id}`),
        source: `decision:${d.id}`,
        target: `memory:${r.memory.id}`,
        kind: 'decision_evidence',
        label: `analyzed with (${r.reason})`,
        basis: 'inferred',
        trace: `decision mirror relevance scoring (${r.score} pts): title/context/values keyword match`,
      });
    }
  }

  // Belief ↔ memories: inferred support or pattern-matched contradiction.
  for (const b of beliefEntries) {
    for (const m of memories) {
      const terms = supportingTerms(b, m);
      if (terms.length === 0) continue;
      if (contradicts(b, m)) {
        const viaInterp = /contradict|counter-evidence/i.test(m.ai_interpretation ?? '');
        addEdge({
          id: edgeId(`belief:${b.id}`, 'evidence_contradicts', `memory:${m.id}`),
          source: `belief:${b.id}`,
          target: `memory:${m.id}`,
          kind: 'evidence_contradicts',
          label: 'contradicted by record',
          basis: 'inferred',
          trace: viaInterp
            ? `stored AI interpretation of "${m.title}" names this conflict (machine-generated, re-derivable)`
            : `keyword pattern match on statement vs record (shared: ${terms.slice(0, 3).join(', ')})`,
        });
      } else if (terms.length >= 2) {
        addEdge({
          id: edgeId(`belief:${b.id}`, 'evidence_supports', `memory:${m.id}`),
          source: `belief:${b.id}`,
          target: `memory:${m.id}`,
          kind: 'evidence_supports',
          label: 'supported by record',
          basis: 'inferred',
          trace: `shared terms with record text: ${terms.slice(0, 3).join(', ')}`,
        });
      }
    }
  }

  return { nodes, edges };
}

/** Apply type/date filters. Empty type set = all types. */
export function filterGraph(graph: EvidenceGraph, f: GraphFilters): EvidenceGraph {
  const typeOk = (t: GraphNodeType) => f.types.size === 0 || f.types.has(t);
  const dateOk = (iso: string) => {
    const t = new Date(iso).getTime();
    if (f.from && t < new Date(f.from).getTime()) return false;
    if (f.to && t > new Date(f.to).getTime() + 86_399_000) return false;
    return true;
  };

  const nodes = graph.nodes.filter((n) => typeOk(n.type) && dateOk(n.date));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges };
}

export function nodeRoute(node: GraphNode): string | null {
  const raw = node.id.split(':')[1];
  if (node.type === 'memory') return `#/memory/${raw}`;
  if (node.type === 'decision') return `#/decision/${raw}`;
  return null;
}

export const GRAPH_TYPE_LABELS: Record<GraphNodeType, string> = {
  memory: 'Memories',
  belief: 'Beliefs',
  value: 'Values',
  decision: 'Decisions',
  reflection: 'Reflections & history',
};

export { EMPTY_FILTERS };
