import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  BookOpen,
  Compass,
  Scale,
  Home,
  GitBranch,
  History,
  Settings,
  LayoutGrid,
  LogOut,
  User,
  Sparkles,
  Inbox,
  CheckSquare,
  Lightbulb,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';
import { requestQuickAdd } from '@/lib/quickAdd';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';

interface TrayDestination {
  page: PageId;
  label: string;
  icon: LucideIcon;
}

const TRAY_DESTINATIONS: TrayDestination[] = [
  { page: 'chat', label: 'Twin AI', icon: Sparkles },
  { page: 'memories', label: 'Memories', icon: BookOpen },
  { page: 'decisions', label: 'Decisions', icon: Scale },
  { page: 'beliefs', label: 'Beliefs', icon: Compass },
  { page: 'graph', label: 'Graph', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', icon: History },
  { page: 'inbox', label: 'Inbox', icon: Inbox },
  { page: 'insights', label: 'Insights', icon: Lightbulb },
  { page: 'reflect', label: 'Reflect', icon: PenLine },
  { page: 'review', label: 'Review', icon: CheckSquare },
  { page: 'profile', label: 'Profile', icon: User },
  { page: 'settings', label: 'Settings', icon: Settings },
];

export function MobileBottomBar({
  route,
  signedIn: propSignedIn,
}: {
  route: Route;
  signedIn?: boolean;
}) {
  const { user, loading } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const signedIn = propSignedIn !== undefined ? propSignedIn : (!loading && !!user);
  // Show bar on all app routes when signed in; or on non-landing preview pages when guest
  const showBar =
    route.kind === 'app' &&
    route.page !== 'onboarding' &&
    (signedIn || (!loading && route.page !== 'home'));
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;

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

  const isMorePageActive = currentPage !== null && currentPage !== 'home' && currentPage !== 'decisions';

  return (
    <>
      {/* Backdrop overlay for More popup tray */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-charcoal/25 backdrop-blur-2xs transition-opacity animate-[fadeIn_150ms_ease-out]"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Popup Tray (Anchored directly above the bottom bar) */}
      {moreOpen && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Workspace Tools Tray"
          className="fixed bottom-[74px] sm:bottom-[78px] inset-x-3 max-w-sm sm:max-w-md mx-auto z-50 bg-paper/95 backdrop-blur-2xl border border-linen-dark/90 rounded-3xl shadow-[0_20px_50px_rgba(43,42,38,0.22)] p-4 sm:p-5 animate-[slideUp_180ms_cubic-bezier(0.16,1,0.3,1)] max-h-[calc(100dvh-96px)] overflow-y-auto overscroll-contain space-y-4"
        >
          {/* Header with Title & Close button */}
          <div className="flex items-center justify-between pb-2 border-b border-linen-dark/60">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-terracotta/15 text-terracotta-deep">
                <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-charcoal font-serif">Workspace Tools</h3>
                <p className="text-[10px] text-slateink-light">All destinations & quick capture</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="p-1.5 rounded-xl text-slateink-light hover:text-charcoal hover:bg-linen/70 transition-colors cursor-pointer"
              aria-label="Close tray"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Actions (Strict 3-Column Grid View) */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
              Quick Actions
            </p>
            <div className="grid grid-cols-3 gap-2">
              <QuickActionBtn
                label="Memory"
                icon={BookOpen}
                onClick={() => handleQuickAdd('memory')}
              />
              <QuickActionBtn
                label="Decision"
                icon={Scale}
                onClick={() => handleQuickAdd('decision')}
              />
              <QuickActionBtn
                label="Belief"
                icon={Compass}
                onClick={() => handleQuickAdd('belief')}
              />
              <QuickActionBtn
                label="Capture"
                icon={Inbox}
                onClick={() => handleQuickAdd('capture')}
              />
              <QuickActionBtn
                label="Reflect"
                icon={PenLine}
                onClick={() => {
                  setMoreOpen(false);
                  navigateTo('reflect');
                }}
              />
              <QuickActionBtn
                label="Ask Twin"
                icon={Sparkles}
                onClick={() => {
                  setMoreOpen(false);
                  navigateTo('chat');
                }}
              />
            </div>
          </div>

          {/* Destinations (Strict 3-Column Grid View) */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
              Destinations
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TRAY_DESTINATIONS.map((dest) => {
                const Icon = dest.icon;
                const isActive = currentPage === dest.page;
                return (
                  <a
                    key={dest.page}
                    href={hrefFor(dest.page)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      goPage(dest.page);
                    }}
                    className={`group flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all text-center cursor-pointer ${
                      isActive
                        ? 'bg-terracotta-light/20 border-terracotta/60 shadow-xs'
                        : 'bg-white/80 border-linen-dark/70 hover:border-linen-dark hover:bg-white hover:shadow-2xs'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl mb-1 transition-all ${
                        isActive
                          ? 'bg-terracotta text-paper shadow-2xs'
                          : 'bg-linen/80 text-charcoal group-hover:bg-linen group-hover:scale-105'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span
                      className={`text-[11px] font-medium leading-tight line-clamp-1 ${
                        isActive ? 'text-terracotta-deep font-semibold' : 'text-charcoal'
                      }`}
                    >
                      {dest.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Footer Area: User Status, Privacy & Logout */}
          <div className="pt-2 border-t border-linen-dark/60 flex items-center justify-between text-xs">
            {signedIn ? (
              <>
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sage-dark shrink-0" />
                    <p className="text-xs font-semibold text-charcoal truncate max-w-[150px] sm:max-w-[200px]">
                      {user!.email}
                    </p>
                  </div>
                  <a
                    href="/privacy"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      goPage('privacy');
                    }}
                    className="text-[10px] text-slateink hover:text-charcoal hover:underline mt-0.5 inline-block"
                  >
                    Privacy & Data Controls
                  </a>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-clayred-DEFAULT hover:text-clayred-dark px-2.5 py-1.5 rounded-xl hover:bg-clayred-light/30 transition-colors cursor-pointer"
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
                className="w-full text-center py-2.5 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark shadow-xs transition-colors"
              >
                Sign in to save your personal workspace
              </a>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Navigation Bar (Minimalistic 3-Column Grid) */}
      <nav
        aria-label="Bottom Navigation Bar"
        className="fixed bottom-3 inset-x-3 max-w-sm sm:max-w-md mx-auto z-40 bg-paper/95 backdrop-blur-xl border border-linen-dark/80 rounded-2xl shadow-[0_8px_30px_rgba(32,35,33,0.12)] h-[58px] px-2 select-none"
      >
        <div className="grid grid-cols-3 items-center h-full gap-1">
          {/* Col 1: Home */}
          <DockTab
            href="/home"
            label="Home"
            icon={Home}
            active={currentPage === 'home'}
            onClick={() => goPage('home')}
          />

          {/* Col 2: Decisions */}
          <DockTab
            href="/decisions"
            label="Decisions"
            icon={Scale}
            active={currentPage === 'decisions'}
            onClick={() => goPage('decisions')}
          />

          {/* Col 3: More (Toggles popup tray floating directly above) */}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="Open workspace tools tray"
            className={`flex flex-col items-center justify-center gap-0.5 py-1 h-full rounded-xl transition-all duration-150 cursor-pointer ${
              moreOpen || isMorePageActive
                ? 'text-terracotta-deep font-semibold'
                : 'text-slateink hover:text-charcoal'
            }`}
          >
            <span
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                moreOpen || isMorePageActive ? 'bg-terracotta/15' : 'hover:bg-linen/60'
              }`}
            >
              <LayoutGrid
                className={`w-4 h-4 ${
                  moreOpen || isMorePageActive ? 'text-terracotta-deep' : 'text-slateink'
                }`}
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
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
          active ? 'bg-terracotta/15' : 'hover:bg-linen/60'
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

function QuickActionBtn({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center p-2 rounded-2xl border border-linen-dark/70 bg-white/80 hover:bg-white hover:border-terracotta hover:shadow-2xs transition-all text-center shadow-2xs cursor-pointer"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-linen/80 text-charcoal group-hover:bg-terracotta/10 group-hover:text-terracotta-deep group-hover:scale-105 transition-all mb-1">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
      <span className="text-[11px] font-medium text-charcoal group-hover:text-terracotta-deep leading-tight truncate max-w-full">
        {label}
      </span>
    </button>
  );
}
