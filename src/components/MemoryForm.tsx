import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Tag as TagIcon, Plus } from 'lucide-react';
import { memoriesService } from '@/lib/services';
import { useAuth } from '@/lib/useAuth';
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
  const { user } = useAuth();
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

  // Fetch all existing tags from memories in the database for autocomplete
  const [dbTags, setDbTags] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    memoriesService.list('occurred_at', user?.id).then((list) => {
      if (cancelled) return;
      const seen = new Set<string>();
      for (const m of list) {
        for (const t of m.tags ?? []) {
          const clean = t.trim().toLowerCase();
          if (clean && clean !== 'demo-wave-2') seen.add(clean);
        }
      }
      setDbTags(Array.from(seen));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const valid = title.trim().length > 0 && content.trim().length > 0 && date !== '';

  function parseTags(raw: string): string[] {
    const seen = new Set<string>();
    for (const t of raw.split(',')) {
      const tag = t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
      if (tag && tag !== 'demo-wave-2') seen.add(tag);
    }
    return Array.from(seen).slice(0, 8);
  }

  // Active word token being typed
  const currentToken = useMemo(() => {
    const parts = tagsInput.split(',');
    return parts[parts.length - 1].trim().toLowerCase();
  }, [tagsInput]);

  // Matching tags from database as user types
  const tagSuggestions = useMemo(() => {
    if (!currentToken || currentToken.length < 1) return [];
    const alreadyChosen = parseTags(tagsInput);
    return dbTags
      .filter((t) => t.includes(currentToken) && !alreadyChosen.includes(t))
      .slice(0, 6);
  }, [currentToken, dbTags, tagsInput]);

  function handleSelectSuggestion(suggestedTag: string) {
    const parts = tagsInput.split(',').map((p) => p.trim()).filter(Boolean);
    parts.pop(); // Remove the partial token
    parts.push(suggestedTag);
    setTagsInput(parts.join(', ') + ', ');
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-charcoal/50 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto scroll-elegant rounded-2xl sm:rounded-3xl bg-paper border border-linen-dark shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-linen-dark/60">
          <div>
            <h3 id="form-title" className="font-serif text-lg sm:text-xl font-bold text-charcoal">
              {existing ? 'Edit memory' : 'Record a memory'}
            </h3>
            <p className="text-xs text-slateink-light">Capture an experience in your own authentic words</p>
          </div>
          <button
            onClick={onCancel}
            type="button"
            className="p-1.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5" aria-label={existing ? 'Edit memory' : 'Record a memory'}>
          {/* Title */}
          <div>
            <label htmlFor="memory-title" className="block text-xs font-semibold text-charcoal mb-1">
              Title
            </label>
            <input
              id="memory-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 shadow-xs"
              placeholder="E.g., Discussing team direction with Sarah"
            />
          </div>

          {/* Original Content */}
          <div>
            <label htmlFor="memory-content" className="block text-xs font-semibold text-charcoal mb-1">
              Original text (written by you)
            </label>
            <textarea
              id="memory-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={4}
              className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm leading-relaxed focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 shadow-xs"
              placeholder="What happened? What were you thinking, feeling, or deciding?"
            />
            <p className="mt-1 text-[11px] text-slateink-light">
              Your authentic record. The twin reasons from this and never alters your words.
            </p>
          </div>

          {/* 4 Metadata Selects in 2x2 or 4x1 grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label htmlFor="memory-category" className="block text-[11px] font-semibold text-slateink-dark mb-1">
                Category
              </label>
              <select
                id="memory-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryInput['category'])}
                className="w-full rounded-xl border border-linen-dark bg-white px-2.5 py-1.5 text-xs capitalize focus:border-terracotta"
              >
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="memory-source" className="block text-[11px] font-semibold text-slateink-dark mb-1">
                Source
              </label>
              <select
                id="memory-source"
                value={source}
                onChange={(e) => setSource(e.target.value as MemoryInput['source'])}
                className="w-full rounded-xl border border-linen-dark bg-white px-2.5 py-1.5 text-xs capitalize focus:border-terracotta"
              >
                {MEMORY_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="memory-date" className="block text-[11px] font-semibold text-slateink-dark mb-1">
                Date
              </label>
              <input
                id="memory-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-linen-dark bg-white px-2 py-1.5 text-xs focus:border-terracotta"
              />
            </div>

            <div>
              <label htmlFor="memory-mood" className="block text-[11px] font-semibold text-slateink-dark mb-1">
                Mood
              </label>
              <select
                id="memory-mood"
                value={mood}
                onChange={(e) => setMood(e.target.value as MemoryInput['mood'])}
                className="w-full rounded-xl border border-linen-dark bg-white px-2.5 py-1.5 text-xs capitalize focus:border-terracotta"
              >
                {MEMORY_MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Confidence & Significance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-linen/40 border border-linen-dark/60">
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-charcoal">
                <span>Clarity of memory</span>
                <span className="text-terracotta font-bold">{confidence}%</span>
              </div>
              <input
                id="memory-confidence"
                type="range"
                min={0}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-terracotta cursor-pointer"
              />
              <p className="text-[10px] text-slateink-light">How vividly you recall details</p>
            </div>

            <div>
              <label htmlFor="memory-importance" className="block text-xs font-semibold text-charcoal mb-1">
                Significance (optional)
              </label>
              <select
                id="memory-importance"
                value={importance ?? ''}
                onChange={(e) => setImportance(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full rounded-xl border border-linen-dark bg-white px-2.5 py-1.5 text-xs focus:border-terracotta"
              >
                <option value="">Not rated</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} — {MEMORY_IMPORTANCE_LABELS[n]}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slateink-light mt-0.5">Helps twin prioritize key life moments</p>
            </div>
          </div>

          {/* Tags with Dynamic DB Fetching/Suggestions */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="memory-tags" className="block text-xs font-semibold text-charcoal">
                Tags (comma separated)
              </label>
              {tagSuggestions.length > 0 && (
                <span className="text-[10px] text-terracotta font-medium flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Suggestions from DB
                </span>
              )}
            </div>

            <input
              id="memory-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full rounded-xl border border-linen-dark bg-white px-3 py-1.5 text-xs focus:border-terracotta shadow-xs"
              placeholder="e.g. career, habits, family..."
              autoComplete="off"
            />

            {/* Live Autocomplete suggestions fetched from Database */}
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 animate-[fadeIn_100ms_ease-out]">
                <span className="text-[10px] text-slateink-light uppercase font-semibold mr-0.5">
                  Tap to add:
                </span>
                {tagSuggestions.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleSelectSuggestion(st)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-linen-dark text-[11px] font-medium text-terracotta-deep hover:bg-terracotta hover:text-paper hover:border-terracotta transition-all shadow-xs"
                  >
                    <span>#{st}</span>
                    <Plus className="w-2.5 h-2.5 opacity-60" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-clayred-light px-3 py-2 text-xs text-clayred-DEFAULT">
              {formError}
            </p>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-linen-dark/60 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-full text-xs font-medium text-slateink-dark hover:bg-linen transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-paper hover:bg-terracotta-dark transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
            >
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Save memory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
