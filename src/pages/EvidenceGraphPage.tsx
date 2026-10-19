import { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  RotateCcw,
  Check,
  Calendar,
  Layers,
  ArrowRight,
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
  { fill: string; stroke: string; text: string; bg: string; border: string; icon: React.ReactNode; column: string }
> = {
  memory: {
    fill: 'fill-terracotta/20', stroke: 'stroke-terracotta', text: 'text-terracotta-deep',
    bg: 'bg-terracotta/10', border: 'border-terracotta/25',
    icon: <BookOpen className="w-3.5 h-3.5" aria-hidden />, column: 'Evidence',
  },
  belief: {
    fill: 'fill-sage-light', stroke: 'stroke-sage-dark', text: 'text-sage-dark',
    bg: 'bg-sage/15', border: 'border-sage/30',
    icon: <Compass className="w-3.5 h-3.5" aria-hidden />, column: 'Beliefs',
  },
  value: {
    fill: 'fill-amberclay-light', stroke: 'stroke-amberclay-DEFAULT', text: 'text-amberclay-DEFAULT',
    bg: 'bg-amberclay-DEFAULT/15', border: 'border-amberclay-DEFAULT/30',
    icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, column: 'Values',
  },
  decision: {
    fill: 'fill-linen-dark', stroke: 'stroke-charcoal', text: 'text-charcoal',
    bg: 'bg-linen', border: 'border-linen-dark',
    icon: <Scale className="w-3.5 h-3.5" aria-hidden />, column: 'Decisions',
  },
  reflection: {
    fill: 'fill-paper-deep', stroke: 'stroke-slateink-light', text: 'text-slateink-dark',
    bg: 'bg-paper-deep', border: 'border-linen-dark',
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

const PERIOD_LABELS: Record<'all' | '30' | '90' | '365', string> = {
  all: 'All time',
  30: 'Last 30 days',
  90: 'Last 90 days',
  365: 'Last year',
};

export function EvidenceGraphPage() {
  const { user } = useAuth();
  const memories = useAsyncData(() => memoriesService.list(), [user?.id]);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), [user?.id]);
  const decisions = useAsyncData(() => decisionsService.list(), [user?.id]);
  const confirmations = useAsyncData(() => edgeConfirmationsService.list(), [user?.id]);

  const loading = memories.loading || beliefs.loading || decisions.loading || confirmations.loading;
  const error = memories.error || beliefs.error || decisions.error || confirmations.error;

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [types, setTypes] = useState<GraphNodeType[]>([]);
  const [period, setPeriod] = useState<'all' | '30' | '90' | '365'>('all');
  const [showInferred, setShowInferred] = useState(true);
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('diagram');

  // Dropdown states
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [decisionDropdownOpen, setDecisionDropdownOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodDropdownOpen(false);
      }
      if (decisionRef.current && !decisionRef.current.contains(e.target as Node)) {
        setDecisionDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const contradictionEdges = useMemo(
    () => filtered.edges.filter((e) => e.kind === 'evidence_contradicts'),
    [filtered.edges]
  );

  function toggleType(t: GraphNodeType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function resetFilters() {
    setTypes([]);
    setPeriod('all');
    setDecisionFilter('all');
    setShowInferred(true);
  }

  const hasActiveFilters = types.length > 0 || period !== 'all' || decisionFilter !== 'all' || !showInferred;

  const isolatedCount = filtered.nodes.filter((n) => !connectedIds.has(n.id)).length;

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

  if (loading) return <LoadingState label="Laying out the evidence graph…" />;
  if (error) return <ErrorState message={error} onRetry={() => { memories.reload(); beliefs.reload(); decisions.reload(); }} />;

  return (
    <div className="space-y-6 sm:space-y-8 pb-28 sm:pb-12">
      {/* Header Block: Title & Live Graph Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-terracotta-deep font-semibold">Connections</p>
            <span className="text-[10px] font-bold text-slateink-light bg-linen/70 px-2 py-0.5 rounded-full">
              {filtered.nodes.length} nodes · {filtered.edges.length} connections
            </span>
            {contradictionEdges.length > 0 && (
              <span className="text-[10px] font-bold text-clayred-DEFAULT bg-clayred-light/70 border border-clayred-light px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>{contradictionEdges.length} tension{contradictionEdges.length === 1 ? '' : 's'}</span>
              </span>
            )}
          </div>
          <h1 className="font-serif text-xl sm:text-3xl font-bold text-charcoal">Evidence Graph</h1>
        </div>

        {/* View Mode Toggle (Diagram vs List Explorer) */}
        <div className="inline-flex p-0.5 rounded-full bg-linen/70 border border-linen-dark/60 self-start sm:self-auto shrink-0 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('diagram')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'diagram'
                ? 'bg-paper text-charcoal shadow-2xs'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-terracotta" />
            <span>Graph Diagram</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-paper text-charcoal shadow-2xs'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slateink-dark" />
            <span>Entity Explorer</span>
          </button>
        </div>
      </div>

      {/* Editorial Lead Description */}
      <p className="text-xs sm:text-sm text-slateink leading-relaxed max-w-2xl">
        Every line traces to a stored record, a decision dilemma, or a connection you confirmed yourself—nothing is drawn just to fill the diagram. Dashed red lines preserve genuine contradictions so both sides stay visible.
      </p>

      {edgeError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-4 py-2.5 text-xs sm:text-sm text-clayred-DEFAULT">
          {edgeError}
        </p>
      )}

      {/* Toolbar: Entity Types, Period, Decision Focus & Inferred Links Toggle */}
      <div className="space-y-2.5 p-3 sm:p-4 rounded-2xl bg-paper-soft border border-linen-dark/80 shadow-2xs">
        {/* Row 1: Entity Types Pill Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypes([])}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              types.length === 0
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'bg-white border border-linen-dark text-slateink hover:text-charcoal'
            }`}
          >
            All types ({graph.nodes.length})
          </button>
          {TYPE_ORDER.map((t) => {
            const count = graph.nodes.filter((n) => n.type === t).length;
            const active = types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                  active
                    ? 'bg-terracotta text-paper border-terracotta shadow-2xs font-semibold'
                    : 'bg-white border-linen-dark text-slateink hover:text-charcoal hover:border-slateink-light'
                }`}
              >
                {TYPE_STYLE[t].icon}
                <span>{GRAPH_TYPE_LABELS[t]}</span>
                <span className={`text-[10px] opacity-75 tabular-nums ${active ? 'text-paper' : 'text-slateink-light'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Secondary Dropdowns and Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-linen-dark/50">
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Dropdown */}
            <div className="relative" ref={periodRef}>
              <button
                type="button"
                onClick={() => setPeriodDropdownOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                  period !== 'all'
                    ? 'bg-terracotta/10 border-terracotta/40 text-terracotta-deep font-semibold'
                    : 'bg-white border-linen-dark text-slateink hover:text-charcoal'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-slateink-light" />
                <span>{PERIOD_LABELS[period]}</span>
                <ChevronDown className={`w-3 h-3 text-slateink-light transition-transform ${periodDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {periodDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 min-w-[150px] rounded-2xl border border-linen-dark bg-paper p-1.5 shadow-xl animate-[fadeIn_100ms_ease-out]">
                  {(['all', '30', '90', '365'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPeriod(p);
                        setPeriodDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        period === p ? 'bg-terracotta text-paper font-semibold' : 'text-charcoal hover:bg-linen/70'
                      }`}
                    >
                      <span>{PERIOD_LABELS[p]}</span>
                      {period === p && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Decision Focus Dropdown */}
            {(decisions.data ?? []).length > 0 && (
              <div className="relative" ref={decisionRef}>
                <button
                  type="button"
                  onClick={() => setDecisionDropdownOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-all cursor-pointer shadow-2xs max-w-[220px] truncate ${
                    decisionFilter !== 'all'
                      ? 'bg-terracotta/10 border-terracotta/40 text-terracotta-deep font-semibold'
                      : 'bg-white border-linen-dark text-slateink hover:text-charcoal'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5 text-slateink-light shrink-0" />
                  <span className="truncate">
                    {decisionFilter === 'all'
                      ? 'All decisions'
                      : (decisions.data ?? []).find((d) => d.id === decisionFilter)?.title ?? 'Selected decision'}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slateink-light shrink-0 transition-transform ${decisionDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {decisionDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-30 min-w-[220px] max-w-[300px] rounded-2xl border border-linen-dark bg-paper p-1.5 shadow-xl max-h-56 overflow-y-auto animate-[fadeIn_100ms_ease-out]">
                    <button
                      type="button"
                      onClick={() => {
                        setDecisionFilter('all');
                        setDecisionDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        decisionFilter === 'all' ? 'bg-terracotta text-paper font-semibold' : 'text-charcoal hover:bg-linen/70'
                      }`}
                    >
                      <span>All decisions</span>
                      {decisionFilter === 'all' && <Check className="w-3 h-3" />}
                    </button>
                    <div className="my-1 border-t border-linen-dark/60" />
                    {(decisions.data ?? []).map((d) => {
                      const isSel = decisionFilter === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDecisionFilter(d.id);
                            setDecisionDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                            isSel ? 'bg-terracotta text-paper font-semibold' : 'text-charcoal hover:bg-linen/70'
                          }`}
                        >
                          <span className="truncate">{d.title}</span>
                          {isSel && <Check className="w-3 h-3 shrink-0 ml-1.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Inferred Links Toggle */}
            <button
              type="button"
              onClick={() => setShowInferred((s) => !s)}
              className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                showInferred
                  ? 'bg-white border-linen-dark text-slateink-dark hover:border-slateink-light'
                  : 'bg-linen border-linen-dark/60 text-slateink-light'
              }`}
            >
              <Link2 className={`w-3.5 h-3.5 ${showInferred ? 'text-terracotta' : 'text-slateink-light'}`} />
              <span>Inferred links: {showInferred ? 'Visible' : 'Hidden'}</span>
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-terracotta hover:underline cursor-pointer py-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {filtered.nodes.length === 0 ? (
        <EmptyState
          icon={<Network className="w-8 h-8 text-terracotta" aria-hidden />}
          title="No connections in this view"
          description={
            graph.edges.length === 0
              ? 'No connections exist between your records yet. Connections appear when a decision references a value, a belief history notes a memory, or records share clear keywords.'
              : 'No entities match your active filters. Try widening the date period or re-enabling record types.'
          }
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-paper hover:bg-terracotta-dark transition-colors"
              >
                Reset filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* List View Mode (Accessible on all screens) */}
          {viewMode === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slateink px-1">
                <span>Select any entity card to inspect its exact connections and provenance.</span>
                <span className="text-slateink-light">
                  {filtered.nodes.length} nodes · {filtered.edges.length} edges
                </span>
              </div>
              <GraphListView
                nodes={filtered.nodes}
                edges={filtered.edges}
                connectedIds={connectedIds}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          )}

          {/* Diagram View Mode */}
          {viewMode === 'diagram' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Canvas Card (Columns: 8 on desktop) */}
              <div className="lg:col-span-8 space-y-3">
                <Card className="p-3 sm:p-5 overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-slateink mb-2 px-1">
                    <span className="font-medium text-charcoal">Interactive Connection Canvas</span>
                    <span className="text-[11px] text-slateink-light hidden sm:inline">
                      Click any node to inspect · Hover to trace paths
                    </span>
                  </div>

                  <GraphCanvas
                    layout={layout}
                    edges={filtered.edges}
                    connectedIds={connectedIds}
                    selected={selected}
                    onSelect={setSelected}
                  />

                  <Legend />
                </Card>
              </div>

              {/* Desktop Node Inspector Sidebar (Columns: 4) */}
              <aside className="hidden lg:block lg:col-span-4 sticky top-24">
                {selected ? (
                  <NodeInspector
                    node={selected}
                    edges={filtered.edges}
                    userCanConfirm={!!user}
                    onDecide={handleEdgeDecision}
                    onClose={() => setSelected(null)}
                  />
                ) : (
                  <Card className="p-5 space-y-3 border-dashed">
                    <div className="flex items-center gap-2 text-charcoal">
                      <Compass className="w-5 h-5 text-terracotta" />
                      <h3 className="font-serif text-base font-bold">Node Inspector</h3>
                    </div>
                    <p className="text-xs text-slateink leading-relaxed">
                      Select any circle in the graph to inspect the original record, its date, tags, and every connected evidence edge with its exact trace.
                    </p>
                    <div className="pt-2 border-t border-linen-dark/60 text-[11px] text-slateink-light space-y-1">
                      <p>• {filtered.nodes.length} active nodes in layout</p>
                      <p>• {filtered.edges.length} total connections</p>
                      {isolatedCount > 0 && (
                        <p>• {isolatedCount} record{isolatedCount === 1 ? '' : 's'} with no connections yet</p>
                      )}
                    </div>
                  </Card>
                )}
              </aside>
            </div>
          )}

          {/* Mobile / Tablet Floating Slide-Up Inspector Drawer */}
          {selected && (
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 bg-charcoal/40 backdrop-blur-xs flex justify-center animate-[fadeIn_150ms_ease-out]">
              <div className="w-full max-w-lg max-h-[80dvh] overflow-y-auto rounded-3xl bg-paper shadow-2xl border border-linen-dark">
                <NodeInspector
                  node={selected}
                  edges={filtered.edges}
                  userCanConfirm={!!user}
                  onDecide={handleEdgeDecision}
                  onClose={() => setSelected(null)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
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
    const H = Math.max(540, group.length * 86);
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
    540,
    ...TYPE_ORDER.map((t) => layout.filter((p) => p.node.type === t).length * 86 + 70)
  );

  return (
    <div className="overflow-x-auto scroll-elegant rounded-2xl bg-paper-soft/40 border border-linen-dark/50">
      <svg
        viewBox={`0 0 940 ${H}`}
        className="w-full min-w-[700px]"
        role="application"
        aria-label="Evidence graph: memories, beliefs, values, decisions, and reflections connected by supported relationships"
      >
        {/* Column Headers */}
        {TYPE_ORDER.map((t, ci) => (
          <g key={t}>
            <rect
              x={ci * (940 / TYPE_ORDER.length) + 6}
              y={6}
              width={940 / TYPE_ORDER.length - 12}
              height={24}
              rx={12}
              className="fill-linen/50"
            />
            <text
              x={(ci + 0.5) * (940 / TYPE_ORDER.length)}
              y={22}
              textAnchor="middle"
              className={`fill-current text-[10px] uppercase font-bold tracking-[0.16em] ${TYPE_STYLE[t].text}`}
            >
              {TYPE_STYLE[t].column}
            </text>
          </g>
        ))}

        {/* Edges Paths */}
        {edges.map((e) => {
          const a = posById.get(e.source);
          const b = posById.get(e.target);
          if (!a || !b) return null;
          const style = EDGE_STYLE[e.kind];
          const mx = (a.x + b.x) / 2;
          const isRelated = selected && (a.node.id === selected.id || b.node.id === selected.id);
          const dim = selected && !isRelated;

          return (
            <g key={e.id} opacity={dim ? 0.12 : 1} className="transition-opacity duration-200">
              <path
                d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                strokeWidth={isRelated ? 2.5 : e.basis === 'direct' ? 1.8 : 1.2}
                strokeDasharray={style.dash}
                className={style.color}
              />
              <title>{`${e.label} (${e.basis}); trace: ${e.trace}`}</title>
            </g>
          );
        })}

        {/* Nodes */}
        {layout.map((p) => {
          const st = TYPE_STYLE[p.node.type];
          const isSel = selected?.id === p.node.id;
          const isolated = !connectedIds.has(p.node.id);
          const label =
            p.node.title.length > 32 ? `${p.node.title.slice(0, 31)}…` : p.node.title;

          return (
            <g
              key={p.node.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer outline-none group"
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
            >
              {isSel && (
                <circle
                  r={22}
                  className="fill-terracotta/15 stroke-terracotta/30 animate-pulse"
                />
              )}
              <circle
                r={isolated ? 11 : 15}
                strokeWidth={isSel ? 3 : 1.5}
                strokeDasharray={isolated ? '3 3' : undefined}
                className={`${st.fill} ${st.stroke} group-hover:scale-110 transition-transform`}
              />
              {isolated && (
                <text y={3} textAnchor="middle" fontSize={10} className="fill-current text-slateink-light">·</text>
              )}
              <text
                y={p.node.type === 'decision' ? -22 : 28}
                textAnchor="middle"
                className={`fill-current transition-colors text-[11px] ${
                  isSel ? 'text-charcoal font-bold' : 'text-slateink group-hover:text-charcoal font-medium'
                }`}
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
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-linen-dark/60 pt-3 text-[11px] text-slateink">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" className="stroke-sage-dark" /></svg>
        <span>Direct record</span>
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" strokeWidth="1.5" className="stroke-terracotta" strokeDasharray="3 2" /></svg>
        <span>Inferred pattern</span>
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" strokeWidth="1.8" className="stroke-clayred-DEFAULT" strokeDasharray="5 3" /></svg>
        <span>Contradiction</span>
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" className="fill-linen stroke-slateink-light" strokeDasharray="2 2" /></svg>
        <span>Unconnected</span>
      </span>
    </div>
  );
}

/**
 * Clean List/Explorer View: Nodes grouped by category with scannable badges.
 */
function GraphListView({
  nodes,
  edges,
  connectedIds,
  selected,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  connectedIds: Set<string>;
  selected: GraphNode | null;
  onSelect: (n: GraphNode) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="space-y-4">
      {TYPE_ORDER.map((t) => {
        const group = nodes.filter((n) => n.type === t);
        if (group.length === 0) return null;
        return (
          <section key={t} aria-label={GRAPH_TYPE_LABELS[t]} className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              {TYPE_STYLE[t].icon}
              <h3 className={`text-xs uppercase tracking-wider font-bold ${TYPE_STYLE[t].text}`}>
                {GRAPH_TYPE_LABELS[t]} ({group.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {group.map((n) => {
                const mine = edges.filter((e) => e.source === n.id || e.target === n.id);
                const hasContradiction = mine.some((e) => e.kind === 'evidence_contradicts');
                const isolated = !connectedIds.has(n.id);
                const isSel = selected?.id === n.id;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onSelect(n)}
                    className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer shadow-2xs ${
                      isSel
                        ? 'border-terracotta bg-paper shadow-sm ring-1 ring-terracotta/30'
                        : 'border-linen-dark/80 bg-paper-soft hover:border-linen-dark hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold uppercase tracking-wider ${TYPE_STYLE[n.type].bg} ${TYPE_STYLE[n.type].text}`}>
                        {n.type}
                      </span>
                      {hasContradiction && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold text-clayred-DEFAULT bg-clayred-light">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Tension</span>
                        </span>
                      )}
                    </div>

                    <p className="font-serif text-xs sm:text-sm font-semibold text-charcoal leading-snug line-clamp-2">
                      {n.title}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-linen-dark/40 text-[11px] text-slateink-light">
                      <span className="truncate">{n.meta}</span>
                      <span className="shrink-0 font-medium text-slateink">
                        {isolated ? 'No edges' : `${mine.length} link${mine.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
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
    <Card className="p-4 sm:p-5 space-y-3.5 shadow-sm" aria-live="polite">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 border-b border-linen-dark/60 pb-2.5">
        <div className="flex items-center gap-2">
          {TYPE_STYLE[node.type].icon}
          <span className={`text-[10px] uppercase tracking-wider font-bold ${TYPE_STYLE[node.type].text}`}>
            {GRAPH_TYPE_LABELS[node.type].replace(/s$/, '')}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="p-1 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Node Info */}
      <div>
        <h3 className="font-serif text-base sm:text-lg font-bold leading-snug text-charcoal">{node.title}</h3>
        <p className="mt-1 text-xs text-slateink">{node.meta}</p>
        <p className="text-[11px] text-slateink-light mt-0.5">
          {new Date(node.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Link to Original Record */}
      {route && (
        <a
          href={route}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-terracotta hover:underline"
        >
          <span>Open original record</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      )}

      {/* Contradictions Banner */}
      {contradictions.length > 0 && (
        <div className="rounded-xl bg-clayred-light/70 border border-clayred-light p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-clayred-DEFAULT">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Conflicting Evidence</span>
          </p>
          <p className="text-[11px] text-charcoal leading-relaxed">
            Both viewpoints are preserved as real evidence of changing context or personal growth.
          </p>
        </div>
      )}

      {/* Connections List */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-slateink font-bold mb-2">
          Connections ({mine.length})
        </h4>
        {mine.length === 0 ? (
          <p className="text-xs text-slateink-light italic">
            No supported connections recorded yet. Connections appear when records share explicit references or keyword patterns.
          </p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {mine.map((e) => (
              <li key={e.id} className="text-xs p-2.5 rounded-xl bg-paper-soft border border-linen-dark/60 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-medium text-charcoal">{e.label}</span>
                  <Badge tone={e.basis === 'confirmed' ? 'sage' : e.basis === 'direct' ? 'sage' : e.kind === 'evidence_contradicts' ? 'clay' : 'neutral'}>
                    {e.basis === 'confirmed' ? 'confirmed' : e.basis === 'direct' ? 'direct' : 'inferred'}
                  </Badge>
                </div>
                <p className="text-[11px] text-slateink">
                  {e.source === node.id ? '→' : '←'} {otherTitle(e, node.id)}
                </p>
                <p className="text-[10px] text-slateink-light">trace: {e.trace}</p>

                {/* Confirm/Dismiss for Inferred Links */}
                {e.basis === 'inferred' && userCanConfirm && (
                  <div className="mt-1.5 flex items-center gap-1.5 pt-1.5 border-t border-linen-dark/40">
                    <button
                      type="button"
                      onClick={() => onDecide(e.id, 'confirmed')}
                      className="rounded-full bg-sage-light border border-sage/40 px-2.5 py-1 text-[10px] font-semibold text-sage-dark hover:bg-sage hover:text-paper transition-all cursor-pointer"
                    >
                      Confirm connection
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecide(e.id, 'dismissed')}
                      className="rounded-full border border-linen-dark bg-white px-2.5 py-1 text-[10px] font-medium text-slateink hover:border-clayred-DEFAULT hover:text-clayred-DEFAULT transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function otherTitle(e: GraphEdge, selfId: string): string {
  return e.source === selfId
    ? e.target.replace(/^(memory|belief|value|decision|reflection):/, '')
    : e.source.replace(/^(memory|belief|value|decision|reflection):/, '');
}
