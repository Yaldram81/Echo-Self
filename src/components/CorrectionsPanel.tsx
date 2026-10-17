import { useState } from 'react';
import { Check, X, RefreshCw, Pencil, Clock, ShieldCheck } from 'lucide-react';
import { flagsService } from '@/lib/services';
import type { CorrectionStatus, InterpretationFlag, Memory } from '@/lib/types';

const STATUS_LABEL: Record<CorrectionStatus, string> = {
  proposed: 'Proposed: not yet part of answers',
  confirmed: 'Confirmed: part of relevant answers',
  superseded: 'Superseded: kept as history only',
  dismissed: 'Dismissed: not used',
};

const STATUS_CLASS: Record<CorrectionStatus, string> = {
  proposed: 'bg-amberclay-light text-amberclay-DEFAULT',
  confirmed: 'bg-sage-light text-sage-dark',
  superseded: 'bg-linen text-slateink-dark',
  dismissed: 'bg-clayred-light text-clayred-DEFAULT',
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CorrectionsPanel({
  flags,
  memories,
  onChanged,
}: {
  flags: InterpretationFlag[];
  memories: Memory[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceNote, setReplaceNote] = useState('');

  const memoryById = new Map(memories.map((m) => [m.id, m]));

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      onChanged();
    } catch {
      setActionError('The change could not be saved. Nothing was lost, please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function startAmend(flag: InterpretationFlag) {
    setEditingId(flag.id);
    setEditNote(flag.correction_note);
    setEditTopic(flag.topic ?? '');
    setReplacingId(null);
  }

  function startReplace(flag: InterpretationFlag) {
    setReplacingId(flag.id);
    setReplaceNote('');
    setEditingId(null);
  }

  async function saveAmend(id: string) {
    if (!editNote.trim()) return;
    await run(id, () =>
      flagsService.amend(id, { correction_note: editNote.trim(), topic: editTopic.trim() || null })
    );
    setEditingId(null);
  }

  async function confirmReplace(old: InterpretationFlag) {
    if (!replaceNote.trim()) return;
    await run(old.id, async () => {
      const created = await flagsService.create({
        memory_id: old.memory_id,
        answer_excerpt: old.answer_excerpt,
        correction_note: replaceNote.trim(),
        topic: old.topic ?? undefined,
      });
      await flagsService.setStatus(old.id, 'superseded', created.id);
    });
    setReplacingId(null);
  }

  function actionsFor(flag: InterpretationFlag) {
    if (busyId === flag.id) {
      return <span className="text-[11px] text-slateink-light">Saving…</span>;
    }
    switch (flag.status) {
      case 'proposed':
      case 'confirmed':
        return (
          <div className="flex flex-wrap gap-1.5">
            {flag.status === 'proposed' && (
              <button
                onClick={() => run(flag.id, () => flagsService.setStatus(flag.id, 'confirmed'))}
                className="inline-flex items-center gap-1 rounded-full bg-sage-dark px-2.5 py-1 text-[10px] font-medium text-paper hover:opacity-90 transition-opacity"
              >
                <Check className="w-3 h-3" aria-hidden /> Confirm
              </button>
            )}
            <button
              onClick={() => startAmend(flag)}
              className="inline-flex items-center gap-1 rounded-full border border-linen-dark px-2.5 py-1 text-[10px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
            >
              <Pencil className="w-3 h-3" aria-hidden /> Amend
            </button>
            <button
              onClick={() => startReplace(flag)}
              className="inline-flex items-center gap-1 rounded-full border border-linen-dark px-2.5 py-1 text-[10px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
            >
              <RefreshCw className="w-3 h-3" aria-hidden /> Replace
            </button>
            <button
              onClick={() => run(flag.id, () => flagsService.setStatus(flag.id, 'dismissed'))}
              className="inline-flex items-center gap-1 rounded-full border border-linen-dark px-2.5 py-1 text-[10px] font-medium text-slateink-dark hover:border-clayred-DEFAULT hover:text-clayred-DEFAULT transition-colors"
            >
              <X className="w-3 h-3" aria-hidden /> Dismiss
            </button>
          </div>
        );
      case 'dismissed':
        return (
          <button
            onClick={() => run(flag.id, () => flagsService.setStatus(flag.id, 'proposed'))}
            className="inline-flex items-center gap-1 rounded-full border border-linen-dark px-2.5 py-1 text-[10px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
          >
            <RefreshCw className="w-3 h-3" aria-hidden /> Reopen as proposal
          </button>
        );
      case 'superseded':
        return <span className="text-[11px] text-slateink-light italic">Kept as history.</span>;
    }
  }

  return (
    <div className="card-surface p-5 md:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-sage-dark">
          <ShieldCheck className="w-4 h-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-serif text-lg text-charcoal">Your corrections</h2>
          <p className="text-xs text-slateink leading-relaxed mt-0.5">
            Corrections only influence answers once you confirm them, and only on the records
            and topics they name. Confirming, amending, or dismissing never changes the
            original memory.
          </p>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-3 rounded-lg bg-clayred-light px-3 py-2 text-xs text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {flags.length === 0 ? (
        <p className="text-sm text-slateink-light italic">
          No corrections saved yet. Flag an interpretation in a twin answer to propose one.
        </p>
      ) : (
        <ul className="space-y-3">
          {flags.map((flag) => {
            const mem = memoryById.get(flag.memory_id);
            const supersedesText = flag.superseded_by
              ? 'Replaced by a newer correction on the same record.'
              : null;
            return (
              <li key={flag.id} className="rounded-xl border border-linen-dark bg-white/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  {mem ? (
                    <a
                      href={`/memory/${mem.id}`}
                      className="font-serif text-sm text-charcoal hover:text-terracotta-deep"
                    >
                      {mem.title}
                    </a>
                  ) : (
                    <span className="font-serif text-sm text-slateink-light">Deleted record</span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-wide font-medium ${STATUS_CLASS[flag.status]}`}
                  >
                    {STATUS_LABEL[flag.status]}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-slateink-light italic mb-1">
                  Twin said: “{flag.answer_excerpt}”
                </p>
                {editingId === flag.id ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="w-full rounded-lg border border-linen-dark bg-white px-3 py-2 text-xs leading-relaxed focus:border-terracotta"
                      aria-label="Correction text"
                    />
                    <input
                      value={editTopic}
                      onChange={(e) => setEditTopic(e.target.value)}
                      className="w-full rounded-lg border border-linen-dark bg-white px-3 py-2 text-xs focus:border-terracotta"
                      placeholder="Topic (optional), e.g. running"
                      aria-label="Correction topic"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveAmend(flag.id)}
                        disabled={!editNote.trim() || busyId === flag.id}
                        className="rounded-full bg-terracotta px-3 py-1 text-[10px] font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50"
                      >
                        Save amendment
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-full px-3 py-1 text-[10px] text-slateink-dark hover:bg-linen transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-charcoal">
                    “{flag.correction_note}”
                  </p>
                )}

                {(flag.topic || flag.reviewed_at || supersedesText) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slateink-light">
                    {flag.topic && (
                      <span className="rounded-full bg-linen px-2 py-0.5 text-slateink-dark">
                        Topic: {flag.topic}
                      </span>
                    )}
                    {flag.reviewed_at && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden /> Reviewed {shortDate(flag.reviewed_at)}
                      </span>
                    )}
                    {supersedesText && <span>{supersedesText}</span>}
                  </div>
                )}

                <p className="mt-1.5 text-[10px] text-slateink-light">
                  Proposed {shortDate(flag.created_at)}
                </p>

                {replacingId === flag.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={2}
                      value={replaceNote}
                      onChange={(e) => setReplaceNote(e.target.value)}
                      className="w-full rounded-lg border border-linen-dark bg-white px-3 py-2 text-xs leading-relaxed focus:border-terracotta"
                      placeholder="The replacement correction. The old one stays as history."
                      aria-label="Replacement correction text"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmReplace(flag)}
                        disabled={!replaceNote.trim() || busyId === flag.id}
                        className="rounded-full bg-terracotta px-3 py-1 text-[10px] font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50"
                      >
                        Save replacement
                      </button>
                      <button
                        onClick={() => setReplacingId(null)}
                        className="rounded-full px-3 py-1 text-[10px] text-slateink-dark hover:bg-linen transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5">{actionsFor(flag)}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
