import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Inbox,
  Sparkles,
  Plus,
  Search,
  Check,
  Tag as TagIcon,
  Calendar,
  Clock,
  ArrowRight,
  Trash2,
  Edit3,
  Archive,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Feather,
  BookOpen,
  Filter,
  X,
} from 'lucide-react';
import { capturesService, memoriesService } from '@/lib/services';
import { geminiService } from '@/lib/geminiService';
import { navigateTo } from '@/lib/router';
import { onQuickAddRequest } from '@/lib/quickAdd';
import { SectionHeading, Card, Badge, LoadingState } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  MEMORY_CATEGORIES,
  MEMORY_MOODS,
  MEMORY_IMPORTANCE_LABELS,
  type CaptureItem,
  type CaptureStatus,
  type MemoryCategory,
  type MemoryInput,
  type Mood,
} from '@/lib/types';

const DRAFT_STORAGE_KEY = 'echoself:capture_inbox_draft';

export function CaptureInboxPage() {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'inbox' | 'all' | 'promoted' | 'archived'>('inbox');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Composer State
  const [content, setContent] = useState(() => {
    try {
      return sessionStorage.getItem(DRAFT_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MemoryCategory | ''>('');
  const [tagsInput, setTagsInput] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  // AI Suggestion State
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    title: string;
    category: MemoryCategory;
    tags: string[];
    source: 'ai' | 'heuristic';
  } | null>(null);

  // Promotion Modal State
  const [promotingCapture, setPromotingCapture] = useState<CaptureItem | null>(null);
  const [promoteTitle, setPromoteTitle] = useState('');
  const [promoteCategory, setPromoteCategory] = useState<MemoryCategory>('personal_growth');
  const [promoteTags, setPromoteTags] = useState('');
  const [promoteMood, setPromoteMood] = useState<Mood>('neutral');
  const [promoteConfidence, setPromoteConfidence] = useState(80);
  const [promoteImportance, setPromoteImportance] = useState<number | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // In-place Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory | ''>('');
  const [editSaving, setEditSaving] = useState(false);

  // Deletion Confirmation State
  const [deletingCapture, setDeletingCapture] = useState<CaptureItem | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load captures from database/service
  async function reloadCaptures() {
    try {
      const data = await capturesService.list();
      setCaptures(data);
    } catch {
      // Gracefully handled by capturesService fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadCaptures();
  }, []);

  // Listen to QuickAdd intents from AppShell or MobileBottomBar
  useEffect(() => {
    const unsub = onQuickAddRequest((kind) => {
      if (kind === 'capture') {
        textareaRef.current?.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    return unsub;
  }, []);

  // Sync draft to sessionStorage
  useEffect(() => {
    try {
      if (content) {
        sessionStorage.setItem(DRAFT_STORAGE_KEY, content);
      } else {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {}
  }, [content]);

  // Handle AI Details Suggestion
  async function handleSuggest() {
    if (!content.trim()) return;
    setSuggesting(true);
    try {
      const result = await geminiService.suggestCaptureDetails(content);
      setSuggestion(result);
    } catch {
      // Ignored
    } finally {
      setSuggesting(false);
    }
  }

  // Handle Quick Save to Inbox
  async function handleSaveCapture(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanContent = content.trim();
    if (!cleanContent) {
      setComposerError('Please enter a thought or experience.');
      return;
    }

    setSaving(true);
    setComposerError(null);

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    try {
      await capturesService.create({
        content: cleanContent,
        title: title.trim() || undefined,
        category: category || undefined,
        tags: parsedTags,
      });

      // Clear composer state
      setContent('');
      setTitle('');
      setCategory('');
      setTagsInput('');
      setSuggestion(null);
      setShowDetails(false);
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {}

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await reloadCaptures();
    } catch {
      setComposerError('Could not save capture. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter in composer
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveCapture();
    }
  }

  // Open Promotion Modal
  function startPromote(capture: CaptureItem) {
    // Prevent duplicate promotion
    if (capture.status === 'promoted' && capture.promoted_memory_id) {
      navigateTo({ page: 'memory', id: capture.promoted_memory_id });
      return;
    }

    let defaultTitle = capture.title?.trim();
    if (!defaultTitle) {
      const firstLine = capture.content.split('\n')[0].replace(/^[#*-]\s*/, '').trim();
      defaultTitle = firstLine.length > 50 ? firstLine.slice(0, 47) + '…' : firstLine;
    }

    setPromotingCapture(capture);
    setPromoteTitle(defaultTitle || 'Captured Reflection');
    setPromoteCategory(capture.category || 'personal_growth');
    setPromoteTags(capture.tags.join(', '));
    setPromoteMood('neutral');
    setPromoteConfidence(80);
    setPromoteImportance(null);
    setPromoteError(null);
  }

  // Confirm Promotion to Memory
  async function confirmPromote() {
    if (!promotingCapture) return;
    if (!promoteTitle.trim()) {
      setPromoteError('A title is required for a permanent memory.');
      return;
    }

    setPromoteLoading(true);
    setPromoteError(null);

    const parsedTags = promoteTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    try {
      const result = await capturesService.promoteToMemory(promotingCapture.id, {
        title: promoteTitle.trim(),
        category: promoteCategory,
        tags: parsedTags,
        mood: promoteMood,
        confidence: promoteConfidence,
        user_importance: promoteImportance,
      });

      setPromotingCapture(null);
      await reloadCaptures();
      // Navigate to the newly created memory
      navigateTo({ page: 'memory', id: result.memory.id });
    } catch {
      setPromoteError('Failed to promote capture to memory. Please try again.');
    } finally {
      setPromoteLoading(false);
    }
  }

  // Start in-place edit
  function startEdit(c: CaptureItem) {
    setEditingId(c.id);
    setEditContent(c.content);
    setEditTitle(c.title || '');
    setEditCategory(c.category || '');
    setEditTags(c.tags.join(', '));
  }

  // Save in-place edit
  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    setEditSaving(true);
    const parsedTags = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    try {
      await capturesService.update(id, {
        content: editContent.trim(),
        title: editTitle.trim() || null,
        category: editCategory || null,
        tags: parsedTags,
      });
      setEditingId(null);
      await reloadCaptures();
    } catch {
      // Ignored
    } finally {
      setEditSaving(false);
    }
  }

  // Toggle Archive
  async function toggleArchive(c: CaptureItem) {
    const nextStatus = c.status === 'archived' ? 'inbox' : 'archived';
    await capturesService.update(c.id, { status: nextStatus });
    await reloadCaptures();
  }

  // Confirm Delete
  async function confirmDelete() {
    if (!deletingCapture) return;
    await capturesService.delete(deletingCapture.id);
    setDeletingCapture(null);
    await reloadCaptures();
  }

  // Computed counts
  const inboxCount = useMemo(() => captures.filter((c) => c.status === 'inbox').length, [captures]);
  const promotedCount = useMemo(() => captures.filter((c) => c.status === 'promoted').length, [captures]);
  const archivedCount = useMemo(() => captures.filter((c) => c.status === 'archived').length, [captures]);

  // Filtered List
  const filteredCaptures = useMemo(() => {
    return captures.filter((c) => {
      // Status filter
      if (statusFilter === 'inbox' && c.status !== 'inbox') return false;
      if (statusFilter === 'promoted' && c.status !== 'promoted') return false;
      if (statusFilter === 'archived' && c.status !== 'archived') return false;

      // Category filter
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = c.content.toLowerCase().includes(q);
        const matchesTitle = c.title?.toLowerCase().includes(q) ?? false;
        const matchesTags = c.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesContent && !matchesTitle && !matchesTags) return false;
      }

      return true;
    });
  }, [captures, statusFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 md:pb-16 animate-[fadeIn_150ms_ease-out]">
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-linen-dark/70">
        <div>
          <SectionHeading
            eyebrow="Capture & Process"
            title="Capture Inbox"
            as="h1"
          />
          <p className="text-xs sm:text-sm text-slateink max-w-xl leading-relaxed mt-0.5">
            Frictionless capture for fleeting thoughts, reflections, and moments. Review and promote them to permanent memories anytime.
          </p>
        </div>

        {/* View Memory Library Link */}
        <a
          href="/memories"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigateTo('memories');
          }}
          className="inline-flex items-center gap-1.5 self-start sm:self-center px-3.5 py-1.5 rounded-full text-xs font-semibold text-charcoal bg-white hover:bg-linen border border-linen-dark/80 transition-all cursor-pointer shadow-2xs shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5 text-terracotta" />
          <span>Memory Library</span>
          <ArrowRight className="w-3 h-3 text-slateink-light" />
        </a>
      </header>

      {/* =========================================================================
          FAST CAPTURE COMPOSER (Frictionless entry)
          ========================================================================= */}
      <Card className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Feather className="w-4 h-4 text-terracotta" />
            <h2 className="font-serif text-sm sm:text-base font-bold text-charcoal">
              Quick Capture
            </h2>
          </div>
          <span className="text-[10px] text-slateink-light font-mono hidden sm:inline">
            Press Ctrl+Enter to save
          </span>
        </div>

        <form onSubmit={handleSaveCapture} className="space-y-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Capture an observation, raw thought, fleeting experience, or decision note…"
            className="w-full p-3 text-xs sm:text-sm text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none bg-paper-soft/40 transition-colors placeholder:text-slateink-light"
          />

          {/* AI / Local Suggestions Banner */}
          {suggestion && (
            <div className="p-3 rounded-xl bg-linen/50 border border-linen-dark/70 space-y-2 animate-[fadeIn_150ms_ease-out]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-charcoal">
                  <Sparkles className="w-3 h-3 text-terracotta" />
                  <span>
                    {suggestion.source === 'ai' ? 'AI Suggestion' : 'Local Pattern Suggestion'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSuggestion(null)}
                  className="text-slateink-light hover:text-charcoal p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {suggestion.title && !title && (
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(suggestion.title);
                      setShowDetails(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-linen-dark text-[11px] font-medium text-charcoal hover:border-terracotta cursor-pointer shadow-2xs"
                  >
                    <span>Use title:</span>
                    <strong className="text-terracotta-deep font-semibold">&ldquo;{suggestion.title}&rdquo;</strong>
                  </button>
                )}

                {suggestion.category && !category && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategory(suggestion.category);
                      setShowDetails(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-linen-dark text-[11px] font-medium text-charcoal hover:border-terracotta cursor-pointer shadow-2xs"
                  >
                    <span>Category:</span>
                    <span className="capitalize font-semibold text-slateink-dark">{suggestion.category.replace('_', ' ')}</span>
                  </button>
                )}

                {suggestion.tags.length > 0 && !tagsInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setTagsInput(suggestion.tags.join(', '));
                      setShowDetails(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-linen-dark text-[11px] font-medium text-charcoal hover:border-terracotta cursor-pointer shadow-2xs"
                  >
                    <TagIcon className="w-3 h-3 text-slateink-light" />
                    <span>Tags: {suggestion.tags.join(', ')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Optional Details Disclosure */}
          {showDetails && (
            <div className="pt-2 border-t border-linen-dark/50 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-[fadeIn_150ms_ease-out]">
              <div>
                <label className="block text-[11px] font-semibold text-charcoal mb-1">
                  Optional Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Conversation with Marcus"
                  className="w-full px-2.5 py-1.5 text-xs border border-linen-dark rounded-lg bg-white focus:border-terracotta focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-charcoal mb-1">
                  Optional Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MemoryCategory)}
                  className="w-full px-2.5 py-1.5 text-xs border border-linen-dark rounded-lg bg-white focus:border-terracotta focus:outline-none"
                >
                  <option value="">No category (Inbox default)</option>
                  {MEMORY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-charcoal mb-1">
                  Optional Tags
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. leadership, habits"
                  className="w-full px-2.5 py-1.5 text-xs border border-linen-dark rounded-lg bg-white focus:border-terracotta focus:outline-none"
                />
              </div>
            </div>
          )}

          {composerError && (
            <p className="text-xs text-clayred-DEFAULT bg-clayred-light/50 p-2 rounded-xl flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{composerError}</span>
            </p>
          )}

          {saveSuccess && (
            <p className="text-xs text-sage-dark bg-sage-light/60 p-2 rounded-xl flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Captured to Inbox.</span>
            </p>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDetails((d) => !d)}
                className="text-[11px] font-semibold text-slateink hover:text-charcoal inline-flex items-center gap-1 cursor-pointer"
              >
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showDetails ? 'Fewer details' : 'Add title or tags'}</span>
              </button>

              {content.trim().length > 15 && !suggestion && (
                <button
                  type="button"
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="text-[11px] font-semibold text-terracotta-deep hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3 text-terracotta" />
                  <span>{suggesting ? 'Analyzing…' : 'Suggest with AI'}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={saving || !content.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-charcoal text-paper text-xs font-semibold hover:bg-terracotta disabled:opacity-40 transition-all cursor-pointer shadow-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Save to Inbox</span>
            </button>
          </div>
        </form>
      </Card>

      {/* =========================================================================
          FILTER BAR & STATUS TABS
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-linen border border-linen-dark/80 self-start">
          <button
            type="button"
            onClick={() => setStatusFilter('inbox')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              statusFilter === 'inbox'
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Inbox</span>
            {inboxCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-terracotta text-paper font-bold">
                {inboxCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('promoted')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              statusFilter === 'promoted'
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Promoted</span>
            {promotedCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sage-dark text-paper font-bold">
                {promotedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            All ({captures.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('archived')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              statusFilter === 'archived'
                ? 'bg-charcoal text-paper shadow-2xs font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>

        {/* Search and Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search captures…"
              className="w-full pl-8 pr-2.5 py-1 text-xs border border-linen-dark rounded-xl bg-white focus:border-terracotta focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 text-xs border border-linen-dark rounded-xl bg-white focus:border-terracotta focus:outline-none"
          >
            <option value="all">All domains</option>
            {MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* =========================================================================
          CAPTURE ITEMS LIST
          ========================================================================= */}
      {loading ? (
        <LoadingState label="Loading your captures" />
      ) : filteredCaptures.length === 0 ? (
        <Card className="p-8 text-center border border-linen-dark/80 bg-white rounded-3xl space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-linen text-slateink-light flex items-center justify-center mx-auto">
            <Inbox className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-base font-bold text-charcoal">
            {statusFilter === 'inbox'
              ? 'Inbox is clear'
              : statusFilter === 'promoted'
              ? 'No promoted captures yet'
              : 'No captures match your filter'}
          </h3>
          <p className="text-xs text-slateink max-w-sm mx-auto leading-relaxed">
            {statusFilter === 'inbox'
              ? 'Use the composer above to quickly jot down raw thoughts, observations, or moments without categorization.'
              : 'Promoted captures create permanent memories in the library while preserving their original text.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCaptures.map((capture) => {
            const isEditing = editingId === capture.id;
            const isPromoted = capture.status === 'promoted';

            return (
              <Card
                key={capture.id}
                className="p-4 sm:p-5 border border-linen-dark/80 bg-white shadow-xs rounded-2xl sm:rounded-3xl space-y-3 transition-all hover:border-terracotta/40"
              >
                {isEditing ? (
                  /* Edit in place form */
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="w-full p-2 text-xs font-semibold text-charcoal border border-linen-dark rounded-lg focus:border-terracotta focus:outline-none"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full p-2.5 text-xs text-charcoal border border-linen-dark rounded-xl focus:border-terracotta focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        className="p-1.5 text-xs border border-linen-dark rounded-lg bg-white"
                      >
                        <option value="">No category</option>
                        {MEMORY_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        placeholder="Tags (comma-separated)"
                        className="p-1.5 text-xs border border-linen-dark rounded-lg"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs text-slateink hover:text-charcoal cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(capture.id)}
                        disabled={editSaving}
                        className="px-3 py-1 rounded-lg bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark cursor-pointer shadow-2xs"
                      >
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Card View */
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {capture.title && (
                          <h3 className="font-serif text-sm sm:text-base font-bold text-charcoal leading-snug">
                            {capture.title}
                          </h3>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slateink-light">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(capture.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {capture.category && (
                            <span className="capitalize font-medium text-slateink">
                              • {capture.category.replace('_', ' ')}
                            </span>
                          )}
                          {isPromoted ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-sage-dark bg-sage-light/60 px-2 py-0.2 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Promoted to Memory
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slateink bg-linen px-2 py-0.2 rounded-full">
                              <Inbox className="w-3 h-3 text-slateink-light" />
                              Inbox
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isPromoted && capture.promoted_memory_id && (
                          <a
                            href={`/memory/${capture.promoted_memory_id}`}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                              e.preventDefault();
                              navigateTo({ page: 'memory', id: capture.promoted_memory_id! });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-terracotta-deep bg-terracotta/10 hover:bg-terracotta/20 transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>View Memory</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {!isPromoted && (
                          <button
                            type="button"
                            onClick={() => startPromote(capture)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark transition-all shadow-2xs cursor-pointer"
                          >
                            <span>Promote</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Original Capture Text */}
                    <p className="text-xs sm:text-sm text-charcoal leading-relaxed whitespace-pre-wrap font-sans">
                      {capture.content}
                    </p>

                    {/* Tag Chips */}
                    {capture.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {capture.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-md bg-linen/60 text-slateink text-[10px] font-medium"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Card Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-linen-dark/40 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(capture)}
                          className="text-slateink hover:text-charcoal inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleArchive(capture)}
                          className="text-slateink hover:text-charcoal inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                        >
                          <Archive className="w-3 h-3" />
                          <span>{capture.status === 'archived' ? 'Unarchive' : 'Archive'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeletingCapture(capture)}
                        className="text-slateink-light hover:text-clayred-DEFAULT transition-colors p-1 cursor-pointer"
                        title="Delete capture"
                        aria-label="Delete capture"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          REVIEW & PROMOTE TO PERMANENT MEMORY MODAL
          ========================================================================= */}
      {promotingCapture && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/50 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto scroll-elegant rounded-3xl bg-paper p-5 sm:p-6 shadow-2xl border border-linen-dark space-y-4">
            <div className="flex items-center justify-between border-b border-linen-dark/60 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-terracotta" />
                <div>
                  <h3 className="font-serif text-base font-bold text-charcoal">
                    Promote to Memory
                  </h3>
                  <p className="text-[11px] text-slateink">
                    Elevate this captured thought into a grounded, permanent memory record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPromotingCapture(null)}
                className="text-slateink-light hover:text-charcoal p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Original Capture Text Preview (Immutable Provenance) */}
            <div className="p-3 rounded-xl bg-linen/35 border border-linen-dark/70 space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slateink-light">
                Original Capture Text (Preserved)
              </span>
              <p className="text-xs text-charcoal leading-relaxed font-sans italic">
                &ldquo;{promotingCapture.content}&rdquo;
              </p>
            </div>

            {/* Promotion Configuration Form */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-charcoal mb-1">
                  Memory Title <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  value={promoteTitle}
                  onChange={(e) => setPromoteTitle(e.target.value)}
                  required
                  placeholder="Title for this permanent memory"
                  className="w-full p-2 border border-linen-dark rounded-xl bg-white focus:border-terracotta focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-charcoal mb-1">Category Domain</label>
                  <select
                    value={promoteCategory}
                    onChange={(e) => setPromoteCategory(e.target.value as MemoryCategory)}
                    className="w-full p-2 border border-linen-dark rounded-xl bg-white"
                  >
                    {MEMORY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-charcoal mb-1">Emotional Mood</label>
                  <select
                    value={promoteMood}
                    onChange={(e) => setPromoteMood(e.target.value as Mood)}
                    className="w-full p-2 border border-linen-dark rounded-xl bg-white"
                  >
                    {MEMORY_MOODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-charcoal mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={promoteTags}
                  onChange={(e) => setPromoteTags(e.target.value)}
                  placeholder="e.g. habits, leadership, mornings"
                  className="w-full p-2 border border-linen-dark rounded-xl bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-charcoal">Factual Confidence</span>
                    <span className="text-slateink">{promoteConfidence}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={promoteConfidence}
                    onChange={(e) => setPromoteConfidence(Number(e.target.value))}
                    className="w-full accent-terracotta"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-charcoal">Significance (1–5)</span>
                    <span className="text-slateink">
                      {promoteImportance ? MEMORY_IMPORTANCE_LABELS[promoteImportance] : 'Unrated'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setPromoteImportance((prev) => (prev === lvl ? null : lvl))}
                        className={`flex-1 py-1 rounded-lg border text-center font-bold text-xs transition-all cursor-pointer ${
                          promoteImportance === lvl
                            ? 'bg-terracotta text-paper border-terracotta shadow-2xs'
                            : 'bg-white border-linen-dark text-slateink hover:border-terracotta'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {promoteError && (
                <p className="text-xs text-clayred-DEFAULT bg-clayred-light/50 p-2 rounded-xl flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{promoteError}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-linen-dark/60">
              <button
                type="button"
                onClick={() => setPromotingCapture(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slateink hover:text-charcoal cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPromote}
                disabled={promoteLoading || !promoteTitle.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark disabled:opacity-50 transition-all cursor-pointer shadow-xs"
              >
                {promoteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Confirm Promotion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION DIALOG
          ========================================================================= */}
      <ConfirmDialog
        open={deletingCapture !== null}
        title="Delete Capture?"
        description="This will permanently delete this raw capture. If this capture has already been promoted to a memory, the permanent memory record will remain safe."
        confirmLabel="Delete capture"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingCapture(null)}
      />
    </div>
  );
}
