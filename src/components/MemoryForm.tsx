import { useState } from 'react';
import { X } from 'lucide-react';
import { memoriesService } from '@/lib/services';
import {
  MEMORY_CATEGORIES,
  MEMORY_SOURCES,
  MEMORY_MOODS,
  MEMORY_IMPORTANCE_LABELS,
  type Memory,
  type MemoryInput,
} from '@/lib/types';

export function MemoryForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: Memory;
  onSaved: (saved: Memory) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'personal_growth');
  const [source, setSource] = useState(existing?.source ?? 'journal');
  const [mood, setMood] = useState(existing?.mood ?? 'neutral');
  const [confidence, setConfidence] = useState(existing?.confidence ?? 80);
  const [importance, setImportance] = useState<number | null>(existing?.user_importance ?? null);
  const [date, setDate] = useState(
    existing ? existing.occurred_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [tagsInput, setTagsInput] = useState((existing?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const valid = title.trim().length > 0 && content.trim().length > 0 && date !== '';

  function parseTags(raw: string): string[] {
    const seen = new Set<string>();
    for (const t of raw.split(',')) {
      const tag = t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
      if (tag) seen.add(tag);
    }
    return Array.from(seen).slice(0, 8);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    const input: MemoryInput = {
      title: title.trim(),
      content: content.trim(),
      category,
      source,
      mood,
      confidence,
      tags: parseTags(tagsInput),
      occurred_at: new Date(`${date}T12:00:00`).toISOString(),
      user_importance: importance,
    };
    try {
      const saved =
        existing
          ? await memoriesService.update(existing.id, input)
          : await memoriesService.create(input);
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the memory.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface p-6 space-y-4" aria-label={existing ? 'Edit memory' : 'Record a memory'}>
      <h3 className="font-serif text-lg text-charcoal">
        {existing ? 'Edit memory' : 'Record a memory'}
      </h3>

      <div>
        <label htmlFor="memory-title" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Title
        </label>
        <input
          id="memory-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm focus:border-terracotta"
          placeholder="What happened?"
        />
      </div>

      <div>
        <label htmlFor="memory-content" className="block text-xs font-medium text-slateink-dark mb-1.5">
          Original text (written by you)
        </label>
        <textarea
          id="memory-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={5}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
          placeholder="Write it as you'd tell it to yourself in a year."
        />
        <p className="mt-1.5 text-[11px] text-slateink-light">
          This is your own record. The twin may add an interpretation later, and it will always
          be shown separately from these words.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="memory-category" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Category
          </label>
          <select
            id="memory-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryInput['category'])}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm capitalize focus:border-terracotta"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="memory-source" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Source
          </label>
          <select
            id="memory-source"
            value={source}
            onChange={(e) => setSource(e.target.value as MemoryInput['source'])}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm focus:border-terracotta"
          >
            {MEMORY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="memory-date" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Date
          </label>
          <input
            id="memory-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm focus:border-terracotta"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="memory-mood" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Mood
          </label>
          <select
            id="memory-mood"
            value={mood}
            onChange={(e) => setMood(e.target.value as MemoryInput['mood'])}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm capitalize focus:border-terracotta"
          >
            {MEMORY_MOODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="memory-tags" className="block text-xs font-medium text-slateink-dark mb-1.5">
            Tags (optional)
          </label>
          <input
            id="memory-tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm focus:border-terracotta"
            placeholder="family, career, habits"
          />
        </div>
      </div>

      <div>
        <label htmlFor="memory-confidence" className="block text-xs font-medium text-slateink-dark mb-1.5">
          How clearly you remember this: {confidence}%
        </label>
        <input
          id="memory-confidence"
          type="range"
          min={0}
          max={100}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full accent-terracotta py-2.5"
        />
        <p className="mt-1 text-[11px] text-slateink-light">
          Reliability of the record — how clearly you remember it. Not the same as how much
          it matters to you; that's the next field.
        </p>
      </div>

      <div>
        <label htmlFor="memory-importance" className="block text-xs font-medium text-slateink-dark mb-1.5">
          How significant is this to you? (optional)
        </label>
        <select
          id="memory-importance"
          value={importance ?? ''}
          onChange={(e) => setImportance(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-xl border border-linen-dark bg-white/80 px-3 py-2.5 text-sm focus:border-terracotta"
        >
          <option value="">Not rated</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {MEMORY_IMPORTANCE_LABELS[n]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-slateink-light">
          Your own sense of how much this memory matters. It may surface sooner in relevant
          answers; it never changes how strongly the record counts as evidence.
        </p>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {formError}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button
          type="submit"
          disabled={!valid || saving}
          className="w-full sm:w-auto rounded-full bg-terracotta px-5 py-2.5 min-h-[44px] text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save memory'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 min-h-[44px] text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
          Cancel
        </button>
      </div>
    </form>
  );
}
