import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  Quote,
  ChevronDown,
  Flag,
  Pencil,
  AlertTriangle,
  Settings2,
  ShieldAlert,
  ScanSearch,
  MessageSquare,
  ShieldCheck,
  X,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { memoriesService, beliefsService, flagsService } from '@/lib/services';
import { askTwin, twinMode, TwinUnavailableError } from '@/lib/twinService';
import type { TwinMode } from '@/lib/twinService';
import type { ChatMessage, Memory, TwinReply } from '@/lib/types';
import { useAsyncData } from '@/hooks/useAsyncData';
import { SectionHeading, LoadingState, ErrorState } from '@/components/ui';
import { formatMemoryForContext } from '@/lib/retrieval';
import { useAuth } from '@/lib/useAuth';
import { CorrectionsPanel } from '@/components/CorrectionsPanel';
import type { InterpretationFlag } from '@/lib/types';

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
  const { user, loading: authLoading } = useAuth();
  const flags = useAsyncData(
    async (): Promise<InterpretationFlag[]> => (user ? await flagsService.list() : []),
    [user?.id]
  );
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
  const [flagTopic, setFlagTopic] = useState('');
  const [flagState, setFlagState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<'chat' | 'corrections'>('chat');

  const bottomRef = useRef<HTMLDivElement>(null);
  const flagDialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(flagging !== null, () => setFlagging(null), flagDialogRef);

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
      const { reply } = await askTwin(
        question,
        memories.data ?? [],
        beliefs.data ?? [],
        flags.data ?? []
      );
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
    if (!flagging || !flagNote.trim() || !user) return;
    const message = messages.find((m) => m.id === flagging.messageId);
    const memory = memoryById.get(flagging.memoryId);
    if (!message || !memory) return;
    setFlagState('saving');
    try {
      const saved = await flagsService.create({
        memory_id: memory.id,
        answer_excerpt: message.content.slice(0, 500),
        correction_note: flagNote.trim(),
        topic: flagTopic.trim() || undefined,
      });
      if (!saved?.id) throw new Error('Correction was not persisted');
      setFlagState('saved');
      setFlagNote('');
      setFlagTopic('');
      flags.reload();
      setMessages((prev) =>
        prev.map((m) => (m.id === flagging.messageId ? { ...m, flagged: true } : m))
      );
    } catch {
      setFlagState('error');
    }
  }

  const flagCount = flags.data?.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-28 sm:pb-16 px-1 sm:px-0">
      {/* Page Header */}
      <div className="space-y-2">
        <SectionHeading
          eyebrow="Dialogue"
          title="Twin Chat"
          as="h1"
          action={
            !!user && (
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-linen border border-linen-dark/80" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'chat'}
                  onClick={() => setActiveTab('chat')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'chat'
                      ? 'bg-charcoal text-paper shadow-2xs'
                      : 'text-slateink-dark hover:text-charcoal hover:bg-paper/60'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden />
                  <span>Conversation</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'corrections'}
                  onClick={() => setActiveTab('corrections')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'corrections'
                      ? 'bg-charcoal text-paper shadow-2xs'
                      : 'text-slateink-dark hover:text-charcoal hover:bg-paper/60'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sage-dark" aria-hidden />
                  <span>Corrections</span>
                  {flagCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        activeTab === 'corrections'
                          ? 'bg-paper/20 text-paper'
                          : 'bg-linen-dark/80 text-slateink-dark'
                      }`}
                    >
                      {flagCount}
                    </span>
                  )}
                </button>
              </div>
            )
          }
        />

        <p className="max-w-xl text-xs sm:text-sm text-slateink leading-relaxed">
          Every answer is strictly grounded in your recorded memories and beliefs, cites exact sources, and distinguishes facts from twin interpretations.
        </p>
      </div>

      {notConfigured && (
        <div className="rounded-2xl border border-clayred-light bg-clayred-light/30 p-3.5 sm:p-4 flex items-start gap-3">
          <Settings2 className="w-5 h-5 text-clayred-DEFAULT shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-charcoal mb-0.5">AI provider not configured</p>
            <p className="text-xs sm:text-sm text-slateink leading-relaxed">
              The twin runs server-side and requires an API key in Settings before it can answer questions.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label="Gathering your records" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { memories.reload(); beliefs.reload(); }} />
      ) : activeTab === 'corrections' && !!user ? (
        /* Corrections Panel Tab View */
        <div className="space-y-4">
          <CorrectionsPanel
            flags={flags.data ?? []}
            memories={memories.data ?? []}
            onChanged={() => {
              flags.reload();
            }}
          />
        </div>
      ) : (
        /* Chat View */
        <div className="card-surface flex flex-col h-[calc(100dvh-13.5rem)] sm:h-[calc(100dvh-14rem)] max-h-[720px] min-h-[460px] rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs overflow-hidden">
          {/* Scrollable Message List */}
          <div className="flex-1 overflow-y-auto scroll-elegant p-3 sm:p-5 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-full bg-terracotta/10 border border-terracotta/20 flex items-center justify-center text-terracotta-deep mb-3.5 shadow-2xs">
                  <Sparkles className="w-6 h-6" aria-hidden />
                </div>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-charcoal mb-1.5">
                  Consult your digital twin
                </h2>
                <p className="text-xs sm:text-sm text-slateink mb-6 leading-relaxed">
                  Ask questions about your values, decisions, recurring patterns, or contradictions. Every response links directly back to your memories.
                </p>

                <div className="w-full space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light text-left pl-1">
                    Suggested prompts
                  </p>
                  <div className="grid grid-cols-1 gap-2 text-left">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="w-full text-left rounded-xl border border-linen-dark/80 bg-linen/40 hover:bg-linen/90 hover:border-terracotta/60 px-3.5 py-2.5 text-xs text-charcoal transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                      >
                        <span className="leading-snug">{q}</span>
                        <Send className="w-3 h-3 text-terracotta opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-xs bg-charcoal px-4 py-3 text-xs sm:text-sm leading-relaxed text-paper shadow-2xs">
                    {m.content}
                  </div>
                </div>
              ) : (
                <TwinMessage
                  key={m.id}
                  message={m}
                  memories={memories.data ?? []}
                  mode={mode}
                  canFlag={!!user && !authLoading}
                  evidenceOpen={!!openEvidence[m.id]}
                  onToggleEvidence={() =>
                    setOpenEvidence((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                  }
                  onFlag={(memoryId) => {
                    setFlagging({ messageId: m.id, memoryId });
                    setFlagNote('');
                    setFlagTopic('');
                    setFlagState('idle');
                  }}
                  onFollowUp={(q) => send(q)}
                />
              )
            )}

            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-xs bg-linen/60 border border-linen-dark/70 px-4 py-3 shadow-2xs flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-terracotta animate-pulse" aria-hidden />
                  <span className="text-xs text-slateink font-medium">Twin is consulting records…</span>
                  <span className="flex gap-1 ml-1" role="img" aria-label="Thinking">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-terracotta/60 animate-pulse"
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
            <div role="alert" className="mx-4 my-2 rounded-xl bg-clayred-light/60 border border-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT flex items-center justify-between" aria-live="assertive">
              <span>{sendError}</span>
              <button
                type="button"
                onClick={() => setSendError(null)}
                className="text-clayred-DEFAULT hover:opacity-80 p-0.5"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Chat Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-linen-dark/70 p-2.5 sm:p-3.5 bg-white/80 backdrop-blur-md flex items-end gap-2 sm:gap-3"
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask your twin
            </label>
            <div className="flex-1 relative">
              <textarea
                id="chat-input"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about priorities, conflicts, evolution of thinking…"
                className="w-full resize-none rounded-xl border border-linen-dark/80 bg-white px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta max-h-24 shadow-2xs"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Send message"
              className="inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-terracotta text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden />
            </button>
          </form>
        </div>
      )}

      {/* Flag Interpretation Dialog Modal */}
      {flagging && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-charcoal/50 backdrop-blur-xs px-0 sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Flag an interpretation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFlagging(null);
          }}
        >
          <div
            ref={flagDialogRef}
            className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto scroll-elegant rounded-t-2xl sm:rounded-3xl bg-paper p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl border border-linen-dark"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amberclay-light text-amberclay-DEFAULT">
                  <Flag className="w-4 h-4" aria-hidden />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">Flag interpretation</h2>
                  <p className="text-xs text-slateink leading-relaxed mt-0.5">
                    Regarding: <strong className="text-charcoal font-medium">{memoryById.get(flagging.memoryId)?.title ?? 'Selected record'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFlagging(null)}
                className="p-1 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slateink leading-relaxed mb-4 p-2.5 rounded-xl bg-linen/50 border border-linen-dark/60">
              The correction is preserved alongside the record without overwriting the original. It takes effect in future twin answers after confirmation.
            </p>

            <div className="space-y-3">
              <div>
                <label htmlFor="flag-note" className="block text-xs font-semibold text-charcoal mb-1">
                  What is inaccurate, and what should be stated?
                </label>
                <textarea
                  id="flag-note"
                  rows={3}
                  value={flagNote}
                  onChange={(e) => setFlagNote(e.target.value)}
                  className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm leading-relaxed text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta"
                  placeholder="e.g., I no longer hold this view in the context of my recent career shift."
                />
              </div>

              <div>
                <label htmlFor="flag-topic" className="block text-xs font-semibold text-charcoal mb-1">
                  Topic scope <span className="font-normal text-slateink-light">(optional, e.g. "career")</span>
                </label>
                <input
                  id="flag-topic"
                  value={flagTopic}
                  onChange={(e) => setFlagTopic(e.target.value)}
                  className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta"
                  placeholder="e.g. career"
                />
              </div>

              {flagState === 'saved' && (
                <p className="text-xs text-sage-dark flex items-start gap-1.5 p-2 rounded-lg bg-sage-light/50 border border-sage-dark/25">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    Saved as a proposed correction. Review and confirm it in the Corrections tab to apply it to future answers.
                  </span>
                </p>
              )}

              {flagState === 'error' && (
                <p role="alert" className="text-xs text-clayred-DEFAULT p-2 rounded-lg bg-clayred-light/50 border border-clayred-light">
                  Could not save the correction. Please try again.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setFlagging(null)}
                className="rounded-full px-4 min-h-[38px] text-xs font-semibold text-slateink-dark hover:bg-linen transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFlag}
                disabled={!flagNote.trim() || flagState === 'saving'}
                className="rounded-full bg-terracotta px-5 min-h-[38px] text-xs font-semibold text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
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

const REVIEW_LABEL_META: Record<string, { text: string; cls: string }> = {
  supported: { text: 'reviewer: supported', cls: 'bg-sage-light/70 text-sage-dark border border-sage-dark/25' },
  partially_supported: { text: 'reviewer: partially supported', cls: 'bg-amberclay-light/80 text-amberclay-DEFAULT border border-amberclay-DEFAULT/30' },
  contradicted: { text: 'reviewer: contradicted', cls: 'bg-clayred-light/80 text-clayred-DEFAULT border border-clayred-DEFAULT/25' },
  unsupported: { text: 'reviewer: not supported', cls: 'bg-clayred-light/80 text-clayred-DEFAULT border border-clayred-DEFAULT/25' },
  unable_to_assess: { text: 'reviewer: cannot decide', cls: 'bg-linen text-slateink-dark border border-linen-dark' },
};

function TwinMessage({
  message,
  memories,
  mode,
  canFlag,
  evidenceOpen,
  onToggleEvidence,
  onFlag,
  onFollowUp,
}: {
  message: ChatMessage;
  memories: Memory[];
  mode: TwinMode;
  canFlag: boolean;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
  onFlag: (memoryId: string) => void;
  onFollowUp: (q: string) => void;
}) {
  const reply: TwinReply | undefined = message.reply;
  const memoryById = new Map(memories.map((m) => [m.id, m]));

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] sm:max-w-[88%] rounded-2xl rounded-bl-xs bg-linen/40 border border-linen-dark/70 p-3.5 sm:p-5 shadow-2xs space-y-3">
        {/* Answer Content */}
        <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-charcoal">
          {message.content}
        </p>

        {/* Semantic Review Note */}
        {reply && reply.review?.note && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slateink-dark border border-linen-dark/60 bg-paper/80 rounded-xl px-3 py-2">
            <ScanSearch className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slateink-light" aria-hidden />
            <span>{reply.review.note}</span>
          </p>
        )}

        {/* Conflicting Records */}
        {reply && reply.conflicts && reply.conflicts.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-amberclay-DEFAULT flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden />
              <span>Conflicting records (both shown without choosing a winner)</span>
            </p>
            {reply.conflicts.map((c, i) => (
              <div key={i} className="rounded-xl bg-amberclay-light/35 border border-amberclay-DEFAULT/30 p-3 space-y-2">
                <p className="text-xs leading-relaxed text-charcoal-soft font-medium">{c.explanation}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[c.a, c.b].map((side) => (
                    <a
                      key={side.memoryId}
                      href={`/memory/${side.memoryId}`}
                      className="block rounded-lg bg-white/90 border border-linen-dark p-2.5 hover:border-terracotta transition-colors group/side shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="font-serif text-xs font-semibold text-charcoal group-hover/side:text-terracotta-deep transition-colors truncate">
                          {side.title}
                        </p>
                        <ExternalLink className="w-2.5 h-2.5 text-slateink-light group-hover/side:text-terracotta shrink-0" aria-hidden />
                      </div>
                      <p className="text-[10px] text-slateink-light mb-1">
                        {new Date(side.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[11px] leading-relaxed text-slateink-dark line-clamp-3 italic">“{side.excerpt}”</p>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User Corrections */}
        {reply && reply.corrections && reply.corrections.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-sage-dark flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" aria-hidden />
              <span>Your active corrections (original records remain intact)</span>
            </p>
            {reply.corrections.map((corr, i) => (
              <div key={i} className="rounded-xl bg-sage-light/35 border border-sage-dark/25 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a
                    href={`/memory/${corr.memoryId}`}
                    className="block rounded-lg bg-white/90 border border-linen-dark p-2.5 hover:border-terracotta transition-colors shadow-2xs"
                  >
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-slateink-light mb-0.5">Original record</p>
                    <p className="font-serif text-xs font-semibold text-charcoal truncate">{corr.memoryTitle}</p>
                  </a>
                  <div className="block rounded-lg bg-white/90 border border-sage-dark/25 p-2.5 shadow-2xs">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-sage-dark mb-0.5">Your correction</p>
                    <p className="text-[11px] leading-relaxed text-charcoal italic">“{corr.correction}”</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Claim by Claim Breakdown */}
        {reply && reply.claims && reply.claims.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
              Claim by claim evidence ({reply.claims.length})
            </p>
            <ul className="space-y-2">
              {reply.claims.map((c, i) => {
                const reviewMeta = c.review?.state === 'reviewed' ? REVIEW_LABEL_META[c.review.label] : undefined;
                return (
                  <li key={i} className="rounded-xl bg-white/80 border border-linen-dark/70 p-3 space-y-1.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs leading-relaxed text-charcoal font-medium">{c.claim}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${
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

                    {c.review?.state === 'reviewed' && reviewMeta && (
                      <div className="rounded-lg border border-slateink-light/20 bg-paper/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-slateink-dark">
                        <span className={`inline-block rounded-full px-2 py-0.2 text-[9px] uppercase tracking-wide font-medium mr-1.5 ${reviewMeta.cls}`}>
                          {reviewMeta.text}
                        </span>
                        <span>{c.review.explanation}</span>
                      </div>
                    )}

                    {c.basis && (
                      <p className="text-[11px] leading-relaxed text-slateink-dark">{c.basis}</p>
                    )}

                    {c.evidence.length > 0 && (
                      <ul className="mt-1 space-y-1 border-l-2 border-terracotta/40 pl-2.5">
                        {c.evidence.map((ev) => (
                          <li key={ev.memoryId} className="space-y-0.5">
                            <a
                              href={`/memory/${ev.memoryId}`}
                              className="text-[11px] font-semibold text-terracotta-deep hover:underline inline-flex items-center gap-1"
                            >
                              <span>{ev.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" aria-hidden />
                            </a>
                            {ev.excerpt && (
                              <p className="text-[11px] leading-relaxed text-slateink italic">“{ev.excerpt}”</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {c.uncertainty && c.type !== 'unknown' && (
                      <p className="text-[11px] leading-relaxed text-amberclay-DEFAULT flex items-start gap-1 pt-0.5 font-medium">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
                        <span>{c.uncertainty}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Inferences */}
        {reply && reply.inferences.length > 0 && (
          <div className="rounded-xl bg-amberclay-light/35 border border-amberclay-DEFAULT/30 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-amberclay-DEFAULT flex items-center gap-1">
              <Sparkles className="w-3 h-3" aria-hidden />
              <span>Inferences (twin synthesis, distinct from direct records)</span>
            </p>
            <ul className="space-y-1 pl-1">
              {reply.inferences.map((inf, i) => (
                <li key={i} className="text-xs leading-relaxed text-charcoal-soft">
                  • {inf}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Gaps or Missing Information */}
        {reply && reply.gaps.length > 0 && (
          <div className="rounded-xl bg-linen/60 border border-linen-dark/60 p-2.5 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light flex items-center gap-1">
              <HelpCircle className="w-3 h-3" aria-hidden />
              <span>Missing or uncertain information</span>
            </p>
            <ul className="space-y-0.5 pl-1">
              {reply.gaps.map((g, i) => (
                <li key={i} className="text-xs leading-relaxed text-slateink">
                  · {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cited Evidence Sources */}
        {reply && reply.sources.length > 0 && (
          <div className="border-t border-linen-dark/60 pt-2 space-y-2">
            <button
              type="button"
              onClick={onToggleEvidence}
              aria-expanded={evidenceOpen}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-terracotta-deep hover:text-terracotta-dark hover:bg-terracotta/10 transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${evidenceOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
              <span>Evidence sources ({reply.sources.length}): {evidenceOpen ? 'Hide' : 'Inspect'}</span>
            </button>

            {!evidenceOpen && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {reply.sources.map((s) => (
                  <a
                    key={s.memoryId}
                    href={`/memory/${s.memoryId}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/80 border border-linen-dark/80 px-2.5 py-1 text-[11px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors shadow-2xs"
                  >
                    <Quote className="w-2.5 h-2.5 text-terracotta shrink-0" aria-hidden />
                    <span>{s.title}</span>
                  </a>
                ))}
              </div>
            )}

            {evidenceOpen && (
              <div className="space-y-2 pt-1">
                {reply.sources.map((s) => {
                  const mem = memoryById.get(s.memoryId);
                  if (!mem) {
                    return (
                      <div key={s.memoryId} className="rounded-xl bg-clayred-light/60 border border-clayred-light p-3 text-xs text-clayred-DEFAULT">
                        Source record is no longer available in database.
                      </div>
                    );
                  }
                  return (
                    <div key={s.memoryId} className="rounded-xl bg-white/95 border border-linen-dark p-3 space-y-2 shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={`/memory/${s.memoryId}`}
                          className="font-serif text-xs sm:text-sm font-semibold text-charcoal hover:text-terracotta-deep transition-colors inline-flex items-center gap-1"
                        >
                          <span>{mem.title}</span>
                          <ExternalLink className="w-3 h-3 opacity-60" aria-hidden />
                        </a>
                        <div className="flex shrink-0 items-center gap-1">
                          {canFlag && !message.flagged && (
                            <button
                              type="button"
                              onClick={() => onFlag(s.memoryId)}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-amberclay-DEFAULT hover:bg-amberclay-light transition-colors cursor-pointer"
                              aria-label={`Flag interpretation of ${mem.title}`}
                            >
                              <Flag className="w-3 h-3" aria-hidden /> Flag
                            </button>
                          )}
                          <a
                            href={`/memory/${s.memoryId}`}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
                            aria-label={`Open ${mem.title}`}
                          >
                            <Pencil className="w-3 h-3" aria-hidden /> Open
                          </a>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slateink-dark bg-linen/30 p-2.5 rounded-lg border border-linen-dark/50">
                        {formatMemoryForContext(mem)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {message.flagged && (
          <p className="text-[11px] font-medium text-amberclay-DEFAULT flex items-center gap-1 pt-1" role="status">
            <Flag className="w-3 h-3" aria-hidden />
            <span>Flagged for correction. Check the Corrections tab to review.</span>
          </p>
        )}

        {/* Follow Up Prompts */}
        {reply && reply.followUps.length > 0 && (
          <div className="pt-2 border-t border-linen-dark/50 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
              Follow-up paths
            </p>
            <div className="flex flex-wrap gap-1.5">
              {reply.followUps.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onFollowUp(f)}
                  className="rounded-full border border-linen-dark bg-paper px-3 py-1 text-[11px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors cursor-pointer shadow-2xs"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
