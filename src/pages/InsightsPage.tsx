import { useState, useEffect, useMemo } from 'react';
import {
  Lightbulb,
  Check,
  X,
  Edit3,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  Clock,
  Compass,
  Scale,
  BookOpen,
  HelpCircle,
  ShieldCheck,
  RefreshCw,
  Plus,
  Inbox,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card, Badge, LoadingState, FilterDropdown, type FilterDropdownOption } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { insightService } from '@/lib/insightService';
import type {
  EvidenceQuality,
  InsightCategory,
  InsightItem,
  InsightStatus,
} from '@/lib/types';

const CATEGORY_META: Record<
  InsightCategory,
  { label: string; icon: typeof Lightbulb; badgeClass: string }
> = {
  recurring_theme: {
    label: 'Recurring Theme',
    icon: BookOpen,
    badgeClass: 'bg-linen-dark/50 text-charcoal border-linen-dark',
  },
  decision_approach: {
    label: 'Decision Approach',
    icon: Scale,
    badgeClass: 'bg-amberclay-light/40 text-amberclay-dark border-amberclay-DEFAULT/30',
  },
  decision_pattern: {
    label: 'Decision Approach',
    icon: Scale,
    badgeClass: 'bg-amberclay-light/40 text-amberclay-dark border-amberclay-DEFAULT/30',
  },
  belief_evolution: {
    label: 'Belief Evolution',
    icon: Compass,
    badgeClass: 'bg-sage-light/50 text-sage-dark border-sage-DEFAULT/30',
  },
  repeated_obstacle: {
    label: 'Repeated Obstacle',
    icon: AlertTriangle,
    badgeClass: 'bg-clayred-light/40 text-clayred-dark border-clayred-DEFAULT/30',
  },
  value_alignment: {
    label: 'Value Alignment',
    icon: Compass,
    badgeClass: 'bg-terracotta-light/30 text-terracotta-deep border-terracotta/30',
  },
  value_decision_alignment: {
    label: 'Value Alignment',
    icon: Compass,
    badgeClass: 'bg-terracotta-light/30 text-terracotta-deep border-terracotta/30',
  },
  priority_tension: {
    label: 'Priority Tension',
    icon: AlertTriangle,
    badgeClass: 'bg-clayred-light/50 text-clayred-DEFAULT border-clayred-DEFAULT/40',
  },
  stated_vs_choice_tension: {
    label: 'Priority Tension',
    icon: AlertTriangle,
    badgeClass: 'bg-clayred-light/50 text-clayred-DEFAULT border-clayred-DEFAULT/40',
  },
  reflection_question: {
    label: 'Reflection Question',
    icon: HelpCircle,
    badgeClass: 'bg-linen text-slateink-dark border-linen-dark',
  },
  reflection_prompt: {
    label: 'Reflection Question',
    icon: HelpCircle,
    badgeClass: 'bg-linen text-slateink-dark border-linen-dark',
  },
  missing_information: {
    label: 'Missing Information',
    icon: Info,
    badgeClass: 'bg-linen text-slateink border-linen-dark',
  },
};

const QUALITY_META: Record<EvidenceQuality, { label: string; badgeClass: string; desc: string }> = {
  multiple_examples: {
    label: 'Multiple supporting records',
    badgeClass: 'bg-sage-light/60 text-sage-dark border-sage-DEFAULT/30',
    desc: 'Supported by 2 or more distinct recorded memories or decisions.',
  },
  single_example: {
    label: 'Single recorded example',
    badgeClass: 'bg-linen text-slateink border-linen-dark',
    desc: 'Based on a single recorded instance; preliminary hypothesis.',
  },
  conflicting_evidence: {
    label: 'Conflicting records exist',
    badgeClass: 'bg-amberclay-light/60 text-amberclay-dark border-amberclay-DEFAULT/40',
    desc: 'Other recorded experiences present counterevidence or exceptions.',
  },
  limited_recent: {
    label: 'Recent evidence is limited',
    badgeClass: 'bg-amberclay-light/40 text-slateink border-linen-dark',
    desc: 'Most supporting evidence is older, with sparse recent data.',
  },
  insufficient_evidence: {
    label: 'Insufficient evidence',
    badgeClass: 'bg-clayred-light/30 text-clayred-dark border-clayred-DEFAULT/30',
    desc: 'Data is too sparse to substantiate a recurring pattern.',
  },
};

const INSIGHT_CATEGORY_OPTIONS: FilterDropdownOption<InsightCategory | 'all'>[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'recurring_theme', label: 'Recurring Themes' },
  { value: 'decision_approach', label: 'Decision Approaches' },
  { value: 'belief_evolution', label: 'Belief Evolution' },
  { value: 'repeated_obstacle', label: 'Obstacles & Concerns' },
  { value: 'value_alignment', label: 'Value Alignment' },
  { value: 'priority_tension', label: 'Priority Tensions' },
  { value: 'reflection_question', label: 'Reflection Questions' },
  { value: 'missing_information', label: 'Missing Information' },
];

const QUALITY_OPTIONS: FilterDropdownOption<EvidenceQuality | 'all'>[] = [
  { value: 'all', label: 'All Evidence' },
  { value: 'multiple_examples', label: 'Multiple supporting records' },
  { value: 'single_example', label: 'Single recorded example' },
  { value: 'conflicting_evidence', label: 'Conflicting records exist' },
  { value: 'limited_recent', label: 'Recent evidence is limited' },
];

export function InsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scopeSummary, setScopeSummary] = useState<string>('Examining recorded experiences');
  const [isSparseData, setIsSparseData] = useState(false);

  // Filters & State
  const [statusFilter, setStatusFilter] = useState<InsightStatus>('candidate');
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | 'all'>('all');
  const [qualityFilter, setQualityFilter] = useState<EvidenceQuality | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded items for detailed reasoning
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Modals / Dialogs
  const [correctingItem, setCorrectingItem] = useState<InsightItem | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [confirmingDismissId, setConfirmingDismissId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const loadData = async (forceEngine = false) => {
    try {
      if (forceEngine) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Generate or retrieve
      const result = await insightService.generateOrRefresh(forceEngine);
      setInsights(result.items);
      setScopeSummary(result.scopeSummary);
      setIsSparseData(result.sparseData);
    } catch (err: unknown) {
      console.error('Failed to load insights:', err);
      setError(err instanceof Error ? err.message : 'Unable to synthesize insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData(false);
    } else {
      setLoading(false);
    }
  }, [user]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async (item: InsightItem) => {
    try {
      const updated = await insightService.confirm(item.id);
      setInsights((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setFeedback(`Confirmed pattern: "${item.title}". It is saved to your confirmed patterns.`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm insight');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      const updated = await insightService.dismiss(id);
      setInsights((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setConfirmingDismissId(null);
      setFeedback('Insight dismissed and archived. It will not be regenerated unchanged.');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss insight');
    }
  };

  const handleRevisit = async (id: string) => {
    try {
      const updated = await insightService.revisit(id);
      setInsights((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setFeedback('Insight restored to candidates for re-examination.');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revisit insight');
    }
  };

  const handleSaveCorrection = async () => {
    if (!correctingItem || !correctionText.trim()) return;
    try {
      const updated = await insightService.correct(correctingItem.id, correctionText.trim());
      setInsights((prev) => prev.map((i) => (i.id === correctingItem.id ? updated : i)));
      setCorrectingItem(null);
      setCorrectionText('');
      setFeedback('Your interpretation has been recorded and confirmed.');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save interpretation');
    }
  };

  const handlePromoteToBelief = async (item: InsightItem) => {
    setPromotingId(item.id);
    try {
      const { insight } = await insightService.promoteToBelief(item.id);
      setInsights((prev) => prev.map((i) => (i.id === item.id ? insight : i)));
      setFeedback(`Pattern promoted to permanent Belief! View in Beliefs & Values.`);
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote insight to belief');
    } finally {
      setPromotingId(null);
    }
  };

  // Counts by status
  const counts = useMemo(() => {
    const res = { candidate: 0, confirmed: 0, dismissed: 0 };
    for (const item of insights) {
      if (item.status in res) {
        res[item.status]++;
      }
    }
    return res;
  }, [insights]);

  // Filtered insights
  const filteredInsights = useMemo(() => {
    return insights.filter((item) => {
      if (item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (qualityFilter !== 'all' && item.evidence_quality !== qualityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mTitle = item.title.toLowerCase().includes(q);
        const mStmt = item.statement.toLowerCase().includes(q);
        const mReason = item.reasoning.toLowerCase().includes(q);
        const mCorr = item.user_correction?.toLowerCase().includes(q) ?? false;
        if (!mTitle && !mStmt && !mReason && !mCorr) return false;
      }
      return true;
    });
  }, [insights, statusFilter, categoryFilter, qualityFilter, searchQuery]);

  // Auth Guard
  if (authLoading) {
    return <LoadingState label="Checking session…" />;
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6 animate-[fadeIn_150ms_ease-out]">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-linen flex items-center justify-center border border-linen-dark text-terracotta shadow-xs">
          <Lightbulb className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <SectionHeading
            eyebrow="Evidence-Grounded Synthesis"
            title="Insights & Patterns"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-md mx-auto leading-relaxed">
            Examine possible recurring themes, repeated decision approaches, and belief evolutions across your recorded memories.
          </p>
        </div>

        <Card className="p-6 rounded-2xl sm:rounded-3xl border border-linen-dark bg-white shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-base font-bold text-charcoal">Sign in to view your personal patterns</h2>
            <p className="text-xs text-slateink-light">
              Pattern synthesis is private, grounded in your own authentic data, and requires explicit user review.
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
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-xl border border-linen-dark bg-linen/60 text-charcoal text-xs font-semibold hover:bg-linen transition-colors cursor-pointer"
            >
              <span>Create Account</span>
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-[fadeIn_150ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-linen-dark/60">
        <div className="space-y-1.5">
          <SectionHeading
            eyebrow="Evidence-Grounded Synthesis"
            title="Insights & Patterns"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-2xl leading-relaxed">
            Candidate interpretations of recurring themes, decision tendencies, and belief evolutions across your records. These are hypotheses for you to examine, govern, and confirm — not clinical personality assessments.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slateink bg-linen px-2.5 py-0.5 rounded-full border border-linen-dark/60">
              <Clock className="w-3 h-3 text-terracotta" />
              <span>{scopeSummary}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slateink-light">
              <ShieldCheck className="w-3 h-3 text-sage-dark" />
              <span>Deterministic evidence validation</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-linen-dark/80 bg-white hover:bg-linen/60 text-charcoal shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Re-synthesize patterns from recent memories and decisions"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-terracotta ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Analyzing records…' : 'Refresh Patterns'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className="p-3.5 rounded-2xl bg-sage-light/60 border border-sage-DEFAULT/40 text-sage-dark text-xs flex items-center justify-between gap-2 animate-[fadeIn_100ms_ease-out]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-sage-dark hover:opacity-75 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-clayred-light/50 border border-clayred-DEFAULT/40 text-clayred-dark text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-clayred-dark hover:opacity-75 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sparse Data Educational Alert */}
      {isSparseData && (
        <Card className="p-5 rounded-2xl border border-amberclay-DEFAULT/30 bg-amberclay-light/20 shadow-2xs space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amberclay-light/60 text-amberclay-dark shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xs sm:text-sm font-semibold text-charcoal">
                More records needed to detect genuine patterns
              </h2>
              <p className="text-xs text-slateink leading-relaxed">
                EchoSelf grounds every insight in authentic recorded experiences rather than fabricating generic advice or personality scores. Add at least 2 memories or record a decision with reflections to help the pattern engine surface recurring themes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 pt-1 pl-11">
            <a
              href="/inbox"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('inbox');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amberclay-DEFAULT/40 text-xs font-semibold text-charcoal hover:bg-amberclay-light/40 transition-colors shadow-2xs"
            >
              <Inbox className="w-3.5 h-3.5 text-terracotta" />
              <span>Capture in Inbox</span>
            </a>
            <a
              href="/memories"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigateTo('memories');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-terracotta-light" />
              <span>Record Memory</span>
            </a>
          </div>
        </Card>
      )}

      {/* Status Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-linen border border-linen-dark/60 w-fit">
        <button
          type="button"
          onClick={() => setStatusFilter('candidate')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'candidate'
              ? 'bg-white text-charcoal shadow-2xs border border-linen-dark/60'
              : 'text-slateink hover:text-charcoal'
          }`}
        >
          <span>Candidate Patterns</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === 'candidate'
                ? 'bg-terracotta/15 text-terracotta-deep font-bold'
                : 'bg-linen-dark/50 text-slateink'
            }`}
          >
            {counts.candidate}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('confirmed')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'confirmed'
              ? 'bg-white text-charcoal shadow-2xs border border-linen-dark/60'
              : 'text-slateink hover:text-charcoal'
          }`}
        >
          <span>Confirmed by You</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === 'confirmed'
                ? 'bg-sage-dark/15 text-sage-dark font-bold'
                : 'bg-linen-dark/50 text-slateink'
            }`}
          >
            {counts.confirmed}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('dismissed')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'dismissed'
              ? 'bg-white text-charcoal shadow-2xs border border-linen-dark/60'
              : 'text-slateink hover:text-charcoal'
          }`}
        >
          <span>Dismissed Archive</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === 'dismissed'
                ? 'bg-charcoal/10 text-charcoal font-bold'
                : 'bg-linen-dark/50 text-slateink'
            }`}
          >
            {counts.dismissed}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slateink absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patterns, statements, or reasoning…"
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-linen-dark/80 bg-white text-xs text-charcoal placeholder:text-slateink focus:outline-none focus:border-terracotta shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slateink hover:text-charcoal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 shrink-0">
          <FilterDropdown<InsightCategory | 'all'>
            value={categoryFilter}
            defaultValue="all"
            options={INSIGHT_CATEGORY_OPTIONS}
            onChange={setCategoryFilter}
            icon={FolderOpen}
            title="Filter by Category"
            ariaLabel="Filter by Category"
          />

          <FilterDropdown<EvidenceQuality | 'all'>
            value={qualityFilter}
            defaultValue="all"
            options={QUALITY_OPTIONS}
            onChange={setQualityFilter}
            icon={ShieldCheck}
            title="Filter by Evidence Quality"
            ariaLabel="Filter by Evidence Quality"
          />
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <LoadingState label="Synthesizing evidence-grounded patterns…" />
      ) : filteredInsights.length === 0 ? (
        <Card className="py-12 px-6 text-center space-y-3 rounded-3xl border border-linen-dark bg-white shadow-2xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-linen flex items-center justify-center text-slateink border border-linen-dark">
            <Lightbulb className="w-6 h-6 text-slateink" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-charcoal">
              {searchQuery || categoryFilter !== 'all' || qualityFilter !== 'all'
                ? 'No matching patterns found'
                : statusFilter === 'candidate'
                ? 'No candidate patterns pending review'
                : statusFilter === 'confirmed'
                ? 'No confirmed patterns yet'
                : 'No dismissed patterns in archive'}
            </h2>
            <p className="text-xs text-slateink max-w-sm mx-auto leading-relaxed">
              {searchQuery || categoryFilter !== 'all' || qualityFilter !== 'all'
                ? 'Try adjusting your search criteria or resetting filters.'
                : statusFilter === 'candidate'
                ? 'When new experiences, decisions, or beliefs are added, the pattern engine will propose structured candidates for your review.'
                : 'Patterns you review and confirm will appear here for longitudinal reflection.'}
            </p>
          </div>
          {(searchQuery || categoryFilter !== 'all' || qualityFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setQualityFilter('all');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-linen text-xs font-semibold text-charcoal hover:bg-linen-dark/60 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredInsights.map((item) => {
            const catMeta = CATEGORY_META[item.category] || CATEGORY_META.recurring_theme;
            const qualMeta = QUALITY_META[item.evidence_quality] || QUALITY_META.single_example;
            const CatIcon = catMeta.icon;
            const isExpanded = expandedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className="p-5 sm:p-6 rounded-3xl border border-linen-dark bg-white shadow-xs hover:border-linen-darker transition-all space-y-4"
              >
                {/* Top Meta Header */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${catMeta.badgeClass}`}
                    >
                      <CatIcon className="w-3.5 h-3.5" />
                      <span>{catMeta.label}</span>
                    </span>

                    <span className="text-xs text-slateink-light">·</span>
                    <span className="text-xs font-medium text-slateink">{item.scope_label}</span>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${qualMeta.badgeClass}`}
                      title={qualMeta.desc}
                    >
                      {qualMeta.label}
                    </span>
                  </div>

                  {item.status === 'confirmed' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-dark bg-sage-light/50 px-2.5 py-0.5 rounded-full border border-sage-DEFAULT/30">
                      <Check className="w-3 h-3" />
                      <span>Confirmed by You</span>
                    </span>
                  )}
                  {item.status === 'dismissed' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slateink bg-linen px-2.5 py-0.5 rounded-full border border-linen-dark">
                      <X className="w-3 h-3" />
                      <span>Dismissed</span>
                    </span>
                  )}
                </div>

                {/* Insight Title and Statement */}
                <div className="space-y-1.5">
                  <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal leading-snug">
                    {item.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slateink-dark leading-relaxed">
                    {item.statement}
                  </p>
                </div>

                {/* User's Custom Interpretation (if present) */}
                {item.user_correction && (
                  <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-terracotta">
                      <Edit3 className="w-3 h-3" />
                      <span>Your Interpretation</span>
                    </div>
                    <p className="text-xs text-charcoal italic leading-relaxed">
                      "{item.user_correction}"
                    </p>
                  </div>
                )}

                {/* Uncertainty and Limitations note */}
                {item.uncertainty_notes && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-linen/50 border border-linen-dark/50 text-[11px] text-slateink leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-slateink-light shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slateink-dark">Data limitation: </strong>
                      {item.uncertainty_notes}
                    </span>
                  </div>
                )}

                {/* Expandable Reasoning and Provenance */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:text-terracotta-dark transition-colors cursor-pointer"
                  >
                    <span>{isExpanded ? 'Hide full evidence reasoning' : 'Inspect reasoning & source records'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 p-4 rounded-2xl bg-linen/40 border border-linen-dark/70 space-y-4 animate-[fadeIn_100ms_ease-out]">
                      {/* Deductive Rationale */}
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slateink-dark">
                          System Synthesis Rationale
                        </p>
                        <p className="text-xs text-charcoal leading-relaxed whitespace-pre-wrap">
                          {item.reasoning}
                        </p>
                      </div>

                      {/* Supporting Records */}
                      {item.supporting_memory_ids && item.supporting_memory_ids.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-linen-dark/50">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            <span>Supporting Records ({item.supporting_memory_ids.length})</span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {item.supporting_memory_ids.map((memId, idx) => (
                              <a
                                key={memId}
                                href={`/memory/${memId}`}
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                                  e.preventDefault();
                                  navigateTo({ page: 'memory', id: memId });
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-linen-dark text-xs text-charcoal hover:border-terracotta hover:text-terracotta transition-colors shadow-2xs"
                              >
                                <span className="font-mono text-[10px] text-slateink-light">#{idx + 1}</span>
                                <span>Record {memId.slice(0, 8)}…</span>
                                <ExternalLink className="w-3 h-3 text-slateink" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Related Decisions */}
                      {item.related_decision_ids && item.related_decision_ids.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-linen-dark/50">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-amberclay-dark flex items-center gap-1">
                            <Scale className="w-3 h-3" />
                            <span>Related Deliberations ({item.related_decision_ids.length})</span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {item.related_decision_ids.map((decId, idx) => (
                              <a
                                key={decId}
                                href={`/decision/${decId}`}
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                                  e.preventDefault();
                                  navigateTo({ page: 'decision', id: decId });
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-linen-dark text-xs text-charcoal hover:border-amberclay-DEFAULT hover:text-amberclay-dark transition-colors shadow-2xs"
                              >
                                <span className="font-mono text-[10px] text-slateink-light">#{idx + 1}</span>
                                <span>Decision {decId.slice(0, 8)}…</span>
                                <ExternalLink className="w-3 h-3 text-slateink" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Conflicting Counterevidence (if present) */}
                      {item.counter_memory_ids && item.counter_memory_ids.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-linen-dark/50">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-clayred-dark flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Conflicting Counterevidence ({item.counter_memory_ids.length})</span>
                          </p>
                          <p className="text-[11px] text-slateink">
                            These recorded experiences present an exception or counterbalance to the proposed pattern:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {item.counter_memory_ids.map((memId, idx) => (
                              <a
                                key={memId}
                                href={`/memory/${memId}`}
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                                  e.preventDefault();
                                  navigateTo({ page: 'memory', id: memId });
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-clayred-light/30 border border-clayred-DEFAULT/40 text-xs text-clayred-dark hover:bg-clayred-light/60 transition-colors shadow-2xs"
                              >
                                <span className="font-mono text-[10px] text-clayred-DEFAULT">Counter #{idx + 1}</span>
                                <span>Record {memId.slice(0, 8)}…</span>
                                <ExternalLink className="w-3 h-3 text-clayred-DEFAULT" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Promoted Link (if applicable) */}
                      {item.promoted_belief_id && (
                        <div className="pt-2 border-t border-linen-dark/50 flex items-center justify-between">
                          <span className="text-xs font-medium text-sage-dark">
                            Active in Beliefs & Values
                          </span>
                          <a
                            href="/beliefs"
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                              e.preventDefault();
                              navigateTo('beliefs');
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:underline"
                          >
                            <span>Open Belief</span>
                            <ArrowRight className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-linen-dark/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {item.status === 'candidate' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConfirm(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-charcoal text-paper hover:bg-slateink-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 text-sage-light" />
                          <span>Resonates (Confirm)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingItem(item);
                            setCorrectionText(item.user_correction || item.statement);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-linen-dark bg-white hover:bg-linen/60 text-xs font-semibold text-charcoal transition-colors shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-terracotta" />
                          <span>Correct</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmingDismissId(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slateink hover:text-clayred-DEFAULT hover:bg-clayred-light/30 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Dismiss</span>
                        </button>
                      </>
                    )}

                    {item.status === 'confirmed' && (
                      <>
                        {!item.promoted_belief_id ? (
                          <button
                            type="button"
                            onClick={() => handlePromoteToBelief(item)}
                            disabled={promotingId === item.id}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-terracotta text-paper hover:bg-terracotta-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amberclay-light" />
                            <span>{promotingId === item.id ? 'Promoting…' : 'Promote to Permanent Belief'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-sage-dark bg-sage-light/40 px-2.5 py-1 rounded-full border border-sage-DEFAULT/30">
                            Saved as Permanent Belief
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingItem(item);
                            setCorrectionText(item.user_correction || item.statement);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-linen-dark bg-white hover:bg-linen/60 text-xs font-semibold text-charcoal transition-colors cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-terracotta" />
                          <span>{item.user_correction ? 'Edit Interpretation' : 'Refine'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevisit(item.id)}
                          className="inline-flex items-center gap-1 text-xs text-slateink hover:text-charcoal px-2.5 py-1.5 rounded-xl hover:bg-linen transition-colors cursor-pointer"
                        >
                          <span>Revisit (Unconfirm)</span>
                        </button>
                      </>
                    )}

                    {item.status === 'dismissed' && (
                      <button
                        type="button"
                        onClick={() => handleRevisit(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal text-paper hover:bg-slateink-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-terracotta-light" />
                        <span>Restore to Candidates</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-slateink-light">
                    Generated {new Date(item.generated_at).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dismiss Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmingDismissId}
        title="Dismiss this insight suggestion?"
        description="This pattern suggestion will be archived. It will not reappear on subsequent page loads unless materially new evidence changes the underlying interpretation."
        confirmLabel="Dismiss Suggestion"
        tone="danger"
        onConfirm={() => {
          if (confirmingDismissId) handleDismiss(confirmingDismissId);
        }}
        onCancel={() => setConfirmingDismissId(null)}
      />

      {/* Correct Interpretation Modal */}
      {correctingItem && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-xs flex items-center justify-center p-4 animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="correct-title"
        >
          <div className="w-full max-w-lg rounded-3xl bg-paper border border-linen-dark shadow-lifted p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-terracotta">
                <Edit3 className="w-5 h-5" />
                <h3 id="correct-title" className="font-serif text-base font-bold text-charcoal">
                  Correct Pattern in Your Own Words
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingItem(null)}
                className="p-1 rounded-lg text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slateink leading-relaxed">
              AI-generated interpretations may overlook personal nuances or infer correlations that don't match your reality. Rephrase the pattern accurately:
            </p>

            <div className="p-3 rounded-2xl bg-linen border border-linen-dark/60 text-xs text-slateink-dark">
              <span className="font-semibold text-charcoal">Original statement: </span>
              {correctingItem.statement}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="user-correction-input" className="text-xs font-semibold text-charcoal">
                Your accurate interpretation:
              </label>
              <textarea
                id="user-correction-input"
                rows={4}
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                placeholder="In my own words, what is actually happening is..."
                className="w-full p-3 rounded-2xl border border-linen-dark/80 bg-white text-xs text-charcoal focus:outline-none focus:border-terracotta shadow-2xs resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrectingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slateink hover:text-charcoal hover:bg-linen transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCorrection}
                disabled={!correctionText.trim()}
                className="px-4 py-2 rounded-xl bg-charcoal text-paper hover:bg-slateink-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                Save & Confirm Pattern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
