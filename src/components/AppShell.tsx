import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Feather,
  LogOut,
  User,
  UserCircle2,
  BookOpen,
  Scale,
  Compass,
  History,
  GitBranch,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Settings,
  Eye,
  Inbox,
  CheckSquare,
  Lightbulb,
  PenLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { PROTECTED_PAGES, hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';
import { MobileBottomBar } from '@/components/MobileBottomBar';
import { SampleDataToast } from '@/components/ui';
import { PublicFooter } from '@/components/PublicFooter';

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_WORKSPACE_NAV: NavItem[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'memories', label: 'Memories', icon: BookOpen },
  { id: 'decisions', label: 'Decisions', icon: Scale },
  { id: 'beliefs', label: 'Beliefs', icon: Compass },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'timeline', label: 'Timeline', icon: History },
];

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [publicMenuOpen, setPublicMenuOpen] = useState(false);
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  const page: PageId = route.kind === 'app' ? route.page : 'signin';
  const isLandingPage = route.kind === 'app' && route.page === 'home';

  const go = (p: PageId) => {
    navigateTo(p);
    setAccountOpen(false);
    setPublicMenuOpen(false);
  };

  const scrollToAnchor = (anchorId: string) => {
    setPublicMenuOpen(false);
    if (!isLandingPage) {
      navigateTo('home');
      setTimeout(() => {
        const el = document.getElementById(anchorId);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(anchorId);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    setAccountOpen(false);
    setPublicMenuOpen(false);
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountOpen(false);
        setPublicMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (accountOpen && target && !target.closest('[data-account-menu]')) {
        setAccountOpen(false);
      }
      if (publicMenuOpen && target && !target.closest('[data-public-menu]')) {
        setPublicMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [accountOpen, publicMenuOpen]);

  async function handleSignOut() {
    setAccountOpen(false);
    setPublicMenuOpen(false);
    await supabase.auth.signOut();
    const current = window.location.pathname;
    const isPersonal = PROTECTED_PAGES.some((p) => current.startsWith(`/${p}`));
    if (isPersonal || current.startsWith('/memory') || current.startsWith('/decision')) {
      navigateTo('home');
    } else {
      navigateTo(current === '/' ? 'home' : (current.slice(1) as PageId), { replace: true });
    }
  }

  const userDisplayName = user?.email ? user.email.split('@')[0] : 'Account';

  return (
    <div
      className={`flex flex-col bg-paper text-charcoal ${
        page === 'chat' || route.kind === 'auth' ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:shadow-card focus:ring-2 focus:ring-terracotta"
      >
        Skip to content
      </a>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-linen-dark/60 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-[68px] flex items-center justify-between gap-4">
          {/* Brand Logo & Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go('home');
              }}
              className="group flex items-center gap-2.5 rounded-xl py-1 px-1 -ml-1 transition-transform active:scale-98 cursor-pointer"
              aria-label="EchoSelf home"
            >
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-terracotta to-terracotta-dark text-paper shadow-2xs group-hover:scale-105 transition-all duration-150">
                <Feather className="w-4 h-4 sm:w-4.5 sm:h-4.5" aria-hidden="true" />
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-charcoal group-hover:text-terracotta transition-colors">
                EchoSelf
              </span>
            </a>

            {isLandingPage && !signedIn && (
              <span className="hidden xl:inline-block pl-3 border-l border-linen-dark/80 text-xs text-slateink font-medium">
                Your experiences, understood in context.
              </span>
            )}
          </div>

          {/* Navigation Items: Public Landing Nav when signed-out on home page; Workspace Nav when signed-in or in workspace */}
          {isLandingPage && !signedIn ? (
            /* =========================================================================
               1. PUBLIC LANDING NAVBAR (Signed-out on landing page)
               ========================================================================= */
            <div className="flex items-center gap-2 sm:gap-4" data-public-menu>
              {/* Desktop Public Nav Links */}
              <nav className="hidden md:flex items-center gap-1.5 lg:gap-3" aria-label="Public Navigation">
                <button
                  type="button"
                  onClick={() => scrollToAnchor('how-it-works')}
                  className="px-3 py-1.5 text-xs sm:text-sm font-medium text-slateink-dark hover:text-charcoal hover:bg-linen/40 rounded-xl transition-colors cursor-pointer"
                >
                  How it works
                </button>
                <button
                  type="button"
                  onClick={() => scrollToAnchor('decision-mirror')}
                  className="px-3 py-1.5 text-xs sm:text-sm font-medium text-slateink-dark hover:text-charcoal hover:bg-linen/40 rounded-xl transition-colors cursor-pointer"
                >
                  Decision Mirror
                </button>
              </nav>

              {/* Public Right Action Area */}
              <div className="flex items-center gap-2 sm:gap-3">
                {signedIn ? (
                  <div className="flex items-center gap-2">
                    <a
                      href="/memories"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go('memories');
                      }}
                      className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-all shadow-xs cursor-pointer"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5 text-terracotta-light" aria-hidden />
                    </a>

                    <div className="relative" data-account-menu>
                      <button
                        type="button"
                        onClick={() => setAccountOpen((o) => !o)}
                        aria-expanded={accountOpen}
                        aria-haspopup="true"
                        aria-label="Profile and settings menu"
                        className="inline-flex items-center gap-1.5 h-9 pl-1.5 pr-2.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal transition-all shadow-2xs cursor-pointer"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shadow-2xs">
                          {userDisplayName.charAt(0)}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slateink-light transition-transform duration-200 ${
                            accountOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {accountOpen && (
                        <div
                          className="absolute right-0 top-11 w-56 rounded-2xl border border-linen-dark/80 bg-white shadow-lifted p-1.5 z-50 animate-[fadeIn_100ms_ease-out]"
                          role="menu"
                        >
                          <div className="px-3 py-2 border-b border-linen-dark/40 mb-1">
                            <p className="text-xs font-semibold text-charcoal truncate">{user!.email}</p>
                            <p className="text-[10px] text-slateink-light mt-0.5">Personal Workspace</p>
                          </div>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => go('profile')}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <User className="w-4 h-4 text-terracotta" aria-hidden />
                            <span>My Profile</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => go('insights')}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Lightbulb className="w-4 h-4 text-terracotta" aria-hidden />
                            <span>Insights & Patterns</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => go('reflect')}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <PenLine className="w-4 h-4 text-terracotta" aria-hidden />
                            <span>Weekly Review</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => go('settings')}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Settings className="w-4 h-4 text-slateink-dark" aria-hidden />
                            <span>Settings & Privacy</span>
                          </button>

                          <div className="my-1 border-t border-linen-dark/40" />

                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleSignOut}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-4 h-4 text-clayred-DEFAULT" aria-hidden />
                            <span>Logout</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <a
                      href="/signin"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go('signin');
                      }}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                    >
                      <UserCircle2 className="w-3.5 h-3.5 text-slateink-light" />
                      <span>Sign in</span>
                    </a>

                    <a
                      href="/memories"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go('memories');
                      }}
                      className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark transition-all shadow-xs cursor-pointer"
                    >
                      <span>Explore Demo</span>
                      <ArrowRight className="w-3.5 h-3.5 text-terracotta-light" />
                    </a>
                  </div>
                )}

                {/* Mobile Hamburger Toggle (for public landing page) */}
                <button
                  type="button"
                  onClick={() => setPublicMenuOpen((o) => !o)}
                  aria-expanded={publicMenuOpen}
                  aria-label="Toggle navigation menu"
                  className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border border-linen-dark/80 bg-white text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
                >
                  {publicMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </button>
              </div>

              {/* Public Mobile Menu Drawer */}
              {publicMenuOpen && (
                <div
                  className="md:hidden absolute top-16 inset-x-0 bg-paper/98 backdrop-blur-xl border-b border-linen-dark shadow-lifted p-4 space-y-3 animate-[slideDown_150ms_ease-out] z-50"
                  role="dialog"
                  aria-label="Mobile menu"
                >
                  <nav className="flex flex-col space-y-1">
                    <button
                      type="button"
                      onClick={() => scrollToAnchor('how-it-works')}
                      className="text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold text-charcoal hover:bg-linen/60 transition-colors"
                    >
                      How it works
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToAnchor('decision-mirror')}
                      className="text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold text-charcoal hover:bg-linen/60 transition-colors"
                    >
                      Decision Mirror
                    </button>
                    <a
                      href="/memories"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go('memories');
                      }}
                      className="text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold text-terracotta-deep hover:bg-terracotta/10 transition-colors flex items-center justify-between"
                    >
                      <span>Explore Demo Persona</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </nav>

                  <div className="pt-2 border-t border-linen-dark/60 flex items-center gap-2">
                    {signedIn ? (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-xs text-slateink truncate max-w-[180px]">{user!.email}</span>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-clayred-DEFAULT hover:bg-clayred-light/30 transition-colors"
                        >
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <>
                        <a
                          href="/signin"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            go('signin');
                          }}
                          className="flex-1 text-center py-2 rounded-xl border border-linen-dark bg-white text-xs font-semibold text-charcoal hover:bg-linen"
                        >
                          Sign In
                        </a>
                        <a
                          href="/signup"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            go('signup');
                          }}
                          className="flex-1 text-center py-2 rounded-xl bg-charcoal text-paper text-xs font-semibold hover:bg-slateink-dark"
                        >
                          Create Account
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               2. IN-APP WORKSPACE NAVBAR
               ========================================================================= */
            <>
              {/* Centered Desktop Primary Nav */}
              <nav
                className="hidden md:flex flex-1 items-center justify-center gap-1 lg:gap-2"
                aria-label="Workspace Navigation"
              >
                {(signedIn ? PRIMARY_WORKSPACE_NAV : PRIMARY_WORKSPACE_NAV.filter((item) => item.id !== 'inbox')).map((item) => {
                  const Icon = item.icon;
                  const isActive = page === item.id;
                  return (
                    <a
                      key={item.id}
                      href={hrefFor(item.id)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go(item.id);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-linen/85 text-charcoal font-semibold border border-linen-dark/60 shadow-2xs'
                          : 'text-slateink-dark hover:text-charcoal hover:bg-linen/40'
                      }`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 transition-colors ${
                          isActive ? 'text-terracotta-deep' : 'text-slateink group-hover:text-charcoal'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>

              {/* Right Action Area: Sample Indicator, Twin Chat, Profile */}
              <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
                {/* Sample Persona Context Badge (Visible when unauthenticated in workspace) */}
                {!signedIn && (
                  <a
                    href="/signin"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('signin');
                    }}
                    title="You are browsing the fictional sample persona 'Jordan'. Click to sign in or create your own private workspace."
                    className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amberclay-light/40 border border-amberclay-DEFAULT/30 text-[11px] font-medium text-amberclay-DEFAULT hover:bg-amberclay-light/60 transition-colors"
                  >
                    <Eye className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>Demo Mode (Jordan)</span>
                  </a>
                )}

                {/* Quick Capture Fast Action (Only visible when signed in) */}
                {signedIn && (
                  <a
                    href={hrefFor('inbox')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('inbox');
                    }}
                    aria-current={page === 'inbox' ? 'page' : undefined}
                    className={`hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 whitespace-nowrap shadow-2xs cursor-pointer border ${
                      page === 'inbox'
                        ? 'bg-linen border-terracotta text-terracotta-deep shadow-xs'
                        : 'bg-white/80 border-linen-dark/80 text-charcoal hover:bg-white hover:border-terracotta/60'
                    }`}
                    title="Capture Inbox"
                  >
                    <Feather className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />
                    <span>Capture</span>
                  </a>
                )}

                {/* Review Center Fast Action (Only visible when signed in) */}
                {signedIn && (
                  <a
                    href={hrefFor('review')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('review');
                    }}
                    aria-current={page === 'review' ? 'page' : undefined}
                    className={`hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 whitespace-nowrap shadow-2xs cursor-pointer border ${
                      page === 'review'
                        ? 'bg-linen border-terracotta text-terracotta-deep shadow-xs'
                        : 'bg-white/80 border-linen-dark/80 text-charcoal hover:bg-white hover:border-terracotta/60'
                    }`}
                    title="Review Center"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />
                    <span>Review</span>
                  </a>
                )}

                {/* Insights Fast Action (Only visible when signed in) */}
                {signedIn && (
                  <a
                    href={hrefFor('insights')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('insights');
                    }}
                    aria-current={page === 'insights' ? 'page' : undefined}
                    className={`hidden xl:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 whitespace-nowrap shadow-2xs cursor-pointer border ${
                      page === 'insights'
                        ? 'bg-linen border-terracotta text-terracotta-deep shadow-xs'
                        : 'bg-white/80 border-linen-dark/80 text-charcoal hover:bg-white hover:border-terracotta/60'
                    }`}
                    title="Insights & Patterns"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />
                    <span>Insights</span>
                  </a>
                )}

                {/* Reflection Fast Action (Only visible when signed in) */}
                {signedIn && (
                  <a
                    href={hrefFor('reflect')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('reflect');
                    }}
                    aria-current={page === 'reflect' ? 'page' : undefined}
                    className={`hidden xl:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 whitespace-nowrap shadow-2xs cursor-pointer border ${
                      page === 'reflect'
                        ? 'bg-linen border-terracotta text-terracotta-deep shadow-xs'
                        : 'bg-white/80 border-linen-dark/80 text-charcoal hover:bg-white hover:border-terracotta/60'
                    }`}
                    title="Weekly Review"
                  >
                    <PenLine className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />
                    <span>Reflect</span>
                  </a>
                )}

                {/* Twin Chat Primary Action */}
                <a
                  href={hrefFor('chat')}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go('chat');
                  }}
                  aria-current={page === 'chat' ? 'page' : undefined}
                  className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 whitespace-nowrap shadow-2xs cursor-pointer ${
                    page === 'chat'
                      ? 'bg-terracotta text-paper ring-2 ring-terracotta/30 shadow-xs'
                      : 'bg-charcoal text-paper hover:bg-slateink-dark'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amberclay-light" aria-hidden="true" />
                  <span>Twin Chat</span>
                </a>

                {/* Profile & Account Menu */}
                {signedIn ? (
                  <div className="relative" data-account-menu>
                    <button
                      type="button"
                      onClick={() => setAccountOpen((o) => !o)}
                      aria-expanded={accountOpen}
                      aria-haspopup="true"
                      aria-label="Profile and workspace menu"
                      className="inline-flex items-center gap-1.5 h-9 pl-1.5 pr-2.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal transition-all shadow-2xs cursor-pointer"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shadow-2xs">
                        {userDisplayName.charAt(0)}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slateink-light transition-transform duration-200 ${
                          accountOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {accountOpen && (
                      <div
                        className="absolute right-0 top-11 w-56 rounded-2xl border border-linen-dark/80 bg-white shadow-lifted p-1.5 z-50 animate-[fadeIn_100ms_ease-out]"
                        role="menu"
                      >
                        <div className="px-3 py-2 border-b border-linen-dark/40 mb-1">
                          <p className="text-xs font-semibold text-charcoal truncate">{user!.email}</p>
                          <p className="text-[10px] text-slateink-light mt-0.5">Personal Workspace</p>
                        </div>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('inbox')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'inbox'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <Inbox className="w-4 h-4 text-terracotta" aria-hidden="true" />
                          <span>Capture Inbox</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('review')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'review'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <CheckSquare className="w-4 h-4 text-terracotta" aria-hidden="true" />
                          <span>Review Center</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('insights')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'insights'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <Lightbulb className="w-4 h-4 text-terracotta" aria-hidden="true" />
                          <span>Insights & Patterns</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('reflect')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'reflect'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <PenLine className="w-4 h-4 text-terracotta" aria-hidden="true" />
                          <span>Weekly Review</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('profile')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'profile'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <User className="w-4 h-4 text-slateink-dark" aria-hidden="true" />
                          <span>My Profile</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => go('settings')}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            page === 'settings'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <Settings className="w-4 h-4 text-slateink-dark" aria-hidden="true" />
                          <span>Settings & Privacy</span>
                        </button>

                        <div className="my-1 border-t border-linen-dark/40" />

                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleSignOut}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 text-clayred-DEFAULT" aria-hidden="true" />
                          <span>Logout</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <a
                    href="/signin"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      go('signin');
                    }}
                    aria-label="Sign in"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal text-xs font-semibold transition-all shadow-2xs whitespace-nowrap cursor-pointer"
                  >
                    <UserCircle2 className="w-3.5 h-3.5 text-slateink-light" />
                    <span>Sign in</span>
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        id="main-content"
        className={`w-full mx-auto ${
          isLandingPage
            ? 'flex-1 max-w-7xl py-6 md:py-12 pb-12 shell-pad'
            : page === 'chat'
            ? 'flex-1 min-h-0 w-full overflow-hidden flex flex-col p-0'
            : route.kind === 'auth'
            ? 'flex-1 min-h-0 w-full overflow-y-auto flex items-center justify-center p-3 sm:p-4'
            : 'flex-1 max-w-6xl py-6 md:py-10 pb-28 md:pb-16 shell-pad'
        }`}
      >
        {children}
      </main>

      {/* Site Footer System: Editorial PublicFooter on Public Landing, and Minimal Desktop Footer on In-App Workspace */}
      {isLandingPage ? (
        <PublicFooter />
      ) : route.kind === 'app' && page !== 'chat' ? (
        <footer className="hidden md:block border-t border-linen-dark/50 mt-auto bg-paper">
          <div className="max-w-6xl mx-auto shell-pad py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slateink">
            <p className="leading-relaxed">
              © {new Date().getFullYear()} EchoSelf · Every claim traces back to recorded evidence.
            </p>
            <div className="flex items-center gap-4 text-slateink-light">
              <span>{signedIn ? 'Private workspace active' : 'Viewing sample persona (Jordan)'}</span>
              <span className="text-linen-dark">·</span>
              <a
                href={hrefFor('settings')}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  go('settings');
                }}
                className="hover:text-charcoal hover:underline transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
              >
                Settings & Privacy
              </a>
            </div>
          </div>
        </footer>
      ) : null}

      {/* Mobile Navigation Dock - Rendered ONLY inside application routes, NOT on public landing page */}
      {!isLandingPage && <MobileBottomBar route={route} />}

      {/* Floating Sample Data Toast for Unauthenticated in-app visitors */}
      {!isLandingPage && !signedIn && !loading && <SampleDataToast />}
    </div>
  );
}
