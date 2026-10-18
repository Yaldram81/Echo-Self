import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  Quote,
  ChevronDown,
  ChevronRight,
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
  PanelLeft,
  PanelLeftClose,
  Plus,
  ArrowUp,
  Copy,
  Check,
  Search,
  Trash2,
  Share2,
  Compass,
  BookOpen,
  Scale,
  Bot,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { memoriesService, beliefsService, flagsService } from '@/lib/services';
import { askTwin, twinMode, TwinUnavailableError } from '@/lib/twinService';
import type { TwinMode } from '@/lib/twinService';
import type { ChatMessage, Memory, TwinReply, InterpretationFlag, MemoryCategory } from '@/lib/types';
import { useAsyncData } from '@/hooks/useAsyncData';
import { LoadingState, ErrorState } from '@/components/ui';
import { formatMemoryForContext } from '@/lib/retrieval';
import { useAuth } from '@/lib/useAuth';
import { CorrectionsPanel } from '@/components/CorrectionsPanel';

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'echoself_twin_sessions_v2';

const SUGGESTED_CARDS = [
  {
    icon: Compass,
    title: 'Career & Ambitions',
    prompt: 'What priorities have I repeatedly expressed regarding work and personal growth?',
    category: 'work',
  },
  {
    icon: Scale,
    title: 'Belief Conflicts',
    prompt: 'Where do my recorded beliefs conflict or pull in opposite directions?',
    category: 'all',
  },
  {
    icon: BookOpen,
    title: 'Decision Dilemmas',
    prompt: 'What past experiences and patterns seem relevant to my current big challenges?',
    category: 'personal_growth',
  },
  {
    icon: RotateCcw,
    title: 'Thinking Evolution',
    prompt: 'What has changed most in my thinking, values, or habits over time?',
    category: 'all',
  },
];

let messageCounter = 0;
function nextMessageId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

function loadPersistedSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function persistSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage quota errors
  }
}

export function TwinChatPage() {
  const memories = useAsyncData(() => memoriesService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);
  const { user, loading: authLoading } = useAuth();
  const preferredUserName = useMemo(() => {
    return (
      user?.user_metadata?.preferred_name ||
      user?.user_metadata?.display_name ||
      localStorage.getItem('echoself:preferred_name') ||
      localStorage.getItem('echoself:display_name') ||
      ''
    );
  }, [user]);
  const flags = useAsyncData(
    async (): Promise<InterpretationFlag[]> => (user ? await flagsService.list() : []),
    [user?.id]
  );
  const loading = memories.loading || beliefs.loading;
  const error = memories.error || beliefs.error;

  const mode: TwinMode = twinMode();

  // Sessions state (ChatGPT style multiple conversations)
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const existing = loadPersistedSessions();
    if (existing.length > 0) return existing;
    const initial: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New reflection',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return [initial];
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || `session-${Date.now()}`);

  // Sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active session helper
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0];
  }, [sessions, activeSessionId]);

  const messages = activeSession?.messages ?? [];

  // Chat input and generation state
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemoryCategory>('all');

  // Copy feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Rename session state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Evidence and Flagging Dialog
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<{ messageId: string; memoryId: string } | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [flagTopic, setFlagTopic] = useState('');
  const [flagState, setFlagState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<'chat' | 'corrections'>('chat');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const flagDialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(flagging !== null, () => setFlagging(null), flagDialogRef);

  // Sync session changes to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      persistSessions(sessions);
    }
  }, [sessions]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thinking]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const memoryById = useMemo(
    () => new Map((memories.data ?? []).map((m) => [m.id, m])),
    [memories.data]
  );

  function createNewChat() {
    // If the active chat is already blank, simply stay on it
    if (activeSession && activeSession.messages.length === 0) {
      setMobileDrawerOpen(false);
      return;
    }
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New reflection',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInput('');
    setSendError(null);
    setMobileDrawerOpen(false);
  }

  function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh: ChatSession = {
          id: `session-${Date.now()}`,
          title: 'New reflection',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  }

  function startRenameSession(session: ChatSession, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  }

  function saveRename(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editingSessionId) return;
    const clean = editingTitle.trim();
    if (clean) {
      setSessions((prev) =>
        prev.map((s) => (s.id === editingSessionId ? { ...s, title: clean } : s))
      );
    }
    setEditingSessionId(null);
  }

  function clearAllHistory() {
    if (window.confirm('Clear all conversation history? This cannot be undone.')) {
      const fresh: ChatSession = {
        id: `session-${Date.now()}`,
        title: 'New reflection',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      localStorage.removeItem(STORAGE_KEY);
      setMobileDrawerOpen(false);
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;

    setSendError(null);
    setNotConfigured(false);
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      content: question,
      created_at: new Date().toISOString(),
    };

    // Update active session with user message and generate title if first message
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          const isFirst = s.messages.length === 0;
          const cleanTitle = isFirst
            ? question.slice(0, 34) + (question.length > 34 ? '…' : '')
            : s.title;
          return {
            ...s,
            title: cleanTitle,
            messages: [...s.messages, userMsg],
            updatedAt: Date.now(),
          };
        }
        return s;
      })
    );

    setThinking(true);

    try {
      // Memory category scoping if user chose a specific filter
      const recordsToUse =
        categoryFilter === 'all'
          ? memories.data ?? []
          : (memories.data ?? []).filter((m) => m.category === categoryFilter);

      const { reply } = await askTwin(
        question,
        recordsToUse.length > 0 ? recordsToUse : memories.data ?? [],
        beliefs.data ?? [],
        flags.data ?? []
      );

      const twinMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'twin',
        content: reply.answer,
        created_at: new Date().toISOString(),
        reply,
        evidenceIds: reply.sources.map((s) => s.memoryId),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              messages: [...s.messages, twinMsg],
              updatedAt: Date.now(),
            };
          }
          return s;
        })
      );
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

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function exportTranscript() {
    if (messages.length === 0) return;
    const formatted = messages
      .map((m) => {
        const role = m.role === 'user' ? 'YOU' : 'ECHOSELF TWIN';
        return `[${role} - ${new Date(m.created_at).toLocaleTimeString()}]\n${m.content}\n`;
      })
      .join('\n---\n\n');

    navigator.clipboard.writeText(formatted);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2500);
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
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === flagging.messageId ? { ...m, flagged: true } : m
          ),
        }))
      );
    } catch {
      setFlagState('error');
    }
  }

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  // Group filtered sessions into Today, Previous 7 Days, Older
  const sessionGroups = useMemo(() => {
    const today: ChatSession[] = [];
    const pastWeek: ChatSession[] = [];
    const older: ChatSession[] = [];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;

    for (const s of filteredSessions) {
      const diff = now - s.updatedAt;
      if (diff < oneDay) {
        today.push(s);
      } else if (diff < sevenDays) {
        pastWeek.push(s);
      } else {
        older.push(s);
      }
    }
    return { today, pastWeek, older };
  }, [filteredSessions]);

  const flagCount = flags.data?.length ?? 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <LoadingState label="Gathering your records and ground truth" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <ErrorState
          message={error}
          onRetry={() => {
            memories.reload();
            beliefs.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-row bg-paper overflow-hidden relative">
      {/* =========================================================================
          1. CHATGPT-STYLE COLLAPSIBLE SIDEBAR (Desktop)
          ========================================================================= */}
      <aside
        className={`hidden md:flex flex-col border-r border-linen-dark/70 bg-paper-soft/95 transition-all duration-300 ease-in-out shrink-0 select-none ${
          sidebarOpen ? 'w-64 lg:w-72' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        {/* Sidebar Top: New Chat Button & Close Panel */}
        <div className="p-3 border-b border-linen-dark/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={createNewChat}
            className="flex-1 inline-flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-linen-dark/80 text-charcoal hover:border-terracotta hover:bg-terracotta/5 hover:text-terracotta-deep transition-all text-xs font-semibold shadow-2xs group cursor-pointer"
            title="Start new conversation"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-terracotta" />
              <span>New chat</span>
            </span>
            <span className="text-[10px] text-slateink-light bg-linen px-1.5 py-0.5 rounded-md font-mono">
              Ctrl+O
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl text-slateink-light hover:text-charcoal hover:bg-linen/70 transition-colors cursor-pointer"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Search Conversations Bar */}
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-slateink-light pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-linen-dark/70 bg-white/70 text-xs text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta focus:bg-white transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slateink-light hover:text-charcoal"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List Scroll Area */}
        <div className="flex-1 overflow-y-auto scroll-elegant px-2 py-2 space-y-4 text-xs">
          {sessionGroups.today.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                Today
              </p>
              <div className="space-y-0.5">
                {sessionGroups.today.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSession.id}
                    isEditing={editingSessionId === s.id}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelect={() => setActiveSessionId(s.id)}
                    onStartRename={(e) => startRenameSession(s, e)}
                    onSaveRename={saveRename}
                    onDelete={(e) => deleteSession(s.id, e)}
                  />
                ))}
              </div>
            </div>
          )}

          {sessionGroups.pastWeek.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                Previous 7 Days
              </p>
              <div className="space-y-0.5">
                {sessionGroups.pastWeek.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSession.id}
                    isEditing={editingSessionId === s.id}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelect={() => setActiveSessionId(s.id)}
                    onStartRename={(e) => startRenameSession(s, e)}
                    onSaveRename={saveRename}
                    onDelete={(e) => deleteSession(s.id, e)}
                  />
                ))}
              </div>
            </div>
          )}

          {sessionGroups.older.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                Older
              </p>
              <div className="space-y-0.5">
                {sessionGroups.older.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSession.id}
                    isEditing={editingSessionId === s.id}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelect={() => setActiveSessionId(s.id)}
                    onStartRename={(e) => startRenameSession(s, e)}
                    onSaveRename={saveRename}
                    onDelete={(e) => deleteSession(s.id, e)}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredSessions.length === 0 && (
            <div className="px-3 py-6 text-center text-slateink-light">
              <p className="text-xs">No conversations match</p>
            </div>
          )}
        </div>

        {/* Sidebar Bottom: Knowledge Grounding & Options */}
        <div className="p-3 border-t border-linen-dark/60 bg-white/60 space-y-2">
          {/* Grounding Info Chip */}
          <div className="px-2.5 py-2 rounded-xl bg-linen/60 border border-linen-dark/60 text-[11px] text-slateink space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-charcoal flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sage-dark animate-pulse" />
                Grounded Knowledge
              </span>
              <span className="text-[10px] font-mono text-terracotta-deep font-semibold">
                {mode.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-slateink leading-tight">
              {memories.data?.length ?? 0} memories · {beliefs.data?.length ?? 0} beliefs loaded
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-slateink-dark pt-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('corrections')}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-linen hover:text-charcoal transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sage-dark" />
              <span>Corrections</span>
              {flagCount > 0 && (
                <span className="px-1.5 py-0.2 bg-terracotta text-paper text-[10px] rounded-full font-bold">
                  {flagCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={clearAllHistory}
              className="p-1.5 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/30 transition-colors cursor-pointer"
              title="Clear all chat history"
              aria-label="Clear all chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          2. MOBILE DRAWER SIDEBAR
          ========================================================================= */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-charcoal/50 backdrop-blur-xs flex"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileDrawerOpen(false);
          }}
        >
          <div className="w-72 max-w-[85%] h-full bg-paper flex flex-col shadow-2xl animate-[slideRight_200ms_ease-out]">
            <div className="p-3 border-b border-linen-dark flex items-center justify-between">
              <button
                type="button"
                onClick={createNewChat}
                className="flex-1 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-linen-dark text-xs font-semibold text-charcoal"
              >
                <Plus className="w-4 h-4 text-terracotta" />
                <span>New chat</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 ml-2 rounded-xl text-slateink hover:text-charcoal"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {filteredSessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSession.id}
                  isEditing={editingSessionId === s.id}
                  editingTitle={editingTitle}
                  setEditingTitle={setEditingTitle}
                  onSelect={() => {
                    setActiveSessionId(s.id);
                    setMobileDrawerOpen(false);
                  }}
                  onStartRename={(e) => startRenameSession(s, e)}
                  onSaveRename={saveRename}
                  onDelete={(e) => deleteSession(s.id, e)}
                />
              ))}
            </div>

            {/* Quick Workspace Navigation on Mobile */}
            <div className="px-3 py-2.5 border-t border-linen-dark/60 bg-linen/25">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light mb-1.5 pl-0.5">
                Workspace
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs font-medium">
                <a
                  href="/memories"
                  className="px-2.5 py-2 rounded-xl bg-white border border-linen-dark/70 text-charcoal hover:border-terracotta flex items-center gap-1.5 shadow-2xs"
                >
                  <BookOpen className="w-3.5 h-3.5 text-terracotta" />
                  <span>Memories</span>
                </a>
                <a
                  href="/decisions"
                  className="px-2.5 py-2 rounded-xl bg-white border border-linen-dark/70 text-charcoal hover:border-amberclay-DEFAULT flex items-center gap-1.5 shadow-2xs"
                >
                  <Scale className="w-3.5 h-3.5 text-amberclay-DEFAULT" />
                  <span>Decisions</span>
                </a>
                <a
                  href="/beliefs"
                  className="px-2.5 py-2 rounded-xl bg-white border border-linen-dark/70 text-charcoal hover:border-sage-dark flex items-center gap-1.5 shadow-2xs"
                >
                  <Compass className="w-3.5 h-3.5 text-sage-dark" />
                  <span>Beliefs</span>
                </a>
                <a
                  href="/"
                  className="px-2.5 py-2 rounded-xl bg-white border border-linen-dark/70 text-charcoal hover:border-charcoal flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-slateink" />
                  <span>Home</span>
                </a>
              </div>
            </div>

            <div className="p-3 border-t border-linen-dark flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('corrections');
                  setMobileDrawerOpen(false);
                }}
                className="inline-flex items-center gap-1.5 text-slateink font-medium"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-sage-dark" />
                <span>Corrections ({flagCount})</span>
              </button>
              <button
                type="button"
                onClick={clearAllHistory}
                className="text-clayred-DEFAULT text-xs hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. MAIN CHAT AREA (ChatGPT Centered Style)
          ========================================================================= */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-paper overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-13 sm:h-14 px-3 sm:px-4 border-b border-linen-dark/60 bg-paper-soft/80 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2">
            {/* Sidebar Toggle for Desktop */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="hidden md:inline-flex p-2 rounded-xl border border-linen-dark/80 bg-white hover:bg-linen text-slateink hover:text-charcoal transition-colors shadow-2xs cursor-pointer"
                title="Open sidebar"
                aria-label="Open sidebar"
              >
                <PanelLeft className="w-4 h-4 text-slateink-dark" />
              </button>
            )}

            {/* Sidebar Toggle for Mobile */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden p-2 rounded-xl border border-linen-dark/80 bg-white text-slateink hover:text-charcoal shadow-2xs"
              aria-label="Open chat history drawer"
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            {/* Model Selector Badge & Explainer Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-linen-dark/80 bg-white/90 hover:bg-white text-xs font-semibold text-charcoal shadow-2xs transition-all cursor-pointer"
                aria-expanded={modelDropdownOpen}
              >
                <span className="flex h-2 w-2 rounded-full bg-sage-dark" />
                <span className="font-serif">Echo Twin 2.0</span>
                <span className="hidden sm:inline text-[10px] text-slateink-light font-sans font-normal border-l border-linen-dark pl-1.5">
                  Grounded
                </span>
                <ChevronDown className="w-3 h-3 text-slateink-light" />
              </button>

              {modelDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-2 w-72 rounded-2xl border border-linen-dark/80 bg-white shadow-xl p-3.5 z-40 space-y-2 animate-[fadeIn_100ms_ease-out]"
                  role="dialog"
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-linen-dark/60">
                    <span className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-terracotta" />
                      Twin Intelligence Model
                    </span>
                    <button
                      type="button"
                      onClick={() => setModelDropdownOpen(false)}
                      className="text-slateink-light hover:text-charcoal"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slateink leading-relaxed">
                    Unlike standard generative chatbots, Echo Twin answers strictly from your
                    recorded memories and beliefs. It cites exact sources and never invents events.
                  </p>
                  <div className="pt-1 text-[10px] font-mono text-terracotta-deep bg-terracotta/10 px-2 py-1 rounded-md">
                    Operating mode: {mode.toUpperCase()}
                  </div>
                </div>
              )}
            </div>

            {/* Focus Memory Category Dropdown */}
            <div className="hidden sm:inline-flex items-center gap-1 pl-2">
              <label htmlFor="cat-filter" className="sr-only">Focus Category</label>
              <select
                id="cat-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | MemoryCategory)}
                className="h-7 rounded-full border border-linen-dark bg-white/80 px-2.5 text-[11px] font-medium text-slateink-dark hover:border-terracotta focus:outline-none cursor-pointer"
                title="Target specific life domain"
              >
                <option value="all">Domain: All records</option>
                <option value="work">Domain: Work & Career</option>
                <option value="relationship">Domain: Relationships</option>
                <option value="personal_growth">Domain: Personal Growth</option>
                <option value="health">Domain: Health & Habits</option>
                <option value="other">Domain: Other</option>
              </select>
            </div>
          </div>

          {/* Right Action Icons: Tabs & Export */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* View Switcher: Chat vs Corrections */}
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-linen border border-linen-dark/80">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                    : 'text-slateink hover:text-charcoal'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('corrections')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1 cursor-pointer ${
                  activeTab === 'corrections'
                    ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                    : 'text-slateink hover:text-charcoal'
                }`}
              >
                <span>Corrections</span>
                {flagCount > 0 && (
                  <span className="text-[10px] px-1 rounded-full bg-terracotta text-paper font-bold">
                    {flagCount}
                  </span>
                )}
              </button>
            </div>

            {/* Copy/Export Full Transcript */}
            <button
              type="button"
              onClick={exportTranscript}
              disabled={messages.length === 0}
              className="p-1.5 rounded-xl border border-linen-dark/80 bg-white hover:bg-linen text-slateink-dark hover:text-charcoal transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
              title="Copy conversation transcript"
              aria-label="Copy transcript"
            >
              {copiedTranscript ? (
                <Check className="w-4 h-4 text-sage-dark" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>

            {/* New Chat shortcut if sidebar closed */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={createNewChat}
                className="hidden md:inline-flex p-1.5 rounded-xl border border-linen-dark/80 bg-white hover:bg-linen text-slateink-dark hover:text-charcoal transition-colors shadow-2xs cursor-pointer"
                title="New chat"
                aria-label="New chat"
              >
                <Plus className="w-4 h-4 text-terracotta" />
              </button>
            )}
          </div>
        </header>

        {/* Tab View: Corrections Panel */}
        {activeTab === 'corrections' ? (
          <div className="flex-1 overflow-y-auto scroll-elegant p-4 sm:p-6 max-w-4xl mx-auto w-full">
            <CorrectionsPanel
              flags={flags.data ?? []}
              memories={memories.data ?? []}
              onChanged={() => flags.reload()}
            />
          </div>
        ) : (
          /* Tab View: ChatGPT Message Stream & Action Area */
          <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative">
            {/* Scrollable Chat Area */}
            <div className="flex-1 overflow-y-auto scroll-elegant px-3 sm:px-6 py-4 space-y-6">
              {notConfigured && (
                <div className="max-w-2xl mx-auto rounded-2xl border border-clayred-light bg-clayred-light/30 p-3.5 flex items-start gap-3 shadow-2xs">
                  <Settings2 className="w-5 h-5 text-clayred-DEFAULT shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-charcoal mb-0.5">
                      AI provider not configured
                    </p>
                    <p className="text-xs text-slateink leading-relaxed">
                      The twin runs server-side and requires an API key in Settings before answering
                      live requests.
                    </p>
                  </div>
                </div>
              )}

              {/* ChatGPT Empty Welcome Hero */}
              {messages.length === 0 ? (
                <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto py-8 animate-[fadeIn_150ms_ease-out]">
                  {/* Avatar Icon */}
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-terracotta/15 to-terracotta/5 border border-terracotta/30 flex items-center justify-center text-terracotta-deep mb-4 shadow-xs">
                    <Sparkles className="w-7 h-7 text-terracotta" />
                  </div>

                  <h1 className="font-serif text-xl sm:text-2xl font-bold text-charcoal mb-2">
                    {preferredUserName
                      ? `What would you like to reflect on, ${preferredUserName}?`
                      : 'What would you like to reflect on?'}
                  </h1>
                  <p className="text-xs sm:text-sm text-slateink max-w-md mb-8 leading-relaxed">
                    Consult your digital twin. Every response cites verified evidence from your
                    recorded memories and beliefs.
                  </p>

                  {/* Suggestion Prompt Cards */}
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                    {SUGGESTED_CARDS.map((card, i) => {
                      const Icon = card.icon;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (card.category !== 'all') {
                              setCategoryFilter(card.category as MemoryCategory);
                            }
                            send(card.prompt);
                          }}
                          className="p-3.5 rounded-2xl border border-linen-dark/80 bg-white/80 hover:bg-white hover:border-terracotta/70 hover:shadow-xs transition-all text-left flex items-start gap-3 group cursor-pointer shadow-2xs"
                        >
                          <div className="p-2 rounded-xl bg-linen text-slateink group-hover:text-terracotta group-hover:bg-terracotta/10 transition-colors shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-charcoal group-hover:text-terracotta-deep transition-colors mb-0.5">
                              {card.title}
                            </p>
                            <p className="text-[11px] text-slateink leading-snug line-clamp-2">
                              {card.prompt}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Active Message Stream */
                <div className="max-w-3xl mx-auto w-full space-y-6 pb-4">
                  {messages.map((m) =>
                    m.role === 'user' ? (
                      /* USER MESSAGE */
                      <div key={m.id} className="flex justify-end group">
                        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[78%]">
                          <div className="rounded-2xl rounded-br-xs bg-charcoal text-paper px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-xs">
                            {m.content}
                          </div>
                          {/* Copy User Message Action */}
                          <button
                            type="button"
                            onClick={() => copyMessage(m.id, m.content)}
                            className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slateink-light hover:text-charcoal inline-flex items-center gap-1 cursor-pointer pr-1"
                            title="Copy message"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-sage-dark" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* TWIN MESSAGE */
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
                        onCopy={() => copyMessage(m.id, m.content)}
                        isCopied={copiedId === m.id}
                      />
                    )
                  )}

                  {/* Thinking Animation */}
                  {thinking && (
                    <div className="flex items-start gap-3 animate-[fadeIn_150ms_ease-out]">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper flex items-center justify-center shrink-0 shadow-2xs">
                        <Sparkles className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="rounded-2xl rounded-bl-xs bg-white border border-linen-dark/80 px-4 py-3 shadow-2xs flex items-center gap-2.5">
                        <span className="text-xs font-medium text-slateink">
                          Twin is consulting memories & checking ground truth…
                        </span>
                        <div className="flex gap-1" role="status" aria-label="Thinking">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full bg-terracotta/70 animate-pulse"
                              style={{ animationDelay: `${i * 180}ms` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Send Error Toast */}
            {sendError && (
              <div
                role="alert"
                className="max-w-2xl mx-auto mb-2 rounded-xl bg-clayred-light/70 border border-clayred-light px-3.5 py-2 text-xs text-clayred-DEFAULT flex items-center justify-between shadow-xs"
              >
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

            {/* =========================================================================
                4. CHATGPT-STYLE FLOATING BOTTOM ACTION AREA (Composer)
                ========================================================================= */}
            <div className="shrink-0 p-2 sm:p-3 bg-gradient-to-t from-paper via-paper to-transparent">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="max-w-3xl mx-auto w-full relative"
              >
                {/* Single-Row Pill Capsule Container without focus rings/outlines */}
                <div className="rounded-full border border-linen-dark/90 bg-white shadow-lifted pl-4 pr-1.5 py-1.5 sm:py-2 flex items-center gap-2 outline-none focus-within:outline-none focus-within:ring-0">
                  <label htmlFor="twin-chat-input" className="sr-only">
                    Message your digital twin
                  </label>
                  <textarea
                    id="twin-chat-input"
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about priorities, decisions, contradictions in beliefs…"
                    className="flex-1 min-w-0 resize-none bg-transparent text-xs sm:text-sm leading-relaxed text-charcoal placeholder:text-slateink-light outline-none focus:outline-none focus:ring-0 border-none shadow-none max-h-32 overflow-y-auto py-1"
                  />

                  <button
                    type="submit"
                    disabled={!input.trim() || thinking}
                    aria-label="Send message"
                    className={`inline-flex h-8 w-8 sm:h-8.5 sm:w-8.5 shrink-0 items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${
                      input.trim() && !thinking
                        ? 'bg-charcoal text-paper hover:bg-terracotta scale-100'
                        : 'bg-linen text-slateink-light opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                {/* Subtle Disclaimer under input */}
                <p className="text-[10px] sm:text-[11px] text-center text-slateink-light mt-1.5">
                  EchoSelf Twin strictly cites recorded memories & beliefs. Verify cited records for
                  vital decisions.
                </p>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          5. FLAG INTERPRETATION MODAL DIALOG
          ========================================================================= */}
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
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amberclay-light text-amberclay-DEFAULT">
                  <Flag className="w-4 h-4" aria-hidden />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-bold text-charcoal">Flag interpretation</h2>
                  <p className="text-xs text-slateink leading-relaxed mt-0.5">
                    Record: <strong className="text-charcoal font-medium">{memoryById.get(flagging.memoryId)?.title ?? 'Selected record'}</strong>
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
              Your correction is preserved alongside the record without overwriting original data.
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
                  className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm leading-relaxed text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta shadow-2xs"
                  placeholder="e.g., I no longer hold this view in the context of my recent career shift."
                />
              </div>

              <div>
                <label htmlFor="flag-topic" className="block text-xs font-semibold text-charcoal mb-1">
                  Topic scope <span className="font-normal text-slateink-light">(optional)</span>
                </label>
                <input
                  id="flag-topic"
                  value={flagTopic}
                  onChange={(e) => setFlagTopic(e.target.value)}
                  className="w-full rounded-xl border border-linen-dark bg-white px-3.5 py-2 text-xs sm:text-sm text-charcoal placeholder:text-slateink-light focus:outline-none focus:border-terracotta shadow-2xs"
                  placeholder="e.g. career"
                />
              </div>

              {flagState === 'saved' && (
                <p className="text-xs text-sage-dark flex items-start gap-1.5 p-2 rounded-lg bg-sage-light/50 border border-sage-dark/25">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>Proposed correction saved! You can review it in the Corrections tab.</span>
                </p>
              )}

              {flagState === 'error' && (
                <p role="alert" className="text-xs text-clayred-DEFAULT p-2 rounded-lg bg-clayred-light/50 border border-clayred-light">
                  Could not save the correction. Please try again.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setFlagging(null)}
                className="rounded-full px-4 min-h-[38px] text-xs font-semibold text-slateink hover:bg-linen cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFlag}
                disabled={!flagNote.trim() || flagState === 'saving'}
                className="rounded-full bg-terracotta px-5 min-h-[38px] text-xs font-semibold text-paper hover:bg-terracotta-dark disabled:opacity-50 shadow-xs cursor-pointer"
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

// Session Item in Sidebar
function SessionItem({
  session,
  isActive,
  isEditing,
  editingTitle,
  setEditingTitle,
  onSelect,
  onStartRename,
  onSaveRename,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSelect: () => void;
  onStartRename: (e: React.MouseEvent) => void;
  onSaveRename: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  if (isEditing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaveRename();
        }}
        className="px-2 py-1"
      >
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={onSaveRename}
          autoFocus
          className="w-full text-xs px-2 py-1 rounded-md border border-terracotta bg-white text-charcoal outline-none shadow-2xs"
        />
      </form>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
        isActive
          ? 'bg-linen-dark/60 text-charcoal font-semibold shadow-2xs'
          : 'text-slateink-dark hover:bg-linen/60 hover:text-charcoal'
      }`}
    >
      <div className="flex items-center gap-2 truncate pr-1">
        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
        <span className="truncate text-xs">{session.title}</span>
      </div>

      {/* Hover action buttons */}
      <div className="hidden group-hover:flex items-center gap-1 shrink-0 bg-paper-soft/90 rounded-md pl-1">
        <button
          type="button"
          onClick={onStartRename}
          className="p-1 rounded text-slateink hover:text-charcoal hover:bg-linen"
          title="Rename chat"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-slateink hover:text-clayred-DEFAULT hover:bg-clayred-light/30"
          title="Delete chat"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// Twin Message Bubble Component
function TwinMessage({
  message,
  memories,
  mode,
  canFlag,
  evidenceOpen,
  onToggleEvidence,
  onFlag,
  onFollowUp,
  onCopy,
  isCopied,
}: {
  message: ChatMessage;
  memories: Memory[];
  mode: TwinMode;
  canFlag: boolean;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
  onFlag: (memoryId: string) => void;
  onFollowUp: (q: string) => void;
  onCopy: () => void;
  isCopied: boolean;
}) {
  const reply: TwinReply | undefined = message.reply;
  const memoryById = useMemo(() => new Map(memories.map((m) => [m.id, m])), [memories]);

  return (
    <div className="flex items-start gap-3 sm:gap-3.5 group">
      {/* Twin Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 max-w-[95%] sm:max-w-[88%] space-y-3">
        {/* Main Response Box */}
        <div className="rounded-2xl rounded-tl-xs bg-white border border-linen-dark/80 p-4 sm:p-5 shadow-2xs space-y-3">
          {/* Answer Text */}
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
                <span>Conflicting records in memory</span>
              </p>
              {reply.conflicts.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-amberclay-light/35 border border-amberclay-DEFAULT/30 p-3 space-y-2"
                >
                  <p className="text-xs leading-relaxed text-charcoal-soft font-medium">
                    {c.explanation}
                  </p>
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
                          <ExternalLink className="w-2.5 h-2.5 text-slateink-light group-hover/side:text-terracotta shrink-0" />
                        </div>
                        <p className="text-[10px] text-slateink-light mb-1">
                          {new Date(side.occurred_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-[11px] leading-relaxed text-slateink-dark line-clamp-3 italic">
                          “{side.excerpt}”
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* User Corrections Applied */}
          {reply && reply.corrections && reply.corrections.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-sage-dark flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" aria-hidden />
                <span>Active user corrections</span>
              </p>
              {reply.corrections.map((corr, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-sage-light/35 border border-sage-dark/25 p-3 space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={`/memory/${corr.memoryId}`}
                      className="block rounded-lg bg-white/90 border border-linen-dark p-2.5 hover:border-terracotta transition-colors shadow-2xs"
                    >
                      <p className="text-[9px] uppercase tracking-wider font-semibold text-slateink-light mb-0.5">
                        Original record
                      </p>
                      <p className="font-serif text-xs font-semibold text-charcoal truncate">
                        {corr.memoryTitle}
                      </p>
                    </a>
                    <div className="block rounded-lg bg-white/90 border border-sage-dark/25 p-2.5 shadow-2xs">
                      <p className="text-[9px] uppercase tracking-wider font-semibold text-sage-dark mb-0.5">
                        Your correction
                      </p>
                      <p className="text-[11px] leading-relaxed text-charcoal italic">
                        “{corr.correction}”
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inferences */}
          {reply && reply.inferences.length > 0 && (
            <div className="rounded-xl bg-amberclay-light/25 border border-amberclay-DEFAULT/25 p-2.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-amberclay-DEFAULT flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Twin Synthesis & Inferences</span>
              </p>
              <ul className="space-y-0.5 pl-1">
                {reply.inferences.map((inf, i) => (
                  <li key={i} className="text-xs leading-relaxed text-charcoal-soft">
                    • {inf}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cited Evidence Sources Accordion */}
          {reply && reply.sources.length > 0 && (
            <div className="border-t border-linen-dark/60 pt-2 space-y-2">
              <button
                type="button"
                onClick={onToggleEvidence}
                aria-expanded={evidenceOpen}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-terracotta-deep hover:text-terracotta-dark hover:bg-terracotta/10 transition-colors cursor-pointer"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    evidenceOpen ? 'rotate-180' : ''
                  }`}
                />
                <span>
                  Cited sources ({reply.sources.length}): {evidenceOpen ? 'Hide' : 'Inspect records'}
                </span>
              </button>

              {!evidenceOpen && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {reply.sources.map((s) => (
                    <a
                      key={s.memoryId}
                      href={`/memory/${s.memoryId}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-linen/50 border border-linen-dark/80 px-2.5 py-1 text-[11px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors shadow-2xs"
                    >
                      <Quote className="w-2.5 h-2.5 text-terracotta shrink-0" />
                      <span>{s.title}</span>
                    </a>
                  ))}
                </div>
              )}

              {evidenceOpen && (
                <div className="space-y-2 pt-1 animate-[fadeIn_100ms_ease-out]">
                  {reply.sources.map((s) => {
                    const mem = memoryById.get(s.memoryId);
                    if (!mem) return null;
                    return (
                      <div
                        key={s.memoryId}
                        className="rounded-xl bg-linen/30 border border-linen-dark p-3 space-y-2 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <a
                            href={`/memory/${s.memoryId}`}
                            className="font-serif text-xs sm:text-sm font-semibold text-charcoal hover:text-terracotta-deep transition-colors inline-flex items-center gap-1"
                          >
                            <span>{mem.title}</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                          <div className="flex shrink-0 items-center gap-1">
                            {canFlag && !message.flagged && (
                              <button
                                type="button"
                                onClick={() => onFlag(s.memoryId)}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-amberclay-DEFAULT hover:bg-amberclay-light transition-colors cursor-pointer"
                              >
                                <Flag className="w-3 h-3" /> Flag
                              </button>
                            )}
                            <a
                              href={`/memory/${s.memoryId}`}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slateink hover:text-terracotta-deep hover:bg-terracotta/10 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Open
                            </a>
                          </div>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slateink-dark bg-white p-2.5 rounded-lg border border-linen-dark/60">
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
            <p className="text-[11px] font-medium text-amberclay-DEFAULT flex items-center gap-1 pt-1">
              <Flag className="w-3 h-3" />
              <span>Flagged for correction. Check the Corrections tab.</span>
            </p>
          )}

          {/* Follow-up Prompts Pills */}
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
                    className="rounded-full border border-linen-dark bg-paper-soft hover:bg-white px-3 py-1 text-[11px] font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-all cursor-pointer shadow-2xs"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Message Actions Bar (Copy & Flag) */}
        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slateink-light hover:text-charcoal hover:bg-linen transition-colors cursor-pointer"
            title="Copy response"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-sage-dark" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
