import { useEffect, useMemo, useState } from 'react';
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
  Tag as TagIcon,
  Calendar,
  FolderOpen,
  SlidersHorizontal,
  X,
  Pencil,
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

  useEffect(() => onQuickAddRequest((kind) => {
    if (kind !== 'memory') return;
    setEditing(null);
    setShowForm(true);
  }), []);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data ?? []) {
      for (const t of m.tags ?? []) {
        if (t.toLowerCase() === 'demo-wave-2') continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .slice(0, 10);
  }, [data]);

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
    <div className="space-y-4 sm:space-y-6">
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

      {/* Search and Action Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slateink-light" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text, memories, tags…"
            aria-label="Search memories"
            className="w-full rounded-full border border-linen-dark bg-white/80 pl-9 pr-3.5 py-2 text-xs sm:text-sm placeholder:text-slateink-light focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 shadow-xs transition-all"
          />
        </div>

        {/* Filter Toggle Button */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border px-3 sm:px-3.5 text-xs sm:text-sm font-medium transition-all shadow-xs shrink-0 ${
            showFilters || activeFiltersCount > 0
              ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-semibold'
              : 'border-linen-dark bg-white/80 text-slateink-dark hover:border-terracotta'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="h-4 min-w-[16px] px-1 rounded-full bg-terracotta text-paper text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Primary Action Button */}
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

      {/* Expandable Filters Tray */}
      {showFilters && (
        <div className="p-3 sm:p-4 rounded-2xl bg-paper-soft border border-linen-dark/80 shadow-xs space-y-3 animate-[fadeIn_120ms_ease-out]">
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              icon={<FolderOpen className="w-3.5 h-3.5" aria-hidden />}
              label="Category"
              value={category}
              onChange={(v) => setCategory(v as 'all' | MemoryCategory)}
              options={[
                { value: 'all', label: 'All categories' },
                ...MEMORY_CATEGORIES.map((c) => ({ value: c, label: c.replace('_', ' ') })),
              ]}
            />

            <FilterSelect
              icon={<Calendar className="w-3.5 h-3.5" aria-hidden />}
              label="When"
              value={dateRange}
              onChange={(v) => setDateRange(v as 'all' | '30' | '90' | '365')}
              options={[
                { value: 'all', label: 'All time' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
                { value: '365', label: 'Past year' },
              ]}
            />

            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-clayred-DEFAULT hover:underline transition-colors ml-auto"
              >
                <X className="w-3 h-3" />
                <span>Reset filters</span>
              </button>
            )}
          </div>

          {/* Tag Chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-linen-dark/40" role="group" aria-label="Filter by tag">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slateink-light mr-1">
                <TagIcon className="w-3 h-3" aria-hidden /> Tags:
              </span>
              <button
                onClick={() => setTag(null)}
                aria-pressed={tag === null}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tag === null ? 'bg-charcoal text-paper' : 'bg-linen/70 text-slateink hover:bg-linen'
                }`}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(tag === t ? null : t)}
                  aria-pressed={tag === t}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    tag === t ? 'bg-terracotta text-paper' : 'bg-linen/70 text-slateink hover:bg-linen'
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

function FilterSelect({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center h-8 sm:h-9 rounded-full border border-linen-dark bg-white pl-2.5 pr-1.5 text-xs text-slateink-dark hover:border-terracotta transition-colors focus-within:border-terracotta">
      <span className="flex items-center gap-1 text-slateink-light mr-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="appearance-none bg-transparent pr-4 py-1 text-xs capitalize text-charcoal font-medium focus:outline-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="capitalize">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slateink-light" aria-hidden />
    </label>
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
