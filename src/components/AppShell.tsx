import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Feather,
  LogOut,
  User,
  UserCircle2,
  MessageCircle,
  BookOpen,
  Scale,
  Compass,
  History,
  GitBranch,
  ChevronDown,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { PROTECTED_PAGES, hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';
import { MobileBottomBar } from '@/components/MobileBottomBar';
import { SampleDataToast } from '@/components/ui';

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const CENTERED_NAV: NavItem[] = [
  { id: 'memories', label: 'Memories', icon: BookOpen },
  { id: 'decisions', label: 'Decisions', icon: Scale },
  { id: 'beliefs', label: 'Beliefs', icon: Compass },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'timeline', label: 'Timeline', icon: History },
];

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  const page: PageId = route.kind === 'app' ? route.page : 'signin';
  const isLandingPage = route.kind === 'app' && route.page === 'home';

  const go = (p: PageId) => {
    navigateTo(p);
    setAccountOpen(false);
  };

  const scrollToHowItWorks = () => {
    if (!isLandingPage) {
      navigateTo('home');
      setTimeout(() => {
        const el = document.getElementById('how-it-works');
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById('how-it-works');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    setAccountOpen(false);
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (accountOpen && target && !target.closest('[data-account-menu]')) {
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [accountOpen]);

  async function handleSignOut() {
    setAccountOpen(false);
    await supabase.auth.signOut();
    const current = window.location.pathname;
    const isPersonal = PROTECTED_PAGES.some((p) => current.startsWith(`/${p}`));
    if (isPersonal || current.startsWith('/memory') || current.startsWith('/decision')) {
      navigateTo('home');
    } else {
      navigateTo(current === '/' ? 'home' : (current.slice(1) as PageId), { replace: true });
    }
  }

  const userDisplayName = user?.email
    ? user.email.split('@')[0]
    : 'Account';

  return (
    <div className="min-h-screen flex flex-col bg-paper text-charcoal">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-xl border-b border-linen-dark/40 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 h-16 md:h-20 flex items-center justify-between gap-4">
          
          {/* Brand Logo & Brand Tag */}
          <div className="flex items-center gap-4 min-w-max">
            <button
              onClick={() => go('home')}
              className="group shrink-0 flex items-center gap-3 rounded-xl py-1 px-1 -ml-1 transition-transform active:scale-98"
              aria-label="EchoSelf home"
            >
              <span className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-terracotta to-terracotta-dark text-paper shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all duration-200">
                <Feather className="w-5 h-5" aria-hidden />
              </span>
              <span className="font-serif text-2xl font-bold tracking-tight text-charcoal group-hover:text-terracotta transition-colors">
                EchoSelf
              </span>
            </button>

            {isLandingPage && (
              <span className="hidden lg:inline-block pl-4 border-l border-linen-dark/80 text-xs text-slateink font-medium">
                Your experiences, understood in context.
              </span>
            )}
          </div>

          {/* Navigation Items */}
          {isLandingPage ? (
            /* Public Landing Page Minimal Navigation */
            <nav className="flex items-center justify-end gap-3 sm:gap-6 min-w-max">
              <button
                onClick={scrollToHowItWorks}
                className="text-xs sm:text-sm font-medium text-slateink hover:text-charcoal transition-colors px-2 py-1"
              >
                How it works
              </button>

              <button
                onClick={() => go('memories')}
                className="text-xs sm:text-sm font-semibold text-terracotta-deep hover:text-terracotta-dark transition-colors px-2 py-1 inline-flex items-center gap-1"
              >
                <span>Explore</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {signedIn ? (
                <div className="relative" data-account-menu>
                  <button
                    onClick={() => setAccountOpen((o) => !o)}
                    aria-expanded={accountOpen}
                    aria-label="Profile menu"
                    className="inline-flex items-center gap-2 h-9 md:h-10 pl-2 pr-2.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal transition-all shadow-xs"
                  >
                    <span className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shadow-xs">
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
                      className="absolute right-0 top-12 w-56 rounded-2xl border border-linen-dark/80 bg-white shadow-lifted p-2 z-50 animate-[fadeIn_120ms_ease-out]"
                      role="menu"
                    >
                      <div className="px-3 py-2 border-b border-linen-dark/40 mb-1">
                        <p className="text-xs font-semibold text-charcoal truncate">
                          {user!.email}
                        </p>
                        <p className="text-[10px] text-slateink-light mt-0.5">
                          Personal Workspace
                        </p>
                      </div>

                      <button
                        role="menuitem"
                        onClick={() => go('profile')}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2.5 transition-colors"
                      >
                        <User className="w-4 h-4 text-terracotta" aria-hidden />
                        <span>My Profile</span>
                      </button>

                      <div className="my-1 border-t border-linen-dark/40" />

                      <button
                        role="menuitem"
                        onClick={handleSignOut}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 flex items-center gap-2.5 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-clayred-DEFAULT" aria-hidden />
                        <span>Logout</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => go('signin')}
                  className="inline-flex items-center gap-1.5 h-9 md:h-10 px-4 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal text-xs font-semibold transition-all shadow-xs"
                >
                  <UserCircle2 className="w-4 h-4 text-slateink-light" />
                  <span>Sign in</span>
                </button>
              )}
            </nav>
          ) : (
            /* In-App Workspace Navigation */
            <>
              {/* Centered Navigation Links */}
              <nav
                className="hidden md:flex flex-1 items-center justify-center gap-1 lg:gap-2.5"
                aria-label="Main Navigation"
              >
                {CENTERED_NAV.map((item) => {
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
                      className={`group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-linen/80 text-charcoal font-semibold shadow-xs'
                          : 'text-slateink-dark hover:text-charcoal hover:bg-linen/40'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-terracotta-deep' : 'text-slateink group-hover:text-charcoal'
                        }`}
                        aria-hidden
                      />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>

              {/* Right-most Actions: Twin Chat & User Profile */}
              <div className="flex items-center justify-end gap-3 min-w-max">
                <a
                  href={hrefFor('chat')}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go('chat');
                  }}
                  aria-current={page === 'chat' ? 'page' : undefined}
                  className={`hidden sm:inline-flex items-center gap-2 h-10 px-4 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 whitespace-nowrap shadow-xs ${
                    page === 'chat'
                      ? 'bg-terracotta text-paper ring-2 ring-terracotta/30 shadow-md'
                      : 'bg-charcoal text-paper hover:bg-charcoal/85 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amberclay-light" aria-hidden />
                  <span>Twin Chat</span>
                </a>

                {signedIn ? (
                  <div className="relative" data-account-menu>
                    <button
                      onClick={() => setAccountOpen((o) => !o)}
                      aria-expanded={accountOpen}
                      aria-label="Profile menu"
                      className="inline-flex items-center gap-2 h-10 pl-2 pr-2.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal transition-all shadow-xs"
                    >
                      <span className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark text-paper font-semibold text-xs uppercase shadow-xs">
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
                        className="absolute right-0 top-12 w-56 rounded-2xl border border-linen-dark/80 bg-white shadow-lifted p-2 z-50 animate-[fadeIn_120ms_ease-out]"
                        role="menu"
                      >
                        <div className="px-3 py-2 border-b border-linen-dark/40 mb-1">
                          <p className="text-xs font-semibold text-charcoal truncate">
                            {user!.email}
                          </p>
                          <p className="text-[10px] text-slateink-light mt-0.5">
                            Personal Workspace
                          </p>
                        </div>

                        <button
                          role="menuitem"
                          onClick={() => go('profile')}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors ${
                            page === 'profile'
                              ? 'bg-terracotta/10 text-terracotta-deep font-semibold'
                              : 'text-charcoal hover:bg-linen/60'
                          }`}
                        >
                          <User className="w-4 h-4 text-terracotta" aria-hidden />
                          <span>My Profile</span>
                        </button>

                        <div className="my-1 border-t border-linen-dark/40" />

                        <button
                          role="menuitem"
                          onClick={handleSignOut}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 flex items-center gap-2.5 transition-colors"
                        >
                          <LogOut className="w-4 h-4 text-clayred-DEFAULT" aria-hidden />
                          <span>Logout</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => go('signin')}
                    aria-label="Sign in"
                    className="inline-flex items-center gap-1.5 h-10 px-4.5 rounded-full border border-linen-dark/80 bg-white/80 hover:bg-white text-charcoal text-xs font-semibold transition-all shadow-xs active:scale-95 whitespace-nowrap"
                  >
                    <UserCircle2 className="w-4 h-4 text-slateink-light" />
                    <span>Sign in</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        id="main-content"
        className={`flex-1 w-full ${isLandingPage ? 'max-w-6xl' : 'max-w-6xl'} mx-auto shell-pad ${
          isLandingPage ? 'py-8 md:py-16 pb-16' : 'py-8 md:py-12 pb-32 md:pb-16'
        }`}
      >
        {children}
      </main>

      {/* Desktop Footer (Hidden on landing page which has its own bespoke closing section & footer) */}
      {!isLandingPage && (
        <footer className="hidden md:block border-t border-linen-dark/50 mt-auto">
          <div className="max-w-6xl mx-auto shell-pad py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-slateink leading-relaxed">
              EchoSelf: a personal knowledge and decision-support tool. Claims about you trace
              back to recorded evidence.
            </p>
            <p className="text-xs text-slateink-light whitespace-nowrap">
              {signedIn ? 'Your private workspace' : 'A quiet space for self-examination.'}
            </p>
          </div>
        </footer>
      )}

      {/* Mobile Navigation Dock - ONLY rendered inside the application, NOT on public landing page */}
      {!isLandingPage && <MobileBottomBar route={route} />}

      {/* Floating Sample Data Notice for Visitors (Only inside in-app views) */}
      {!isLandingPage && !signedIn && !loading && <SampleDataToast />}

      {/* Desktop Floating Twin Chat Button (Only inside in-app views, not on chat page) */}
      {!isLandingPage && route.kind === 'app' && route.page !== 'chat' && (
        <button
          onClick={() => go('chat')}
          aria-label="Open Twin Chat"
          className="hidden lg:inline-flex fixed z-40 items-center justify-center h-14 w-14 rounded-full bg-charcoal text-paper shadow-lifted hover:bg-charcoal/90 hover:scale-105 active:scale-95 transition-all bottom-8 right-8"
        >
          <MessageCircle className="w-6 h-6 text-paper" aria-hidden />
        </button>
      )}
    </div>
  );
}
