import { useState } from 'react';
import { X, Plus } from 'lucide-react';
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const valid = title.trim() && context.trim() && optionLabels.filter((o) => o.trim()).length >= 2;

  function addValue() {
    const v = newValue.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
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
    <form onSubmit={handleSubmit} className="card-surface p-6 space-y-5" aria-label={existing ? 'Edit decision' : 'New decision'}>
      <h3 className="font-serif text-lg text-charcoal">
        {existing ? 'Edit decision' : 'Open a new decision'}
      </h3>

      <div>
        <label htmlFor="d-title" className="block text-xs font-medium text-slateink-dark mb-1.5">
          What are you deciding?
        </label>
        <input
          id="d-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={140}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm focus:border-terracotta"
          placeholder="e.g. Take the new role or stay?"
        />
      </div>

      <div>
        <label htmlFor="d-context" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Context — what makes this hard?
        </label>
        <textarea
          id="d-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          required
          rows={3}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
          placeholder="What's at stake? Who else is affected?"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="d-constraints" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Constraints (optional)
          </label>
          <textarea
            id="d-constraints"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
            placeholder="Deadlines, money, location, commitments…"
          />
        </div>
        <div>
          <label htmlFor="d-uncertainties" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Uncertainties (optional)
          </label>
          <textarea
            id="d-uncertainties"
            value={uncertainties}
            onChange={(e) => setUncertainties(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
            placeholder="What you don't know or can't control…"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slateink-dark mb-1.5">
          Relevant personal values (up to 6)
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 px-3 py-1 text-xs text-terracotta-deep"
            >
              {v}
              <button
                type="button"
                onClick={() => setValues(values.filter((x) => x !== v))}
                aria-label={`Remove value ${v}`}
                className="hover:text-clayred-DEFAULT"
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            </span>
          ))}
          {values.length === 0 && (
            <span className="text-xs text-slateink-light italic">No values linked yet.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addValue();
              }
            }}
            className="flex-1 rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2 text-sm focus:border-terracotta"
            placeholder="e.g. family, freedom, craft"
            aria-label="Add a value"
          />
          <button
            type="button"
            onClick={addValue}
            className="inline-flex items-center gap-1 rounded-xl border border-linen-dark bg-linen-light px-3 py-2 text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Add
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="d-success" className="block text-xs font-medium text-slateink-dark mb-1.5">
          What would a successful outcome mean to you? (optional)
        </label>
        <textarea
          id="d-success"
          value={success}
          onChange={(e) => setSuccess(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
          placeholder="Describe it as if it already happened, a year from now."
        />
      </div>

      <div>
        <span className="block text-xs font-medium text-slateink-dark mb-1.5">
          Available options (at least 2)
        </span>
        <div className="space-y-2">
          {optionLabels.map((label, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={label}
                onChange={(e) => {
                  const next = [...optionLabels];
                  next[i] = e.target.value;
                  setOptionLabels(next);
                }}
                className="flex-1 rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2 text-sm focus:border-terracotta"
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                aria-label={`Option ${i + 1}`}
              />
              {optionLabels.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptionLabels(optionLabels.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="rounded-xl px-2 text-slateink-light hover:text-clayred-DEFAULT"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {optionLabels.length < 4 && (
            <button
              type="button"
              onClick={() => setOptionLabels([...optionLabels, ''])}
              className="text-xs font-medium text-terracotta-deep hover:text-terracotta-dark"
            >
              + Add another option
            </button>
          )}
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
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Open decision'}
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
