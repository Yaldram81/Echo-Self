import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Compass,
  History,
  Sparkles,
  Check,
  X,
  Edit3,
  Quote,
  Search,
  ChevronDown,
  ChevronUp,
  Scale,
  Tag,
} from 'lucide-react';
import { beliefsService, memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Belief, BeliefKind } from '@/lib/types';
import { RelationshipsPanel } from '@/components/RelationshipsPanel';
import { BeliefForm } from '@/components/BeliefForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { onQuickAddRequest } from '@/lib/quickAdd';
import {
  LoadingState,
  ErrorState,
  EmptyState,
  StrengthMeter,
} from '@/components/ui';
import { useAuth } from '@/lib/useAuth';

export function BeliefsPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    () => beliefsService.listWithHistory(user?.id),
    [user?.id, authLoading],
    { enabled: !authLoading }
  );
  const { data: memories } = useAsyncData(
    () => memoriesService.list('occurred_at', user?.id),
    [user?.id, authLoading],
    { enabled: !authLoading }
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'suggestions'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | BeliefKind>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Belief | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRelationships, setShowRelationships] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Belief | null>(null);
  const [pendingDismiss, setPendingDismiss] = useState<Belief | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Quick add from mobile bottom bar or shortcut
  useEffect(() => onQuickAddRequest((kind) => {
    if (kind !== 'belief') return;
    setEditing(null);
    setShowForm(true);
  }), []);

  // Click outside listener for custom category dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    }
    if (categoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [categoryDropdownOpen]);

  const confirmed = useMemo(
    () => (data ?? []).filter((b) => b.origin === 'user' || b.origin === 'confirmed_suggestion'),
    [data]
  );
  const suggestions = useMemo(() => (data ?? []).filter((b) => b.origin === 'suggestion'), [data]);

  // Derive unique categories and counts from existing data
  const { availableCategories, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    const set = new Set<string>();
    for (const b of data ?? []) {
      if (b.category) {
        const cat = b.category.toLowerCase().trim();
        set.add(cat);
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
    }
    return {
      availableCategories: Array.from(set).sort(),
      categoryCounts: counts,
    };
  }, [data]);

  // Filtered dataset
  const visible = useMemo(() => {
    let pool: Belief[];
    if (filter === 'suggestions') pool = suggestions;
    else if (filter === 'user') pool = confirmed;
    else pool = data ?? [];

    const q = searchQuery.trim().toLowerCase();

    return pool.filter((b) => {
      // Kind filter
      if (kindFilter !== 'all' && b.kind !== kindFilter) return false;

      // Category filter
      if (categoryFilter !== 'all' && b.category?.toLowerCase() !== categoryFilter) return false;

      // Search query filter
      if (q === '') return true;
      const historyNotes = (b.history ?? []).map((h) => h.note ?? '').join(' ');
      const searchBlob = `${b.statement} ${b.description ?? ''} ${b.category ?? ''} ${b.kind} ${historyNotes}`.toLowerCase();
      return searchBlob.includes(q);
    });
  }, [data, confirmed, suggestions, filter, kindFilter, categoryFilter, searchQuery]);

  async function handleConfirmSuggestion(id: string) {
    setActionError(null);
    try {
      await beliefsService.confirmSuggestion(id);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not confirm the suggestion.');
    }
  }

  async function handleDismissSuggestion() {
    if (!pendingDismiss) return;
    setActionError(null);
    try {
      await beliefsService.dismissSuggestion(pendingDismiss.id);
      setPendingDismiss(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not dismiss the suggestion.');
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await beliefsService.remove(pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the statement.');
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-28 sm:pb-12">
      {/* Header Block: Title & Primary Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-terracotta-deep font-semibold">Interior</p>
            {data && (
              <span className="text-[10px] font-bold text-slateink-light bg-linen/70 px-2 py-0.5 rounded-full">
                {confirmed.length} recorded · {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <h1 className="font-serif text-xl sm:text-3xl font-bold text-charcoal">Beliefs & Values</h1>
        </div>

        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 sm:px-5 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all shadow-xs shrink-0 self-start sm:self-auto active:scale-98 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden />
          <span>Add a statement</span>
        </button>
      </div>

      {/* Editorial Lead Context */}
      <p className="text-xs sm:text-sm text-slateink leading-relaxed max-w-2xl">
        Statements you write or explicitly confirm are preserved as your core principles. Patterns noticed by your twin stay labeled as suggestions until you deliberate—nothing is confirmed or overwritten automatically.
      </p>

      {/* Twin Suggestions in a compact Grid of 3 */}
      {suggestions.length > 0 && filter !== 'user' && (
        <section aria-label="AI-suggested patterns" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-amberclay-DEFAULT font-bold">
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              <span>Twin Suggestions ({suggestions.length})</span>
            </h2>
            <span className="text-[11px] text-slateink-light hidden sm:inline">
              Grounded in memory patterns
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col justify-between rounded-2xl border border-amberclay-DEFAULT/35 bg-amberclay-light/20 p-3.5 sm:p-4 shadow-2xs hover:bg-amberclay-light/30 transition-all space-y-2.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amberclay-DEFAULT/15 text-amberclay-DEFAULT">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>{s.kind}</span>
                    </span>
                    <span className="text-[11px] font-medium text-slateink-light">#{s.category}</span>
                  </div>

                  <p className="font-serif text-xs sm:text-sm font-semibold text-charcoal leading-snug">
                    “{s.statement}”
                  </p>

                  {s.description && (
                    <p className="text-[11px] text-slateink leading-relaxed line-clamp-2" title={s.description}>
                      {s.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-amberclay-DEFAULT/25">
                  <button
                    onClick={() => handleConfirmSuggestion(s.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-sage-light border border-sage/40 py-1.5 px-2 text-[11px] font-semibold text-sage-dark hover:bg-sage hover:text-paper transition-all cursor-pointer shadow-2xs"
                  >
                    <Check className="w-3 h-3" />
                    <span>Confirm</span>
                  </button>
                  <button
                    onClick={() => setPendingDismiss(s)}
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-linen-dark bg-white py-1.5 px-2.5 text-[11px] font-medium text-slateink hover:border-clayred-DEFAULT hover:text-clayred-DEFAULT transition-all cursor-pointer shadow-2xs"
                  >
                    <X className="w-3 h-3" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Expandable Relationships & Contradictions Panel */}
      <div className="rounded-2xl border border-linen-dark/80 bg-paper-soft/80 overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowRelationships((v) => !v)}
          className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-linen/40 transition-colors cursor-pointer"
          aria-expanded={showRelationships}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-charcoal">Statement Relationships & Tensions</span>
                <span className="text-[10px] font-semibold bg-linen px-2 py-0.5 rounded-full text-slateink-light">
                  Contradiction detector
                </span>
              </div>
              <p className="text-[11px] text-slateink hidden sm:block">
                Examine candidate tensions, contradictions, and changes across your recorded statements.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            <span className="text-xs text-slateink-light font-medium hidden sm:inline">
              {showRelationships ? 'Hide analysis' : 'Explore'}
            </span>
            {showRelationships ? (
              <ChevronUp className="w-4 h-4 text-slateink" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slateink" />
            )}
          </div>
        </button>

        {showRelationships && (
          <div className="p-4 sm:p-6 border-t border-linen-dark/60 bg-paper">
            <RelationshipsPanel beliefs={confirmed} memories={memories ?? []} />
          </div>
        )}
      </div>

      {/* Toolbar: Search & Segmented Filter Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slateink-light" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search statements, descriptions, reflections…"
              aria-label="Search beliefs and values"
              className="w-full h-9 sm:h-10 rounded-full border border-linen-dark bg-white/90 pl-9 pr-8 py-2 text-xs sm:text-sm placeholder:text-slateink-light focus:border-terracotta focus:ring-1 focus:ring-terracotta/20 shadow-xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slateink-light hover:text-charcoal rounded-full"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Kind Filter Pills: All / Beliefs / Values */}
          <div className="flex items-center p-0.5 rounded-full bg-linen/70 border border-linen-dark/60 self-start sm:self-auto shrink-0">
            {(['all', 'belief', 'value'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                aria-pressed={kindFilter === k}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  kindFilter === k
                    ? 'bg-terracotta text-paper shadow-2xs'
                    : 'text-slateink hover:text-charcoal'
                }`}
              >
                {k === 'all' ? 'All kinds' : k === 'belief' ? 'Beliefs' : 'Values'}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Row: Source Tabs & Custom Category Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                  : 'bg-linen/70 text-slateink hover:bg-linen hover:text-charcoal'
              }`}
            >
              All statements ({data?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setFilter('user')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                filter === 'user'
                  ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                  : 'bg-linen/70 text-slateink hover:bg-linen hover:text-charcoal'
              }`}
            >
              My statements ({confirmed.length})
            </button>
            {suggestions.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('suggestions')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  filter === 'suggestions'
                    ? 'bg-amberclay-DEFAULT text-paper shadow-2xs font-semibold'
                    : 'bg-amberclay-light/40 text-amberclay-DEFAULT border border-amberclay-DEFAULT/30 hover:bg-amberclay-light/70'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Suggestions ({suggestions.length})</span>
              </button>
            )}
          </div>

          {/* Refined Custom Category Dropdown */}
          {availableCategories.length > 0 && (
            <div className="relative" ref={categoryDropdownRef}>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                  categoryFilter !== 'all'
                    ? 'bg-terracotta/10 border-terracotta/40 text-terracotta-deep font-semibold'
                    : 'bg-white/90 border-linen-dark text-slateink hover:text-charcoal hover:border-slateink-light'
                }`}
                aria-haspopup="listbox"
                aria-expanded={categoryDropdownOpen}
              >
                <Tag className="w-3.5 h-3.5 text-terracotta" />
                <span>{categoryFilter === 'all' ? 'All categories' : `#${categoryFilter}`}</span>
                <ChevronDown
                  className={`w-3 h-3 text-slateink-light transition-transform duration-150 ${
                    categoryDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {categoryDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-40 min-w-[190px] rounded-2xl border border-linen-dark bg-paper p-1.5 shadow-xl animate-[fadeIn_100ms_ease-out]"
                  role="listbox"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setCategoryDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-terracotta text-paper font-semibold'
                        : 'text-charcoal hover:bg-linen/70'
                    }`}
                  >
                    <span>All categories</span>
                    <span className="text-[11px] opacity-80 tabular-nums">({data?.length ?? 0})</span>
                  </button>

                  <div className="my-1 border-t border-linen-dark/60" />

                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {availableCategories.map((cat) => {
                      const isSelected = categoryFilter === cat;
                      const count = categoryCounts[cat] ?? 0;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setCategoryFilter(cat);
                            setCategoryDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-terracotta text-paper font-semibold'
                              : 'text-charcoal hover:bg-linen/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span className="truncate">#{cat}</span>
                          </div>
                          <span className="text-[10px] opacity-75 tabular-nums ml-2">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal / Dialog Form for Adding / Editing */}
      {showForm && (
        <BeliefForm
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <BeliefForm
          existing={editing}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {actionError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-4 py-2.5 text-xs sm:text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {/* Statements Grid / States */}
      {loading ? (
        <LoadingState label="Loading statements…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Compass className="w-8 h-8 text-terracotta" aria-hidden />}
          title={
            searchQuery
              ? 'No matching statements found'
              : filter === 'suggestions'
              ? 'No suggestions right now'
              : 'No statements recorded yet'
          }
          description={
            searchQuery
              ? `No beliefs or values matched "${searchQuery}". Try adjusting your keywords or clearing the filter.`
              : filter === 'suggestions'
              ? 'When the twin notices recurring themes across your memories, it surfaces them here for you to confirm or dismiss.'
              : 'Beliefs and values establish the moral and intellectual framework your twin draws from. Record your first statement.'
          }
          action={
            searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="rounded-full bg-linen px-4 py-2 text-xs font-semibold text-charcoal hover:bg-linen-dark transition-colors"
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-terracotta px-5 py-2.5 text-xs font-semibold text-paper hover:bg-terracotta-dark transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add first statement</span>
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {visible.map((b) => (
            <BeliefCard
              key={b.id}
              belief={b}
              expanded={expandedId === b.id}
              onToggleHistory={() => setExpandedId(expandedId === b.id ? null : b.id)}
              onEdit={() => setEditing(b)}
              onDelete={() => setPendingDelete(b)}
            />
          ))}
        </div>
      )}

      {/* Refined Confirmation Dialogs */}
      <ConfirmDialog
        open={pendingDismiss !== null}
        title="Dismiss this suggestion?"
        description="The suggested pattern will be removed and will not be re-suggested from the same records."
        confirmLabel="Dismiss suggestion"
        tone="warning"
        previewText={pendingDismiss?.statement}
        onConfirm={handleDismissSuggestion}
        onCancel={() => setPendingDismiss(null)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this statement?"
        description="This statement and all of its reflection history records will be permanently removed. This action cannot be undone."
        confirmLabel="Delete statement"
        tone="danger"
        previewText={pendingDelete?.statement}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function BeliefCard({
  belief,
  expanded,
  onToggleHistory,
  onEdit,
  onDelete,
}: {
  belief: Belief;
  expanded: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isConfirmedSuggestion = belief.origin === 'confirmed_suggestion';
  const isValue = belief.kind === 'value';

  return (
    <article className="group flex flex-col rounded-3xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-5 shadow-xs hover:border-terracotta/40 hover:shadow-sm transition-all duration-200">
      {/* Card Header: Kind, Category, and Action Buttons */}
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isValue ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 border border-terracotta/20 px-2.5 py-0.5 text-[10px] font-bold text-terracotta-deep uppercase tracking-wider">
              <span>🧭</span>
              <span>Value</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slateink/10 border border-linen-dark px-2.5 py-0.5 text-[10px] font-bold text-slateink-dark uppercase tracking-wider">
              <span>💡</span>
              <span>Belief</span>
            </span>
          )}

          {belief.category && (
            <span className="rounded-full bg-linen/70 px-2 py-0.5 text-[11px] font-medium text-slateink">
              #{belief.category}
            </span>
          )}

          {isConfirmedSuggestion && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sage/15 border border-sage/30 px-2 py-0.5 text-[10px] font-semibold text-sage-dark">
              <Sparkles className="w-3 h-3 text-sage-dark" />
              <span>Confirmed</span>
            </span>
          )}
        </div>

        {/* Action buttons: Edit & Delete */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            aria-label={`Edit statement: ${belief.statement}`}
            className="rounded-full p-2 text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors cursor-pointer"
            title="Edit statement"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete statement: ${belief.statement}`}
            className="rounded-full p-2 text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/40 transition-colors cursor-pointer"
            title="Delete statement"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Main Statement Text */}
      <p className="font-serif text-[15px] sm:text-base font-semibold text-charcoal leading-snug mb-2 flex-1">
        “{belief.statement}”
      </p>

      {/* Description / Provenance Context */}
      {belief.description && (
        <p className="text-xs text-slateink leading-relaxed mb-3 line-clamp-3 group-hover:line-clamp-none transition-all">
          {belief.description}
        </p>
      )}

      {/* Card Footer: Strength Meter & Reflection Counter */}
      <div className="flex items-center justify-between pt-2.5 border-t border-linen-dark/50 mt-auto">
        <StrengthMeter value={belief.strength} />

        <div className="flex items-center gap-2">
          {belief.history && belief.history.length > 0 && (
            <button
              onClick={onToggleHistory}
              aria-expanded={expanded}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                expanded
                  ? 'bg-terracotta/15 text-terracotta font-semibold'
                  : 'text-slateink hover:text-terracotta hover:bg-linen/60'
              }`}
            >
              <History className="w-3 h-3" aria-hidden />
              <span>{belief.history.length} {belief.history.length === 1 ? 'reflection' : 'reflections'}</span>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          <span
            className="text-[11px] text-slateink-light"
            title={belief.last_reviewed ? `Last reviewed: ${belief.last_reviewed}` : 'Not reviewed yet'}
          >
            {belief.last_reviewed
              ? new Date(belief.last_reviewed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Initial'}
          </span>
        </div>
      </div>

      {/* Expandable Reflection History Drawer */}
      {expanded && belief.history && (
        <div className="mt-3.5 pt-3 border-t border-linen-dark/60 space-y-2.5 animate-[fadeIn_150ms_ease-out]">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slateink-light">
            Recalibration & Reflection History
          </p>
          <div className="relative pl-3.5 border-l-2 border-linen-dark space-y-2.5">
            {[...belief.history].reverse().map((h) => (
              <div key={h.id} className="relative text-xs">
                {/* Timeline dot */}
                <div className="absolute -left-[19px] top-1 w-2 h-2 rounded-full bg-terracotta" />
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-charcoal tabular-nums bg-linen px-1.5 py-0.2 rounded-md text-[11px]">
                    {h.strength}/100
                  </span>
                  <span className="text-[11px] text-slateink-light">
                    {new Date(h.recorded_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {h.note && (
                  <p className="text-xs text-slateink leading-relaxed bg-white/70 p-2 rounded-xl border border-linen-dark/40">
                    {h.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
