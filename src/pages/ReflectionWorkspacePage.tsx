import { useState, useEffect, useMemo, useRef } from 'react';
import {
  PenLine,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  BookOpen,
  Scale,
  Compass,
  Lightbulb,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  History,
  Save,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Info,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { navigateTo } from '@/lib/router';
import { SectionHeading, Card, Badge, LoadingState } from '@/components/ui';
import { reflectionService } from '@/lib/reflectionService';
import type {
  PeriodSummary,
  ProposedBeliefUpdate,
  ReflectionItem,
  ReflectionPrompt,
} from '@/lib/types';

export function ReflectionWorkspacePage() {
  const { user, loading: authLoading } = useAuth();

  // Period State (defaults to current week)
  const [currentWeek] = useState(() => reflectionService.getWeekBoundaries());
  const [periodStart, setPeriodStart] = useState<string>(currentWeek.periodStart);
  const [periodEnd, setPeriodEnd] = useState<string>(currentWeek.periodEnd);

  // Loaded Summary and Prompts
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [prompts, setPrompts] = useState<ReflectionPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reflection Content State
  const [reflectionId, setReflectionId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [isSaved, setIsSaved] = useState(false);

  // Lesson / Belief Proposal State
  const [showBeliefProposal, setShowBeliefProposal] = useState(false);
  const [beliefStatement, setBeliefStatement] = useState('');
  const [beliefRationale, setBeliefRationale] = useState('');
  const [beliefProposalSubmitted, setBeliefProposalSubmitted] = useState(false);

  // History List State
  const [historyList, setHistoryList] = useState<ReflectionItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Timezone display
  const userTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  // Track if period matches current week
  const isCurrentWeek = useMemo(() => {
    return (
      new Date(periodStart).getTime() === new Date(currentWeek.periodStart).getTime() &&
      new Date(periodEnd).getTime() === new Date(currentWeek.periodEnd).getTime()
    );
  }, [periodStart, periodEnd, currentWeek]);

  // Load Period Summary & Existing Reflection
  const loadPeriodData = async (start: string, end: string) => {
    setLoading(true);
    setError(null);
    try {
      const [sum, existingRefl, allRefls] = await Promise.all([
        reflectionService.summarizePeriod(start, end),
        reflectionService.getByPeriod(start, end),
        reflectionService.list(),
      ]);

      setSummary(sum);
      setPrompts(reflectionService.generatePrompts(sum));
      setHistoryList(allRefls);

      if (existingRefl) {
        setReflectionId(existingRefl.id);
        setContent(existingRefl.content);
        setGuidedAnswers(existingRefl.guided_answers || {});
        setIsSaved(true);
        if (existingRefl.proposed_belief_update) {
          setShowBeliefProposal(true);
          setBeliefStatement(existingRefl.proposed_belief_update.statement);
          setBeliefRationale(existingRefl.proposed_belief_update.rationale);
          setBeliefProposalSubmitted(true);
        } else {
          setShowBeliefProposal(false);
          setBeliefStatement('');
          setBeliefRationale('');
          setBeliefProposalSubmitted(false);
        }
      } else {
        // Clear for clean review
        setReflectionId(null);
        setContent('');
        setGuidedAnswers({});
        setIsSaved(false);
        setShowBeliefProposal(false);
        setBeliefStatement('');
        setBeliefRationale('');
        setBeliefProposalSubmitted(false);
      }
    } catch (err: unknown) {
      console.error('Failed to load period data:', err);
      setError(err instanceof Error ? err.message : 'Failed to aggregate period records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadPeriodData(periodStart, periodEnd);
    } else {
      setLoading(false);
    }
  }, [user, periodStart, periodEnd]);

  // Week Navigation
  const navigateWeek = (offset: number) => {
    const nextBoundaries = reflectionService.getAdjacentWeek(periodStart, offset);
    setPeriodStart(nextBoundaries.periodStart);
    setPeriodEnd(nextBoundaries.periodEnd);
  };

  const jumpToCurrentWeek = () => {
    setPeriodStart(currentWeek.periodStart);
    setPeriodEnd(currentWeek.periodEnd);
  };

  // Guided prompt answer handler
  const handleAnswerChange = (promptId: string, answer: string) => {
    setGuidedAnswers((prev) => ({ ...prev, [promptId]: answer }));
    setIsSaved(false);
  };

  // Save Reflection
  const handleSaveReflection = async () => {
    if (!content.trim() && Object.values(guidedAnswers).every((v) => !v.trim())) {
      setError('Please write reflection notes or answer at least one prompt before saving.');
      return;
    }

    setSaving(true);
    setError(null);

    let proposal: ProposedBeliefUpdate | null = null;
    if (showBeliefProposal && beliefStatement.trim()) {
      proposal = {
        statement: beliefStatement.trim(),
        rationale: beliefRationale.trim() || 'Preserved from weekly review.',
        kind: 'belief',
      };
    }

    try {
      const saved = await reflectionService.save({
        period_start: periodStart,
        period_end: periodEnd,
        period_type: 'weekly',
        content,
        guided_answers: guidedAnswers,
        memory_ids: summary?.memories.map((m) => m.id) || [],
        decision_ids: summary?.decisions.map((d) => d.id) || [],
        belief_ids: summary?.beliefs.map((b) => b.id) || [],
        proposed_belief_update: proposal,
        status: 'saved',
      });

      setReflectionId(saved.id);
      setIsSaved(true);
      setFeedback('Weekly Review saved and logged to your timeline.');
      setTimeout(() => setFeedback(null), 4000);

      // Submit proposed belief update through human approval workflow if configured
      if (proposal && !beliefProposalSubmitted) {
        await reflectionService.proposeBeliefFromReflection(saved.id, proposal);
        setBeliefProposalSubmitted(true);
        setFeedback('Weekly Review saved and belief update submitted to Review Center.');
      }

      // Refresh history list
      const updatedList = await reflectionService.list();
      setHistoryList(updatedList);
    } catch (err: unknown) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save reflection');
    } finally {
      setSaving(false);
    }
  };

  // Load a historic reflection into the view
  const handleSelectHistoryItem = (item: ReflectionItem) => {
    setPeriodStart(item.period_start);
    setPeriodEnd(item.period_end);
    setShowHistory(false);
  };

  // Auth Guard
  if (authLoading) {
    return <LoadingState label="Checking session…" />;
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6 animate-[fadeIn_150ms_ease-out]">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-linen flex items-center justify-center border border-linen-dark text-terracotta shadow-xs">
          <PenLine className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <SectionHeading
            eyebrow="Personal Synthesis"
            title="Weekly Review & Reflection"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-md mx-auto leading-relaxed">
            Look back at actual recorded experiences, examine unresolved choices, and preserve lessons without automated life coaching or productivity scores.
          </p>
        </div>

        <Card className="p-6 rounded-2xl sm:rounded-3xl border border-linen-dark bg-white shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-base font-bold text-charcoal">Sign in to reflect on your records</h2>
            <p className="text-xs text-slateink-light">
              Your weekly reviews and personal reflections are completely private to your authenticated workspace.
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

  const periodLabel = summary?.periodLabel || reflectionService.formatPeriodLabel(periodStart, periodEnd);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-[fadeIn_150ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-linen-dark/60">
        <div className="space-y-1.5">
          <SectionHeading
            eyebrow="Personal Synthesis"
            title="Reflection Workspace"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-2xl leading-relaxed">
            Review actual recorded moments from a selected period, write your observations, and preserve enduring lessons in your personal model. No streaks, no artificial productivity scores.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slateink-light">
            <span className="inline-flex items-center gap-1 bg-linen px-2.5 py-0.5 rounded-full border border-linen-dark/60 text-slateink font-medium">
              <Clock className="w-3 h-3 text-terracotta" />
              <span>Timezone: {userTimezone}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-sage-dark" />
              <span>Owner-scoped & private</span>
            </span>
          </div>
        </div>

        {/* Previous Reviews History Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowHistory((h) => !h)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-linen-dark/80 bg-white hover:bg-linen/60 text-charcoal shadow-2xs transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-terracotta" />
            <span>Saved Reviews ({historyList.length})</span>
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

      {/* Past Reviews Drawer / Modal */}
      {showHistory && (
        <Card className="p-5 rounded-3xl border border-linen-dark bg-white shadow-lifted space-y-3 animate-[fadeIn_100ms_ease-out]">
          <div className="flex items-center justify-between border-b border-linen-dark/60 pb-2.5">
            <div className="flex items-center gap-2 text-charcoal font-semibold text-xs sm:text-sm">
              <History className="w-4 h-4 text-terracotta" />
              <span>Previous Saved Reviews</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-slateink hover:text-charcoal p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {historyList.length === 0 ? (
            <p className="text-xs text-slateink py-4 text-center">
              No saved weekly reflections yet. Reflections you save for any period will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pt-1">
              {historyList.map((item) => {
                const label = reflectionService.formatPeriodLabel(item.period_start, item.period_end);
                const isActive =
                  new Date(item.period_start).getTime() === new Date(periodStart).getTime() &&
                  new Date(item.period_end).getTime() === new Date(periodEnd).getTime();

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectHistoryItem(item)}
                    className={`text-left p-3 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                      isActive
                        ? 'border-terracotta bg-terracotta/10 text-charcoal shadow-xs'
                        : 'border-linen-dark bg-linen/30 hover:bg-linen/60 text-slateink-dark'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-charcoal">{label}</span>
                      <span className="text-[10px] font-mono text-slateink-light">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slateink line-clamp-2">
                      {item.content || 'Guided prompt responses only.'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Period Selector Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-3xl bg-white border border-linen-dark shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateWeek(-1)}
            aria-label="Previous week"
            className="p-1.5 rounded-xl border border-linen-dark text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
            title="Previous Week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1 rounded-2xl bg-linen border border-linen-dark/60 text-charcoal font-semibold text-xs sm:text-sm">
            <Calendar className="w-3.5 h-3.5 text-terracotta" />
            <span>{periodLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => navigateWeek(1)}
            aria-label="Next week"
            className="p-1.5 rounded-xl border border-linen-dark text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
            title="Next Week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={jumpToCurrentWeek}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-terracotta hover:bg-terracotta/10 border border-terracotta/30 transition-colors cursor-pointer"
            >
              Jump to Current Week
            </button>
          )}

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              isSaved
                ? 'bg-sage-light/60 text-sage-dark border-sage-DEFAULT/30'
                : 'bg-linen text-slateink border-linen-dark'
            }`}
          >
            {isSaved ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            <span>{isSaved ? 'Saved for this period' : 'Unsaved draft'}</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left Column (Records Summary & Prompts) | Right Column (Reflection Editor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =========================================================================
            LEFT COLUMN: ACTUAL RECORDS & PROMPTS (5 Cols)
            ========================================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* Period Summary Card */}
          <Card className="p-5 rounded-3xl border border-linen-dark bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-terracotta" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal">
                  Recorded in this Period
                </h2>
              </div>
              <span className="text-[11px] text-slateink-light">
                {summary?.memories.length || 0} memories · {summary?.decisions.length || 0} decisions
              </span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slateink">
                Aggregating period records…
              </div>
            ) : summary?.isEmpty ? (
              <div className="p-4 rounded-2xl bg-linen/40 border border-linen-dark/50 text-center space-y-1.5">
                <p className="text-xs font-semibold text-charcoal">Quiet period</p>
                <p className="text-[11px] text-slateink leading-relaxed">
                  No memories, decisions, or belief updates were recorded during this week. You can write a free-form reflection below to capture memories you recall later.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
                {/* 1. Memories */}
                {summary && summary.memories.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slateink flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-terracotta" />
                      <span>Memories ({summary.memories.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {summary.memories.map((m) => (
                        <a
                          key={m.id}
                          href={`/memory/${m.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            navigateTo({ page: 'memory', id: m.id });
                          }}
                          className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-linen-dark/60 bg-linen/30 hover:bg-linen hover:border-terracotta/40 transition-all text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-semibold text-charcoal truncate">{m.title}</p>
                            <p className="text-[10px] text-slateink line-clamp-1">{m.content}</p>
                          </div>
                          <span className="text-[10px] text-slateink-light shrink-0 font-mono">
                            {new Date(m.occurred_at || m.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Decisions & Reflections */}
                {summary && summary.decisions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-linen-dark/50">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slateink flex items-center gap-1">
                      <Scale className="w-3 h-3 text-amberclay-dark" />
                      <span>Decisions ({summary.decisions.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {summary.decisions.map((d) => (
                        <a
                          key={d.id}
                          href={`/decision/${d.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            navigateTo({ page: 'decision', id: d.id });
                          }}
                          className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-linen-dark/60 bg-linen/30 hover:bg-linen hover:border-amberclay-DEFAULT/40 transition-all text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-semibold text-charcoal truncate">{d.title}</p>
                            {d.chosen_option && (
                              <p className="text-[10px] text-amberclay-dark">
                                Chosen: {d.chosen_option}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md ${
                              d.status === 'decided'
                                ? 'bg-sage-light/60 text-sage-dark'
                                : 'bg-linen text-slateink'
                            }`}
                          >
                            {d.status}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Beliefs & Evolution */}
                {summary && summary.beliefs.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-linen-dark/50">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slateink flex items-center gap-1">
                      <Compass className="w-3 h-3 text-sage-dark" />
                      <span>Belief Updates ({summary.beliefs.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {summary.beliefs.map((b) => (
                        <a
                          key={b.id}
                          href="/beliefs"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            navigateTo('beliefs');
                          }}
                          className="block p-2.5 rounded-xl border border-linen-dark/60 bg-linen/30 hover:bg-linen text-xs space-y-0.5"
                        >
                          <p className="font-semibold text-charcoal truncate">{b.statement}</p>
                          <p className="text-[10px] text-slateink">Current strength: {b.strength}%</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Confirmed Insights */}
                {summary && summary.insights.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-linen-dark/50">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slateink flex items-center gap-1">
                      <Lightbulb className="w-3 h-3 text-terracotta" />
                      <span>Confirmed Patterns ({summary.insights.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {summary.insights.map((i) => (
                        <div
                          key={i.id}
                          className="p-2.5 rounded-xl border border-linen-dark/60 bg-linen/30 text-xs space-y-0.5"
                        >
                          <p className="font-semibold text-charcoal">{i.title}</p>
                          <p className="text-[10px] text-slateink">{i.statement}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Evidence-Grounded Prompts */}
          <Card className="p-5 rounded-3xl border border-linen-dark bg-white shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-linen-dark/60 pb-2">
              <Sparkles className="w-4 h-4 text-amberclay-DEFAULT" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal">
                Grounded Reflection Questions
              </h2>
            </div>
            <p className="text-[11px] text-slateink leading-relaxed">
              These questions are rooted in your actual recorded moments from this week:
            </p>

            <div className="space-y-2.5 pt-1">
              {prompts.map((p, idx) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-2xl border border-linen-dark/80 bg-linen/25 space-y-2"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-charcoal leading-snug">
                      {idx + 1}. {p.question}
                    </p>
                    {p.sourceUrl && (
                      <a
                        href={p.sourceUrl}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          if (p.sourceType === 'memory' && p.sourceId) {
                            navigateTo({ page: 'memory', id: p.sourceId });
                          } else if (p.sourceType === 'decision' && p.sourceId) {
                            navigateTo({ page: 'decision', id: p.sourceId });
                          } else {
                            navigateTo('beliefs');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-terracotta hover:underline"
                      >
                        <span>Examine record: {p.sourceTitle}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="pt-1">
                    <input
                      type="text"
                      value={guidedAnswers[p.id] || ''}
                      onChange={(e) => handleAnswerChange(p.id, e.target.value)}
                      placeholder="Optional brief answer…"
                      className="w-full h-8 px-2.5 rounded-xl border border-linen-dark/80 bg-white text-xs text-charcoal focus:outline-none focus:border-terracotta shadow-2xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: FOCUSED REFLECTION EDITOR (7 Cols)
            ========================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-6 rounded-3xl border border-linen-dark bg-white shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-linen-dark/60 pb-3">
              <div className="space-y-0.5">
                <h2 className="font-serif text-lg font-bold text-charcoal">
                  Your Reflection Notes
                </h2>
                <p className="text-xs text-slateink">
                  Preserve your own words, perspective, and meaning.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveReflection}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-charcoal text-paper hover:bg-slateink-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Save className={`w-3.5 h-3.5 text-terracotta-light ${saving ? 'animate-pulse' : ''}`} />
                  <span>{saving ? 'Saving…' : 'Save Weekly Review'}</span>
                </button>
              </div>
            </div>

            {/* Free-form reflection text area */}
            <div className="space-y-2">
              <label htmlFor="reflection-content" className="block text-xs font-bold text-charcoal uppercase tracking-wider">
                Overall Synthesis & Key Observations
              </label>
              <textarea
                id="reflection-content"
                rows={9}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setIsSaved(false);
                }}
                placeholder="What was the core theme of this week? What did you discover about your energy, decisions, or priorities? Write freely without pressure for perfection…"
                className="w-full p-4 rounded-2xl border border-linen-dark/80 bg-linen/20 text-xs sm:text-sm text-charcoal placeholder:text-slateink focus:outline-none focus:border-terracotta focus:bg-white transition-all shadow-inner leading-relaxed resize-y"
              />
            </div>

            {/* Belief & Lesson Preservation Section */}
            <div className="pt-2 border-t border-linen-dark/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-sage-dark" />
                    <span>Preserve a Lasting Lesson</span>
                  </h3>
                  <p className="text-[11px] text-slateink">
                    Propose a principle or value update for your personal model.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBeliefProposal((s) => !s)}
                  className="px-2.5 py-1 rounded-xl text-xs font-semibold border border-linen-dark bg-white hover:bg-linen/60 text-charcoal transition-colors cursor-pointer shadow-2xs"
                >
                  {showBeliefProposal ? 'Cancel Proposal' : '+ Propose Lesson'}
                </button>
              </div>

              {showBeliefProposal && (
                <div className="p-4 rounded-2xl border border-sage-DEFAULT/30 bg-sage-light/20 space-y-3 animate-[fadeIn_100ms_ease-out]">
                  <div className="space-y-1">
                    <label htmlFor="belief-statement-input" className="text-xs font-semibold text-charcoal">
                      Principle Statement
                    </label>
                    <input
                      id="belief-statement-input"
                      type="text"
                      value={beliefStatement}
                      onChange={(e) => setBeliefStatement(e.target.value)}
                      placeholder="e.g. Deliberate isolation before sprint releases protects architectural clarity."
                      className="w-full h-9 px-3 rounded-xl border border-linen-dark/80 bg-white text-xs text-charcoal focus:outline-none focus:border-terracotta shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="belief-rationale-input" className="text-xs font-semibold text-charcoal">
                      Rationale / Origin Context
                    </label>
                    <input
                      id="belief-rationale-input"
                      type="text"
                      value={beliefRationale}
                      onChange={(e) => setBeliefRationale(e.target.value)}
                      placeholder="Why does this matter based on this week's experiences?"
                      className="w-full h-9 px-3 rounded-xl border border-linen-dark/80 bg-white text-xs text-charcoal focus:outline-none focus:border-terracotta shadow-2xs"
                    />
                  </div>

                  <p className="text-[10px] text-slateink-dark flex items-center gap-1">
                    <Info className="w-3 h-3 text-slateink shrink-0" />
                    <span>
                      This will be submitted to your Review Center as a pending suggestion. It will never silently overwrite existing beliefs without your explicit approval.
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Save Bar */}
            <div className="pt-3 border-t border-linen-dark/60 flex items-center justify-between text-xs text-slateink">
              <span className="font-mono text-[11px]">
                {reflectionId ? `Reflection ID: ${reflectionId.slice(0, 8)}…` : 'New Review'}
              </span>

              <button
                type="button"
                onClick={handleSaveReflection}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-charcoal text-paper hover:bg-slateink-dark text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <Save className={`w-3.5 h-3.5 text-terracotta-light ${saving ? 'animate-pulse' : ''}`} />
                <span>{saving ? 'Saving…' : 'Save Weekly Review'}</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
