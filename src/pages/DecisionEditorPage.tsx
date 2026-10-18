import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Scale,
  Plus,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Eye,
  Loader2,
  Sparkles,
  Layers,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Briefcase,
  Users,
  Compass,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { decisionsService, beliefsService } from '@/lib/services';
import { geminiService, type GeminiDecisionDraft } from '@/lib/geminiService';
import { navigateTo } from '@/lib/router';
import type { Decision, DecisionInput, DecisionOption } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui';

interface OptionDraft {
  label: string;
  pros: string[];
  cons: string[];
}

const CATEGORIES = [
  'Career & Work',
  'Relationships & Family',
  'Health & Wellbeing',
  'Finance & Wealth',
  'Relocation & Living',
  'Personal Growth',
  'Creative & Projects',
  'Other',
] as const;

const TIMELINES = [
  'Immediate (This week)',
  'Within 1 month',
  '1 to 3 months',
  '6+ months',
  'Open exploration',
] as const;

const SAMPLE_PROMPTS = [
  {
    title: 'Career Dilemma',
    prompt:
      "I've been offered a VP role with a 35% salary increase, but it requires 60+ hour weeks and frequent travel. My current job gives me great work-life balance and time for my young daughter, but limited financial growth. What should I do?",
  },
  {
    title: 'Relocation vs Roots',
    prompt:
      "My partner wants to move closer to her aging parents in another state. I love our current community and my local network, but I want to support her family and reduce her travel stress. How do we weigh this?",
  },
  {
    title: 'Startup vs Stability',
    prompt:
      "A former colleague invited me to co-found a B2B SaaS startup with 12 months of runway. Leaving my stable tech job means giving up unvested equity and healthcare stability, but staying feels like I'm stagnating in my craft.",
  },
];

export function DecisionEditorPage({
  mode,
  decisionId,
}: {
  mode: 'new' | 'edit';
  decisionId?: string;
}) {
  const [loadingInitial, setLoadingInitial] = useState(mode === 'edit');
  const [initialError, setInitialError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [timeline, setTimeline] = useState<string>(TIMELINES[2]);
  const [stakeholders, setStakeholders] = useState('');
  const [context, setContext] = useState('');
  const [constraints, setConstraints] = useState('');
  const [uncertainties, setUncertainties] = useState('');
  const [success, setSuccess] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [newValueInput, setNewValueInput] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([
    { label: '', pros: [], cons: [] },
    { label: '', pros: [], cons: [] },
  ]);

  // Pro/Con input fields per option
  const [proInputs, setProInputs] = useState<Record<number, string>>({});
  const [conInputs, setConInputs] = useState<Record<number, string>>({});

  // User's existing core beliefs and values for 1-click tagging
  const [userCoreValues, setUserCoreValues] = useState<string[]>([]);

  // AI Assistant State
  const [showAiMode, setShowAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState(geminiService.getApiKey());
  const [showKeyConfig, setShowKeyConfig] = useState(!geminiService.getApiKey());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch initial decision if editing
  useEffect(() => {
    if (mode === 'edit' && decisionId) {
      setLoadingInitial(true);
      decisionsService
        .get(decisionId)
        .then((d) => {
          if (!d) {
            setInitialError('Decision not found. It may have been deleted.');
            return;
          }
          setTitle(d.title);
          setContext(d.context);
          setConstraints(d.constraints ?? '');
          setUncertainties(d.uncertainties ?? '');
          setSuccess(d.success_definition ?? '');
          setValues(d.values ?? []);
          setOptions(
            d.options && d.options.length >= 2
              ? d.options.map((o) => ({
                  label: o.label,
                  pros: o.pros ?? [],
                  cons: o.cons ?? [],
                }))
              : [
                  { label: '', pros: [], cons: [] },
                  { label: '', pros: [], cons: [] },
                ]
          );
        })
        .catch((err) => {
          setInitialError(err instanceof Error ? err.message : 'Failed to load decision.');
        })
        .finally(() => setLoadingInitial(false));
    }
  }, [mode, decisionId]);

  // Fetch user's registered values/beliefs for quick suggestions
  useEffect(() => {
    beliefsService
      .listWithHistory()
      .then((list) => {
        const found = new Set<string>();
        for (const b of list) {
          const words = b.statement
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .split(/\s+/)
            .filter((w) => w.length >= 4 && w.length <= 16);
          words.slice(0, 2).forEach((w) => found.add(w));
        }
        ['autonomy', 'family', 'growth', 'craft', 'health', 'financial-security', 'freedom', 'integrity'].forEach(
          (v) => found.add(v)
        );
        setUserCoreValues(Array.from(found).slice(0, 10));
      })
      .catch(() => {
        setUserCoreValues(['autonomy', 'family', 'growth', 'craft', 'health', 'freedom']);
      });
  }, []);

  // Validation
  const valid = useMemo(() => {
    const hasTitle = title.trim().length > 0;
    const hasContext = context.trim().length > 0;
    const namedOptions = options.filter((o) => o.label.trim().length > 0);
    return hasTitle && hasContext && namedOptions.length >= 2;
  }, [title, context, options]);

  // Option Handlers
  function updateOptionLabel(index: number, label: string) {
    const updated = [...options];
    updated[index] = { ...updated[index], label };
    setOptions(updated);
  }

  function addOption() {
    if (options.length < 4) {
      setOptions([...options, { label: '', pros: [], cons: [] }]);
    }
  }

  function removeOption(index: number) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  function addPro(optionIdx: number) {
    const val = (proInputs[optionIdx] ?? '').trim();
    if (!val) return;
    const updated = [...options];
    updated[optionIdx] = {
      ...updated[optionIdx],
      pros: [...updated[optionIdx].pros, val],
    };
    setOptions(updated);
    setProInputs({ ...proInputs, [optionIdx]: '' });
  }

  function removePro(optionIdx: number, proIdx: number) {
    const updated = [...options];
    updated[optionIdx] = {
      ...updated[optionIdx],
      pros: updated[optionIdx].pros.filter((_, i) => i !== proIdx),
    };
    setOptions(updated);
  }

  function addCon(optionIdx: number) {
    const val = (conInputs[optionIdx] ?? '').trim();
    if (!val) return;
    const updated = [...options];
    updated[optionIdx] = {
      ...updated[optionIdx],
      cons: [...updated[optionIdx].cons, val],
    };
    setOptions(updated);
    setConInputs({ ...conInputs, [optionIdx]: '' });
  }

  function removeCon(optionIdx: number, conIdx: number) {
    const updated = [...options];
    updated[optionIdx] = {
      ...updated[optionIdx],
      cons: updated[optionIdx].cons.filter((_, i) => i !== conIdx),
    };
    setOptions(updated);
  }

  // Values Handlers
  function toggleValue(val: string) {
    const clean = val.toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 24);
    if (!clean) return;
    if (values.includes(clean)) {
      setValues(values.filter((v) => v !== clean));
    } else if (values.length < 6) {
      setValues([...values, clean]);
    }
  }

  function handleCustomValueSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = newValueInput.toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 24);
    if (clean && !values.includes(clean) && values.length < 6) {
      setValues([...values, clean]);
      setNewValueInput('');
    }
  }

  // AI Structure with Gemini
  async function handleAiStructure() {
    if (!aiPrompt.trim()) return;
    const key = geminiService.getApiKey();
    if (!key) {
      setAiError('Gemini API key is not configured. Please add your key in Settings to use the AI Deliberation Assistant.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiSuccessMessage(null);

    try {
      const draft: GeminiDecisionDraft = await geminiService.structureDecision(aiPrompt);

      // Populate form fields
      if (draft.title) setTitle(draft.title);
      if (draft.context) setContext(draft.context);
      if (draft.constraints) setConstraints(draft.constraints);
      if (draft.uncertainties) setUncertainties(draft.uncertainties);
      if (draft.success_definition) setSuccess(draft.success_definition);
      if (Array.isArray(draft.values) && draft.values.length > 0) {
        setValues(draft.values.slice(0, 6));
      }
      if (Array.isArray(draft.options) && draft.options.length >= 2) {
        setOptions(
          draft.options.slice(0, 4).map((o) => ({
            label: o.label,
            pros: Array.isArray(o.pros) ? o.pros : [],
            cons: Array.isArray(o.cons) ? o.cons : [],
          }))
        );
      }

      setAiSuccessMessage('Gemini successfully parsed your dilemma! Review and customize the fields below.');
      setShowAiMode(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not structure with Gemini.');
    } finally {
      setAiLoading(false);
    }
  }

  // Save / Submit
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);

    const namedOptions: DecisionOption[] = options
      .filter((o) => o.label.trim().length > 0)
      .map((o) => ({
        label: o.label.trim(),
        pros: o.pros,
        cons: o.cons,
      }));

    // Enrich context with category and timeline if set
    let enrichedContext = context.trim();
    const metaNotes: string[] = [];
    if (category) metaNotes.push(`Category: ${category}`);
    if (timeline) metaNotes.push(`Timeline: ${timeline}`);
    if (stakeholders.trim()) metaNotes.push(`Stakeholders: ${stakeholders.trim()}`);
    if (metaNotes.length > 0 && !enrichedContext.includes('Category:')) {
      enrichedContext = `${enrichedContext}\n\n[${metaNotes.join(' · ')}]`;
    }

    const input: DecisionInput = {
      title: title.trim(),
      context: enrichedContext,
      constraints: constraints.trim(),
      uncertainties: uncertainties.trim(),
      values,
      success_definition: success.trim(),
      options: namedOptions,
    };

    try {
      if (mode === 'edit' && decisionId) {
        await decisionsService.update(decisionId, input);
        navigateTo({ page: 'decision', id: decisionId });
      } else {
        const created = await decisionsService.create(input);
        navigateTo({ page: 'decision', id: created.id });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save decision.');
      setSaving(false);
    }
  }

  if (loadingInitial) {
    return <LoadingState label="Loading decision setup…" />;
  }

  if (initialError) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-8">
        <a href="/decisions" className="inline-flex items-center gap-1.5 text-xs text-slateink hover:text-charcoal transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to decisions
        </a>
        <ErrorState message={initialError} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 pb-20">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-linen-dark/60 pb-4">
        <div className="flex items-center gap-3">
          <a
            href={mode === 'edit' && decisionId ? `/decision/${decisionId}` : '/decisions'}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{mode === 'edit' ? 'Back to deliberation' : 'Back to Decision Mirror'}</span>
          </a>
          <span className="text-slateink-light/40">/</span>
          <span className="text-xs sm:text-sm font-semibold text-charcoal">
            {mode === 'edit' ? 'Edit Setup' : 'New Decision'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {/* AI Mode Toggle Button */}
          <button
            type="button"
            onClick={() => setShowAiMode((v) => !v)}
            className={`inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border px-4 text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer ${
              showAiMode
                ? 'border-terracotta bg-terracotta text-paper shadow-sm'
                : 'border-terracotta/40 bg-terracotta/10 text-terracotta-deep hover:bg-terracotta/20 hover:border-terracotta'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Deliberation Assistant</span>
          </button>
        </div>
      </div>

      {/* AI Success Notification */}
      {aiSuccessMessage && (
        <div className="p-3 sm:p-4 rounded-2xl bg-sage/15 border border-sage/30 flex items-center justify-between gap-3 text-xs sm:text-sm text-sage-dark font-medium animate-[fadeIn_150ms_ease-out]">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-sage-dark shrink-0" />
            <span>{aiSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiSuccessMessage(null)}
            className="p-1 hover:text-charcoal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* AI Assistant Mode Card (Expands when clicked) */}
      {showAiMode && (
        <div className="p-5 sm:p-6 rounded-3xl bg-linear-to-br from-paper-soft via-white to-linen/30 border-2 border-terracotta/40 shadow-xl space-y-4 animate-[fadeIn_150ms_ease-out]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-terracotta/15 text-terracotta-deep flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-charcoal">Gemini Deliberation Assistant</h3>
                <p className="text-xs text-slateink">
                  Brain-dump your raw thoughts, doubts, and stakes. Gemini will structure your dilemma into options, pros/cons, constraints, and values for your review.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAiMode(false)}
              className="p-1.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. I got offered a job in another state with higher pay, but my family is rooted here. My current company has good stability, but I feel underpaid. I don't know how to choose between career acceleration and family continuity..."
              className="w-full rounded-2xl border border-linen-dark bg-white/95 p-3.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-inner"
            />
          </div>

          {/* Quick Starter Prompts */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slateink-light uppercase tracking-wider">Or try a sample dilemma:</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((sample, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAiPrompt(sample.prompt)}
                  className="rounded-full bg-white border border-linen-dark/80 px-3 py-1 text-xs text-slateink hover:border-terracotta hover:text-charcoal transition-all text-left"
                >
                  💡 {sample.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slateink-light pt-1 border-t border-linen-dark/40">
            <span>Powered by Google Gemini 2.5</span>
            <a href="/settings" className="text-terracotta hover:underline font-medium">
              Manage API key in Settings →
            </a>
          </div>

          {aiError && (
            <div className="p-3 rounded-xl bg-clayred-light text-xs text-clayred-DEFAULT flex items-center justify-between gap-2">
              <span>{aiError}</span>
              {aiError.includes('Settings') && (
                <a href="/settings" className="font-semibold underline shrink-0">
                  Open Settings
                </a>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowAiMode(false)}
              className="px-4 py-2 text-xs font-medium text-slateink hover:text-charcoal"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAiStructure}
              disabled={!aiPrompt.trim() || aiLoading}
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:opacity-50 transition-all shadow-xs cursor-pointer"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Structuring with Gemini…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze & Populate Fields</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {formError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-4 py-2.5 text-xs sm:text-sm text-clayred-DEFAULT">
          {formError}
        </p>
      )}

      {/* Main Full-Page 2-Column Responsive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Dilemma, Domain, Tension, Reality Checks & Success */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Core Dilemma & Emotional Stakes */}
          <section className="rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-5 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">The Dilemma & The Core Tension</h2>
                  <p className="text-[11px] text-slateink-light">State what you are deciding and what makes it difficult.</p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-terracotta-deep bg-terracotta/10 px-2.5 py-0.5 rounded-full">
                Primary
              </span>
            </div>

            {/* Title / Question */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="d-title" className="block text-xs font-semibold text-charcoal">
                  What are you deciding? <span className="text-terracotta">*</span>
                </label>
                <span className="text-[10px] text-slateink-light">{title.length}/140</span>
              </div>
              <input
                id="d-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={140}
                className="w-full rounded-2xl border border-linen-dark bg-white/95 px-4 py-3 text-sm font-medium text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-2xs"
                placeholder="e.g. Take the Seattle director promotion or keep building the platform team?"
              />
            </div>

            {/* Category & Timeline Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slateink-light" />
                  <span>Domain / Category</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 rounded-xl border border-linen-dark bg-white px-3 text-xs text-charcoal font-medium focus:border-terracotta focus:outline-none cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slateink-light" />
                  <span>Decision Horizon</span>
                </label>
                <select
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  className="w-full h-10 rounded-xl border border-linen-dark bg-white px-3 text-xs text-charcoal font-medium focus:border-terracotta focus:outline-none cursor-pointer"
                >
                  {TIMELINES.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stakeholders */}
            <div>
              <label htmlFor="d-stakeholders" className="block text-xs font-semibold text-charcoal mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slateink-light" />
                <span>Key Stakeholders <span className="text-slateink-light font-normal">(Who else has skin in the game?)</span></span>
              </label>
              <input
                id="d-stakeholders"
                value={stakeholders}
                onChange={(e) => setStakeholders(e.target.value)}
                placeholder="e.g. Partner, daughter, 4 platform engineers, leadership"
                className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none"
              />
            </div>

            {/* Context & Emotional Stakes */}
            <div>
              <label htmlFor="d-context" className="block text-xs font-semibold text-charcoal mb-1.5">
                Context & Stakes: what makes this hard? <span className="text-terracotta">*</span>
              </label>
              <textarea
                id="d-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                required
                rows={4}
                className="w-full rounded-2xl border border-linen-dark bg-white/95 p-3.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-2xs"
                placeholder="What is at stake? What are the conflicting loyalties, emotional pressures, financial realities, or fears driving this dilemma?"
              />
            </div>
          </section>

          {/* Card 2: Constraints & Uncertainties */}
          <section className="rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-5 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-linen-dark/50 pb-3">
              <div className="w-8 h-8 rounded-full bg-amberclay/15 text-amberclay-DEFAULT flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-charcoal">Reality Checks</h2>
                <p className="text-[11px] text-slateink-light">Distinguish immutable constraints from controllable risks.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="d-constraints" className="block text-xs font-semibold text-charcoal">
                  Hard Constraints <span className="text-slateink-light font-normal">(Non-negotiables)</span>
                </label>
                <textarea
                  id="d-constraints"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-linen-dark bg-white/95 p-3 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                  placeholder="Firm deadlines, financial floors, physical health limits, contractual obligations…"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="d-uncertainties" className="block text-xs font-semibold text-charcoal">
                  Uncertainties & Assumptions <span className="text-slateink-light font-normal">(Unknowns)</span>
                </label>
                <textarea
                  id="d-uncertainties"
                  value={uncertainties}
                  onChange={(e) => setUncertainties(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-linen-dark bg-white/95 p-3 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                  placeholder="What don't you know? What assumptions could be wrong? What depends on other people?"
                />
              </div>
            </div>
          </section>

          {/* Card 3: Success Definition (The Pre-Mortem) */}
          <section className="rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-5 sm:p-7 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2.5 border-b border-linen-dark/50 pb-3">
              <div className="w-8 h-8 rounded-full bg-sage/20 text-sage-dark flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-charcoal">Definition of Success (The Pre-Mortem)</h2>
                <p className="text-[11px] text-slateink-light">Clarify your evaluation criteria before emotions cloud hindsight.</p>
              </div>
            </div>

            <div>
              <label htmlFor="d-success" className="block text-xs font-semibold text-charcoal mb-1">
                How will you know 12 months from now that you made a sound choice?
              </label>
              <textarea
                id="d-success"
                value={success}
                onChange={(e) => setSuccess(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-linen-dark bg-white/95 p-3.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                placeholder="Imagine it is one year in the future. What concrete signals or inner peace tell you that this was the right path, regardless of normal friction?"
              />
            </div>
          </section>
        </div>

        {/* Right Column (5 cols): Options on Scale & Guiding Values */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 4: Competing Options on the Scale */}
          <section className="rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-5 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">Options on the Scale</h2>
                  <p className="text-[11px] text-slateink-light">At least 2 competing paths required.</p>
                </div>
              </div>

              {options.length < 4 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:text-terracotta-dark"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>

            <div className="space-y-4">
              {options.map((opt, optIdx) => (
                <div
                  key={optIdx}
                  className="rounded-2xl border border-linen-dark/80 bg-white/90 p-4 space-y-3 shadow-2xs hover:border-linen-dark transition-all"
                >
                  {/* Option Title Row */}
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-paper border border-linen-dark flex items-center justify-center text-xs font-bold text-terracotta-deep font-mono shrink-0 shadow-2xs">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <input
                      value={opt.label}
                      onChange={(e) => updateOptionLabel(optIdx, e.target.value)}
                      className="flex-1 rounded-xl border border-linen-dark bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none"
                      placeholder={`Option ${String.fromCharCode(65 + optIdx)} title`}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(optIdx)}
                        className="p-1 rounded-lg text-slateink-light hover:text-clayred-DEFAULT transition-colors"
                        title="Remove option"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Upsides / Pros */}
                  <div className="rounded-xl bg-sage/10 border border-sage/25 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-sage-dark">
                      <ThumbsUp className="w-3 h-3 text-sage-dark" />
                      <span>Key Upsides (Pros)</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {opt.pros.map((pro, pIdx) => (
                        <span
                          key={pIdx}
                          className="inline-flex items-center gap-1 rounded-md bg-white border border-sage/30 px-2 py-0.5 text-[10px] text-sage-dark font-medium"
                        >
                          {pro}
                          <button
                            type="button"
                            onClick={() => removePro(optIdx, pIdx)}
                            className="hover:text-clayred-DEFAULT"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-1 pt-0.5">
                      <input
                        value={proInputs[optIdx] ?? ''}
                        onChange={(e) => setProInputs({ ...proInputs, [optIdx]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addPro(optIdx);
                          }
                        }}
                        placeholder="+ Add upside…"
                        className="flex-1 h-6 rounded-md border border-sage/30 bg-white px-2 text-[10px] text-charcoal placeholder:text-slateink-light focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addPro(optIdx)}
                        className="h-6 px-2 rounded-md bg-sage/30 text-sage-dark text-[10px] font-semibold hover:bg-sage/40"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Downsides / Cons */}
                  <div className="rounded-xl bg-clayred-light/35 border border-clayred-light/60 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-clayred-DEFAULT">
                      <ThumbsDown className="w-3 h-3 text-clayred-DEFAULT" />
                      <span>Key Trade-offs (Cons)</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {opt.cons.map((con, cIdx) => (
                        <span
                          key={cIdx}
                          className="inline-flex items-center gap-1 rounded-md bg-white border border-clayred-light px-2 py-0.5 text-[10px] text-clayred-DEFAULT font-medium"
                        >
                          {con}
                          <button
                            type="button"
                            onClick={() => removeCon(optIdx, cIdx)}
                            className="hover:text-charcoal"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-1 pt-0.5">
                      <input
                        value={conInputs[optIdx] ?? ''}
                        onChange={(e) => setConInputs({ ...conInputs, [optIdx]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCon(optIdx);
                          }
                        }}
                        placeholder="+ Add trade-off…"
                        className="flex-1 h-6 rounded-md border border-clayred-light bg-white px-2 text-[10px] text-charcoal placeholder:text-slateink-light focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addCon(optIdx)}
                        className="h-6 px-2 rounded-md bg-clayred-light text-clayred-DEFAULT text-[10px] font-semibold hover:bg-clayred-light/70"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {options.length < 4 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="w-full py-2.5 rounded-2xl border border-dashed border-linen-dark hover:border-terracotta bg-white/50 hover:bg-white text-xs font-semibold text-terracotta transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another option (up to 4)
                </button>
              )}
            </div>
          </section>

          {/* Card 5: Guiding Personal Values */}
          <section className="rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-5 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">Guiding Personal Values</h2>
                  <p className="text-[11px] text-slateink-light">Principles that dictate your priority weighting.</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-terracotta-deep">{values.length}/6 linked</span>
            </div>

            {/* Selected Values Display */}
            <div className="flex flex-wrap gap-1.5 min-h-[36px] items-center p-2.5 rounded-2xl bg-linen/25 border border-linen-dark/60">
              {values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/15 border border-terracotta/25 px-3 py-1 text-xs text-terracotta-deep font-semibold"
                >
                  #{v}
                  <button
                    type="button"
                    onClick={() => toggleValue(v)}
                    className="hover:text-clayred-DEFAULT p-0.5 rounded-full"
                    aria-label={`Remove value ${v}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {values.length === 0 && (
                <span className="text-xs text-slateink-light italic">No values linked yet. Tap suggestions below.</span>
              )}
            </div>

            {/* Suggestions from Personal Model */}
            {userCoreValues.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-bold text-slateink-light uppercase tracking-wider">Suggested from your personal model:</p>
                <div className="flex flex-wrap gap-1.5">
                  {userCoreValues.map((val) => {
                    const active = values.includes(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => toggleValue(val)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                          active
                            ? 'bg-terracotta text-paper shadow-2xs font-semibold'
                            : 'bg-white border border-linen-dark/80 text-slateink hover:border-terracotta hover:text-charcoal'
                        }`}
                      >
                        #{val}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Value Adder */}
            <form onSubmit={handleCustomValueSubmit} className="flex gap-2 pt-1">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slateink-light font-mono select-none">#</span>
                <input
                  value={newValueInput}
                  onChange={(e) => setNewValueInput(e.target.value)}
                  placeholder="Add custom value (e.g. autonomy, family)…"
                  className="w-full rounded-xl border border-linen-dark bg-white pl-7 pr-3 py-2 text-xs text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!newValueInput.trim() || values.length >= 6}
                className="inline-flex items-center gap-1 rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs font-semibold text-charcoal hover:border-terracotta disabled:opacity-40 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* End-of-Form Action Dock (Scrolls into view naturally, never hidden by bottom bar) */}
      <div className="pt-6 pb-24 sm:pb-12 border-t border-linen-dark/60">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-paper-soft/90 border border-linen-dark/80 shadow-xs">
          <div className="text-xs text-slateink">
            {!valid ? (
              <span className="text-clayred-DEFAULT font-medium">
                Requires dilemma title, context, and at least 2 named options.
              </span>
            ) : (
              <span className="text-sage-dark font-medium flex items-center gap-1.5">
                <Check className="w-4 h-4 text-sage-dark" />
                <span>Ready to weigh ({options.filter((o) => o.label.trim()).length} options, {values.length} values)</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <a
              href={mode === 'edit' && decisionId ? `/decision/${decisionId}` : '/decisions'}
              className="rounded-full px-5 py-2.5 text-xs sm:text-sm font-medium text-slateink-dark hover:bg-linen/70 transition-colors text-center"
            >
              Cancel
            </a>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!valid || saving}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-terracotta px-7 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : mode === 'edit' ? (
                'Save changes'
              ) : (
                'Open decision'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
