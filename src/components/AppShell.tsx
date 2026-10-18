import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X, Feather, LogOut, UserCircle2, MessageCircle, Home, BookOpen, Scale, Compass, History, GitBranch, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { NAV_PAGES, PROTECTED_PAGES, hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';
import { MobileBottomBar } from '@/components/MobileBottomBar';
import { SampleDataToast } from '@/components/ui';

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  const page: PageId = route.kind === 'app' ? route.page : 'signin';

  const go = (p: PageId) => {
    navigateTo(p);
    setMenuOpen(false);
    setAccountOpen(false);
  };

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstDrawerLinkRef = useRef<HTMLAnchorElement>(null);

  // Route changes (including back/forward navigation) close the drawer so it
  // never traps the user behind stale content.
  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return;
    // Freeze background scrolling and land focus inside the drawer.
    document.body.style.overflow = 'hidden';
    firstDrawerLinkRef.current?.focus();
    const menuButton = menuButtonRef.current;
    return () => {
      document.body.style.overflow = '';
      menuButton?.focus();
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (accountOpen && target && !target.closest('[data-account-menu]')) setAccountOpen(false);
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
    setMenuOpen(false);
    await supabase.auth.signOut();
    // Personal pages need an account; land signed-out users somewhere valid.
    const current = window.location.pathname;
    const isPersonal = PROTECTED_PAGES.some((p) => current.startsWith(`/${p}`));
    if (isPersonal || current.startsWith('/memory') || current.startsWith('/decision')) {
      navigateTo('home');
    } else {
      navigateTo(current === '/' ? 'home' : (current.slice(1) as PageId), { replace: true });
    }
  }

  const navLinkClass = (active: boolean) =>
    `group shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium leading-none transition-colors duration-150 ${
      active
        ? 'bg-terracotta/10 text-terracotta-deep'
        : 'text-slateink-dark hover:text-charcoal hover:bg-linen/70'
    }`;

  const navMobileClass = (active: boolean) =>
    `block px-3 py-2.5 rounded-lg text-sm ${
      active
        ? 'bg-terracotta/10 text-terracotta-deep font-medium'
        : 'text-slateink-dark hover:bg-linen'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-linen-dark/60">
        <div className="max-w-6xl mx-auto shell-pad h-16 flex items-center justify-between gap-3">
          <button
            onClick={() => go('home')}
            className="shrink-0 flex items-center gap-2.5 rounded-lg"
            aria-label="EchoSelf home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta text-paper">
              <Feather className="w-4 h-4" aria-hidden />
            </span>
            <span className="font-serif text-xl font-medium tracking-tight text-charcoal">
              EchoSelf
            </span>
          </button>

          <nav
            className="hidden xl:flex flex-1 min-w-0 items-center justify-center gap-1.5"
            aria-label="Main"
          >
            {NAV_PAGES.map((item) => {
              const Icon = NAV_ICONS[item];
              return (
                <a
                  key={item}
                  href={hrefFor(item)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go(item);
                  }}
                  aria-current={page === item ? 'page' : undefined}
                  className={navLinkClass(page === item)}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      page === item ? '' : 'text-slateink-light group-hover:text-slateink-dark transition-colors'
                    }`}
                    aria-hidden
                  />
                  {labelFor(item)}
                </a>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {signedIn ? (
              <div className="relative" data-account-menu>
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-expanded={accountOpen}
                  aria-label="Account menu"
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-charcoal hover:bg-linen text-sm"
                >
                  <UserCircle2 className="w-5 h-5" aria-hidden />
                  <span className="hidden md:inline max-w-32 truncate">
                    {user!.email}
                  </span>
                </button>

                {accountOpen && (
                  <div
                    className="absolute right-0 top-12 w-64 rounded-xl border border-linen-dark bg-white shadow-card py-2 z-50"
                    role="menu"
                  >
                    <p className="px-4 py-2 text-xs text-slateink-light border-b border-linen-dark/60 truncate">
                      Signed in as {user!.email}
                    </p>
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-charcoal hover:bg-linen inline-flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" aria-hidden />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => go('signin')}
                aria-label="Sign in or create an account"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-terracotta text-paper text-sm font-medium hover:bg-terracotta-dark active:bg-terracotta-dark/90 transition-colors"
              >
                <UserCircle2 className="w-5 h-5" aria-hidden />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}

            <button
              ref={menuButtonRef}
              className="xl:hidden inline-flex items-center justify-center h-11 w-11 rounded-full text-charcoal hover:bg-linen"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <>
            {/* Scrim: tap outside or Escape to dismiss; click-through blocked. */}
            <div
              className="xl:hidden fixed inset-0 top-16 z-30 bg-charcoal/20"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <nav
              className="xl:hidden fixed top-16 inset-x-0 bottom-0 z-40 overflow-y-auto scroll-elegant bg-paper border-t border-linen-dark/60 shell-pad py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              aria-label="Mobile"
            >
              <ul className="flex flex-col gap-1">
                {NAV_PAGES.map((item, i) => (
                  <li key={item}>
                    <a
                      ref={i === 0 ? firstDrawerLinkRef : undefined}
                      href={hrefFor(item)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go(item);
                      }}
                      aria-current={page === item ? 'page' : undefined}
                      className={`${navMobileClass(page === item)} min-h-[44px] flex items-center`}
                    >
                      {labelFor(item)}
                    </a>
                  </li>
                ))}
              </ul>
              {signedIn && (
                <button
                  onClick={handleSignOut}
                  className="mt-4 w-full text-left px-3 min-h-[44px] flex items-center rounded-lg text-sm text-clayred-DEFAULT"
                >
                  Sign out
                </button>
              )}
            </nav>
          </>
        )}
      </header>

      <main id="main-content" className="flex-1 w-full max-w-6xl mx-auto shell-pad py-8 md:py-12 pb-28 lg:pb-12">
        {children}
      </main>

      <footer className="hidden lg:block border-t border-linen-dark/60 mt-8">
        <div className="max-w-6xl mx-auto shell-pad py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-slateink">
            EchoSelf: a personal knowledge and decision-support tool. Claims about you trace
            back to recorded evidence.
          </p>
          <p className="text-xs text-slateink-light">
            {signedIn ? 'Your private workspace' : 'A quiet space for self-examination.'}
          </p>
        </div>
      </footer>

      <MobileBottomBar route={route} />

      {/* Floating, auto-dismissing sample-data notice for signed-out
          visitors. Disappears on its own after 3 seconds. */}
      {!signedIn && !loading && <SampleDataToast />}

      {/* Floating Twin Chat shortcut — sits above the mobile bottom bar on
          small screens, bottom-right on desktop. Hidden on the chat page and
          on auth/not-found routes so it never competes with the active view. */}
      {route.kind === 'app' && route.page !== 'chat' && (
        <button
          onClick={() => go('chat')}
          aria-label="Open Twin Chat"
          className="fixed z-40 inline-flex items-center justify-center h-14 w-14 rounded-full bg-charcoal text-paper shadow-lifted hover:bg-charcoal/90 hover:scale-105 active:scale-95 transition-all bottom-[5.5rem] right-4 lg:bottom-6 lg:right-6"
        >
          <MessageCircle className="w-6 h-6" aria-hidden />
        </button>
      )}
    </div>
  );
}

const NAV_ICONS: Record<PageId, LucideIcon> = {
  home: Home,
  memories: BookOpen,
  chat: MessageCircle,
  decisions: Scale,
  beliefs: Compass,
  timeline: History,
  graph: GitBranch,
  settings: Settings,
};

function labelFor(p: PageId): string {
  const labels: Record<string, string> = {
    home: 'Overview',
    memories: 'Memories',
    chat: 'Twin Chat',
    decisions: 'Decision Mirror',
    beliefs: 'Beliefs & Values',
    timeline: 'Timeline',
    graph: 'Evidence Graph',
    settings: 'Settings & Privacy',
  };
  return labels[p] ?? p;
}
