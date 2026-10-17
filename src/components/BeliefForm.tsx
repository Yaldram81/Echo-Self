import { useState } from 'react';
import { beliefsService } from '@/lib/services';
import type { Belief, BeliefInput } from '@/lib/types';

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    const input: BeliefInput = {
      statement: statement.trim(),
      description: description.trim(),
      kind,
      category: category.trim() || 'personal',
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
      setFormError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface p-6 space-y-4" aria-label={existing ? 'Edit statement' : 'Add a statement'}>
      <h3 className="font-serif text-lg text-charcoal">
        {existing ? 'Edit statement' : 'Add a belief or value'}
      </h3>
      <p className="text-xs text-slateink-light">
        This record is yours: what you write here is stored as a user statement, separate from
        anything the twin suggests.
      </p>

      <div>
        <label htmlFor="b-kind" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Type
        </label>
        <select
          id="b-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'belief' | 'value')}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm capitalize focus:border-terracotta"
        >
          <option value="belief">Belief</option>
          <option value="value">Value</option>
        </select>
      </div>

      <div>
        <label htmlFor="b-statement" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Statement {kind === 'belief' ? '— I believe…' : '— I value…'}
        </label>
        <textarea
          id="b-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          required
          rows={2}
          maxLength={280}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
          placeholder="Say it plainly, in your own words."
        />
      </div>

      <div>
        <label htmlFor="b-description" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Description (optional)
        </label>
        <textarea
          id="b-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
          placeholder="Where does this come from? What does it look like in practice?"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="b-category" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Area of life
          </label>
          <input
            id="b-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm focus:border-terracotta"
            placeholder="work, family, health…"
          />
        </div>
        <div>
          <label htmlFor="b-strength" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Confidence: {strength}/100
          </label>
          <input
            id="b-strength"
            type="range"
            min={0}
            max={100}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-terracotta"
          />
        </div>
        <div>
          <label htmlFor="b-reviewed" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Last reviewed
          </label>
          <input
            id="b-reviewed"
            type="date"
            value={reviewed}
            onChange={(e) => setReviewed(e.target.value)}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm focus:border-terracotta"
          />
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!valid || saving}
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save statement'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
