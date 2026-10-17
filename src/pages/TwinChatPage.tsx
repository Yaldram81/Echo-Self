import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Quote, ChevronDown, Flag, Pencil, AlertTriangle, Settings2 } from 'lucide-react';
import { memoriesService, beliefsService, flagsService } from '@/lib/services';
import { askTwin, twinMode, TwinUnavailableError } from '@/lib/twinService';
import type { TwinMode } from '@/lib/twinService';
import type { ChatMessage, Memory, TwinReply } from '@/lib/types';
import { useAsyncData } from '@/hooks/useAsyncData';
import { SectionHeading, LoadingState, ErrorState, DemoModeBanner } from '@/components/ui';
import { formatMemoryForContext } from '@/lib/retrieval';

const SUGGESTED_QUESTIONS = [
  'What priorities have I repeatedly expressed?',
  'What experiences seem relevant to my current challenge?',
  'Where do my recorded beliefs conflict?',
  'What has changed in my thinking over time?',
  'Which memories support your interpretation?',
];

let messageCounter = 0;
function nextMessageId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

export function TwinChatPage() {
  const memories = useAsyncData(() => memoriesService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);
  const loading = memories.loading || beliefs.loading;
  const error = memories.error || beliefs.error;

  const mode: TwinMode = twinMode();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<{ messageId: string; memoryId: string } | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [flagState, setFlagState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thinking]);

  const memoryById = new Map((memories.data ?? []).map((m) => [m.id, m]));

  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    setSendError(null);
    setNotConfigured(false);
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId(), role: 'user', content: question, created_at: new Date().toISOString() },
    ]);
    setThinking(true);
    try {
      const { reply } = await askTwin(question, memories.data ?? [], beliefs.data ?? []);
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'twin',
          content: reply.answer,
          created_at: new Date().toISOString(),
          reply,
          evidenceIds: reply.sources.map((s) => s.memoryId),
        },
      ]);
    } catch (err) {
      if (err instanceof TwinUnavailableError && err.kind === 'not-configured') {
        setNotConfigured(true);
      } else {
        setSendError(err instanceof Error ? err.message : 'The twin could not answer. Try again.');
      }
    } finally {
      setThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  async function submitFlag() {
    if (!flagging || !flagNote.trim()) return;
    const message = messages.find((m) => m.id === flagging.messageId);
    const memory = memoryById.get(flagging.memoryId);
    if (!message || !memory) return;
    setFlagState('saving');
    try {
      await flagsService.create({
        memory_id: memory.id,
        answer_excerpt: message.content.slice(0, 500),
        correction_note: flagNote.trim(),
      });
      setFlagState('saved');
      setMessages((prev) =>
        prev.map((m) => (m.id === flagging.messageId ? { ...m, flagged: true } : m))
      );
    } catch {
      setFlagState('error');
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Dialogue" title="Twin Chat" />
      {mode === 'demo' && <DemoModeBanner />}

      {mode === 'demo' && (
        <div className="rounded-xl border border-terracotta/25 bg-terracotta/8 px-4 py-3 text-xs leading-relaxed text-terracotta-deep">
          <strong className="font-semibold">Sample conversation mode.</strong> Replies are
          composed locally from the sample persona's records using keyword retrieval — no AI
          provider is connected. Answers are grounded in the records shown in the evidence
          panels, but they are not model-generated.
        </div>
      )}

      {notConfigured && (
        <div className="card-surface border-clayred-light p-5 flex items-start gap-3">
          <Settings2 className="w-5 h-5 text-clayred-DEFAULT shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-medium text-charcoal mb-1">AI provider not configured</p>
            <p className="text-sm text-slateink leading-relaxed">
              The twin runs server-side and needs an AI provider key before it can answer. Until
              it's set up, you'll see a setup message here rather than a fabricated reply. You
              can still explore the sample conversation mode below.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label="Gathering records" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { memories.reload(); beliefs.reload(); }} />
      ) : (
        <div className="card-surface flex flex-col h-[70vh] min-h-[460px]">
          <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5" aria-live="polite">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <Sparkles className="w-7 h-7 text-terracotta/70 mb-3" aria-hidden />
                <p className="font-serif text-xl text-charcoal mb-2">Ask your twin something.</p>
                <p className="text-sm text-slateink max-w-md mb-6 leading-relaxed">
                  Every answer is grounded in recorded evidence, distinguishes supported facts
                  from interpretation, and links each citation back to the exact memory.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-full border border-linen-dark bg-linen-light px-4 py-2 text-xs text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-charcoal px-4 py-3 text-sm leading-relaxed text-paper">
                    {m.content}
                  </div>
                </div>
              ) : (
                <TwinMessage
                  key={m.id}
                  message={m}
                  memories={memories.data ?? []}
                  mode={mode}
                  evidenceOpen={!!openEvidence[m.id]}
                  onToggleEvidence={() =>
                    setOpenEvidence((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                  }
                  onFlag={(memoryId) => {
                    setFlagging({ messageId: m.id, memoryId });
                    setFlagNote('');
                    setFlagState('idle');
                  }}
                  onFollowUp={(q) => send(q)}
                />
              )
            )}

            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-linen-light border border-linen-dark/60 px-4 py-3">
                  <span className="flex gap-1.5" aria-label="Twin is thinking">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full bg-terracotta/60 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {sendError && (
            <p role="alert" className="mx-5 mb-2 rounded-lg bg-clayred-light px-3 py-2 text-xs text-clayred-DEFAULT">
              {sendError}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-linen-dark/60 p-4 flex items-end gap-3"
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask your twin
            </label>
            <textarea
              id="chat-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about priorities, conflicts, changes over time…"
              className="flex-1 resize-none rounded-xl border border-linen-dark bg-white/80 px-4 py-3 text-sm leading-relaxed focus:border-terracotta max-h-32"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Send message"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" aria-hidden />
            </button>
          </form>
        </div>
      )}

      {flagging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Flag an interpretation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFlagging(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-lifted border border-linen-dark">
            <div className="flex items-start gap-3 mb-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amberclay-light text-amberclay-DEFAULT">
                <Flag className="w-4 h-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-serif text-lg text-charcoal mb-1">Flag this interpretation</h2>
                <p className="text-xs text-slateink leading-relaxed">
                  About the memory "{memoryById.get(flagging.memoryId)?.title ?? 'Unknown record'}".
                  Your correction is saved with the record so the twin's view can be fixed.
                </p>
              </div>
            </div>
            <label htmlFor="flag-note" className="block text-xs font-medium text-slateink-dark mb-1.5">
              What's wrong, and what should the record say?
            </label>
            <textarea
              id="flag-note"
              rows={3}
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
              placeholder="e.g. I no longer hold this belief the way it reads."
            />
            {flagState === 'saved' && (
              <p className="mt-2 text-xs text-sage-dark flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" aria-hidden /> Correction saved with the record.
              </p>
            )}
            {flagState === 'error' && (
              <p role="alert" className="mt-2 text-xs text-clayred-DEFAULT">
                Could not save the correction. Please try again.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setFlagging(null)}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
              >
                Close
              </button>
              <button
                onClick={submitFlag}
                disabled={!flagNote.trim() || flagState === 'saving'}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {flagState === 'saving' ? 'Saving…' : 'Save correction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TwinMessage({
  message,
  memories,
  mode,
  evidenceOpen,
  onToggleEvidence,
  onFlag,
  onFollowUp,
}: {
  message: ChatMessage;
  memories: Memory[];
  mode: TwinMode;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
  onFlag: (memoryId: string) => void;
  onFollowUp: (q: string) => void;
}) {
  const reply: TwinReply | undefined = message.reply;
  const memoryById = new Map(memories.map((m) => [m.id, m]));

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-linen-light border border-linen-dark/60 px-4 py-3">
        {mode === 'demo' && (
          <p className="text-[10px] uppercase tracking-[0.15em] text-amberclay-DEFAULT mb-2">
            Sample reply — composed locally from records
          </p>
        )}
        <p className="whitespace-pre-line text-sm leading-relaxed text-charcoal">
          {message.content}
        </p>

        {reply && reply.conflicts && reply.conflicts.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-amberclay-DEFAULT flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden /> Conflicting records — both shown, no winner chosen
            </p>
            {reply.conflicts.map((c, i) => (
              <div key={i} className="rounded-xl bg-amberclay-light/40 border border-amberclay-DEFAULT/30 px-3.5 py-2.5">
                <p className="text-xs leading-relaxed text-charcoal-soft mb-2">{c.explanation}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[c.a, c.b].map((side) => (
                    <a
                      key={side.memoryId}
                      href={`#/memory/${side.memoryId}`}
                      className="block rounded-lg bg-white/80 border border-linen-dark px-3 py-2 hover:border-terracotta transition-colors"
                    >
                      <p className="font-serif text-xs text-charcoal">{side.title}</p>
                      <p className="text-[10px] text-slateink-light mb-1">
                        {new Date(side.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[11px] leading-relaxed text-slateink-dark">“{side.excerpt}”</p>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {reply && reply.claims && reply.claims.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slateink-light mb-1.5">
              Claim by claim
            </p>
            <ul className="space-y-1.5">
              {reply.claims.map((c, i) => (
                <li key={i} className="rounded-xl bg-white/70 border border-linen-dark/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs leading-relaxed text-charcoal">{c.claim}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide font-medium ${
                        c.type === 'directly_supported'
                          ? 'bg-sage-light text-sage-dark'
                          : c.type === 'conflicting_evidence'
                            ? 'bg-amberclay-light text-amberclay-DEFAULT'
                            : c.type === 'unknown'
                              ? 'bg-clayred-light text-clayred-DEFAULT'
                              : 'bg-linen text-slateink-dark'
                      }`}
                    >
                      {c.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {c.evidence.length > 0 && (
                    <ul className="mt-1.5 space-y-1 border-l-2 border-terracotta/30 pl-2.5">
                      {c.evidence.map((ev) => (
                        <li key={ev.memoryId}>
                          <a href={`#/memory/${ev.memoryId}`} className="text-[11px] font-medium text-terracotta-deep hover:underline underline-offset-2">
                            {ev.title}
                          </a>
                          {ev.excerpt && (
                            <p className="text-[11px] leading-relaxed text-slateink italic">“{ev.excerpt}”</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.type === 'unknown' && c.evidence.length === 0 && (
                    <p className="text-[11px] text-slateink-light italic">
                      No record supplied for this request covers this — nothing was invented.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reply && reply.inferences.length > 0 && (
          <div className="mt-3 rounded-xl bg-amberclay-light/50 border border-amberclay-DEFAULT/30 px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-amberclay-DEFAULT mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" aria-hidden /> Inferences — the twin's reading, not your records
            </p>
            <ul className="space-y-1">
              {reply.inferences.map((inf, i) => (
                <li key={i} className="text-xs leading-relaxed text-charcoal-soft">
                  {inf}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reply && reply.gaps.length > 0 && (
          <div className="mt-2.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slateink-light mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden /> Missing or uncertain
            </p>
            <ul className="space-y-0.5">
              {reply.gaps.map((g, i) => (
                <li key={i} className="text-xs leading-relaxed text-slateink">
                  · {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reply && reply.sources.length > 0 && (
          <div className="mt-3 border-t border-linen-dark/60 pt-2.5">
            <button
              onClick={onToggleEvidence}
              aria-expanded={evidenceOpen}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-terracotta-deep hover:text-terracotta-dark"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${evidenceOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
              Evidence ({reply.sources.length}) — {evidenceOpen ? 'hide' : 'show'} sources
            </button>

            {!evidenceOpen && (
              <ul className="mt-2 space-y-1">
                {reply.sources.map((s) => (
                  <li key={s.memoryId}>
                    <a
                      href={`#/memory/${s.memoryId}`}
                      className="inline-flex items-center gap-1.5 text-xs text-terracotta-deep hover:text-terracotta-dark hover:underline underline-offset-2"
                    >
                      <Quote className="w-3 h-3 shrink-0" aria-hidden />
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {evidenceOpen && (
              <div className="mt-2 space-y-2.5">
                {reply.sources.map((s) => {
                  const mem = memoryById.get(s.memoryId);
                  if (!mem) {
                    return (
                      <div key={s.memoryId} className="rounded-xl bg-clayred-light/60 border border-clayred-light px-3.5 py-2.5">
                        <p className="text-xs text-clayred-DEFAULT">
                          This source is no longer in the records — it may have been deleted.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={s.memoryId} className="rounded-xl bg-white/80 border border-linen-dark px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <a
                          href={`#/memory/${s.memoryId}`}
                          className="font-serif text-sm text-charcoal hover:text-terracotta-deep"
                        >
                          {mem.title}
                        </a>
                        <div className="flex shrink-0 items-center gap-1">
                          {!message.flagged && (
                            <button
                              onClick={() => onFlag(s.memoryId)}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-amberclay-DEFAULT hover:bg-amberclay-light transition-colors"
                              aria-label={`Flag interpretation of ${mem.title}`}
                            >
                              <Flag className="w-3 h-3" aria-hidden /> Flag
                            </button>
                          )}
                          <a
                            href={`#/memory/${s.memoryId}`}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
                            aria-label={`Open and edit ${mem.title}`}
                          >
                            <Pencil className="w-3 h-3" aria-hidden /> Open
                          </a>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slateink-dark">
                        {formatMemoryForContext(mem)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {reply && reply.sources.length === 0 && (
          <div className="mt-3 border-t border-linen-dark/60 pt-2.5">
            <p className="text-xs text-slateink-light italic">
              No records were cited for this answer — treat it as a statement about what's missing,
              not as evidence.
            </p>
          </div>
        )}

        {message.flagged && (
          <p className="mt-2 text-[11px] text-amberclay-DEFAULT flex items-center gap-1">
            <Flag className="w-3 h-3" aria-hidden /> Flagged for correction.
          </p>
        )}

        {reply && reply.followUps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reply.followUps.map((f, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(f)}
                className="rounded-full border border-linen-dark bg-paper px-3 py-1 text-[11px] text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
