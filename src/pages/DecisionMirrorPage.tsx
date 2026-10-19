import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Scale,
  ChevronRight,
  RotateCcw,
  Pencil,
  Search,
  X,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { decisionsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import { navigateTo } from '@/lib/router';
import type { Decision, DecisionStatus } from '@/lib/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { onQuickAddRequest } from '@/lib/quickAdd';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { useAuth } from '@/lib/useAuth';

type FilterTab = 'all' | 'unresolved' | 'decided';

export function DecisionMirrorPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => decisionsService.list(), [user?.id]);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [pendingDelete, setPendingDelete] = useState<Decision | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Quick add request from mobile bottom bar or global shortcut
  useEffect(() => onQuickAddRequest((kind) => {
    if (kind !== 'decision') return;
    navigateTo({ page: 'decision', action: 'new' });
  }), []);

  const totalUnresolved = useMemo(() => (data ?? []).filter((d) => d.status === 'unresolved').length, [data]);
  const totalDecided = useMemo(() => (data ?? []).filter((d) => d.status === 'decided').length, [data]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();

    return list.filter((d) => {
      // Tab filter
      if (activeTab === 'unresolved' && d.status !== 'unresolved') return false;
      if (activeTab === 'decided' && d.status !== 'decided') return false;

      // Search query filter
      if (q === '') return true;
      const optionLabels = (d.options ?? []).map((o) => o.label).join(' ');
      const valuesStr = (d.values ?? []).join(' ');
      const searchBlob = `${d.title} ${d.context} ${optionLabels} ${valuesStr} ${d.chosen_option ?? ''}`.toLowerCase();
      return searchBlob.includes(q);
    });
  }, [data, activeTab, query]);

  async function handleDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await decisionsService.remove(pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the decision.');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 sm:pb-12">
      {/* Header Block: Title & Action Button aligned cleanly */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-terracotta-deep font-semibold">Deliberation</p>
            {data && (
              <span className="text-[10px] font-bold text-slateink-light bg-linen/70 px-2 py-0.5 rounded-full">
                {totalUnresolved} on scale · {totalDecided} decided
              </span>
            )}
          </div>
          <h1 className="font-serif text-xl sm:text-3xl font-bold text-charcoal">Decision Mirror</h1>
        </div>

        <a
          href="/decision/new"
          className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 sm:px-5 text-xs sm:text-sm font-semibold text-paper hover:bg-terracotta-dark transition-all shadow-xs shrink-0 self-start sm:self-auto active:scale-98"
        >
          <Plus className="w-4 h-4" aria-hidden />
          <span>New decision</span>
        </a>
      </div>

      {/* Editorial Lead Context */}
      <p className="text-xs sm:text-sm text-slateink leading-relaxed max-w-2xl">
        Weigh active choices against recorded evidence, personal values, and historical patterns—preserving your reasoning so you can examine what actually unfolds.
      </p>

      {/* Toolbar: Search & Segmented Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slateink-light" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decisions, options, values…"
            aria-label="Search decisions"
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

        {/* Segmented Filter Tabs */}
        <div className="inline-flex items-center p-1 rounded-full bg-linen/60 border border-linen-dark/60 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              activeTab === 'all'
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            All ({data?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unresolved')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
              activeTab === 'unresolved'
                ? 'bg-amberclay-DEFAULT text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amberclay-DEFAULT shrink-0" />
            On scale ({totalUnresolved})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('decided')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
              activeTab === 'decided'
                ? 'bg-sage-dark text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sage-dark shrink-0" />
            Decided ({totalDecided})
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {/* Main Content Area */}
      {loading ? (
        <LoadingState label="Loading decisions" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Scale className="w-7 h-7" aria-hidden />}
          title={
            query
              ? 'No matching decisions found'
              : activeTab === 'unresolved'
              ? 'Nothing currently on the scale'
              : activeTab === 'decided'
              ? 'No past decisions recorded yet'
              : 'No decisions recorded yet'
          }
          description={
            query
              ? 'Try modifying your search query or switching filter tabs.'
              : 'Open a decision to weigh competing options against your recorded memories and values.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4.5">
          {filtered.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onDelete={() => setPendingDelete(d)}
            />
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this decision?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" and its preserved reasoning will be permanently removed. This cannot be undone.`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function DecisionCard({
  decision,
  onDelete,
}: {
  decision: Decision;
  onDelete: () => void;
}) {
  const isDecided = decision.status === 'decided';
  const options = decision.options ?? [];

  return (
    <div className="rounded-2xl border border-linen-dark/80 bg-paper-soft/90 p-4 sm:p-5 shadow-xs hover:border-terracotta/40 hover:shadow-md transition-all flex flex-col justify-between group">
      <div>
        {/* Card Top Metadata & Action Icons */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            {isDecided ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sage/15 border border-sage/20 px-2.5 py-0.5 text-[11px] font-semibold text-sage-dark">
                <CheckCircle2 className="w-3 h-3 text-sage-dark" />
                Decided
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amberclay/15 border border-amberclay/20 px-2.5 py-0.5 text-[11px] font-semibold text-amberclay-DEFAULT">
                <Scale className="w-3 h-3 text-amberclay-DEFAULT" />
                On the scale
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slateink-light bg-linen/50 px-2 py-0.5 rounded-full">
              <Layers className="w-3 h-3 text-slateink-light/80" />
              {options.length} {options.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <a
              href={`/decision/${decision.id}/edit`}
              aria-label={`Edit ${decision.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onDelete}
              aria-label={`Delete ${decision.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/decision/${decision.id}`}
              aria-label={`Open deliberation: ${decision.title}`}
              className="p-1.5 rounded-lg text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal leading-snug">
          <a
            href={`/decision/${decision.id}`}
            className="hover:text-terracotta-deep transition-colors"
          >
            {decision.title}
          </a>
        </h2>

        {/* Context Excerpt */}
        <p className="mt-1.5 text-xs sm:text-sm text-slateink leading-relaxed line-clamp-2">
          {decision.context}
        </p>

        {/* Options Preview Pills */}
        {options.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {options.map((opt, idx) => {
              const isChosen = isDecided && decision.chosen_option === opt.label;
              return (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    isChosen
                      ? 'bg-sage/20 border border-sage/40 text-sage-dark font-semibold'
                      : 'bg-white/80 border border-linen-dark/60 text-slateink-dark'
                  }`}
                >
                  {isChosen && <CheckCircle2 className="w-3 h-3 text-sage-dark" />}
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">{opt.label}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Linked Personal Values */}
        {decision.values && decision.values.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {decision.values.map((v) => (
              <span
                key={v}
                className="rounded-md bg-terracotta/8 border border-terracotta/15 px-1.5 py-0.5 text-[10px] text-terracotta-deep font-medium"
              >
                #{v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Card Footer: Metadata & Navigation Prompt */}
      <div className="mt-4 pt-2.5 border-t border-linen-dark/50 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1 text-[11px] text-slateink-light">
          <Calendar className="w-3 h-3 text-slateink-light/80" />
          <span>
            {new Date(decision.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isDecided ? (
            decision.reflection ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-sage-dark font-medium">
                <RotateCcw className="w-3 h-3" />
                Reflected
              </span>
            ) : (
              <a
                href={`/decision/${decision.id}`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amberclay-DEFAULT hover:text-terracotta-deep transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reflect on outcome →
              </a>
            )
          ) : (
            <a
              href={`/decision/${decision.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-terracotta hover:text-terracotta-dark transition-colors"
            >
              Weigh options →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
