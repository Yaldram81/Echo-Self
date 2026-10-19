import { useEffect, useRef, useState } from 'react';
import {
  X,
  BookOpen,
  Compass,
  Scale,
  Home,
  GitBranch,
  History,
  Settings,
  LayoutGrid,
  LayoutDashboard,
  LogOut,
  User,
  Sparkles,
  Inbox,
  CheckSquare,
  Lightbulb,
  PenLine,
  Lock,
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

/**
 * 9 distinct workspace destinations for signed-in users.
 * Does NOT duplicate the 4 primary tabs on the bottom bar: Home, Memories, Twin Chat, Dashboard.
 * Forms a perfect 3x3 grid (grid-cols-3) with zero redundancy.
 */
const WORKSPACE_DESTINATIONS: TrayDestination[] = [
  { page: 'beliefs', label: 'Beliefs', icon: Compass },
  { page: 'graph', label: 'Graph', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', icon: History },
  { page: 'inbox', label: 'Inbox', icon: Inbox },
  { page: 'insights', label: 'Insights', icon: Lightbulb },
  { page: 'reflect', label: 'Reflect', icon: PenLine },
  { page: 'review', label: 'Review', icon: CheckSquare },
  { page: 'decisions', label: 'Decisions', icon: Scale },
  { page: 'settings', label: 'Settings', icon: Settings },
];

/**
 * Public explore tools available in demo mode without signing in (3 columns).
 */
const GUEST_EXPLORE_TOOLS: TrayDestination[] = [
  { page: 'beliefs', label: 'Beliefs', icon: Compass },
  { page: 'graph', label: 'Graph', icon: GitBranch },
  { page: 'timeline', label: 'Timeline', icon: History },
];

/**
 * Personal workspace features locked behind authentication (6 items in 3-column grid).
 */
const GUEST_LOCKED_TOOLS: TrayDestination[] = [
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

  const isFormEditor =
    route.kind === 'app' &&
    (route.action === 'new' || route.action === 'edit');

  // Show bar on all app routes when signed in; or on non-landing preview pages when guest,
  // except when actively inside a full-page editor (new/edit decision) where the editor has its own action dock.
  const showBar =
    route.kind === 'app' &&
    route.page !== 'onboarding' &&
    !isFormEditor &&
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

  const primaryPages = signedIn
    ? ['home', 'memories', 'chat', 'profile']
    : ['home', 'memories', 'chat', 'decisions'];

  const isMorePageActive =
    currentPage !== null &&
    !primaryPages.includes(currentPage);

  return (
    <>
      {/* Backdrop overlay for More popup tray (Mobile Only: hidden on md+) */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-charcoal/30 backdrop-blur-2xs transition-opacity animate-[fadeIn_150ms_ease-out]"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Popup Tray (Anchored directly above bottom bar, Mobile Only: hidden on md+) */}
      {moreOpen && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Workspace Tools Tray"
          className="md:hidden fixed bottom-[72px] sm:bottom-[76px] inset-x-2.5 sm:inset-x-4 max-w-sm sm:max-w-md mx-auto z-50 bg-paper/95 backdrop-blur-2xl border border-linen-dark/90 rounded-3xl shadow-[0_20px_50px_rgba(43,42,38,0.24)] p-4 sm:p-5 animate-[slideUp_180ms_cubic-bezier(0.16,1,0.3,1)] max-h-[calc(100dvh-88px)] overflow-y-auto overscroll-contain space-y-4"
        >
          {/* Header with Title & Close button */}
          <div className="flex items-center justify-between pb-2 border-b border-linen-dark/60">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-terracotta/15 text-terracotta-deep">
                <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-charcoal font-serif">Workspace Tools</h3>
                <p className="text-[10px] text-slateink-light">
                  {signedIn ? 'Quick actions & remaining destinations' : 'Explore demo & locked features'}
                </p>
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

          {signedIn ? (
            /* =========================================================================
               SIGNED-IN EXPERIENCE: Quick Actions + 9 Unlocked Destinations
               ========================================================================= */
            <>
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

              {/* Destinations (Strict 3x3 Grid View without bottom-bar duplicates) */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
                  Destinations
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {WORKSPACE_DESTINATIONS.map((dest) => {
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
            </>
          ) : (
            /* =========================================================================
               GUEST / DEMO EXPERIENCE: Public Tools + Slogan + Locked Options
               ========================================================================= */
            <>
              {/* Public Demo Destinations (3 Columns) */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
                  Explore Demo Tools
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {GUEST_EXPLORE_TOOLS.map((dest) => {
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

              {/* Persuasive Slogan Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-terracotta/10 via-linen to-paper border border-terracotta/30 text-center space-y-2 shadow-2xs">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-terracotta-deep font-serif">
                  <Sparkles className="w-3.5 h-3.5 text-terracotta" />
                  <span>Sign in to get personalized experience</span>
                </div>
                <p className="text-[11px] text-slateink leading-relaxed">
                  Record your own memories, unlock private AI twin reasoning, and isolate your personal records with Postgres Row-Level Security.
                </p>
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo('signin');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark shadow-xs transition-colors cursor-pointer"
                  >
                    <Lock className="w-3 h-3 text-amberclay-light" />
                    <span>Sign In or Create Account</span>
                  </button>
                </div>
              </div>

              {/* Locked Personal Tools (Strict 3-Column Grid View) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">
                    Personal Workspace (Locked)
                  </p>
                  <span className="text-[10px] text-amberclay-DEFAULT font-medium flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Requires Account
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {GUEST_LOCKED_TOOLS.map((dest) => {
                    const Icon = dest.icon;
                    return (
                      <button
                        key={dest.page}
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          navigateTo('signin');
                        }}
                        className="group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border border-linen-dark/60 bg-paper/60 hover:bg-white hover:border-terracotta/60 transition-all text-center cursor-pointer shadow-2xs"
                        title={`Sign in to unlock ${dest.label}`}
                      >
                        <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-linen text-slateink-light group-hover:text-terracotta group-hover:bg-terracotta/10 transition-colors">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl mb-1 bg-linen/50 text-slateink-light group-hover:text-charcoal transition-all">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="text-[11px] font-medium leading-tight line-clamp-1 text-slateink group-hover:text-charcoal">
                          {dest.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

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

      {/* Floating Bottom Navigation Bar (5-Column Grid, Mobile-Only: hidden on md+) */}
      <nav
        aria-label="Bottom Navigation Bar"
        className="md:hidden fixed bottom-3 inset-x-2.5 sm:inset-x-4 max-w-md mx-auto z-40 bg-paper/95 backdrop-blur-xl border border-linen-dark/80 rounded-2xl shadow-[0_8px_30px_rgba(32,35,33,0.12)] h-[58px] px-1 select-none"
      >
        <div className="grid grid-cols-5 items-center h-full gap-0.5">
          {/* Col 1: Home */}
          <DockTab
            href="/home"
            label="Home"
            icon={Home}
            active={currentPage === 'home'}
            onClick={() => goPage('home')}
          />

          {/* Col 2: Memories */}
          <DockTab
            href="/memories"
            label="Memories"
            icon={BookOpen}
            active={currentPage === 'memories'}
            onClick={() => goPage('memories')}
          />

          {/* Col 3: Twin Chat */}
          <DockTab
            href="/chat"
            label="Twin Chat"
            icon={Sparkles}
            active={currentPage === 'chat'}
            onClick={() => goPage('chat')}
          />

          {/* Col 4: Dashboard (signed-in) or Decisions (guest) */}
          {signedIn ? (
            <DockTab
              href="/profile"
              label="Dashboard"
              icon={LayoutDashboard}
              active={currentPage === 'profile'}
              onClick={() => goPage('profile')}
            />
          ) : (
            <DockTab
              href="/decisions"
              label="Decisions"
              icon={Scale}
              active={currentPage === 'decisions'}
              onClick={() => goPage('decisions')}
            />
          )}

          {/* Col 5: More (Toggles popup tray floating directly above) */}
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
