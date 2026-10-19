import { useState } from 'react';
import { ArrowLeft, Trash2, Sparkles, PenLine, Pencil, Calendar, ShieldCheck } from 'lucide-react';
import { memoriesService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Memory } from '@/lib/types';
import { MemoryForm } from '@/components/MemoryForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingState, ErrorState } from '@/components/ui';
import { navigateTo } from '@/lib/router';
import { useAuth } from '@/lib/useAuth';

const MOOD_TONES: Record<Memory['mood'], { bg: string; text: string }> = {
  positive: { bg: 'bg-sage/15', text: 'text-sage-dark' },
  neutral: { bg: 'bg-linen', text: 'text-slateink-dark' },
  mixed: { bg: 'bg-amberclay/20', text: 'text-amberclay-DEFAULT' },
  difficult: { bg: 'bg-clayred-light/40', text: 'text-clayred-DEFAULT' },
};

export function MemoryDetailPage({ memoryId }: { memoryId: string }) {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    () => memoriesService.get(memoryId, user?.id),
    [memoryId, user?.id, authLoading],
    { enabled: !authLoading }
  );
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Opening memory" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <BackLink />
        <div className="rounded-2xl border border-linen-dark bg-white p-8 text-center space-y-2">
          <p className="font-serif text-lg font-bold text-charcoal">Memory not found</p>
          <p className="text-xs text-slateink">
            It may have been deleted, or the link is out of date.
          </p>
        </div>
      </div>
    );
  }

  const memory = data;
  const moodStyle = MOOD_TONES[memory.mood] ?? MOOD_TONES.neutral;
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
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Breadcrumb & Action Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-charcoal hover:bg-white hover:border-terracotta/40 transition-all shadow-xs"
          >
            <Pencil className="w-3.5 h-3.5 text-terracotta" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete memory"
            className="inline-flex items-center gap-1.5 rounded-full border border-clayred-light/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 transition-all shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl bg-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {/* Unified Editorial Article */}
      <article className="rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-white shadow-card p-5 sm:p-8 space-y-6">
        {/* Header Metadata */}
        <div className="space-y-3 pb-5 border-b border-linen-dark/60">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] font-semibold text-terracotta-deep bg-terracotta/10 px-2.5 py-0.5 rounded-full capitalize">
              {memory.category.replace('_', ' ')}
            </span>
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full capitalize ${moodStyle.bg} ${moodStyle.text}`}>
              {memory.mood}
            </span>
            <span className="text-[11px] text-slateink-light bg-linen/60 px-2.5 py-0.5 rounded-full capitalize">
              {memory.source}
            </span>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold leading-tight text-charcoal tracking-tight">
            {memory.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slateink-light">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(memory.occurred_at).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span>·</span>
            <span className="text-terracotta-deep font-medium">
              {memory.confidence}% clarity
            </span>
            {memory.user_importance != null && (
              <>
                <span>·</span>
                <span title="Your significance rating (1–5)">
                  Significance: {memory.user_importance}/5
                </span>
              </>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((t) => (
                <span key={t} className="rounded-md bg-linen px-2 py-0.5 text-[10px] text-slateink-dark font-medium">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Section 1: Original text */}
        <section aria-label="Original text" className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-slateink-light text-[11px] uppercase tracking-wider font-semibold">
            <PenLine className="w-3.5 h-3.5 text-terracotta" aria-hidden />
            <span>Original text (written by you)</span>
          </div>
          <div className="border-l-3 border-terracotta/40 pl-4 sm:pl-5 py-0.5">
            <p className="font-sans text-sm sm:text-base leading-relaxed text-charcoal whitespace-pre-line">
              {memory.content}
            </p>
          </div>
        </section>

        {/* Section 2: AI Interpretation */}
        <section aria-label="AI interpretation" className="pt-2">
          <div className="rounded-2xl bg-paper-soft border border-linen-dark/80 p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-amberclay-DEFAULT text-[11px] uppercase tracking-wider font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amberclay-DEFAULT" aria-hidden />
              <span>Twin&apos;s interpretation (AI-generated)</span>
            </div>

            {memory.ai_interpretation ? (
              <div className="space-y-2">
                <p className="text-xs sm:text-sm leading-relaxed text-charcoal whitespace-pre-line font-serif italic">
                  &ldquo;{memory.ai_interpretation}&rdquo;
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slateink-light border-t border-linen-dark/50 pt-2">
                  <ShieldCheck className="w-3 h-3 text-sage-dark shrink-0" />
                  <span>
                    Generated from your record. Your original text above is always the authoritative ground truth.
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slateink-light italic">
                The twin has not synthesized this memory yet. Its observations will appear here, strictly grounded in your recorded words.
              </p>
            )}
          </div>
        </section>
      </article>

      {/* Edit Modal */}
      {editing && (
        <MemoryForm
          existing={memory}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this memory?"
        description={`"${memory.title}" will be permanently removed, along with any AI interpretations attached to it.`}
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
      className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal transition-colors group"
    >
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
      <span>All memories</span>
    </a>
  );
}
