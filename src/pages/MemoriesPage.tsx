import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, BookOpen, Mic, Camera, MessageSquare, PenLine, StickyNote, ChevronRight, ChevronDown, Tag as TagIcon, Calendar, FolderOpen, SlidersHorizontal } from 'lucide-react';
import { memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import { MEMORY_CATEGORIES, type Memory, type MemoryCategory } from '@/lib/types';
import { MemoryForm } from '@/components/MemoryForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { onQuickAddRequest } from '@/lib/quickAdd';
import {
  Card,
  SectionHeading,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
  ConfidenceBar,
} from '@/components/ui';

const SOURCE_ICONS: Record<Memory['source'], typeof BookOpen> = {
  journal: PenLine,
  conversation: MessageSquare,
  photo: Camera,
  audio: Mic,
  note: StickyNote,
};

const MOOD_TONES: Record<Memory['mood'], 'sage' | 'neutral' | 'amber' | 'clay'> = {
  positive: 'sage',
  neutral: 'neutral',
  mixed: 'amber',
  difficult: 'clay',
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

  // The mobile bottom bar's "Quick add" fires this; open the same form the page
  // button uses.
  useEffect(() => onQuickAddRequest((kind) => {
    if (kind !== 'memory') return;
    setEditing(null);
    setShowForm(true);
  }), []);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data ?? []) {
      for (const t of m.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .slice(0, 14);
  }, [data]);

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
    <div className="space-y-8">
      <SectionHeading eyebrow="Evidence" title="Memories" as="h1" />

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slateink-light" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text and tags…"
            aria-label="Search memories"
            className="w-full rounded-full border border-linen-dark bg-white/70 pl-9 pr-4 py-2.5 min-h-[44px] text-sm placeholder:text-slateink-light focus:border-terracotta"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="md:hidden inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-linen-dark bg-white/70 px-4 text-sm font-medium text-slateink-dark hover:border-terracotta transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden />
            Filters
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="inline-flex flex-1 md:flex-none min-h-[44px] items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Record a memory
          </button>
        </div>
      </div>

      {/* Filters: category and date are compact dropdowns; tags stay free as
          chips so you can scan and toggle them at a glance. Collapsible on
          phones so they don't consume the whole first screen. */}
      <div className={`${showFilters ? 'block' : 'hidden'} md:block space-y-3`}>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <FilterSelect
            icon={<FolderOpen className="w-3.5 h-3.5" aria-hidden />}
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as 'all' | MemoryCategory)}
            options={[{ value: 'all', label: 'All categories' }, ...MEMORY_CATEGORIES.map((c) => ({ value: c, label: c.replace('_', ' ') }))]}
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
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Filter by tag">
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-slateink-light mr-0.5">
              <TagIcon className="w-3 h-3" aria-hidden /> Tags
            </span>
            <FilterChip active={tag === null} onClick={() => setTag(null)}>
              Any
            </FilterChip>
            {allTags.map((t) => (
              <FilterChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

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
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {loading ? (
        <LoadingState label="Loading memories" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-7 h-7" aria-hidden />}
          title={data && data.length > 0 ? 'No matches for these filters' : 'Nothing recorded here yet'}
          description={
            data && data.length > 0
              ? 'Try widening the search, clearing a tag, or picking a different date range.'
              : 'Memories are the raw evidence your twin reasons from. Record one to begin.'
          }
        />
      ) : (
        <>
          <p className="text-xs text-slateink-light" aria-live="polite">
            Showing {filtered.length} of {data?.length ?? 0} memories
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onEdit={() => setEditing(m)}
                onDelete={() => setPendingDelete(m)}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this memory?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently removed, along with any AI interpretation attached to it. This cannot be undone.`
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
  const selected = options.find((o) => o.value === value);
  return (
    <label className="relative inline-flex items-center min-h-[40px] rounded-full border border-linen-dark bg-white/70 pl-3 pr-2 text-sm text-slateink-dark hover:border-terracotta transition-colors focus-within:border-terracotta">
      <span className="flex items-center gap-1.5 text-slateink-light">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </span>
      <span className="mx-1.5 w-px self-stretch bg-linen-dark" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="appearance-none bg-transparent pr-5 py-1.5 text-sm capitalize text-charcoal focus:outline-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="capitalize">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slateink-light" aria-hidden />
      {selected && value !== 'all' && (
        <span className="sr-only">Current: {selected.label}</span>
      )}
    </label>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-2 min-h-[36px] text-xs font-medium capitalize transition-colors ${
        active
          ? 'bg-charcoal text-paper'
          : 'bg-linen/70 text-slateink-dark hover:bg-linen'
      }`}
    >
      {children}
    </button>
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
  const tags = memory.tags?.filter((t) => t !== 'demo-wave-2') ?? [];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <a
          href={`/memory/${memory.id}`}
          className="font-serif text-lg leading-snug text-charcoal hover:text-terracotta-deep transition-colors"
        >
          {memory.title}
        </a>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`/memory/${memory.id}`}
            aria-label={`Open memory: ${memory.title}`}
            className="rounded-full p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </a>
          <button
            onClick={onDelete}
            aria-label={`Delete memory: ${memory.title}`}
            className="rounded-full p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="text-sm text-slateink leading-relaxed flex-1 line-clamp-3">{memory.content}</p>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-md bg-linen px-2 py-0.5 text-[11px] text-slateink-dark">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="terracotta">{memory.category.replace('_', ' ')}</Badge>
        <Badge tone={MOOD_TONES[memory.mood]}>{memory.mood}</Badge>
        <span className="inline-flex items-center gap-1 text-[11px] text-slateink-light">
          <SourceIcon className="w-3.5 h-3.5" aria-hidden />
          {memory.source}
        </span>
        <span className="flex-1" />
        <ConfidenceBar value={memory.confidence} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slateink-light">
          {new Date(memory.occurred_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <button
          onClick={onEdit}
          className="text-xs font-medium text-terracotta-deep hover:text-terracotta-dark px-2 py-2 -my-1.5 min-h-[36px]"
        >
          Edit
        </button>
      </div>
    </Card>
  );
}
