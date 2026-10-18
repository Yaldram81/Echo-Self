import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Feather,
  LogOut,
  UserCircle2,
  MessageCircle,
  Home,
  BookOpen,
  Scale,
  Compass,
  History,
  GitBranch,
  Settings,
  ChevronDown,
  Sparkles,
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

const PRIMARY_NAV: NavItem[] = [
  { id: 'home', label: 'Overview', icon: Home },
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

  const go = (p: PageId) => {
    navigateTo(p);
    setAccountOpen(false);
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
    <div className="min-h-screen flex flex-col bg-paper">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>

      {/* Main Top Header */}
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md border-b border-linen-dark/50 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <button
            onClick={() => go('home')}
            className="group shrink-0 flex items-center gap-2.5 rounded-xl py-1 px-1.5 -ml-1.5 hover:bg-linen/40 transition-colors"
            aria-label="EchoSelf home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta text-paper shadow-xs group-hover:scale-105 group-hover:bg-terracotta-dark transition-all">
              <Feather className="w-4 h-4" aria-hidden />
            </span>
            <div className="flex flex-col items-start leading-none">
              <span className="font-serif text-xl font-semibold tracking-tight text-charcoal">
                EchoSelf
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav
            className="hidden md:flex items-center gap-1 bg-linen/35 p-1 rounded-full border border-linen-dark/40 shadow-xs"
            aria-label="Main"
          >
            {PRIMARY_NAV.map((item) => {
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
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs lg:text-[13px] font-medium leading-none transition-all duration-150 ${
                    isActive
                      ? 'bg-white text-charcoal font-semibold shadow-xs ring-1 ring-charcoal/5'
                      : 'text-slateink hover:text-charcoal hover:bg-white/50'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      isActive ? 'text-terracotta-deep' : 'text-slateink-light group-hover:text-charcoal'
                    }`}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Twin Chat Quick Access (Desktop) */}
            <a
              href={hrefFor('chat')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go('chat');
              }}
              aria-current={page === 'chat' ? 'page' : undefined}
              className={`hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold tracking-tight transition-all duration-150 shadow-xs ${
                page === 'chat'
                  ? 'bg-terracotta text-paper ring-2 ring-terracotta/20'
                  : 'bg-charcoal text-paper hover:bg-charcoal/85 active:scale-95'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amberclay-light" aria-hidden />
              <span>Twin Chat</span>
            </a>

            {/* Account / Auth */}
            {signedIn ? (
              <div className="relative" data-account-menu>
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-expanded={accountOpen}
                  aria-label="Account menu"
                  className="inline-flex items-center gap-1.5 h-8.5 px-2.5 rounded-full border border-linen-dark/70 bg-white/70 hover:bg-white text-charcoal text-xs font-medium transition-all shadow-xs"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terracotta/15 text-terracotta-deep font-semibold text-[11px] uppercase">
                    {userDisplayName.charAt(0)}
                  </span>
                  <span className="hidden sm:inline max-w-28 truncate font-medium">
                    {userDisplayName}
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
                    className="absolute right-0 top-11 w-64 rounded-2xl border border-linen-dark/80 bg-white shadow-lifted p-1.5 z-50 animate-[fadeIn_120ms_ease-out]"
                    role="menu"
                  >
                    <div className="px-3 py-2.5 border-b border-linen-dark/40 mb-1">
                      <p className="text-xs font-semibold text-charcoal truncate">
                        {user!.email}
                      </p>
                      <p className="text-[11px] text-slateink-light mt-0.5">
                        Private workspace
                      </p>
                    </div>

                    <a
                      href={hrefFor('settings')}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go('settings');
                      }}
                      role="menuitem"
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-linen/60 flex items-center gap-2 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-slateink-light" aria-hidden />
                      <span>Settings & Privacy</span>
                    </a>

                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light/30 flex items-center gap-2 transition-colors mt-0.5"
                    >
                      <LogOut className="w-3.5 h-3.5 text-clayred-DEFAULT" aria-hidden />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => go('signin')}
                aria-label="Sign in"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-terracotta text-paper text-xs font-medium hover:bg-terracotta-dark active:scale-95 transition-all shadow-xs"
              >
                <UserCircle2 className="w-3.5 h-3.5" aria-hidden />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 w-full max-w-6xl mx-auto shell-pad py-6 md:py-10 pb-24 md:pb-12">
        {children}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:block border-t border-linen-dark/50 mt-auto">
        <div className="max-w-6xl mx-auto shell-pad py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-slateink">
            EchoSelf: a personal knowledge and decision-support tool. Claims about you trace
            back to recorded evidence.
          </p>
          <p className="text-xs text-slateink-light">
            {signedIn ? 'Your private workspace' : 'A quiet space for self-examination.'}
          </p>
        </div>
      </footer>

      {/* Modern Mobile Bottom Navigation (Shown only on small screens) */}
      <MobileBottomBar route={route} />

      {/* Floating Sample Data Toast */}
      {!signedIn && !loading && <SampleDataToast />}

      {/* Desktop Floating Twin Chat Button (Hidden on Mobile because Twin is in the bottom bar) */}
      {route.kind === 'app' && route.page !== 'chat' && (
        <button
          onClick={() => go('chat')}
          aria-label="Open Twin Chat"
          className="hidden lg:inline-flex fixed z-40 items-center justify-center h-13 w-13 rounded-full bg-charcoal text-paper shadow-lifted hover:bg-charcoal/90 hover:scale-105 active:scale-95 transition-all bottom-6 right-6"
        >
          <MessageCircle className="w-5 h-5 text-paper" aria-hidden />
        </button>
      )}
    </div>
  );
}
