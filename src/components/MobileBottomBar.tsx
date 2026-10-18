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
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { navigateTo, type PageId, type Route } from '@/lib/router';
import { requestQuickAdd, type QuickAddKind } from '@/lib/quickAdd';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';

interface GridToolItem {
  page: PageId;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const MORE_GRID_ITEMS: GridToolItem[] = [
  { page: 'decisions', label: 'Decisions', icon: Scale },
  { page: 'beliefs', label: 'Beliefs', icon: Compass },
  { page: 'graph', label: 'Graph', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', icon: History },
  { page: 'profile', label: 'Profile', icon: User },
  { page: 'settings', label: 'Settings', icon: Settings },
];

export function MobileBottomBar({ route }: { route: Route }) {
  const { user, loading } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const showBar = !loading && route.kind === 'app' && route.page !== 'home';
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;

  const isMorePageActive = MORE_GRID_ITEMS.some((item) => item.page === currentPage);

  useEffect(() => {
    setMoreOpen(false);
  }, [route]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  if (!showBar) return null;

  /**
   * Direct Action Button for (+):
   * Instantly triggers the appropriate record creation without any lengthy intermediary trays.
   */
  const handleDirectAdd = () => {
    setMoreOpen(false);
    if (currentPage === 'beliefs') {
      requestQuickAdd('belief');
      return;
    }
    if (currentPage === 'decisions') {
      requestQuickAdd('decision');
      return;
    }
    // Default primary record is Memory: navigate to memories and immediately open form
    if (currentPage !== 'memories') {
      navigateTo('memories');
      setTimeout(() => requestQuickAdd('memory'), 80);
    } else {
      requestQuickAdd('memory');
    }
  };

  const goPage = (p: PageId) => {
    setMoreOpen(false);
    if (currentPage === p && route.kind === 'app' && route.detailId === null) return;
    navigateTo(p);
  };

  const handleSignOut = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
    navigateTo('home');
  };

  return (
    <>
      {/* Backdrop overlay for More bottom sheet */}
      {moreOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setMoreOpen(false)}
          className="md:hidden fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm transition-opacity animate-[fadeIn_150ms_ease-out]"
        />
      )}

      {/* More Tools Bottom Sheet - Clean Grid View */}
      {moreOpen && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Explore and tools"
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-[28px] border-t border-linen-dark/80 shadow-2xl p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] animate-[slideUp_200ms_ease-out]"
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 bg-linen-dark/80 rounded-full mx-auto mb-4" />
          
          {/* Header */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div>
              <h2 className="text-base font-serif font-bold text-charcoal">Explore & Tools</h2>
              <p className="text-xs text-slateink-light">Inspect models, graph, and profile</p>
            </div>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-1.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Grid View of Items (3 columns) */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {MORE_GRID_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => goPage(item.page)}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all active:scale-95 ${
                    isActive
                      ? 'bg-terracotta/12 border-terracotta text-terracotta-deep shadow-xs font-semibold'
                      : 'bg-white border-linen-dark/60 text-charcoal hover:bg-linen/40'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl mb-2 transition-colors ${
                      isActive ? 'bg-terracotta text-paper shadow-xs' : 'bg-linen/70 text-slateink-dark'
                    }`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium leading-tight text-charcoal">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Account Footer in More Sheet */}
          <div className="pt-3 border-t border-linen-dark/60 flex items-center justify-between gap-3 px-1">
            {user ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shrink-0 shadow-xs">
                    {user.email?.charAt(0) ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-charcoal truncate">{user.email}</p>
                    <p className="text-[10px] text-slateink-light">Private Workspace</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-clayred-DEFAULT hover:text-clayred-dark px-3 py-1.5 rounded-xl hover:bg-clayred-light/30 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => goPage('signin')}
                className="w-full text-center py-2.5 rounded-xl bg-terracotta text-paper text-xs font-semibold hover:bg-terracotta-dark shadow-xs transition-colors"
              >
                Sign in to save your workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Mobile Navigation Dock */}
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

          {/* Tab 3: Direct Action (+) Button - Direct, no lengthy tray */}
          <div className="relative flex items-center justify-center h-full">
            <button
              type="button"
              onClick={handleDirectAdd}
              aria-label="Create record directly"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-terracotta-deep via-terracotta to-terracotta-light text-paper shadow-lifted ring-4 ring-paper -translate-y-2.5 hover:scale-105 active:scale-95 transition-all duration-150"
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

          {/* Tab 5: More Tools - Opens Grid View Tray */}
          <DockTabButton
            label="More"
            icon={LayoutGrid}
            active={isMorePageActive || moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
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
