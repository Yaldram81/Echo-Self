import { useEffect, useState } from 'react';
import { X, Plus, ChevronDown, ChevronUp, Loader2, Sparkles, Scale } from 'lucide-react';
import { decisionsService } from '@/lib/services';
import type { Decision, DecisionInput } from '@/lib/types';

export function DecisionForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: Decision;
  onSaved: (saved: Decision) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [context, setContext] = useState(existing?.context ?? '');
  const [constraints, setConstraints] = useState(existing?.constraints ?? '');
  const [uncertainties, setUncertainties] = useState(existing?.uncertainties ?? '');
  const [success, setSuccess] = useState(existing?.success_definition ?? '');
  const [values, setValues] = useState<string[]>(existing?.values ?? []);
  const [newValue, setNewValue] = useState('');
  const [optionLabels, setOptionLabels] = useState<string[]>(
    existing?.options.map((o) => o.label) ?? ['', '']
  );
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(existing?.constraints || existing?.uncertainties || existing?.success_definition)
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const valid = title.trim() && context.trim() && optionLabels.filter((o) => o.trim()).length >= 2;

  function addValue() {
    const v = newValue.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 24);
    if (v && !values.includes(v) && values.length < 6) {
      setValues([...values, v]);
    }
    setNewValue('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    const input: DecisionInput = {
      title: title.trim(),
      context: context.trim(),
      constraints: constraints.trim(),
      uncertainties: uncertainties.trim(),
      values,
      success_definition: success.trim(),
      options: optionLabels
        .filter((o) => o.trim())
        .map((label) => ({ label: label.trim(), pros: [], cons: [] })),
    };
    try {
      const saved = existing
        ? (await decisionsService.update(existing.id, input), { ...existing, ...input })
        : await decisionsService.create(input);
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the decision.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-charcoal/45 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-paper-soft border border-linen-dark/90 shadow-2xl overflow-hidden animate-[scaleIn_150ms_ease-out]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-linen-dark/60 bg-paper">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-terracotta-deep font-semibold">Deliberation</p>
              <h2 id="decision-form-title" className="font-serif text-lg sm:text-xl font-bold text-charcoal leading-tight">
                {existing ? 'Edit decision' : 'Open a new decision'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <div>
            <label htmlFor="d-title" className="block text-xs font-semibold text-charcoal mb-1">
              What are you deciding? <span className="text-terracotta">*</span>
            </label>
            <input
              id="d-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={140}
              className="w-full rounded-xl border border-linen-dark bg-white/90 px-3.5 py-2 text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all"
              placeholder="e.g. Take the new role or stay with the team?"
            />
          </div>

          <div>
            <label htmlFor="d-context" className="block text-xs font-semibold text-charcoal mb-1">
              Context: what makes this hard? <span className="text-terracotta">*</span>
            </label>
            <textarea
              id="d-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              required
              rows={3}
              className="w-full rounded-xl border border-linen-dark bg-white/90 px-3.5 py-2 text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all"
              placeholder="What is at stake? Who is impacted, and what are the competing factors?"
            />
          </div>

          {/* Options on the scale */}
          <div className="rounded-2xl border border-linen-dark/70 bg-linen/25 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-charcoal">
                Options on the scale <span className="text-slateink-light font-normal">(at least 2)</span>
              </label>
              {optionLabels.length < 4 && (
                <button
                  type="button"
                  onClick={() => setOptionLabels([...optionLabels, ''])}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-terracotta hover:text-terracotta-dark"
                >
                  <Plus className="w-3 h-3" /> Add option
                </button>
              )}
            </div>

            <div className="space-y-2">
              {optionLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white border border-linen-dark/80 flex items-center justify-center text-[10px] font-bold text-slateink font-mono shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    value={label}
                    onChange={(e) => {
                      const next = [...optionLabels];
                      next[i] = e.target.value;
                      setOptionLabels(next);
                    }}
                    className="flex-1 rounded-xl border border-linen-dark bg-white/90 px-3 py-1.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    aria-label={`Option ${i + 1}`}
                  />
                  {optionLabels.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptionLabels(optionLabels.filter((_, j) => j !== i))}
                      aria-label={`Remove option ${i + 1}`}
                      className="p-1 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Relevant Values */}
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">
              Personal values at stake <span className="text-slateink-light font-normal">(up to 6)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 border border-terracotta/20 px-2.5 py-0.5 text-xs text-terracotta-deep font-medium"
                >
                  #{v}
                  <button
                    type="button"
                    onClick={() => setValues(values.filter((x) => x !== v))}
                    aria-label={`Remove value ${v}`}
                    className="hover:text-clayred-DEFAULT p-0.5 rounded-full"
                  >
                    <X className="w-3 h-3" aria-hidden />
                  </button>
                </span>
              ))}
              {values.length === 0 && (
                <span className="text-xs text-slateink-light italic py-0.5">No values linked yet.</span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slateink-light font-mono">#</span>
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addValue();
                    }
                  }}
                  className="w-full rounded-xl border border-linen-dark bg-white/90 pl-7 pr-3 py-1.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                  placeholder="e.g. autonomy, family, craft"
                  aria-label="Add a value"
                />
              </div>
              <button
                type="button"
                onClick={addValue}
                disabled={!newValue.trim() || values.length >= 6}
                className="inline-flex items-center gap-1 rounded-xl border border-linen-dark bg-white px-3 py-1.5 text-xs font-semibold text-charcoal hover:border-terracotta disabled:opacity-40 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden /> Add
              </button>
            </div>
          </div>

          {/* Collapsible Advanced Considerations */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slateink-dark hover:text-charcoal border-t border-linen-dark/50"
            >
              <span>More considerations (Constraints, Uncertainties, Success)</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-slateink-light" /> : <ChevronDown className="w-4 h-4 text-slateink-light" />}
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-2 animate-[fadeIn_120ms_ease-out]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="d-constraints" className="block text-xs font-medium text-slateink-dark mb-1">
                      Constraints (optional)
                    </label>
                    <textarea
                      id="d-constraints"
                      value={constraints}
                      onChange={(e) => setConstraints(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-linen-dark bg-white/90 px-3 py-1.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                      placeholder="Deadlines, finances, location…"
                    />
                  </div>
                  <div>
                    <label htmlFor="d-uncertainties" className="block text-xs font-medium text-slateink-dark mb-1">
                      Uncertainties (optional)
                    </label>
                    <textarea
                      id="d-uncertainties"
                      value={uncertainties}
                      onChange={(e) => setUncertainties(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-linen-dark bg-white/90 px-3 py-1.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                      placeholder="What is unknown or uncontrollable…"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="d-success" className="block text-xs font-medium text-slateink-dark mb-1">
                    Definition of success (optional)
                  </label>
                  <textarea
                    id="d-success"
                    value={success}
                    onChange={(e) => setSuccess(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-linen-dark bg-white/90 px-3 py-1.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all"
                    placeholder="Describe what a great outcome looks like one year from now."
                  />
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
              {formError}
            </p>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-3 border-t border-linen-dark/60 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium text-slateink-dark hover:bg-linen/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-terracotta px-5 py-2 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : existing ? (
                'Save changes'
              ) : (
                'Open decision'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
