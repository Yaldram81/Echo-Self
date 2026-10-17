import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X, Feather } from 'lucide-react';

export type PageId =
  | 'home'
  | 'memories'
  | 'chat'
  | 'decisions'
  | 'beliefs'
  | 'timeline'
  | 'graph'
  | 'settings';

export const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: 'home', label: 'Overview' },
  { id: 'memories', label: 'Memories' },
  { id: 'chat', label: 'Twin Chat' },
  { id: 'decisions', label: 'Decision Mirror' },
  { id: 'beliefs', label: 'Beliefs & Values' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'graph', label: 'Evidence Graph' },
  { id: 'settings', label: 'Settings & Privacy' },
];

export function AppShell({
  page,
  onNavigate,
  children,
}: {
  page: PageId;
  onNavigate: (p: PageId) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useCallback(
    (p: PageId) => {
      onNavigate(p);
      setMenuOpen(false);
    },
    [onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
            onClick={() => navigate('home')}
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
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? 'page' : undefined}
                className={`px-3 py-2 rounded-full text-sm transition-colors duration-150 ${
                  page === item.id
                    ? 'bg-charcoal text-paper font-medium'
                    : 'text-slateink-dark hover:text-charcoal hover:bg-linen/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            className="lg:hidden inline-flex items-center justify-center h-10 w-10 rounded-full text-charcoal hover:bg-linen"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <nav
            className="lg:hidden border-t border-linen-dark/60 bg-paper px-5 py-3 flex flex-col"
            aria-label="Mobile"
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? 'page' : undefined}
                className={`text-left px-3 py-2.5 rounded-lg text-sm ${
                  page === item.id
                    ? 'bg-charcoal text-paper font-medium'
                    : 'text-slateink-dark hover:bg-linen'
                }`}
              >
                {item.label}
              </button>
            ))}
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
            Demo persona · Sample data
          </p>
        </div>
      </footer>
    </div>
  );
}
