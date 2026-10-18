import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { beliefsService } from '@/lib/services';
import type { Belief, BeliefInput } from '@/lib/types';

const POPULAR_CATEGORIES = ['personal', 'career', 'relationships', 'health', 'creative'];

export function BeliefForm({
  existing,
  defaultKind,
  onSaved,
  onCancel,
}: {
  existing?: Belief;
  defaultKind?: 'belief' | 'value';
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [statement, setStatement] = useState(existing?.statement ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [kind, setKind] = useState<'belief' | 'value'>(existing?.kind ?? defaultKind ?? 'belief');
  const [category, setCategory] = useState(existing?.category ?? 'personal');
  const [strength, setStrength] = useState(existing?.strength ?? 70);
  const [reviewed, setReviewed] = useState(
    (existing?.last_reviewed ?? new Date().toISOString()).slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const valid = statement.trim().length > 0;

  // Handle escape key to cancel and Cmd/Ctrl+Enter to submit
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && valid && !saving) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [valid, saving, statement, description, kind, category, strength, reviewed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    const input: BeliefInput = {
      statement: statement.trim(),
      description: description.trim(),
      kind,
      category: category.trim().toLowerCase() || 'personal',
      strength,
      last_reviewed: reviewed ? new Date(`${reviewed}T12:00:00`).toISOString() : null,
    };
    try {
      if (existing) {
        await beliefsService.update(existing.id, input);
      } else {
        await beliefsService.create(input);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the statement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-charcoal/50 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col rounded-2xl sm:rounded-3xl bg-paper border border-linen-dark/80 shadow-2xl overflow-hidden">
        {/* Fixed Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-linen-dark/60 flex items-center justify-between shrink-0 bg-paper">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-terracotta-deep">
              {existing ? 'Recalibrate' : 'New Principle'}
            </span>
            <h3 className="font-serif text-base sm:text-lg font-bold text-charcoal leading-tight">
              {existing ? 'Edit statement' : 'Add a belief or value'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
            aria-label="Close form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body - Scrollable & Flex-Shrinkable */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 sm:px-5 py-3 sm:py-4 overflow-y-auto space-y-3 flex-1 min-h-0 overscroll-contain">
            {/* Inline Kind Selector (Belief vs Value) */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-charcoal">Statement Type:</span>
              <div className="inline-flex p-0.5 rounded-full bg-linen/70 border border-linen-dark/60">
                <button
                  type="button"
                  onClick={() => setKind('belief')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    kind === 'belief'
                      ? 'bg-paper text-charcoal shadow-2xs'
                      : 'text-slateink hover:text-charcoal'
                  }`}
                >
                  💡 Belief (I believe…)
                </button>
                <button
                  type="button"
                  onClick={() => setKind('value')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    kind === 'value'
                      ? 'bg-terracotta text-paper shadow-2xs'
                      : 'text-slateink hover:text-charcoal'
                  }`}
                >
                  🧭 Value (I prize…)
                </button>
              </div>
            </div>

            {/* Statement Input */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="b-statement" className="text-xs font-semibold text-charcoal">
                  Statement <span className="text-clayred-DEFAULT">*</span>
                </label>
                <span className="text-[10px] text-slateink-light tabular-nums">{statement.length}/280</span>
              </div>
              <textarea
                id="b-statement"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                required
                rows={2}
                maxLength={280}
                className="w-full rounded-xl border border-linen-dark bg-white/95 p-2.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-2xs"
                placeholder={kind === 'belief' ? 'e.g. Long-term craft matters more than temporary acclaim.' : 'e.g. Intellectual honesty in relationships.'}
                autoFocus
              />
            </div>

            {/* Context / Provenance */}
            <div>
              <label htmlFor="b-description" className="block text-xs font-semibold text-charcoal mb-1">
                Context / Provenance <span className="text-[10px] font-normal text-slateink-light">(optional)</span>
              </label>
              <textarea
                id="b-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-linen-dark bg-white/95 p-2.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none transition-all shadow-2xs"
                placeholder="Where did this originate? What does it look like in practice?"
              />
            </div>

            {/* Category with Quick Tag Chips */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="b-category" className="text-xs font-semibold text-charcoal">
                  Category
                </label>
                <div className="flex flex-wrap gap-1">
                  {POPULAR_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-1.5 py-0.5 rounded-full text-[10px] transition-all cursor-pointer ${
                        category.toLowerCase() === cat
                          ? 'bg-terracotta/15 text-terracotta-deep font-semibold border border-terracotta/30'
                          : 'bg-linen/60 text-slateink hover:bg-linen hover:text-charcoal'
                      }`}
                    >
                      #{cat}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="b-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-8 sm:h-9 rounded-xl border border-linen-dark bg-white/95 px-3 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none"
                placeholder="e.g. personal, career, creative…"
              />
            </div>

            {/* Strength Slider & Reviewed Date in compact row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
              <div className="p-2 rounded-xl bg-linen/40 border border-linen-dark/60 space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="b-strength" className="text-[11px] font-semibold text-charcoal">
                    Conviction Strength:
                  </label>
                  <span className="text-[11px] font-bold text-terracotta-deep tabular-nums bg-terracotta/10 px-1.5 py-0.2 rounded-full">
                    {strength}/100
                  </span>
                </div>
                <input
                  id="b-strength"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-full accent-terracotta cursor-pointer h-1.5"
                />
              </div>

              <div className="p-2 rounded-xl bg-linen/40 border border-linen-dark/60 space-y-1">
                <label htmlFor="b-reviewed" className="block text-[11px] font-semibold text-charcoal">
                  Date Grounded / Reviewed
                </label>
                <input
                  id="b-reviewed"
                  type="date"
                  value={reviewed}
                  onChange={(e) => setReviewed(e.target.value)}
                  className="w-full h-7 rounded-lg border border-linen-dark bg-white px-2 text-xs text-charcoal focus:border-terracotta focus:outline-none"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
                {formError}
              </p>
            )}
          </div>

          {/* Fixed Footer - GUARANTEED VISIBLE ALWAYS */}
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-t border-linen-dark/70 bg-paper-soft/95 shrink-0 flex items-center justify-end gap-2.5 z-10">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 sm:px-5 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : existing ? (
                'Save changes'
              ) : (
                'Save statement'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
