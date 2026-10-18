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
  Sparkles,
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
  { kind: 'memory', label: 'Record a Memory', hint: 'An experience, reflection, or moment', icon: BookOpen },
  { kind: 'belief', label: 'State a Belief or Value', hint: 'A core principle you hold to be true', icon: Compass },
  { kind: 'decision', label: 'Frame a Decision', hint: 'Weigh choices and examine outcomes', icon: Scale },
];

const MORE_TOOLS: { page: PageId; label: string; desc: string; icon: LucideIcon }[] = [
  { page: 'decisions', label: 'Decision Mirror', desc: 'Weigh options & arithmetic', icon: Scale },
  { page: 'beliefs', label: 'Beliefs & Values', desc: 'Track principles & changes', icon: Compass },
  { page: 'graph', label: 'Evidence Graph', desc: 'Interactive connection map', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', desc: 'Chronological memory stream', icon: History },
  { page: 'settings', label: 'Settings & Privacy', desc: 'Data export & preferences', icon: Settings },
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
          className="md:hidden fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm transition-opacity animate-[fadeIn_150ms_ease-out]"
        />
      )}

      {/* Quick Record Bottom Sheet */}
      {sheet === 'add' && (
        <div
          ref={sheetContentRef}
          role="dialog"
          aria-modal="true"
          aria-label="Quick record"
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-[28px] border-t border-linen-dark/80 shadow-2xl p-6 pb-[max(2rem,env(safe-area-inset-bottom))] animate-[slideUp_200ms_ease-out]"
        >
          <div className="w-12 h-1.5 bg-linen-dark/80 rounded-full mx-auto mb-5" />
          
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-serif font-bold text-charcoal">Quick Record</h2>
              <p className="text-xs text-slateink-light mt-0.5">Capture evidence for your personal model</p>
            </div>
            <button
              onClick={() => setSheet(null)}
              className="p-2 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.kind}
                  onClick={() => chooseAdd(opt)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white border border-linen-dark/70 shadow-xs hover:border-terracotta hover:shadow-card active:scale-[0.98] transition-all text-left group"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-terracotta/10 text-terracotta-deep group-hover:bg-terracotta group-hover:text-paper transition-colors">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-charcoal">{opt.label}</span>
                    <span className="block text-xs text-slateink-light mt-0.5">{opt.hint}</span>
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
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-[28px] border-t border-linen-dark/80 shadow-2xl p-6 pb-[max(2rem,env(safe-area-inset-bottom))] animate-[slideUp_200ms_ease-out]"
        >
          <div className="w-12 h-1.5 bg-linen-dark/80 rounded-full mx-auto mb-5" />
          
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-serif font-bold text-charcoal">Explore & Tools</h2>
              <p className="text-xs text-slateink-light mt-0.5">Deep inspection of your personal model</p>
            </div>
            <button
              onClick={() => setSheet(null)}
              className="p-2 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
            {MORE_TOOLS.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => goPage(item.page)}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all ${
                    isActive
                      ? 'bg-terracotta/10 border-terracotta text-terracotta-deep shadow-xs'
                      : 'bg-white border-linen-dark/60 text-charcoal hover:bg-linen/40'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      isActive ? 'bg-terracotta text-paper' : 'bg-linen text-slateink-dark'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold leading-snug">{item.label}</span>
                    <span className="block text-[11px] text-slateink-light mt-0.5 truncate">{item.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Account Footer in More Sheet */}
          <div className="pt-4 border-t border-linen-dark/60 flex items-center justify-between gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta/15 text-terracotta-deep font-semibold text-xs uppercase shrink-0">
                    {user.email?.charAt(0) ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-charcoal truncate">{user.email}</p>
                    <p className="text-[10px] text-slateink-light">Private Workspace</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-clayred-DEFAULT hover:text-clayred-dark px-3 py-2 rounded-xl hover:bg-clayred-light/30 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => goPage('signin')}
                className="w-full text-center py-3 rounded-2xl bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark shadow-sm transition-colors"
              >
                Sign in to save your private workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Luxury Mobile Navigation Dock */}
      <nav
        aria-label="Mobile Navigation Dock"
        className="md:hidden fixed bottom-4 inset-x-4 max-w-sm sm:max-w-md mx-auto z-40 bg-paper/95 backdrop-blur-2xl border border-linen-dark/80 rounded-2xl shadow-[0_10px_35px_rgba(32,35,33,0.12)] h-16 px-1.5"
      >
        <div className="grid grid-cols-5 items-center h-full">
          {/* Tab 1: Home */}
          <DockTabButton
            label="Home"
            icon={Home}
            active={currentPage === 'home'}
            onClick={() => goPage('home')}
          />

          {/* Tab 2: Memories */}
          <DockTabButton
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
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-terracotta-deep via-terracotta to-terracotta-light text-paper shadow-lifted ring-4 ring-paper -translate-y-2.5 transition-all duration-200 active:scale-95 ${
                sheet === 'add' ? 'rotate-45 bg-charcoal' : 'hover:scale-105'
              }`}
            >
              <Plus className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          {/* Tab 4: Twin Chat */}
          <DockTabButton
            label="Twin"
            icon={MessageCircle}
            active={currentPage === 'chat'}
            onClick={() => goPage('chat')}
          />

          {/* Tab 5: More Tools */}
          <DockTabButton
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

function DockTabButton({
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
      className={`flex flex-col items-center justify-center gap-1 py-1 h-full rounded-xl transition-all duration-150 ${
        active
          ? 'text-terracotta-deep font-semibold'
          : 'text-slateink hover:text-charcoal active:scale-95'
      }`}
    >
      <span
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
          active ? 'bg-terracotta/15' : ''
        }`}
      >
        <Icon className={`w-5 h-5 ${active ? 'text-terracotta-deep' : 'text-slateink'}`} aria-hidden="true" />
      </span>
      <span className="text-[10px] tracking-tight leading-none font-medium">{label}</span>
    </button>
  );
}
