import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X, Feather, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { NAV_PAGES, PROTECTED_PAGES, hrefFor, navigateTo, type PageId, type Route } from '@/lib/router';

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
    `px-3 py-2 rounded-full text-sm transition-colors duration-150 ${
      active
        ? 'bg-charcoal text-paper font-medium'
        : 'text-slateink-dark hover:text-charcoal hover:bg-linen/70'
    }`;

  const navMobileClass = (active: boolean) =>
    `block px-3 py-2.5 rounded-lg text-sm ${
      active ? 'bg-charcoal text-paper font-medium' : 'text-slateink-dark hover:bg-linen'
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
        <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => go('home')}
            className="flex items-center gap-2.5 rounded-lg"
            aria-label="EchoSelf home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta text-paper">
              <Feather className="w-4 h-4" aria-hidden />
            </span>
            <span className="font-serif text-xl font-medium tracking-tight text-charcoal">
              EchoSelf
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
            {NAV_PAGES.map((item) => (
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
                {labelFor(item)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative" data-account-menu>
              <button
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-label={signedIn ? 'Account menu' : 'Sign in or create an account'}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-charcoal hover:bg-linen text-sm"
              >
                <UserCircle2 className="w-5 h-5" aria-hidden />
                <span className="hidden md:inline max-w-32 truncate">
                  {signedIn ? user!.email : 'Sign in'}
                </span>
              </button>

              {accountOpen && (
                <div
                  className="absolute right-0 top-12 w-64 rounded-xl border border-linen-dark bg-white shadow-card py-2 z-50"
                  role="menu"
                >
                  {signedIn ? (
                    <>
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
                    </>
                  ) : (
                    <div className="px-4 py-2.5 text-xs text-slateink leading-relaxed">
                      {loading ? (
                        'Checking your session…'
                      ) : (
                        <>
                          You are browsing the shared sample.{' '}
                          <a href="/signin" onClick={(e) => { e.preventDefault(); go('signin'); }} className="font-medium text-terracotta-deep hover:underline">
                            Sign in
                          </a>{' '}
                          for a private workspace.
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              className="lg:hidden inline-flex items-center justify-center h-11 w-11 rounded-full text-charcoal hover:bg-linen"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            className="lg:hidden border-t border-linen-dark/60 bg-paper px-5 py-3 flex flex-col"
            aria-label="Mobile"
          >
            {NAV_PAGES.map((item) => (
              <a
                key={item}
                href={hrefFor(item)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  go(item);
                }}
                aria-current={page === item ? 'page' : undefined}
                className={navMobileClass(page === item)}
              >
                {labelFor(item)}
              </a>
            ))}
            {signedIn && (
              <button onClick={handleSignOut} className="text-left px-3 py-2.5 rounded-lg text-sm text-clayred-DEFAULT">
                Sign out
              </button>
            )}
          </nav>
        )}
      </header>

      <main id="main-content" className="flex-1 w-full max-w-6xl mx-auto px-5 md:px-8 py-8 md:py-12">
        {children}
      </main>

      <footer className="border-t border-linen-dark/60 mt-8">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-slateink">
            EchoSelf — a personal knowledge and decision-support tool. Claims about you trace
            back to recorded evidence.
          </p>
          <p className="text-xs text-slateink-light">
            {signedIn ? 'Your private workspace' : 'Demo persona · Sample data (read-only)'}
          </p>
        </div>
      </footer>
    </div>
  );
}

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
