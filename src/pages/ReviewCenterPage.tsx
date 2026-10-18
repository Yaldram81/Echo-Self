import { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  Sparkles,
  Check,
  X,
  Edit3,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  Clock,
  History,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  BookOpen,
  Compass,
  GitBranch,
  Scale,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card, Badge, LoadingState } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  reviewService,
  type UnifiedReviewItem,
  type ReviewItemKind,
  type ReviewItemStatus,
} from '@/lib/reviewService';

const KIND_LABELS: Record<ReviewItemKind, string> = {
  belief_suggestion: 'Suggested Beliefs',
  interpretation_flag: 'Interpretation Corrections',
  statement_relationship: 'Statement Relationships',
  graph_edge: 'Graph Connections',
  decision_proposal: 'Decision Proposals',
};

const KIND_ICONS: Record<ReviewItemKind, typeof Sparkles> = {
  belief_suggestion: Compass,
  interpretation_flag: BookOpen,
  statement_relationship: Scale,
  graph_edge: GitBranch,
  decision_proposal: Scale,
};

export function ReviewCenterPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<UnifiedReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<ReviewItemStatus>('pending');
  const [kindFilter, setKindFilter] = useState<ReviewItemKind | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // In-action states (to prevent double clicks)
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<UnifiedReviewItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Dismiss Confirmation State
  const [dismissingItem, setDismissingItem] = useState<UnifiedReviewItem | null>(null);

  // Expanded items for deep inspection
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const data = await reviewService.listAll();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load review items.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadItems();
    } else {
      setLoading(false);
    }
  }, [user]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Handle Approve
  async function handleApprove(item: UnifiedReviewItem) {
    if (actingIds.has(item.id)) return;
    setActingIds((prev) => new Set(prev).add(item.id));
    setActionError(null);

    try {
      await reviewService.approve(item);
      setFeedbackNotice(`Approved: "${item.title}"`);
      setTimeout(() => setFeedbackNotice(null), 3500);
      await loadItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed. Please try again.');
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Handle Edit & Approve
  function startEdit(item: UnifiedReviewItem) {
    let initial = '';
    if (item.kind === 'belief_suggestion' && item.raw.belief) initial = item.raw.belief.statement;
    else if (item.kind === 'interpretation_flag' && item.raw.flag) initial = item.raw.flag.correction_note;
    else if (item.kind === 'statement_relationship' && item.raw.relationship) initial = item.raw.relationship.explanation;
    else initial = item.summary;

    setEditingItem(item);
    setEditText(initial);
  }

  async function saveEditAndApprove() {
    if (!editingItem) return;
    setEditSaving(true);
    setActionError(null);

    try {
      await reviewService.approve(editingItem, editText.trim());
      setFeedbackNotice(`Edited and approved: "${editingItem.title}"`);
      setTimeout(() => setFeedbackNotice(null), 3500);
      setEditingItem(null);
      await loadItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save and approve.');
    } finally {
      setEditSaving(false);
    }
  }

  // Handle Dismiss
  async function confirmDismiss() {
    if (!dismissingItem) return;
    setActingIds((prev) => new Set(prev).add(dismissingItem.id));
    setActionError(null);

    try {
      await reviewService.dismiss(dismissingItem);
      setFeedbackNotice(`Dismissed: "${dismissingItem.title}"`);
      setTimeout(() => setFeedbackNotice(null), 3500);
      setDismissingItem(null);
      await loadItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to dismiss.');
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        if (dismissingItem) next.delete(dismissingItem.id);
        return next;
      });
    }
  }

  // Count items awaiting review
  const pendingCount = useMemo(() => items.filter((i) => i.status === 'pending').length, [items]);
  const approvedCount = useMemo(() => items.filter((i) => i.status === 'approved').length, [items]);
  const dismissedCount = useMemo(() => items.filter((i) => i.status === 'dismissed').length, [items]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status filter
      if (item.status !== statusFilter) return false;

      // Kind filter
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesProposal = item.proposal.toLowerCase().includes(q);
        const matchesRationale = item.rationale.toLowerCase().includes(q);
        const matchesCategory = item.categoryLabel.toLowerCase().includes(q);
        if (!matchesTitle && !matchesProposal && !matchesRationale && !matchesCategory) return false;
      }

      return true;
    }).sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortBy === 'newest' ? tB - tA : tA - tB;
    });
  }, [items, statusFilter, kindFilter, searchQuery, sortBy]);

  // Auth Guard
  if (authLoading) {
    return <LoadingState label="Checking session…" />;
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6 animate-[fadeIn_150ms_ease-out]">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-linen flex items-center justify-center border border-linen-dark text-terracotta shadow-xs">
          <CheckSquare className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <SectionHeading
            eyebrow="Human Oversight"
            title="Review Center"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-md mx-auto leading-relaxed">
            The Review Center gives you full authority over AI suggestions, interpretation corrections, graph connections, and belief proposals.
          </p>
        </div>

        <Card className="p-6 rounded-2xl sm:rounded-3xl border border-linen-dark bg-white shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-base font-bold text-charcoal">Sign in to govern your personal model</h2>
            <p className="text-xs text-slateink-light">
              AI suggestions and corrections are private to your authenticated personal workspace.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="/signin"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('signin');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-colors shadow-2xs cursor-pointer"
            >
              <span>Sign in</span>
              <ArrowRight className="w-3.5 h-3.5 text-terracotta-light" />
            </a>
            <a
              href="/signup"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('signup');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center h-10 px-5 rounded-xl bg-linen hover:bg-linen-dark/60 border border-linen-dark text-charcoal text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              Create account
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 md:pb-16 animate-[fadeIn_150ms_ease-out]">
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-linen-dark/70">
        <div>
          <div className="flex items-center gap-2">
            <SectionHeading
              eyebrow="Governance & Human Oversight"
              title="Review Center"
              as="h1"
            />
            {pendingCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-terracotta/15 text-terracotta-deep border border-terracotta/30">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slateink max-w-xl leading-relaxed mt-0.5">
            Inspect, approve, edit, or dismiss AI suggestions before they become permanent knowledge. You retain complete authority over your personal model.
          </p>
        </div>

        <button
          type="button"
          onClick={loadItems}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded-xl text-xs font-medium text-slateink-dark bg-white hover:bg-linen border border-linen-dark transition-colors cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slateink-light ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Action feedback / error notifications */}
      {feedbackNotice && (
        <div className="p-3 rounded-xl bg-sage-light/60 border border-sage-dark/30 text-xs font-semibold text-sage-dark flex items-center gap-2 animate-[fadeIn_150ms_ease-out]">
          <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-clayred-light/50 border border-clayred-DEFAULT/30 text-xs font-semibold text-clayred-DEFAULT flex items-center gap-2 animate-[fadeIn_150ms_ease-out]">
          <AlertTriangle className="w-4 h-4 text-clayred-DEFAULT shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* =========================================================================
          CONTROLS: Status Tabs, Category Filter, Search & Sort
          ========================================================================= */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div className="flex items-center justify-between border-b border-linen-dark/60 pb-1 gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-linen text-charcoal font-semibold border border-linen-dark/80 shadow-2xs'
                  : 'text-slateink-dark hover:text-charcoal hover:bg-linen/40'
              }`}
            >
              <span>Awaiting Review</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                statusFilter === 'pending' ? 'bg-terracotta text-white' : 'bg-linen-dark/60 text-slateink'
              }`}>
                {pendingCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('approved')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'approved'
                  ? 'bg-linen text-charcoal font-semibold border border-linen-dark/80 shadow-2xs'
                  : 'text-slateink-dark hover:text-charcoal hover:bg-linen/40'
              }`}
            >
              <span>Approved</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-linen-dark/60 text-slateink font-bold">
                {approvedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('dismissed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'dismissed'
                  ? 'bg-linen text-charcoal font-semibold border border-linen-dark/80 shadow-2xs'
                  : 'text-slateink-dark hover:text-charcoal hover:bg-linen/40'
              }`}
            >
              <span>Dismissed</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-linen-dark/60 text-slateink font-bold">
                {dismissedCount}
              </span>
            </button>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-1.5 text-xs text-slateink shrink-0">
            <span className="hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
              className="text-xs bg-white border border-linen-dark rounded-lg px-2 py-1 text-charcoal focus:outline-none focus:border-terracotta"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        {/* Category Pills & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scroll-elegant">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                kindFilter === 'all'
                  ? 'bg-charcoal text-paper font-semibold shadow-2xs'
                  : 'bg-white border border-linen-dark text-slateink hover:text-charcoal hover:bg-linen/40'
              }`}
            >
              All Types
            </button>
            {(Object.keys(KIND_LABELS) as ReviewItemKind[]).map((kind) => {
              const countForKind = items.filter((i) => i.status === statusFilter && i.kind === kind).length;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setKindFilter(kind)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    kindFilter === kind
                      ? 'bg-terracotta text-paper font-semibold shadow-2xs'
                      : 'bg-white border border-linen-dark text-slateink hover:text-charcoal hover:bg-linen/40'
                  }`}
                >
                  <span>{KIND_LABELS[kind]}</span>
                  {countForKind > 0 && (
                    <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
                      kindFilter === kind ? 'bg-white/20 text-white' : 'bg-linen text-slateink-dark'
                    }`}>
                      {countForKind}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Query Input */}
          <div className="relative sm:w-56 shrink-0">
            <Search className="w-3.5 h-3.5 text-slateink-light absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search proposals…"
              className="w-full pl-8 pr-3 py-1.5 text-xs text-charcoal bg-white border border-linen-dark rounded-xl focus:outline-none focus:border-terracotta transition-colors placeholder:text-slateink-light"
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
          ITEMS LIST
          ========================================================================= */}
      {loading ? (
        <LoadingState label="Analyzing pending proposals and evidence…" />
      ) : error ? (
        <Card className="p-6 text-center space-y-3 bg-white border border-linen-dark rounded-2xl">
          <AlertTriangle className="w-8 h-8 text-clayred-DEFAULT mx-auto" />
          <p className="text-sm font-semibold text-charcoal">{error}</p>
          <button
            type="button"
            onClick={loadItems}
            className="px-4 py-2 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-colors"
          >
            Retry
          </button>
        </Card>
      ) : filteredItems.length === 0 ? (
        /* Empty States */
        <Card className="p-8 sm:p-12 text-center space-y-4 bg-white border border-linen-dark rounded-2xl sm:rounded-3xl shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-linen flex items-center justify-center border border-linen-dark text-slateink-light">
            <CheckCircle2 className="w-6 h-6 text-sage-dark" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">
              {statusFilter === 'pending'
                ? kindFilter !== 'all'
                  ? `No pending ${KIND_LABELS[kindFilter]} items`
                  : 'All caught up'
                : `No ${statusFilter} items found`}
            </h2>
            <p className="text-xs sm:text-sm text-slateink max-w-md mx-auto leading-relaxed">
              {statusFilter === 'pending'
                ? 'There are no AI suggestions or corrections awaiting your review. As you capture memories, reflect on decisions, and converse with your twin, new suggestions will appear here.'
                : 'Items you approve or dismiss will be archived in this view for transparency.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <a
              href="/memories"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('memories');
              }}
              className="px-3.5 py-1.5 rounded-xl border border-linen-dark bg-white text-xs font-medium text-charcoal hover:bg-linen transition-colors shadow-2xs"
            >
              Explore Memories
            </a>
            <a
              href="/beliefs"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('beliefs');
              }}
              className="px-3.5 py-1.5 rounded-xl border border-linen-dark bg-white text-xs font-medium text-charcoal hover:bg-linen transition-colors shadow-2xs"
            >
              Beliefs & Values
            </a>
            <a
              href="/graph"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('graph');
              }}
              className="px-3.5 py-1.5 rounded-xl border border-linen-dark bg-white text-xs font-medium text-charcoal hover:bg-linen transition-colors shadow-2xs"
            >
              Evidence Graph
            </a>
          </div>
        </Card>
      ) : (
        <div className="space-y-3.5">
          {filteredItems.map((item) => {
            const Icon = KIND_ICONS[item.kind];
            const isActing = actingIds.has(item.id);
            const isExpanded = expandedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className="p-4 sm:p-5 border border-linen-dark/80 bg-white rounded-2xl shadow-xs transition-all hover:border-linen-dark space-y-3"
              >
                {/* Header row: Category pill, created time, status badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-linen-dark/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-linen text-terracotta border border-linen-dark/60 shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-semibold text-charcoal uppercase tracking-wider">
                      {item.categoryLabel}
                    </span>
                    {item.sourceDeleted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amberclay-DEFAULT bg-amberclay-light/50 border border-amberclay-DEFAULT/30 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        <span>Source Deleted</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slateink-light">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {item.status === 'approved' && (
                      <span className="text-sage-dark font-semibold bg-sage-light/50 px-2 py-0.5 rounded-md">Approved</span>
                    )}
                    {item.status === 'dismissed' && (
                      <span className="text-slateink-light font-semibold bg-linen px-2 py-0.5 rounded-md">Dismissed</span>
                    )}
                  </div>
                </div>

                {/* Primary Proposal Statement */}
                <div className="space-y-1">
                  <h2 className="font-serif text-sm sm:text-base font-bold text-charcoal">
                    {item.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slateink leading-relaxed font-mono sm:font-sans bg-paper-soft/40 p-2.5 rounded-xl border border-linen-dark/40">
                    <strong className="text-charcoal font-semibold">Proposal: </strong>
                    {item.proposal}
                  </p>
                </div>

                {/* Core 5-Pillar Disclosure / Detail Area */}
                <div className="space-y-2.5 text-xs text-slateink">
                  {/* Pillar 2: Rationale */}
                  <div className="flex items-start gap-1.5">
                    <strong className="text-charcoal font-semibold shrink-0">Why Proposed:</strong>
                    <span>{item.rationale}</span>
                  </div>

                  {/* Pillar 3: Supporting Evidence Records */}
                  {item.supportingRecords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <strong className="text-charcoal font-semibold shrink-0">Supporting Records:</strong>
                      {item.supportingRecords.map((rec) => (
                        <a
                          key={rec.id}
                          href={rec.href}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            if (rec.href.startsWith('/memory/')) {
                              navigateTo({ page: 'memory', id: rec.id });
                            } else if (rec.href.startsWith('/decision/')) {
                              navigateTo({ page: 'decision', id: rec.id });
                            } else {
                              navigateTo('beliefs');
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-linen/70 hover:bg-linen border border-linen-dark/70 text-[11px] font-medium text-terracotta-deep transition-colors cursor-pointer shadow-2xs"
                        >
                          <span>{rec.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-slateink-light" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Expandable deeper inspection (Uncertainties & System Impact) */}
                  {isExpanded && (
                    <div className="p-3 rounded-xl bg-linen/40 border border-linen-dark/60 space-y-2 mt-2 animate-[fadeIn_100ms_ease-out]">
                      <div className="space-y-0.5">
                        <strong className="text-charcoal font-semibold block text-[11px]">Uncertainties & Context:</strong>
                        <p className="text-[11px] text-slateink leading-relaxed">{item.uncertainties}</p>
                      </div>
                      <div className="space-y-0.5 pt-1 border-t border-linen-dark/40">
                        <strong className="text-charcoal font-semibold block text-[11px]">Expected System Impact:</strong>
                        <p className="text-[11px] text-slateink leading-relaxed">{item.impactExplanation}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-linen-dark/50">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="text-[11px] font-medium text-slateink-dark hover:text-charcoal cursor-pointer"
                  >
                    {isExpanded ? 'Hide context details' : 'Inspect full context & impact'}
                  </button>

                  <div className="flex items-center gap-2">
                    {item.status === 'pending' ? (
                      <>
                        {/* Dismiss */}
                        <button
                          type="button"
                          onClick={() => setDismissingItem(item)}
                          disabled={isActing}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-linen-dark bg-white hover:bg-linen text-xs font-medium text-slateink hover:text-charcoal transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Dismiss</span>
                        </button>

                        {/* Edit before approval (only if text is editable) */}
                        {item.kind !== 'graph_edge' && !item.sourceDeleted && (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            disabled={isActing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-linen-dark bg-white hover:bg-linen text-xs font-medium text-charcoal transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slateink-light" />
                            <span>Edit</span>
                          </button>
                        )}

                        {/* Approve */}
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          disabled={isActing || item.sourceDeleted}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={item.sourceDeleted ? 'Cannot approve: source record is deleted' : 'Confirm proposal'}
                        >
                          {isActing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-sage-light" />
                          )}
                          <span>Approve</span>
                        </button>
                      </>
                    ) : item.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-dark">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirmed into system</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slateink-light">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Dismissed from suggestions</span>
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          EDIT & APPROVE MODAL
          ========================================================================= */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-charcoal/50 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl sm:rounded-3xl bg-paper border border-linen-dark shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-linen-dark/60">
              <div>
                <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">
                  Edit Before Approval
                </h2>
                <p className="text-xs text-slateink-light">
                  Refine the wording with your own phrasing before establishing it in your system.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-full text-slateink-light hover:text-charcoal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-charcoal">
                Refined statement / correction note:
              </label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full p-3 text-xs sm:text-sm text-charcoal border border-linen-dark rounded-xl focus:outline-none focus:border-terracotta bg-white"
                placeholder="Enter your refined wording…"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-linen-dark/60">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                disabled={editSaving}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slateink hover:text-charcoal"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditAndApprove}
                disabled={editSaving || !editText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-colors shadow-2xs disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save & Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DISMISS CONFIRMATION DIALOG
          ========================================================================= */}
      <ConfirmDialog
        open={!!dismissingItem}
        title="Dismiss AI Suggestion?"
        description={`Dismissing "${dismissingItem?.title}" will record your choice and suppress this item from reappearing in pending reviews.`}
        confirmLabel="Dismiss Suggestion"
        tone="danger"
        onConfirm={confirmDismiss}
        onCancel={() => setDismissingItem(null)}
      />
    </div>
  );
}
