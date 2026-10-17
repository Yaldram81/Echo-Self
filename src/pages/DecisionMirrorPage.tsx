import { useMemo, useState } from 'react';
import { Plus, Trash2, Scale, ChevronRight, RotateCcw } from 'lucide-react';
import { decisionsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Decision, DecisionStatus } from '@/lib/types';
import { DecisionForm } from '@/components/DecisionForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Card,
  SectionHeading,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
  DemoModeBanner,
} from '@/components/ui';

const STATUS_TONES: Record<DecisionStatus, 'amber' | 'sage' | 'neutral'> = {
  unresolved: 'amber',
  decided: 'sage',
  archived: 'neutral',
};

export function DecisionMirrorPage() {
  const { data, loading, error, reload } = useAsyncData(() => decisionsService.list(), []);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Decision | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unresolved = useMemo(() => (data ?? []).filter((d) => d.status === 'unresolved'), [data]);
  const decided = useMemo(() => (data ?? []).filter((d) => d.status === 'decided'), [data]);

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
    <div className="space-y-8">
      <SectionHeading eyebrow="Deliberation" title="Decision Mirror" />
      <DemoModeBanner />

      <p className="max-w-2xl text-sm text-slateink leading-relaxed">
        Lay out a decision with its constraints, uncertainties, and the values it touches. The
        mirror weighs each option against your recorded evidence — preference alignment, never
        predictions — and keeps the reasoning so you can compare it with what actually happened.
      </p>

      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Start a new decision
        </button>
      </div>

      {showForm && (
        <DecisionForm
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <DecisionForm
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
        <LoadingState label="Loading decisions" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <section aria-labelledby="unresolved-decisions">
            <h2 id="unresolved-decisions" className="text-xs uppercase tracking-[0.18em] text-slateink font-medium mb-4">
              On the scale
            </h2>
            {unresolved.length === 0 ? (
              <EmptyState
                icon={<Scale className="w-7 h-7" aria-hidden />}
                title="Nothing on the scale"
                description="Open a decision and the mirror will weigh your options against recorded memories and values."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unresolved.map((d) => (
                  <DecisionCard key={d.id} decision={d} onEdit={() => setEditing(d)} onDelete={() => setPendingDelete(d)} />
                ))}
              </div>
            )}
          </section>

          {decided.length > 0 && (
            <section aria-labelledby="past-decisions">
              <h2 id="past-decisions" className="text-xs uppercase tracking-[0.18em] text-slateink font-medium mb-4">
                Decided — reasoning preserved
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {decided.map((d) => (
                  <DecisionCard key={d.id} decision={d} onEdit={() => setEditing(d)} onDelete={() => setPendingDelete(d)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

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
  onEdit,
  onDelete,
}: {
  decision: Decision;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <a
          href={`#/decision/${decision.id}`}
          className="font-serif text-lg leading-snug text-charcoal hover:text-terracotta-deep transition-colors"
        >
          {decision.title}
        </a>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`#/decision/${decision.id}`}
            aria-label={`Open decision: ${decision.title}`}
            className="rounded-full p-1.5 text-slateink-light hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </a>
          <button
            onClick={onDelete}
            aria-label={`Delete decision: ${decision.title}`}
            className="rounded-full p-1.5 text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="text-sm text-slateink leading-relaxed line-clamp-2 flex-1">{decision.context}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {decision.values.map((v) => (
          <span key={v} className="rounded-md bg-terracotta/10 px-2 py-0.5 text-[11px] text-terracotta-deep">
            {v}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[decision.status]}>{decision.status}</Badge>
        {decision.status === 'decided' && decision.chosen_option && (
          <span className="text-xs text-sage-dark font-medium">chose: {decision.chosen_option}</span>
        )}
        {decision.status === 'decided' && !decision.reflection && (
          <button
            onClick={onEdit}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amberclay-DEFAULT hover:text-terracotta-deep"
          >
            <RotateCcw className="w-3 h-3" aria-hidden />
            Reflect on outcome
          </button>
        )}
        {decision.reflection && (
          <span className="ml-auto text-xs text-sage-dark flex items-center gap-1">
            <RotateCcw className="w-3 h-3" aria-hidden /> reflected
          </span>
        )}
      </div>
    </Card>
  );
}
