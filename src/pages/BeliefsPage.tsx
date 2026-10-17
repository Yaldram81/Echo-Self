import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { beliefsService, memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Belief, BeliefKind } from '@/lib/types';
import { RelationshipsPanel } from '@/components/RelationshipsPanel';
import { BeliefForm } from '@/components/BeliefForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Card,
  SectionHeading,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
  StrengthMeter,
  DemoModeBanner,
} from '@/components/ui';

export function BeliefsPage() {
  const { data, loading, error, reload } = useAsyncData(() => beliefsService.listWithHistory(), []);
  const { data: memories } = useAsyncData(() => memoriesService.list(), []);
  const [filter, setFilter] = useState<'all' | 'user' | 'suggestions'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | BeliefKind>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Belief | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Belief | null>(null);
  const [pendingDismiss, setPendingDismiss] = useState<Belief | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const confirmed = useMemo(
    () => (data ?? []).filter((b) => b.origin === 'user' || b.origin === 'confirmed_suggestion'),
    [data]
  );
  const suggestions = useMemo(() => (data ?? []).filter((b) => b.origin === 'suggestion'), [data]);

  const visible = useMemo(() => {
    let pool: Belief[];
    if (filter === 'suggestions') pool = suggestions;
    else if (filter === 'user') pool = confirmed;
    else pool = data ?? [];
    return pool.filter((b) => kindFilter === 'all' || b.kind === kindFilter);
  }, [data, confirmed, suggestions, filter, kindFilter]);

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
    <div className="space-y-8">
      <SectionHeading eyebrow="Interior" title="Beliefs & Values" as="h1" />
      <DemoModeBanner />

      <p className="max-w-2xl text-sm text-slateink leading-relaxed">
        Statements you write, or explicitly confirm, are kept as your own records. Patterns the
        twin notices stay labeled as suggestions until you decide; nothing is confirmed or
        overwritten automatically.
      </p>

      {suggestions.length > 0 && (
        <section aria-label="AI-suggested patterns" className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amberclay-DEFAULT font-medium">
            <Sparkles className="w-4 h-4" aria-hidden />
            Twin suggestions (not yet confirmed by you)
          </h2>
          {suggestions.map((s) => (
            <Card key={s.id} className="border-amberclay-DEFAULT/40 bg-amberclay-light/30">
              <div className="flex items-start justify-between gap-3 mb-2">
                <Badge tone="amber">AI suggestion</Badge>
                <span className="text-[11px] capitalize text-slateink-light">
                  {s.kind} · {s.category}
                </span>
              </div>
              <p className="font-serif text-[1.1rem] leading-snug text-charcoal mb-2">
                “{s.statement}”
              </p>
              {s.description && (
                <p className="text-xs text-slateink leading-relaxed mb-4">{s.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleConfirmSuggestion(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-light px-4 py-1.5 text-xs font-medium text-sage-dark hover:bg-sage hover:text-paper transition-colors"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden /> Confirm: this is true of me
                </button>
                <button
                  onClick={() => setPendingDismiss(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-clayred-DEFAULT hover:text-clayred-DEFAULT transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden /> Dismiss
                </button>
                <span className="text-[11px] text-slateink-light italic">
                  confirming records it as yours; dismissing removes it entirely
                </span>
              </div>
            </Card>
          ))}
        </section>
      )}

      <RelationshipsPanel beliefs={confirmed} memories={memories ?? []} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {(['all', 'user', 'suggestions'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-charcoal text-paper' : 'bg-linen/70 text-slateink-dark hover:bg-linen'
              }`}
            >
              {f === 'all' ? 'All statements' : f === 'user' ? 'My statements' : 'Suggestions'}
            </button>
          ))}
          <span className="w-px self-stretch bg-linen-dark" aria-hidden />
          {(['all', 'belief', 'value'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              aria-pressed={kindFilter === k}
              className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                kindFilter === k ? 'bg-terracotta text-paper' : 'bg-linen/70 text-slateink-dark hover:bg-linen'
              }`}
            >
              {k === 'all' ? 'Both kinds' : `${k}s`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          aria-expanded={showForm}
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Add a statement
        </button>
      </div>

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
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {loading ? (
        <LoadingState label="Loading statements" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Compass className="w-7 h-7" aria-hidden />}
          title={filter === 'suggestions' ? 'No suggestions right now' : 'No statements recorded yet'}
          description={
            filter === 'suggestions'
              ? 'When the twin notices a recurring pattern across your memories, it will appear here for you to confirm or dismiss.'
              : 'Beliefs and values give your twin a vocabulary for who you are. Add the first one.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <ConfirmDialog
        open={pendingDismiss !== null}
        title="Dismiss this suggestion?"
        description="The suggested pattern will be removed and will not be re-suggested from the same records."
        confirmLabel="Dismiss"
        onConfirm={handleDismissSuggestion}
        onCancel={() => setPendingDismiss(null)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this statement?"
        description={`"${pendingDelete?.statement}" will be permanently removed. This cannot be undone.`}
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

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={belief.status === 'active' ? 'sage' : belief.status === 'evolving' ? 'amber' : 'clay'}>
            {belief.status}
          </Badge>
          <Badge tone="neutral">{belief.kind}</Badge>
          <span className="text-[11px] capitalize text-slateink-light">{belief.category}</span>
          {isConfirmedSuggestion && (
            <Badge tone="sage">
              <Sparkles className="w-3 h-3" aria-hidden /> confirmed from a suggestion
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            aria-label={`Edit statement: ${belief.statement}`}
            className="rounded-full p-2.5 text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
          >
            <Edit3 className="w-4 h-4" aria-hidden />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete statement: ${belief.statement}`}
            className="rounded-full p-2.5 text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="font-serif text-[1.15rem] leading-snug text-charcoal mb-2 flex-1">
        “{belief.statement}”
      </p>
      {belief.description && (
        <p className="text-xs text-slateink leading-relaxed mb-3">{belief.description}</p>
      )}

      <div className="flex items-center justify-between">
        <StrengthMeter value={belief.strength} />
        {belief.history && belief.history.length > 0 && (
          <button
            onClick={onToggleHistory}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-xs text-terracotta-deep hover:text-terracotta-dark font-medium"
          >
            <History className="w-3.5 h-3.5" aria-hidden />
            {belief.history.length} reflection{belief.history.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {expanded && belief.history && (
        <ol className="mt-4 space-y-3 border-t border-linen-dark/60 pt-4">
          {[...belief.history].reverse().map((h) => (
            <li key={h.id} className="text-xs">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-charcoal tabular-nums">{h.strength}/100</span>
                <span className="text-slateink-light">
                  {new Date(h.recorded_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {h.note && <p className="text-slateink leading-relaxed">{h.note}</p>}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-[11px] text-slateink-light flex items-center gap-1.5">
        <Quote className="w-3 h-3" aria-hidden />
        Last reviewed{' '}
        {belief.last_reviewed
          ? new Date(belief.last_reviewed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'not yet'}
      </p>
    </Card>
  );
}
