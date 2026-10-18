import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  BookOpen,
  Compass,
  Scale,
  Home,
  MessageCircle,
  History,
  GitBranch,
  Settings,
  LayoutGrid,
  LogOut,
  UserCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { navigateTo, type PageId, type Route } from '@/lib/router';
import { requestQuickAdd, QUICK_ADD_PAGE, type QuickAddKind } from '@/lib/quickAdd';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';

type AddOption = {
  kind: QuickAddKind;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const OPTIONS: AddOption[] = [
  { kind: 'memory', label: 'Memory', hint: 'Record an experience or event', icon: BookOpen },
  { kind: 'belief', label: 'Belief / Value', hint: 'Articulate a principle you hold', icon: Compass },
  { kind: 'decision', label: 'Decision', hint: 'Map a choice and weigh values', icon: Scale },
];

type NavTab = {
  page: PageId;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_TABS: NavTab[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'memories', label: 'Memories', icon: BookOpen },
  { page: 'chat', label: 'Twin', icon: MessageCircle },
];

const MORE_TOOLS: { page: PageId; label: string; desc: string; icon: LucideIcon }[] = [
  { page: 'decisions', label: 'Decision Mirror', desc: 'Weigh choices & reflect on outcomes', icon: Scale },
  { page: 'beliefs', label: 'Beliefs & Values', desc: 'Track principles and evolution', icon: Compass },
  { page: 'graph', label: 'Evidence Graph', desc: 'Interactive connection map', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', desc: 'Chronological history of moments', icon: History },
  { page: 'settings', label: 'Settings & Privacy', desc: 'Preferences, export & data control', icon: Settings },
];

type SheetType = 'add' | 'more' | null;

export function MobileBottomBar({ route }: { route: Route }) {
  const { user, loading } = useAuth();
  const [sheet, setSheet] = useState<SheetType>(null);
  const [burstKind, setBurstKind] = useState<QuickAddKind | null>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  const showBar = !loading && route.kind === 'app';
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;

  const isMorePageActive =
    currentPage === 'decisions' ||
    currentPage === 'beliefs' ||
    currentPage === 'timeline' ||
    currentPage === 'graph' ||
    currentPage === 'settings';

  useEffect(() => {
    setSheet(null);
  }, [route]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  useEffect(() => {
    if (!burstKind) return;
    if (route.kind !== 'app') {
      setBurstKind(null);
      return;
    }
    const target = QUICK_ADD_PAGE[burstKind];
    if (route.page === target) {
      requestQuickAdd(burstKind);
      setBurstKind(null);
    }
  }, [route, burstKind]);

  if (!showBar) return null;

  const chooseAdd = (opt: AddOption) => {
    setSheet(null);
    const current = route.kind === 'app' ? route.page : null;
    const target: PageId = QUICK_ADD_PAGE[opt.kind];
    if (current === target && route.kind === 'app' && route.detailId === null) {
      requestQuickAdd(opt.kind);
      return;
    }
    setBurstKind(opt.kind);
    navigateTo(target);
  };

  const goPage = (p: PageId) => {
    setSheet(null);
    if (currentPage === p && route.kind === 'app' && route.detailId === null) return;
    navigateTo(p);
  };

  const handleSignOut = async () => {
    setSheet(null);
    await supabase.auth.signOut();
    navigateTo('home');
  };

  return (
    <>
      {/* Backdrop overlay for bottom sheets */}
      {sheet && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setSheet(null)}
          className="md:hidden fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-xs transition-opacity animate-[fadeIn_150ms_ease-out]"
        />
      )}

      {/* Quick Add Bottom Sheet */}
      {sheet === 'add' && (
        <div
          ref={sheetContentRef}
          role="dialog"
          aria-modal="true"
          aria-label="Create record"
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-3xl border-t border-linen-dark/80 shadow-2xl p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] animate-[fadeIn_180ms_ease-out]"
        >
          <div className="w-10 h-1 bg-linen-dark rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-serif font-semibold text-charcoal">Quick Record</h2>
              <p className="text-xs text-slateink-light">Capture an experience, belief, or decision</p>
            </div>
            <button
              onClick={() => setSheet(null)}
              className="p-1.5 rounded-full text-slateink hover:text-charcoal hover:bg-linen/60"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.kind}
                  onClick={() => chooseAdd(opt)}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-white border border-linen-dark/60 shadow-xs hover:border-terracotta active:scale-[0.98] transition-all text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-terracotta/10 text-terracotta-deep">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-charcoal">{opt.label}</span>
                    <span className="block text-xs text-slateink-light truncate">{opt.hint}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Explore & More Tools Bottom Sheet */}
      {sheet === 'more' && (
        <div
          ref={sheetContentRef}
          role="dialog"
          aria-modal="true"
          aria-label="Explore and tools"
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-3xl border-t border-linen-dark/80 shadow-2xl p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] animate-[fadeIn_180ms_ease-out]"
        >
          <div className="w-10 h-1 bg-linen-dark rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-serif font-semibold text-charcoal">Explore & Tools</h2>
              <p className="text-xs text-slateink-light">Access your models, graph, and preferences</p>
            </div>
            <button
              onClick={() => setSheet(null)}
              className="p-1.5 rounded-full text-slateink hover:text-charcoal hover:bg-linen/60"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {MORE_TOOLS.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => goPage(item.page)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isActive
                      ? 'bg-terracotta/10 border-terracotta text-terracotta-deep shadow-xs'
                      : 'bg-white border-linen-dark/60 text-charcoal hover:bg-linen/40'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-terracotta text-paper' : 'bg-linen text-slateink-dark'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold leading-snug">{item.label}</span>
                    <span className="block text-[11px] text-slateink-light truncate">{item.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Account Footer in More Sheet */}
          <div className="pt-3 border-t border-linen-dark/50 flex items-center justify-between gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle2 className="w-4 h-4 text-slateink-light shrink-0" />
                  <span className="text-xs text-slateink-dark truncate">{user.email}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-clayred-DEFAULT hover:text-clayred-dark px-2.5 py-1.5 rounded-lg hover:bg-clayred-light/30 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => goPage('signin')}
                className="w-full text-center py-2.5 rounded-xl bg-terracotta text-paper text-xs font-medium hover:bg-terracotta-dark transition-colors"
              >
                Sign in to save your workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main 5-Slot Bottom Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-paper/90 backdrop-blur-xl border-t border-linen-dark/70 shadow-[0_-4px_24px_rgba(32,35,33,0.06)] h-15 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 items-center h-full max-w-md mx-auto px-1">
          {/* Tab 1: Home */}
          <TabButton
            label="Home"
            icon={Home}
            active={currentPage === 'home'}
            onClick={() => goPage('home')}
          />

          {/* Tab 2: Memories */}
          <TabButton
            label="Memories"
            icon={BookOpen}
            active={currentPage === 'memories'}
            onClick={() => goPage('memories')}
          />

          {/* Tab 3: Center Elevated Action (+) Button */}
          <div className="relative flex items-center justify-center h-full">
            <button
              type="button"
              onClick={() => setSheet((s) => (s === 'add' ? null : 'add'))}
              aria-expanded={sheet === 'add'}
              aria-label={sheet === 'add' ? 'Close quick record' : 'Quick record'}
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-terracotta text-paper shadow-lifted ring-3 ring-paper transition-all duration-200 active:scale-95 ${
                sheet === 'add' ? 'rotate-45 bg-charcoal' : 'hover:bg-terracotta-dark'
              }`}
            >
              <Plus className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          {/* Tab 4: Twin Chat */}
          <TabButton
            label="Twin"
            icon={MessageCircle}
            active={currentPage === 'chat'}
            onClick={() => goPage('chat')}
          />

          {/* Tab 5: More Tools */}
          <TabButton
            label="More"
            icon={LayoutGrid}
            active={isMorePageActive || sheet === 'more'}
            onClick={() => setSheet((s) => (s === 'more' ? null : 'more'))}
          />
        </div>
      </nav>
    </>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-1 py-1 h-full rounded-xl transition-all ${
        active
          ? 'text-terracotta-deep font-semibold'
          : 'text-slateink hover:text-charcoal active:scale-95'
      }`}
    >
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
          active ? 'bg-terracotta/12' : ''
        }`}
      >
        <Icon className={`w-4.5 h-4.5 ${active ? 'text-terracotta-deep' : 'text-slateink'}`} aria-hidden="true" />
      </span>
      <span className="text-[10px] tracking-tight leading-none">{label}</span>
    </button>
  );
}
