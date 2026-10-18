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
} from 'lucide-react';
import { decisionsService, beliefsService } from '@/lib/services';
import { navigateTo } from '@/lib/router';
import type { Decision, DecisionInput, DecisionOption } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui';

interface OptionDraft {
  label: string;
  pros: string[];
  cons: string[];
}

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

  // Temporary pro/con input state per option index
  const [proInputs, setProInputs] = useState<Record<number, string>>({});
  const [conInputs, setConInputs] = useState<Record<number, string>>({});

  // User's existing core beliefs and values for 1-click tagging
  const [userCoreValues, setUserCoreValues] = useState<string[]>([]);

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
          // Add single-word or short phrases from statements
          const words = b.statement
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .split(/\s+/)
            .filter((w) => w.length >= 4 && w.length <= 16);
          words.slice(0, 2).forEach((w) => found.add(w));
        }
        // Add popular deliberation archetypes if sparse
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

    const input: DecisionInput = {
      title: title.trim(),
      context: context.trim(),
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
    <div className="max-w-3xl mx-auto space-y-6 pb-32 sm:pb-24">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <a
          href={mode === 'edit' && decisionId ? `/decision/${decisionId}` : '/decisions'}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{mode === 'edit' ? 'Back to deliberation' : 'Back to Decision Mirror'}</span>
        </a>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!valid || saving}
            className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 sm:px-5 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
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

      {/* Header Banner */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-terracotta-deep font-semibold">Deliberation Workspace</span>
          <span className="text-[10px] font-bold text-slateink-light bg-linen/70 px-2 py-0.5 rounded-full">
            {mode === 'edit' ? 'Editing setup' : 'New deliberation'}
          </span>
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-charcoal">
          {mode === 'edit' ? 'Refine Decision Setup' : 'Open a New Decision'}
        </h1>
        <p className="text-xs sm:text-sm text-slateink leading-relaxed">
          Articulate the dilemma, name the competing paths, and ground them in your personal values. EchoSelf will weigh the options transparently against your recorded experiences.
        </p>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-4 py-2.5 text-xs sm:text-sm text-clayred-DEFAULT">
          {formError}
        </p>
      )}

      {/* Section 1: The Dilemma & Context */}
      <section className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-linen-dark/40 pb-2.5">
          <Scale className="w-4 h-4 text-terracotta" />
          <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">The Dilemma & The Stakes</h2>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
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
            className="w-full rounded-xl border border-linen-dark bg-white/95 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all"
            placeholder="e.g. Take the new role or stay with the four-person platform team?"
          />
        </div>

        <div>
          <label htmlFor="d-context" className="block text-xs font-semibold text-charcoal mb-1">
            Context & Tension: what makes this hard? <span className="text-terracotta">*</span>
          </label>
          <textarea
            id="d-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            required
            rows={3}
            className="w-full rounded-xl border border-linen-dark bg-white/95 px-3.5 py-2.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all"
            placeholder="What is at stake? Who else is affected? What are the emotional or practical trade-offs you are grappling with?"
          />
        </div>
      </section>

      {/* Section 2: Competing Options on the Scale */}
      <section className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-linen-dark/40 pb-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-terracotta" />
            <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">Options on the Scale</h2>
          </div>
          <span className="text-[11px] text-slateink-light font-medium">At least 2 options required</span>
        </div>

        <p className="text-xs text-slateink">
          List the distinct paths you are weighing. You can optionally add key pros and cons to give your twin richer context for preference alignment.
        </p>

        <div className="space-y-3.5">
          {options.map((opt, optIdx) => (
            <div
              key={optIdx}
              className="rounded-xl border border-linen-dark/70 bg-white/80 p-3.5 sm:p-4 space-y-3 transition-all hover:border-linen-dark"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-paper border border-linen-dark flex items-center justify-center text-xs font-bold text-terracotta-deep font-mono shrink-0 shadow-2xs">
                  {String.fromCharCode(65 + optIdx)}
                </span>
                <input
                  value={opt.label}
                  onChange={(e) => updateOptionLabel(optIdx, e.target.value)}
                  className="flex-1 rounded-xl border border-linen-dark bg-white px-3 py-2 text-xs sm:text-sm font-medium text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                  placeholder={`Option ${String.fromCharCode(65 + optIdx)}: e.g. Accept the promotion`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(optIdx)}
                    className="p-1.5 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/40 transition-colors"
                    title="Remove this option"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Pros & Cons per option */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Pros */}
                <div className="rounded-lg bg-sage/10 border border-sage/20 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-sage-dark">
                    <ThumbsUp className="w-3 h-3 text-sage-dark" />
                    <span>Potential upsides (Pros)</span>
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
                      className="flex-1 h-6 rounded-md border border-sage/30 bg-white/90 px-2 text-[10px] text-charcoal placeholder:text-slateink-light focus:outline-none"
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

                {/* Cons */}
                <div className="rounded-lg bg-clayred-light/30 border border-clayred-light/50 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-clayred-DEFAULT">
                    <ThumbsDown className="w-3 h-3 text-clayred-DEFAULT" />
                    <span>Trade-offs & downsides (Cons)</span>
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
                      placeholder="+ Add downside…"
                      className="flex-1 h-6 rounded-md border border-clayred-light bg-white/90 px-2 text-[10px] text-charcoal placeholder:text-slateink-light focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addCon(optIdx)}
                      className="h-6 px-2 rounded-md bg-clayred-light/50 text-clayred-DEFAULT text-[10px] font-semibold hover:bg-clayred-light"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {options.length < 4 && (
            <button
              type="button"
              onClick={addOption}
              className="w-full py-2.5 rounded-xl border border-dashed border-linen-dark hover:border-terracotta bg-white/50 hover:bg-white text-xs font-semibold text-terracotta transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add another option (up to 4)
            </button>
          )}
        </div>
      </section>

      {/* Section 3: Guiding Personal Values */}
      <section className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-linen-dark/40 pb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-terracotta" />
            <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">Guiding Personal Values</h2>
          </div>
          <span className="text-[11px] text-slateink-light font-medium">{values.length}/6 linked</span>
        </div>

        <p className="text-xs text-slateink">
          Which core principles or priorities are tested by this dilemma? The twin uses these values to calculate alignment scores for each option.
        </p>

        {/* Selected Values Chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center p-2 rounded-xl bg-linen/25 border border-linen-dark/50">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/15 border border-terracotta/25 px-2.5 py-1 text-xs text-terracotta-deep font-semibold"
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
            <span className="text-xs text-slateink-light italic">No values selected yet. Tap suggestions below or type a custom value.</span>
          )}
        </div>

        {/* Quick Tappable Value Suggestions */}
        {userCoreValues.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-slateink-light uppercase tracking-wider">Suggested from your personal model:</p>
            <div className="flex flex-wrap gap-1.5">
              {userCoreValues.map((suggestion) => {
                const active = values.includes(suggestion);
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => toggleValue(suggestion)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'bg-terracotta text-paper shadow-2xs font-semibold'
                        : 'bg-white border border-linen-dark/70 text-slateink hover:border-terracotta hover:text-charcoal'
                    }`}
                  >
                    #{suggestion}
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
              placeholder="Add custom value (e.g. autonomy, craftsmanship)…"
              className="w-full rounded-xl border border-linen-dark bg-white/95 pl-7 pr-3 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
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

      {/* Section 4: Constraints & Uncertainties */}
      <section className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-linen-dark/40 pb-2.5">
          <AlertTriangle className="w-4 h-4 text-terracotta" />
          <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">Reality Checks: Constraints & Uncertainties</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="d-constraints" className="block text-xs font-semibold text-charcoal mb-1">
              Hard Constraints <span className="text-slateink-light font-normal">(optional)</span>
            </label>
            <textarea
              id="d-constraints"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-linen-dark bg-white/95 px-3 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
              placeholder="Firm deadlines, financial requirements, geographic limits, family commitments…"
            />
          </div>

          <div>
            <label htmlFor="d-uncertainties" className="block text-xs font-semibold text-charcoal mb-1">
              Uncertainties & Unknowns <span className="text-slateink-light font-normal">(optional)</span>
            </label>
            <textarea
              id="d-uncertainties"
              value={uncertainties}
              onChange={(e) => setUncertainties(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-linen-dark bg-white/95 px-3 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
              placeholder="What don't you know yet? What assumptions are you making? What is outside your control?"
            />
          </div>
        </div>
      </section>

      {/* Section 5: Definition of Success */}
      <section className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-linen-dark/40 pb-2.5">
          <Eye className="w-4 h-4 text-terracotta" />
          <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">Definition of Success</h2>
        </div>

        <div>
          <label htmlFor="d-success" className="block text-xs font-semibold text-charcoal mb-1">
            The Pre-Mortem: What does a great outcome look like? <span className="text-slateink-light font-normal">(optional)</span>
          </label>
          <textarea
            id="d-success"
            value={success}
            onChange={(e) => setSuccess(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-linen-dark bg-white/95 px-3.5 py-2 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
            placeholder="Imagine it is one year from now. What indicates that your choice was grounded and sound, regardless of short-term friction?"
          />
        </div>
      </section>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-paper/95 backdrop-blur-md border-t border-linen-dark/80 px-4 py-3 sm:py-3.5 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-slateink hidden sm:block">
            {!valid ? (
              <span className="text-clayred-DEFAULT">Requires dilemma title, context, and 2 named options.</span>
            ) : (
              <span className="text-sage-dark font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Ready to deliberate ({options.filter((o) => o.label.trim()).length} options, {values.length} values)
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <a
              href={mode === 'edit' && decisionId ? `/decision/${decisionId}` : '/decisions'}
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium text-slateink-dark hover:bg-linen/70 transition-colors"
            >
              Cancel
            </a>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!valid || saving}
              className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-5 sm:px-6 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98"
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
