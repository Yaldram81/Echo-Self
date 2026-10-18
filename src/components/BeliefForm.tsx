import { useEffect, useState } from 'react';
import { Sparkles, X, Check, Loader2 } from 'lucide-react';
import { beliefsService } from '@/lib/services';
import type { Belief, BeliefInput } from '@/lib/types';

const POPULAR_CATEGORIES = ['personal', 'career', 'relationships', 'health', 'finance', 'creative', 'family'];

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

  // Handle escape key to cancel
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-charcoal/40 backdrop-blur-xs overflow-y-auto animate-[fadeIn_150ms_ease-out]">
      <div className="relative w-full max-w-xl rounded-3xl bg-paper border border-linen-dark/80 shadow-2xl p-5 sm:p-7 space-y-4 my-auto">
        {/* Form Header */}
        <div className="flex items-start justify-between gap-3 border-b border-linen-dark/60 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-terracotta-deep">
                {existing ? 'Edit Principle' : 'Record Principle'}
              </span>
            </div>
            <h3 className="font-serif text-lg sm:text-xl font-bold text-charcoal">
              {existing ? 'Edit statement' : 'Add a belief or value'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            aria-label="Close form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slateink leading-relaxed">
          This record is grounded in your own identity. You can evolve or recalibrate its strength anytime.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kind Toggle (Belief vs Value) */}
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">Statement Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-linen/60 border border-linen-dark/60">
              <button
                type="button"
                onClick={() => setKind('belief')}
                className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  kind === 'belief'
                    ? 'bg-paper text-charcoal shadow-2xs'
                    : 'text-slateink hover:text-charcoal'
                }`}
              >
                <span>💡</span>
                <span>Belief (I believe…)</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('value')}
                className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  kind === 'value'
                    ? 'bg-terracotta text-paper shadow-2xs'
                    : 'text-slateink hover:text-charcoal'
                }`}
              >
                <span>🧭</span>
                <span>Value (I prize…)</span>
              </button>
            </div>
          </div>

          {/* Statement Input */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="b-statement" className="text-xs font-semibold text-charcoal">
                Statement <span className="text-clayred-DEFAULT">*</span>
              </label>
              <span className="text-[11px] text-slateink-light tabular-nums">{statement.length}/280</span>
            </div>
            <textarea
              id="b-statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              required
              rows={2}
              maxLength={280}
              className="w-full rounded-2xl border border-linen-dark bg-white/95 p-3.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-xs"
              placeholder={kind === 'belief' ? 'e.g. Long-term craft matters more than temporary acclaim.' : 'e.g. Intellectual honesty in relationships.'}
              autoFocus
            />
          </div>

          {/* Description Input */}
          <div>
            <label htmlFor="b-description" className="block text-xs font-semibold text-charcoal mb-1.5">
              Context or Provenance <span className="text-[11px] font-normal text-slateink-light">(optional)</span>
            </label>
            <textarea
              id="b-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-linen-dark bg-white/95 p-3.5 text-xs sm:text-sm text-charcoal leading-relaxed placeholder:text-slateink-light/70 focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 focus:outline-none transition-all shadow-xs"
              placeholder="Where did this conviction originate? What does it look like when tested?"
            />
          </div>

          {/* Category & Suggested Tags */}
          <div>
            <label htmlFor="b-category" className="block text-xs font-semibold text-charcoal mb-1.5">
              Category
            </label>
            <input
              id="b-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-xl border border-linen-dark bg-white/95 px-3.5 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:outline-none mb-2"
              placeholder="e.g. personal, career, creative…"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slateink-light mr-1">Suggestions:</span>
              {POPULAR_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2 py-0.5 rounded-full text-[11px] transition-all ${
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

          {/* Strength Slider & Reviewed Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-3 rounded-2xl bg-paper-soft border border-linen-dark/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="b-strength" className="text-xs font-semibold text-charcoal">
                  Conviction Strength
                </label>
                <span className="text-xs font-bold text-terracotta-deep tabular-nums bg-terracotta/10 px-2 py-0.5 rounded-full">
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
                className="w-full accent-terracotta cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slateink-light">
                <span>Emerging</span>
                <span>Moderate</span>
                <span>Core Pillar</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-paper-soft border border-linen-dark/60 space-y-1.5">
              <label htmlFor="b-reviewed" className="block text-xs font-semibold text-charcoal">
                Date Grounded / Reviewed
              </label>
              <input
                id="b-reviewed"
                type="date"
                value={reviewed}
                onChange={(e) => setReviewed(e.target.value)}
                className="w-full h-9 rounded-xl border border-linen-dark bg-white px-3 text-xs text-charcoal focus:border-terracotta focus:outline-none"
              />
              <p className="text-[10px] text-slateink-light">Marks your latest reflection point.</p>
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
              {formError}
            </p>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-linen-dark/60">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-6 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-98 cursor-pointer"
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
