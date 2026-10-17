import { useState } from 'react';
import { ArrowLeft, Trash2, Sparkles, PenLine } from 'lucide-react';
import { memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Memory } from '@/lib/types';
import { MemoryForm } from '@/components/MemoryForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingState, ErrorState, Badge, ConfidenceBar } from '@/components/ui';
import { navigateTo } from '@/lib/router';

const MOOD_TONES: Record<Memory['mood'], 'sage' | 'neutral' | 'amber' | 'clay'> = {
  positive: 'sage',
  neutral: 'neutral',
  mixed: 'amber',
  difficult: 'clay',
};

export function MemoryDetailPage({ memoryId }: { memoryId: string }) {
  const { data, loading, error, reload } = useAsyncData(
    () => memoriesService.get(memoryId),
    [memoryId]
  );
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Opening memory" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="card-surface p-10 text-center">
          <p className="font-serif text-xl text-charcoal mb-2">Memory not found</p>
          <p className="text-sm text-slateink mb-1">
            It may have been deleted, or the link is out of date.
          </p>
        </div>
      </div>
    );
  }

  const memory = data;
  const tags = (memory.tags ?? []).filter((t) => t !== 'demo-wave-2');

  async function handleConfirmDelete() {
    if (!memory) return;
    setActionError(null);
    try {
      await memoriesService.remove(memory.id);
      navigateTo('memories');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the memory.');
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {editing ? (
        <MemoryForm
          existing={memory}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <article className="space-y-6">
          <header className="card-surface p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="terracotta">{memory.category.replace('_', ' ')}</Badge>
                <Badge tone={MOOD_TONES[memory.mood]}>{memory.mood}</Badge>
                <Badge tone="neutral">{memory.source}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-linen-dark bg-linen-light px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete memory"
                  className="inline-flex items-center gap-1.5 rounded-full border border-clayred-light px-4 py-1.5 text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  Delete
                </button>
              </div>
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-light leading-tight text-charcoal mb-2">
              {memory.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slateink-light">
              <span>
                {new Date(memory.occurred_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <ConfidenceBar value={memory.confidence} />
              {memory.user_importance != null && (
                <span title="Your significance rating (1–5)">
                  Significance: {memory.user_importance}/5
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-md bg-linen px-2 py-0.5 text-[11px] text-slateink-dark">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </header>

          <section aria-label="Original text" className="card-surface p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <PenLine className="w-4 h-4 text-slateink" aria-hidden />
              <h2 className="text-xs uppercase tracking-[0.18em] text-slateink font-medium">
                Original text (written by you)
              </h2>
            </div>
            <p className="text-[15px] leading-[1.8] text-charcoal whitespace-pre-line border-l-2 border-terracotta/40 pl-4">
              {memory.content}
            </p>
          </section>

          <section aria-label="AI interpretation" className="card-surface p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-amberclay-DEFAULT" aria-hidden />
              <h2 className="text-xs uppercase tracking-[0.18em] text-amberclay-DEFAULT font-medium">
                Twin's interpretation (AI-generated)
              </h2>
            </div>
            {memory.ai_interpretation ? (
              <div className="border border-dashed border-amberclay-DEFAULT/50 bg-amberclay-light/40 rounded-xl px-5 py-4">
                <p className="text-sm leading-[1.8] text-charcoal-soft whitespace-pre-line">
                  {memory.ai_interpretation}
                </p>
                <p className="mt-3 text-[11px] text-slateink-light">
                  Generated from your record by the twin. It may contain mistakes; your original
                  text above is always the source of truth.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slateink-light italic">
                The twin has not interpreted this memory yet. Its observations will appear here,
                kept apart from your own words.
              </p>
            )}
          </section>
        </article>
      )}

      {actionError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this memory?"
        description={`"${memory?.title}" will be permanently removed. This cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function BackLink() {
  return (
    <a
      href="/memories"
      className="inline-flex items-center gap-1.5 text-sm text-slateink hover:text-charcoal transition-colors"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden />
      All memories
    </a>
  );
}
