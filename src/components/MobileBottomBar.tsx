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
  Sparkles,
  Inbox,
  CheckSquare,
  Lightbulb,
  PenLine,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';
import { requestQuickAdd } from '@/lib/quickAdd';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';

interface SecondaryNavItem {
  page: PageId;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SECONDARY_DESTINATIONS: SecondaryNavItem[] = [
  { page: 'inbox', label: 'Capture Inbox', description: 'Quick thoughts & reflection drafts', icon: Inbox },
  { page: 'reflect', label: 'Weekly Review', description: 'Reflect on records & lessons', icon: PenLine },
  { page: 'review', label: 'Review Center', description: 'Inspect & govern pending AI suggestions', icon: CheckSquare },
  { page: 'insights', label: 'Insights & Patterns', description: 'Evidence-grounded recurring themes & tensions', icon: Lightbulb },
  { page: 'beliefs', label: 'Beliefs & Values', description: 'Confirmed principles & confidence', icon: Compass },
  { page: 'graph', label: 'Evidence Graph', description: 'Visual map of records & tensions', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', description: 'Chronological history of moments', icon: History },
  { page: 'privacy', label: 'Privacy & Data', description: 'Real counts, exports & deletion', icon: ShieldCheck },
  { page: 'settings', label: 'Settings & AI Keys', description: 'Keys and model configuration', icon: Settings },
  { page: 'profile', label: 'My Profile', description: 'Personal model identity & stats', icon: User },
];

export function MobileBottomBar({ route }: { route: Route }) {
  const { user, loading } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const signedIn = !loading && !!user;
  const showBar = !loading && route.kind === 'app' && route.page !== 'chat' && (signedIn || route.page !== 'home');
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;

  const isMorePageActive = SECONDARY_DESTINATIONS.some((item) => item.page === currentPage);

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

  const goPage = (p: PageId) => {
    setMoreOpen(false);
    if (currentPage === p && route.kind === 'app' && route.detailId === null) return;
    navigateTo(p);
  };

  const handleQuickAdd = (kind: 'memory' | 'decision' | 'belief' | 'capture') => {
    setMoreOpen(false);
    if (kind === 'capture') {
      navigateTo('inbox');
      setTimeout(() => requestQuickAdd('capture'), 80);
      return;
    }
    if (kind === 'decision') {
      navigateTo({ page: 'decision', action: 'new' });
      return;
    }
    if (kind === 'belief') {
      if (currentPage !== 'beliefs') {
        navigateTo('beliefs');
        setTimeout(() => requestQuickAdd('belief'), 80);
      } else {
        requestQuickAdd('belief');
      }
      return;
    }
    // Memory
    if (currentPage !== 'memories') {
      navigateTo('memories');
      setTimeout(() => requestQuickAdd('memory'), 80);
    } else {
      requestQuickAdd('memory');
    }
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
          className="md:hidden fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-xs transition-opacity animate-[fadeIn_150ms_ease-out]"
        />
      )}

      {/* More Navigation Bottom Sheet */}
      {moreOpen && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Secondary navigation and tools"
          className="md:hidden fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-paper rounded-t-3xl border-t border-linen-dark shadow-2xl p-4 sm:p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-[slideUp_180ms_ease-out] space-y-4"
        >
          {/* Drag Handle & Header */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-1 bg-linen-dark/80 rounded-full mb-3" />
            <div className="w-full flex items-center justify-between px-1">
              <div>
                <h2 className="font-serif text-base font-bold text-charcoal">More Destinations</h2>
                <p className="text-[11px] text-slateink-light">Explore models, visualizations, and settings</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-1 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Record Action Banner (Only visible when logged in) */}
          {signedIn && (
            <div className="p-2.5 rounded-2xl bg-linen/50 border border-linen-dark/60 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light pl-1">
                Quick create
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickAdd('capture')}
                  className="py-1.5 px-1.5 rounded-xl bg-linen border border-terracotta/40 text-xs font-semibold text-terracotta-deep hover:bg-terracotta/10 transition-colors flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-terracotta" />
                  <span>Capture</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('memory')}
                  className="py-1.5 px-1.5 rounded-xl bg-white border border-linen-dark/80 text-xs font-semibold text-charcoal hover:border-terracotta hover:text-terracotta-deep transition-colors flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-terracotta" />
                  <span>Memory</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('decision')}
                  className="py-1.5 px-1.5 rounded-xl bg-white border border-linen-dark/80 text-xs font-semibold text-charcoal hover:border-amberclay-DEFAULT hover:text-amberclay-DEFAULT transition-colors flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-amberclay-DEFAULT" />
                  <span>Decision</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('belief')}
                  className="py-1.5 px-1.5 rounded-xl bg-white border border-linen-dark/80 text-xs font-semibold text-charcoal hover:border-sage-dark hover:text-sage-dark transition-colors flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-sage-dark" />
                  <span>Belief</span>
                </button>
              </div>
            </div>
          )}

          {/* Secondary Destinations List */}
          <div className="space-y-1">
            {(signedIn
              ? SECONDARY_DESTINATIONS
              : SECONDARY_DESTINATIONS.filter((item) => item.page !== 'inbox' && item.page !== 'profile' && item.page !== 'review' && item.page !== 'insights' && item.page !== 'reflect')
            ).map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <a
                  key={item.page}
                  href={hrefFor(item.page)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    goPage(item.page);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-terracotta/10 border-terracotta/40 text-terracotta-deep font-semibold'
                      : 'bg-white/80 border-linen-dark/60 text-charcoal hover:bg-linen/50'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActive ? 'bg-terracotta text-paper shadow-2xs' : 'bg-linen/80 text-slateink-dark'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-tight">{item.label}</p>
                    <p className="text-[10px] text-slateink-light truncate mt-0.5">{item.description}</p>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Account Footer in More Sheet */}
          <div className="pt-2.5 border-t border-linen-dark/60 flex items-center justify-between gap-3 px-1">
            {user ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shrink-0 shadow-2xs">
                    {user.email?.charAt(0) ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-charcoal truncate">{user.email}</p>
                    <p className="text-[10px] text-slateink-light">Private Workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-clayred-DEFAULT hover:text-clayred-dark px-2.5 py-1 rounded-lg hover:bg-clayred-light/30 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <a
                href="/signin"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  goPage('signin');
                }}
                className="w-full text-center py-2 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark shadow-xs transition-colors"
              >
                Sign in to save your personal workspace
              </a>
            )}
          </div>
        </div>
      )}

      {/* Floating Mobile Navigation Dock */}
      <nav
        aria-label="Mobile Navigation Dock"
        className="md:hidden fixed bottom-3 inset-x-3 max-w-sm sm:max-w-md mx-auto z-40 bg-paper/95 backdrop-blur-xl border border-linen-dark/80 rounded-2xl shadow-[0_8px_30px_rgba(32,35,33,0.12)] h-[60px] px-1.5"
      >
        <div className="grid grid-cols-5 items-center h-full">
          {/* Tab 1: Home */}
          <DockTab
            href="/home"
            label="Home"
            icon={Home}
            active={currentPage === 'home'}
            onClick={() => goPage('home')}
          />

          {/* Tab 2: Memories */}
          <DockTab
            href="/memories"
            label="Memories"
            icon={BookOpen}
            active={currentPage === 'memories'}
            onClick={() => goPage('memories')}
          />

          {/* Tab 3: Decisions */}
          <DockTab
            href="/decisions"
            label="Decisions"
            icon={Scale}
            active={currentPage === 'decisions'}
            onClick={() => goPage('decisions')}
          />

          {/* Tab 4: Twin Chat */}
          <DockTab
            href="/chat"
            label="Twin"
            icon={MessageCircle}
            active={currentPage === 'chat'}
            onClick={() => goPage('chat')}
          />

          {/* Tab 5: More Tools - Opens non-repeating Secondary Tools */}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="Open secondary destinations"
            className={`flex flex-col items-center justify-center gap-0.5 py-1 h-full rounded-xl transition-all duration-150 cursor-pointer ${
              isMorePageActive || moreOpen
                ? 'text-terracotta-deep font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                isMorePageActive || moreOpen ? 'bg-terracotta/15' : ''
              }`}
            >
              <LayoutGrid
                className={`w-4 h-4 ${isMorePageActive || moreOpen ? 'text-terracotta-deep' : 'text-slateink'}`}
                aria-hidden="true"
              />
            </span>
            <span className="text-[10px] tracking-tight leading-none font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function DockTab({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick();
      }}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 py-1 h-full rounded-xl transition-all duration-150 cursor-pointer ${
        active
          ? 'text-terracotta-deep font-semibold'
          : 'text-slateink hover:text-charcoal'
      }`}
    >
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
          active ? 'bg-terracotta/15' : ''
        }`}
      >
        <Icon
          className={`w-4 h-4 ${active ? 'text-terracotta-deep' : 'text-slateink'}`}
          aria-hidden="true"
        />
      </span>
      <span className="text-[10px] tracking-tight leading-none font-medium">{label}</span>
    </a>
  );
}
