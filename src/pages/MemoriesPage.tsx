import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  BookOpen,
  Mic,
  Camera,
  MessageSquare,
  PenLine,
  StickyNote,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Tag as TagIcon,
  Calendar,
  FolderOpen,
  SlidersHorizontal,
  X,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import { memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import { MEMORY_CATEGORIES, type Memory, type MemoryCategory } from '@/lib/types';
import { MemoryForm } from '@/components/MemoryForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { onQuickAddRequest } from '@/lib/quickAdd';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';

const SOURCE_ICONS: Record<Memory['source'], typeof BookOpen> = {
  journal: PenLine,
  conversation: MessageSquare,
  photo: Camera,
  audio: Mic,
  note: StickyNote,
};

const MOOD_TONES: Record<Memory['mood'], { bg: string; text: string }> = {
  positive: { bg: 'bg-sage/15', text: 'text-sage-dark' },
  neutral: { bg: 'bg-linen', text: 'text-slateink-dark' },
  mixed: { bg: 'bg-amberclay/20', text: 'text-amberclay-DEFAULT' },
  difficult: { bg: 'bg-clayred-light/40', text: 'text-clayred-DEFAULT' },
};

function withinDays(iso: string, days: number | null): boolean {
  if (days === null) return true;
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return ageDays <= days;
}

export function MemoriesPage() {
  const { data, loading, error, reload } = useAsyncData(() => memoriesService.list(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | MemoryCategory>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'all' | '30' | '90' | '365'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Memory | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Inline tag creation state
  const [newTagInput, setNewTagInput] = useState('');
  const [isSavingTag, setIsSavingTag] = useState(false);

  // Progressive inline tags expansion state
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [tagBatchLimit, setTagBatchLimit] = useState(20);

  useEffect(() => onQuickAddRequest((kind) => {
    if (kind !== 'memory') return;
    setEditing(null);
    setShowForm(true);
  }), []);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data ?? []) {
      for (const t of m.tags ?? []) {
        if (t.toLowerCase() === 'demo-wave-2') continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const allTags = useMemo(() => {
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
  }, [tagCounts]);

  const activeFiltersCount =
    (category !== 'all' ? 1 : 0) +
    (dateRange !== 'all' ? 1 : 0) +
    (tag !== null ? 1 : 0);

  const resetFilters = () => {
    setCategory('all');
    setDateRange('all');
    setTag(null);
    setQuery('');
  };

  async function handleInlineAddTag(e: React.FormEvent) {
    e.preventDefault();
    const clean = newTagInput.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 24);
    if (!clean || isSavingTag) return;
    setIsSavingTag(true);
    setActionError(null);
    try {
      const list = data ?? [];
      if (list.length > 0) {
        const targetMemory = list[0];
        const existingTags = targetMemory.tags ?? [];
        if (!existingTags.includes(clean)) {
          const updatedTags = [...existingTags, clean];
          await memoriesService.update(targetMemory.id, {
            title: targetMemory.title,
            content: targetMemory.content,
            category: targetMemory.category,
            source: targetMemory.source,
            mood: targetMemory.mood,
            confidence: targetMemory.confidence,
            occurred_at: targetMemory.occurred_at,
            user_importance: targetMemory.user_importance,
            tags: updatedTags,
          });
        }
      }
      setNewTagInput('');
      setTag(clean);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save new tag to database.');
    } finally {
      setIsSavingTag(false);
    }
  }

  const filtered = useMemo(() => {
    const items = data ?? [];
    const q = query.trim().toLowerCase();
    const days = dateRange === 'all' ? null : Number(dateRange);
    return items.filter((m) => {
      const matchesQuery =
        q === '' ||
        `${m.title} ${m.content} ${(m.tags ?? []).join(' ')}`.toLowerCase().includes(q);
      const matchesCategory = category === 'all' || m.category === category;
      const matchesTag = tag === null || (m.tags ?? []).includes(tag);
      const matchesDate = withinDays(m.occurred_at, days);
      return matchesQuery && matchesCategory && matchesTag && matchesDate;
    });
  }, [data, query, category, tag, dateRange]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await memoriesService.remove(pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the memory.');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page Title & Counter */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-terracotta-deep font-semibold">Evidence</p>
          <h1 className="font-serif text-xl sm:text-3xl font-bold text-charcoal">Memories</h1>
        </div>
        {data && (
          <p className="text-xs text-slateink-light" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          </p>
        )}
      </div>

      {/* Primary Toolbar: Search Bar inline with Categories & Time on desktop */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slateink-light" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text, memories, tags…"
            aria-label="Search memories"
            className="w-full h-9 sm:h-10 rounded-full border border-linen-dark bg-white/90 pl-9 pr-8 py-2 text-xs sm:text-sm placeholder:text-slateink-light focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 shadow-xs transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slateink-light hover:text-charcoal"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Categories & Time inline on Desktop/Tablet */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <CategoryDropdown category={category} onChange={setCategory} />
          <TimeDropdown dateRange={dateRange} onChange={setDateRange} />
        </div>

        {/* Mobile Filter Toggle Button */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`sm:hidden inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all shadow-xs shrink-0 ${
            showFilters || activeFiltersCount > 0
              ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-semibold'
              : 'border-linen-dark bg-white/90 text-slateink-dark hover:border-terracotta'
          }`}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span className="h-4 min-w-[16px] px-1 rounded-full bg-terracotta text-paper text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Record Memory Action Button */}
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-3.5 sm:px-4.5 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all shadow-xs shrink-0 active:scale-98"
        >
          <Plus className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">Record memory</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Mobile Filters Tray: Categories and Time in a SINGLE LINE */}
      {showFilters && (
        <div className="sm:hidden grid grid-cols-2 gap-2 p-2 rounded-2xl bg-paper-soft/95 border border-linen-dark/80 shadow-xs animate-[fadeIn_120ms_ease-out]">
          <CategoryDropdown category={category} onChange={setCategory} fullWidth />
          <TimeDropdown dateRange={dateRange} onChange={setDateRange} fullWidth />
        </div>
      )}

      {/* Tags Row: Single line initially (top 6 on mobile), expandable into multi-line progressive flow */}
      <div
        className={`flex justify-between gap-2 pt-0.5 ${
          isTagsExpanded ? 'flex-col sm:flex-row items-start' : 'items-center'
        }`}
        role="group"
        aria-label="Filter by tag"
      >
        {!isTagsExpanded ? (
          /* COLLAPSED VIEW: Strictly single line. Top 6 on mobile, 8 on desktop */
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-1 flex-nowrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slateink-light mr-0.5 shrink-0 select-none">
              <TagIcon className="w-3.5 h-3.5" aria-hidden /> Tags:
            </span>

            {/* All filter button */}
            <button
              type="button"
              onClick={() => setTag(null)}
              aria-pressed={tag === null}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                tag === null
                  ? 'bg-charcoal text-paper shadow-xs font-semibold'
                  : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
              }`}
            >
              All
            </button>

            {/* If an active tag is not in top 6, display it prominently as an active chip */}
            {tag !== null && !allTags.slice(0, 6).includes(tag) && (
              <button
                type="button"
                onClick={() => setTag(null)}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold bg-terracotta text-paper shadow-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Click to remove tag filter"
              >
                <span>#{tag}</span>
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Top 6 Tags: Always visible on mobile, tablet, and desktop */}
            {allTags.slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  tag === t
                    ? 'bg-terracotta text-paper shadow-xs font-semibold'
                    : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
                }`}
              >
                #{t}
              </button>
            ))}

            {/* Tags 7 & 8: Visible on desktop and tablet, hidden on mobile */}
            {allTags.slice(6, 8).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={`hidden md:inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  tag === t
                    ? 'bg-terracotta text-paper shadow-xs font-semibold'
                    : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
                }`}
              >
                #{t}
              </button>
            ))}

            {/* Expand inline progressive 'More tags' / 'Read more' button */}
            {allTags.length > 6 && (
              <button
                type="button"
                onClick={() => {
                  setIsTagsExpanded(true);
                  setTagBatchLimit(20);
                }}
                aria-expanded={false}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs ${
                  allTags.length <= 8 ? 'md:hidden' : ''
                } ${
                  tag !== null && !allTags.slice(0, 8).includes(tag)
                    ? 'border border-terracotta bg-terracotta/15 text-terracotta-deep font-semibold shadow-xs'
                    : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
                }`}
              >
                <span className="md:hidden">+{Math.max(0, allTags.length - 6)} more</span>
                <span className="hidden md:inline">more tags ({Math.max(0, allTags.length - 8)})</span>
                <ChevronDown className="w-3.5 h-3.5 text-slateink-light shrink-0" />
              </button>
            )}
          </div>
        ) : (
          /* EXPANDED VIEW: Multi-line inline progressive wrapping across whatever lines it takes */
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 py-1 flex-1 animate-[fadeIn_120ms_ease-out]">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slateink-light mr-0.5 shrink-0 select-none">
              <TagIcon className="w-3.5 h-3.5" aria-hidden /> Tags:
            </span>

            {/* All filter button */}
            <button
              type="button"
              onClick={() => setTag(null)}
              aria-pressed={tag === null}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                tag === null
                  ? 'bg-charcoal text-paper shadow-xs font-semibold'
                  : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
              }`}
            >
              All
            </button>

            {allTags.slice(0, tagBatchLimit).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                  tag === t
                    ? 'bg-terracotta text-paper shadow-xs font-semibold'
                    : 'bg-white/80 border border-linen-dark/80 text-slateink hover:bg-linen hover:text-charcoal'
                }`}
              >
                <span>#{t}</span>
                <span className="text-[10px] opacity-70">({tagCounts.get(t) ?? 1})</span>
              </button>
            ))}

            {/* If more tags exist beyond current batch, offer progressive batch load */}
            {tagBatchLimit < allTags.length && (
              <button
                type="button"
                onClick={() => setTagBatchLimit((prev) => prev + 20)}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap bg-terracotta/10 border border-terracotta/40 text-terracotta-deep hover:bg-terracotta/20 shadow-2xs"
              >
                <span>Load more (+{Math.min(20, allTags.length - tagBatchLimit)})</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Show less button to collapse back to single line */}
            <button
              type="button"
              onClick={() => {
                setIsTagsExpanded(false);
                setTagBatchLimit(20);
              }}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap bg-linen border border-linen-dark/80 text-slateink hover:text-charcoal hover:bg-linen-dark/60 shadow-2xs"
              title="Collapse tags to single line"
            >
              <span>Show less</span>
              <ChevronUp className="w-3.5 h-3.5 text-slateink-light shrink-0" />
            </button>
          </div>
        )}

        {/* Trailing Controls: Inline Tag Creator & Reset Filters */}
        <div className={`flex items-center gap-1.5 shrink-0 pl-1 ${isTagsExpanded ? 'self-end sm:self-start pt-1' : ''}`}>
          {/* Inline Add Tag Field & Save Button (Desktop) */}
          <form onSubmit={handleInlineAddTag} className="hidden sm:inline-flex items-center gap-1">
            <div className="relative inline-flex items-center">
              <span className="absolute left-2.5 text-xs text-slateink-light font-mono select-none">#</span>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Add tag…"
                aria-label="Add new tag"
                className="h-7 w-20 sm:w-24 rounded-full border border-dashed border-linen-dark bg-white/80 pl-5 pr-2 text-[11px] text-charcoal placeholder:text-slateink-light/70 focus:border-terracotta focus:border-solid focus:bg-white focus:w-32 focus:outline-none transition-all shadow-2xs"
              />
            </div>
            {newTagInput.trim().length > 0 && (
              <button
                type="submit"
                disabled={isSavingTag}
                className="h-7 px-2.5 rounded-full bg-terracotta text-paper text-[11px] font-semibold hover:bg-terracotta-dark transition-all disabled:opacity-50 flex items-center gap-1 shadow-xs"
                title="Save tag to database"
              >
                {isSavingTag ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>Save</span>
                  </>
                )}
              </button>
            )}
          </form>

          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-clayred-DEFAULT hover:underline transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Memory Form Modal */}
      {(showForm || editing) && (
        <MemoryForm
          existing={editing ?? undefined}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            reload();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {actionError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {/* Memories Grid */}
      {loading ? (
        <LoadingState label="Loading memories" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" aria-hidden />}
          title={data && data.length > 0 ? 'No matches found' : 'No memories recorded yet'}
          description={
            data && data.length > 0
              ? 'Try adjusting your search keywords or clearing filter criteria.'
              : 'Memories are the ground evidence your twin inspects. Record an experience to begin.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filtered.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              onEdit={() => setEditing(m)}
              onDelete={() => setPendingDelete(m)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this memory?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently removed, along with any AI interpretations attached to it.`
            : ''
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

const TIME_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Past year' },
] as const;

function CategoryDropdown({
  category,
  onChange,
  fullWidth = false,
}: {
  category: 'all' | MemoryCategory;
  onChange: (cat: 'all' | MemoryCategory) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  const activeLabel = category === 'all' ? 'All' : category.replace('_', ' ');

  return (
    <div ref={ref} className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 sm:h-10 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs sm:text-sm font-medium transition-all shadow-xs cursor-pointer ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          category !== 'all'
            ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-semibold'
            : 'border-linen-dark bg-white/90 text-slateink-dark hover:border-terracotta hover:bg-white'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Filter by category"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${category !== 'all' ? 'text-terracotta' : 'text-slateink-light'}`} />
          <span className="capitalize truncate max-w-[120px] sm:max-w-none">{activeLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slateink-light shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-1.5 w-52 sm:w-56 rounded-2xl bg-paper-soft/95 backdrop-blur-md border border-linen-dark/80 shadow-xl p-1.5 z-50 space-y-0.5 animate-[fadeIn_120ms_ease-out]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slateink-light">Filter by Category</div>
          <button
            type="button"
            role="option"
            aria-selected={category === 'all'}
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              category === 'all'
                ? 'bg-terracotta/15 text-terracotta-deep font-semibold'
                : 'text-slateink-dark hover:bg-linen/80 hover:text-charcoal'
            }`}
          >
            <span>All categories</span>
            {category === 'all' && <Check className="w-3.5 h-3.5 text-terracotta shrink-0" />}
          </button>
          <div className="my-1 border-t border-linen-dark/40" />
          {MEMORY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="option"
              aria-selected={category === cat}
              onClick={() => {
                onChange(cat);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer ${
                category === cat
                  ? 'bg-terracotta/15 text-terracotta-deep font-semibold'
                  : 'text-slateink-dark hover:bg-linen/80 hover:text-charcoal'
              }`}
            >
              <span>{cat.replace('_', ' ')}</span>
              {category === cat && <Check className="w-3.5 h-3.5 text-terracotta shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeDropdown({
  dateRange,
  onChange,
  fullWidth = false,
}: {
  dateRange: 'all' | '30' | '90' | '365';
  onChange: (range: 'all' | '30' | '90' | '365') => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  const activeLabel = TIME_OPTIONS.find((o) => o.value === dateRange)?.label ?? 'All time';

  return (
    <div ref={ref} className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 sm:h-10 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs sm:text-sm font-medium transition-all shadow-xs cursor-pointer ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          dateRange !== 'all'
            ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-semibold'
            : 'border-linen-dark bg-white/90 text-slateink-dark hover:border-terracotta hover:bg-white'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Filter by time"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Calendar className={`w-3.5 h-3.5 shrink-0 ${dateRange !== 'all' ? 'text-terracotta' : 'text-slateink-light'}`} />
          <span className="truncate max-w-[120px] sm:max-w-none">{activeLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slateink-light shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 sm:right-0 sm:left-auto mt-1.5 w-48 sm:w-52 rounded-2xl bg-paper-soft/95 backdrop-blur-md border border-linen-dark/80 shadow-xl p-1.5 z-50 space-y-0.5 animate-[fadeIn_120ms_ease-out]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slateink-light">Filter by Time</div>
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={dateRange === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                dateRange === opt.value
                  ? 'bg-terracotta/15 text-terracotta-deep font-semibold'
                  : 'text-slateink-dark hover:bg-linen/80 hover:text-charcoal'
              }`}
            >
              <span>{opt.label}</span>
              {dateRange === opt.value && <Check className="w-3.5 h-3.5 text-terracotta shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  onEdit,
  onDelete,
}: {
  memory: Memory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const SourceIcon = SOURCE_ICONS[memory.source] ?? BookOpen;
  const moodStyle = MOOD_TONES[memory.mood] ?? MOOD_TONES.neutral;
  const tags = memory.tags?.filter((t) => t !== 'demo-wave-2').slice(0, 4) ?? [];

  return (
    <div className="group rounded-2xl border border-linen-dark/80 bg-white/80 hover:bg-white p-4 sm:p-5 shadow-xs hover:shadow-card transition-all flex flex-col justify-between space-y-3">
      {/* Card Header: Title and Actions */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <a
            href={`/memory/${memory.id}`}
            className="font-serif text-base sm:text-lg font-bold text-charcoal group-hover:text-terracotta-deep transition-colors line-clamp-2 leading-snug"
          >
            {memory.title}
          </a>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              aria-label={`Edit ${memory.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              aria-label={`Delete ${memory.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/memory/${memory.id}`}
              aria-label={`Open ${memory.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Content Excerpt */}
        <p className="text-xs sm:text-sm text-slateink leading-relaxed line-clamp-2 sm:line-clamp-3">
          {memory.content}
        </p>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-linen/70 px-1.5 py-0.5 text-[10px] text-slateink-dark font-medium">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Single Consolidated Footer: Badges, Date, Confidence */}
      <div className="pt-2.5 border-t border-linen-dark/50 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-terracotta-deep bg-terracotta/10 px-2 py-0.5 rounded-full capitalize">
            {memory.category.replace('_', ' ')}
          </span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${moodStyle.bg} ${moodStyle.text}`}>
            {memory.mood}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slateink-light capitalize pl-1">
            <SourceIcon className="w-3 h-3" aria-hidden />
            <span className="hidden sm:inline">{memory.source}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slateink-light ml-auto">
          <span>
            {new Date(memory.occurred_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <span className="text-terracotta-deep font-semibold">
            {memory.confidence}% clarity
          </span>
        </div>
      </div>
    </div>
  );
}
