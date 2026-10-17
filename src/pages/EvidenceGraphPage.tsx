import { useMemo, useState } from 'react';
import {
  BookOpen,
  Scale,
  Compass,
  ScrollText,
  GitBranch,
  Network,
  AlertTriangle,
  Link2,
  Sparkles,
  X,
} from 'lucide-react';
import { decisionsService, memoriesService, beliefsService, edgeConfirmationsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
  buildEvidenceGraph,
  filterGraph,
  emptyFilters,
  nodeRoute,
  applyEdgeConfirmations,
  GRAPH_TYPE_LABELS,
  type GraphNode,
  type GraphNodeType,
  type GraphEdge,
} from '@/lib/evidenceGraph';
import { Card, SectionHeading, LoadingState, ErrorState, EmptyState, Badge } from '@/components/ui';
import { useAuth } from '@/lib/useAuth';

const TYPE_ORDER: GraphNodeType[] = ['memory', 'belief', 'value', 'decision', 'reflection'];

const TYPE_STYLE: Record<
  GraphNodeType,
  { fill: string; stroke: string; text: string; icon: React.ReactNode; column: string }
> = {
  memory: {
    fill: 'fill-terracotta/20', stroke: 'stroke-terracotta', text: 'text-terracotta-deep',
    icon: <BookOpen className="w-3.5 h-3.5" aria-hidden />, column: 'Evidence',
  },
  belief: {
    fill: 'fill-sage-light', stroke: 'stroke-sage-dark', text: 'text-sage-dark',
    icon: <Compass className="w-3.5 h-3.5" aria-hidden />, column: 'Beliefs',
  },
  value: {
    fill: 'fill-amberclay-light', stroke: 'stroke-amberclay-DEFAULT', text: 'text-amberclay-DEFAULT',
    icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, column: 'Values',
  },
  decision: {
    fill: 'fill-linen-dark', stroke: 'stroke-charcoal', text: 'text-charcoal',
    icon: <Scale className="w-3.5 h-3.5" aria-hidden />, column: 'Decisions',
  },
  reflection: {
    fill: 'fill-paper-deep', stroke: 'stroke-slateink-light', text: 'text-slateink-dark',
    icon: <ScrollText className="w-3.5 h-3.5" aria-hidden />, column: 'Reflections',
  },
};

const EDGE_STYLE: Record<GraphEdge['kind'], { color: string; dash?: string }> = {
  belief_history: { color: 'stroke-slateink-light' },
  value_held: { color: 'stroke-amberclay-DEFAULT' },
  evidence_supports: { color: 'stroke-sage-dark' },
  evidence_contradicts: { color: 'stroke-clayred-DEFAULT', dash: '6 4' },
  decision_value: { color: 'stroke-charcoal' },
  decision_evidence: { color: 'stroke-terracotta' },
  reflection_on_decision: { color: 'stroke-slateink' },
  reflects_on: { color: 'stroke-slateink' },
};

export function EvidenceGraphPage() {
  const memories = useAsyncData(() => memoriesService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);
  const decisions = useAsyncData(() => decisionsService.list(), []);
  const confirmations = useAsyncData(() => edgeConfirmationsService.list(), []);
  const { user } = useAuth();

  const loading = memories.loading || beliefs.loading || decisions.loading || confirmations.loading;
  const error = memories.error || beliefs.error || decisions.error || confirmations.error;

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [types, setTypes] = useState<GraphNodeType[]>([]);
  const [period, setPeriod] = useState<'all' | '30' | '90' | '365'>('all');
  const [showInferred, setShowInferred] = useState(true);
  const [decisionFilter, setDecisionFilter] = useState<string>('all');

  const graph = useMemo(() => {
    if (loading || error) return { nodes: [], edges: [] };
    const derived = buildEvidenceGraph(memories.data ?? [], beliefs.data ?? [], decisions.data ?? []);
    return applyEdgeConfirmations(derived, confirmations.data ?? []);
  }, [loading, error, memories.data, beliefs.data, decisions.data, confirmations.data]);

  const filtered = useMemo(() => {
    const f = emptyFilters();
    for (const t of types) f.types.add(t);
    if (period !== 'all') {
      const days = Number(period);
      f.from = new Date(Date.now() - days * 86_400_000).toISOString();
    }
    let g = filterGraph(graph, f);
    if (!showInferred) g = { ...g, edges: g.edges.filter((e) => e.basis === 'direct' || e.basis === 'confirmed') };
    if (decisionFilter !== 'all') {
      const focus = `decision:${decisionFilter}`;
      const keep = new Set<string>([focus]);
      for (const e of g.edges) {
        if (e.source === focus) keep.add(e.target);
        if (e.target === focus) keep.add(e.source);
      }
      g = {
        nodes: g.nodes.filter((n) => keep.has(n.id)),
        edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
      };
    }
    return g;
  }, [graph, types, period, showInferred, decisionFilter]);

  const layout = useMemo(() => computeLayout(filtered), [filtered]);

  const connectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of filtered.edges) {
      s.add(e.source);
      s.add(e.target);
    }
    return s;
  }, [filtered]);

  function toggleType(t: GraphNodeType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const isolatedCount = filtered.nodes.filter((n) => !connectedIds.has(n.id)).length;

  if (loading) return <LoadingState label="Laying out the evidence graph" />;
  if (error) return <ErrorState message={error} onRetry={() => { memories.reload(); beliefs.reload(); decisions.reload(); }} />;

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Connections" title="Evidence Graph" as="h1" />

      <p className="max-w-2xl text-sm text-slateink leading-relaxed">
        Every line below traces to a stored record, a re-derivable keyword match, or a connection
        you confirmed yourself; nothing is drawn just to fill the picture. Dashed red lines mark
        contradictions; both sides stay visible. Solid lines are recorded directly in your data or
        confirmed by you; lighter lines are inferred and labeled with how.
      </p>

      {edgeError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">{edgeError}</p>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by entity type">
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={types.includes(t)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              types.includes(t)
                ? 'bg-charcoal text-paper'
                : 'bg-linen-light/70 text-slateink-dark hover:bg-linen'
            }`}
          >
            {TYPE_STYLE[t].icon}
            {GRAPH_TYPE_LABELS[t]}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-linen-dark" aria-hidden />
        <label htmlFor="graph-period" className="text-xs text-slateink">Period</label>
        <select
          id="graph-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          className="rounded-full border border-linen-dark bg-white/80 px-3 py-1.5 text-xs text-charcoal"
        >
          <option value="all">All time</option>
          <option value="365">Last year</option>
          <option value="90">Last 90 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <button
          onClick={() => setShowInferred((s) => !s)}
          aria-pressed={showInferred}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            showInferred ? 'bg-charcoal text-paper' : 'bg-linen-light/70 text-slateink-dark hover:bg-linen'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" aria-hidden />
          Inferred links
        </button>
        <label htmlFor="graph-decision" className="sr-only">Focus on a decision</label>
        <select
          id="graph-decision"
          value={decisionFilter}
          onChange={(e) => setDecisionFilter(e.target.value)}
          className="rounded-full border border-linen-dark bg-white/80 px-3 py-1.5 text-xs text-charcoal max-w-[220px]"
        >
          <option value="all">All decisions</option>
          {(decisions.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        {(types.length > 0 || period !== 'all' || decisionFilter !== 'all') && (
          <button
            onClick={() => { setTypes([]); setPeriod('all'); setDecisionFilter('all'); }}
            className="text-xs font-medium text-terracotta-deep hover:text-terracotta-dark"
          >
            Reset filters
          </button>
        )}
      </div>

      {filtered.nodes.length === 0 ? (
        <EmptyState
          icon={<Network className="w-7 h-7" aria-hidden />}
          title="No connections in this view"
          description={
            graph.edges.length === 0
              ? 'No supported connections exist between your records yet. Edges appear when a decision cites a value, a belief history note names a memory, or record texts share clear keywords; never invented for looks.'
              : 'Nothing matches the current filters. Widen the time period or re-enable an entity type.'
          }
        />
      ) : (
        <>
          {/* Mobile: linked list instead of the wide SVG */}
          <div className="xl:hidden space-y-3">
            <p className="text-xs text-slateink-light px-1">
              List view (the diagram is below on larger screens). Tap any record for details.
            </p>
            <GraphListView
              nodes={filtered.nodes}
              edges={filtered.edges}
              connectedIds={connectedIds}
              onSelect={setSelected}
            />
          </div>
          <div className="hidden xl:grid grid-cols-[1fr_360px] gap-6">
            <Card className="p-4 md:p-6 overflow-hidden">
              <GraphCanvas
                layout={layout}
                edges={filtered.edges}
                connectedIds={connectedIds}
                selected={selected}
                onSelect={setSelected}
              />
              <Legend />
            </Card>
            <aside className="space-y-4">
              {selected ? (
                <NodeInspector
                  node={selected}
                  edges={filtered.edges}
                  userCanConfirm={!!user}
                  onDecide={handleEdgeDecision}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <Card className="p-5">
                  <h3 className="font-serif text-lg text-charcoal mb-1">Inspect a node</h3>
                  <p className="text-xs text-slateink leading-relaxed">
                    Select any circle, or Tab to it and press Enter, to read the original record,
                    its metadata, and every edge with its exact source.
                  </p>
                  <p className="mt-3 text-xs text-slateink-light">
                    {filtered.nodes.length} nodes · {filtered.edges.length} edges
                    {isolatedCount > 0 && ` · ${isolatedCount} record${isolatedCount === 1 ? '' : 's'} with no supported connections yet`}
                  </p>
                </Card>
              )}
            </aside>
          </div>
          {selected && (
            <div className="xl:hidden">
              <NodeInspector
                node={selected}
                edges={filtered.edges}
                userCanConfirm={!!user}
                onDecide={handleEdgeDecision}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  async function handleEdgeDecision(edgeKey: string, status: 'confirmed' | 'dismissed') {
    const e = filtered.edges.find((x) => x.id === edgeKey);
    if (!e) return;
    try {
      await edgeConfirmationsService.decide({
        edge_key: e.id,
        source_id: e.source,
        target_id: e.target,
        kind: e.kind,
        status,
      });
      confirmations.reload();
    } catch (err) {
      setEdgeError(err instanceof Error ? err.message : 'Could not record your decision.');
    }
  }
}

interface Positioned {
  node: GraphNode;
  x: number;
  y: number;
}

/** Deterministic layout: columns by type, vertical spread by date, no physics. */
function computeLayout(graph: { nodes: GraphNode[] }): Positioned[] {
  const W = 940;
  const COLS = TYPE_ORDER.length;
  const colW = W / COLS;
  const out: Positioned[] = [];

  for (let ci = 0; ci < COLS; ci++) {
    const type = TYPE_ORDER[ci];
    const group = graph.nodes
      .filter((n) => n.type === type)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const H = Math.max(560, group.length * 92);
    group.forEach((node, i) => {
      const y = group.length === 1 ? H / 2 : ((i + 0.5) / group.length) * H;
      out.push({ node, x: ci * colW + colW / 2, y });
    });
  }
  return out;
}

function GraphCanvas({
  layout,
  edges,
  connectedIds,
  selected,
  onSelect,
}: {
  layout: Positioned[];
  edges: GraphEdge[];
  connectedIds: Set<string>;
  selected: GraphNode | null;
  onSelect: (n: GraphNode) => void;
}) {
  const posById = new Map(layout.map((p) => [p.node.id, p]));
  const H = Math.max(
    560,
    ...TYPE_ORDER.map((t) => layout.filter((p) => p.node.type === t).length * 92 + 80)
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 940 ${H}`}
        className="w-full min-w-[720px]"
        role="application"
        aria-label="Evidence graph: memories, beliefs, values, decisions, and reflections connected by supported relationships"
      >
        {/* column headers */}
        {TYPE_ORDER.map((t, ci) => (
          <text
            key={t}
            x={(ci + 0.5) * (940 / TYPE_ORDER.length)}
            y={18}
            textAnchor="middle"
            className={`fill-current text-[10px] uppercase tracking-[0.18em] ${TYPE_STYLE[t].text}`}
          >
            {TYPE_STYLE[t].column}
          </text>
        ))}

        {edges.map((e) => {
          const a = posById.get(e.source);
          const b = posById.get(e.target);
          if (!a || !b) return null;
          const style = EDGE_STYLE[e.kind];
          const mx = (a.x + b.x) / 2;
          const dim = selected && a.node.id !== selected.id && b.node.id !== selected.id;
          return (
            <g key={e.id} opacity={dim ? 0.15 : 1}>
              <path
                d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                strokeWidth={e.basis === 'direct' ? 1.8 : 1.2}
                strokeDasharray={style.dash}
                className={style.color}
              />
              <title>{`${e.label} (${e.basis}); trace: ${e.trace}`}</title>
            </g>
          );
        })}

        {layout.map((p) => {
          const st = TYPE_STYLE[p.node.type];
          const isSel = selected?.id === p.node.id;
          const isolated = !connectedIds.has(p.node.id);
          const label =
            p.node.title.length > 34 ? `${p.node.title.slice(0, 33)}…` : p.node.title;
          return (
            <g
              key={p.node.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${GRAPH_TYPE_LABELS[p.node.type]}: ${p.node.title}${isolated ? ' (no connections yet)' : ''}`}
              onClick={() => onSelect(p.node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p.node);
                }
              }}
              onFocus={(ev) => {
                const g = ev.currentTarget;
                g.querySelector('circle')?.setAttribute('stroke-width', '3');
              }}
              onBlur={(ev) => {
                const g = ev.currentTarget;
                g.querySelector('circle')?.setAttribute('stroke-width', isSel ? '3' : '1.5');
              }}
            >
              <circle
                r={isolated ? 12 : 16}
                strokeWidth={isSel ? 3 : 1.5}
                strokeDasharray={isolated ? '3 3' : undefined}
                className={`${st.fill} ${st.stroke} transition-all`}
              />
              {isolated && (
                <text y={4} textAnchor="middle" fontSize={10} className="fill-current text-slateink-light">·</text>
              )}
              <text
                y={p.node.type === 'decision' ? -24 : 30}
                textAnchor="middle"
                className={`fill-current ${isSel ? 'text-charcoal font-semibold' : 'text-slateink-dark'}`}
                fontSize={11}
              >
                {label}
              </text>
              <title>{`${p.node.title}: ${p.node.meta}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-linen-dark pt-4 text-[11px] text-slateink">
      <span className="flex items-center gap-1.5">
        <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" strokeWidth="2" className="stroke-sage-dark" /></svg>
        supported / direct
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.4" className="stroke-terracotta" strokeDasharray="4 3" /></svg>
        inferred (keyword-derived)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.8" className="stroke-sage-dark" /></svg>
        confirmed by you
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.8" className="stroke-clayred-DEFAULT" strokeDasharray="6 4" /></svg>
        contradiction (both sides kept)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" className="fill-linen stroke-slateink-light" strokeDasharray="3 3" /></svg>
        no supported connections yet
      </span>
    </div>
  );
}

/**
 * Mobile/readable alternative to the SVG: nodes grouped by type, each linking
 * to its record and listing its connections as text.
 */
function GraphListView({
  nodes,
  edges,
  connectedIds,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  connectedIds: Set<string>;
  onSelect: (n: GraphNode) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="space-y-4">
      {TYPE_ORDER.map((t) => {
        const group = nodes.filter((n) => n.type === t);
        if (group.length === 0) return null;
        return (
          <section key={t} aria-label={GRAPH_TYPE_LABELS[t]} className="card-surface p-4">
            <h3 className={`text-[10px] uppercase tracking-[0.15em] font-medium mb-2 ${TYPE_STYLE[t].text}`}>
              {GRAPH_TYPE_LABELS[t]}
            </h3>
            <ul className="space-y-2">
              {group.map((n) => {
                const mine = edges.filter((e) => e.source === n.id || e.target === n.id);
                const isolated = !connectedIds.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => onSelect(n)}
                      className="w-full text-left rounded-xl border border-linen-dark bg-white/60 px-4 py-3 hover:border-terracotta transition-colors"
                    >
                      <span className="block text-sm font-medium text-charcoal leading-snug">{n.title}</span>
                      <span className="block text-[11px] text-slateink mt-0.5">{n.meta}</span>
                      <span className="block text-[11px] text-slateink-light mt-1">
                        {isolated
                          ? 'No supported connections yet'
                          : `${mine.length} connection${mine.length === 1 ? '' : 's'}: ${mine.map((e) => e.label).slice(0, 3).join(', ')}${mine.length > 3 ? ', …' : ''}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function NodeInspector({
  node,
  edges,
  userCanConfirm,
  onDecide,
  onClose,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  userCanConfirm: boolean;
  onDecide: (edgeKey: string, status: 'confirmed' | 'dismissed') => void;
  onClose: () => void;
}) {
  const mine = edges.filter((e) => e.source === node.id || e.target === node.id);
  const route = nodeRoute(node);
  const contradictions = mine.filter((e) => e.kind === 'evidence_contradicts');

  return (
    <Card className="p-5 space-y-4" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {TYPE_STYLE[node.type].icon}
          <span className={`text-[10px] uppercase tracking-[0.15em] font-medium ${TYPE_STYLE[node.type].text}`}>
            {GRAPH_TYPE_LABELS[node.type].replace(/s$/, '')}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded-full p-1 text-slateink-light hover:text-charcoal hover:bg-linen transition-colors"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div>
        <h3 className="font-serif text-lg leading-snug text-charcoal">{node.title}</h3>
        <p className="mt-1 text-[11px] text-slateink">{node.meta}</p>
        <p className="text-[11px] text-slateink-light">
          {new Date(node.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {route && (
        <a
          href={route}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-terracotta-deep hover:text-terracotta-dark"
        >
          <GitBranch className="w-3.5 h-3.5" aria-hidden />
          Open the original record
        </a>
      )}

      {contradictions.length > 0 && (
        <div className="rounded-xl bg-clayred-light/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-clayred-DEFAULT mb-1">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            Conflicting evidence: both sides shown
          </p>
          <ul className="space-y-1 text-[11px] text-charcoal-soft">
            {contradictions.map((c) => (
              <li key={c.id}>· {c.label} (trace: {c.trace})</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-[10px] uppercase tracking-[0.15em] text-slateink font-medium mb-2">
          Connections ({mine.length})
        </h4>
        {mine.length === 0 ? (
          <p className="text-xs text-slateink-light italic">
            No supported connections for this record yet. The graph does not invent edges;
            connections appear when your data supports them.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {mine.map((e) => (
              <li key={e.id} className="text-[11px] leading-relaxed">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={e.basis === 'confirmed' ? 'sage' : e.basis === 'direct' ? 'sage' : e.kind === 'evidence_contradicts' ? 'clay' : 'neutral'}>
                    {e.basis === 'confirmed' ? 'confirmed by you' : e.basis === 'direct' ? 'recorded' : 'suggested'}
                  </Badge>
                  <span className="font-medium text-charcoal">{e.label}</span>
                </div>
                <p className="text-slateink mt-0.5">
                  {e.source === node.id ? '→' : '←'} {otherTitle(e, node.id)}
                </p>
                <p className="text-slateink-light mt-0.5">trace: {e.trace}</p>
                {e.basis === 'inferred' && userCanConfirm && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-slateink-light">This connection is a suggestion:</span>
                    <button
                      onClick={() => onDecide(e.id, 'confirmed')}
                      className="rounded-full bg-sage-light px-2.5 py-1 text-[10px] font-medium text-sage-dark hover:brightness-95 transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => onDecide(e.id, 'dismissed')}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium text-slateink-dark hover:bg-linen transition"
                    >
                      Not a connection
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!userCanConfirm && mine.some((e) => e.basis === 'inferred') && (
          <p className="mt-2 text-[11px] text-slateink-light italic">
            Sign in to confirm or dismiss suggested connections as established ones.
          </p>
        )}
      </div>
    </Card>
  );
}

function otherTitle(e: GraphEdge, selfId: string): string {
  return e.source === selfId ? e.target.replace(/^(memory|belief|value|decision|reflection):/, '') : e.source.replace(/^(memory|belief|value|decision|reflection):/, '');
}
