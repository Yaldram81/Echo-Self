import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  BookOpen,
  Compass,
  Scale,
  Home,
  MoreVertical,
  MessageCircle,
  History,
  GitBranch,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { navigateTo, type PageId, type Route } from '@/lib/router';
import { requestQuickAdd, QUICK_ADD_PAGE, type QuickAddKind } from '@/lib/quickAdd';
import { useAuth } from '@/lib/useAuth';

type AddOption = {
  kind: QuickAddKind;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const OPTIONS: AddOption[] = [
  { kind: 'memory', label: 'Memory', hint: 'Record a moment', icon: BookOpen },
  { kind: 'belief', label: 'Belief / Value', hint: 'State something true of you', icon: Compass },
  { kind: 'decision', label: 'Decision', hint: 'Lay out a choice', icon: Scale },
];

type NavTab = {
  page: PageId;
  label: string;
  icon: LucideIcon;
};

// Four primary destinations sit alongside the center add button. The rest
// (Beliefs, Timeline, Graph, Settings) live behind the 3-dots tray.
const NAV_TABS: NavTab[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'memories', label: 'Memories', icon: BookOpen },
  { page: 'decisions', label: 'Decisions', icon: Scale },
  { page: 'chat', label: 'Twin', icon: MessageCircle },
];

const MORE_TABS: NavTab[] = [
  { page: 'beliefs', label: 'Beliefs & Values', icon: Compass },
  { page: 'timeline', label: 'Timeline', icon: History },
  { page: 'graph', label: 'Evidence Graph', icon: GitBranch },
  { page: 'settings', label: 'Settings', icon: Settings },
];

type Tray = 'add' | 'more' | null;

export function MobileBottomBar({ route }: { route: Route }) {
  const { loading } = useAuth();
  const [tray, setTray] = useState<Tray>(null);
  const [burstKind, setBurstKind] = useState<QuickAddKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const showBar = !loading && route.kind === 'app';
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;
  const moreActive =
    currentPage === 'beliefs' ||
    currentPage === 'timeline' ||
    currentPage === 'graph' ||
    currentPage === 'settings';

  useEffect(() => {
    setTray(null);
  }, [route]);

  useEffect(() => {
    if (!tray) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTray(null);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) setTray(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [tray]);

  // After we navigate to a target page, open its form once the page mounts.
  useEffect(() => {
    if (!burstKind) return;
    if (route.kind !== 'app') {
      setBurstKind(null);
      return;
    }
    const target = QUICK_ADD_PAGE[burstKind];
    if (route.page === target) {
      requestQuickAdd(burstKind);
      setBurstKind(null);
    }
  }, [route, burstKind]);

  if (!showBar) return null;

  const choose = (opt: AddOption) => {
    setTray(null);
    const current = route.kind === 'app' ? route.page : null;
    const target: PageId = QUICK_ADD_PAGE[opt.kind];
    if (current === target && route.kind === 'app' && route.detailId === null) {
      requestQuickAdd(opt.kind);
      return;
    }
    setBurstKind(opt.kind);
    navigateTo(target);
  };

  const goPage = (p: PageId) => {
    setTray(null);
    if (currentPage === p && route.kind === 'app' && route.detailId === null) return;
    navigateTo(p);
  };

  return (
    <>
      {tray && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setTray(null)}
          className="lg:hidden fixed inset-0 z-40 bg-charcoal/30 backdrop-blur-[1px]"
        />
      )}
      <div
        ref={rootRef}
        className="lg:hidden fixed inset-x-0 bottom-0 z-50"
        aria-label="Quick actions"
      >
        {/* Trays sit above the bar. */}
        {tray === 'add' && (
          <div className="absolute inset-x-0 bottom-full pb-2 px-4 flex justify-center pointer-events-none">
            <ul
              role="menu"
              aria-label="Add something"
              className="pointer-events-auto w-full max-w-xs grid gap-2 animate-[fadeIn_120ms_ease-out]"
            >
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <li key={opt.kind}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => choose(opt)}
                      className="w-full flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur border border-linen-dark shadow-lifted px-4 py-3 text-left hover:border-terracotta transition-colors"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
                        <Icon className="w-4.5 h-4.5" aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-charcoal">{opt.label}</span>
                        <span className="block text-[11px] text-slateink-light truncate">{opt.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tray === 'more' && (
          <div className="absolute inset-x-0 bottom-full pb-2 px-4 flex justify-center pointer-events-none">
            <div
              role="menu"
              aria-label="More navigation"
              className="pointer-events-auto w-full max-w-xs rounded-2xl bg-white/95 backdrop-blur border border-linen-dark shadow-lifted p-2 animate-[fadeIn_120ms_ease-out]"
            >
              <ul className="grid grid-cols-2 gap-1.5">
                {MORE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = currentPage === tab.page;
                  return (
                    <li key={tab.page}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => goPage(tab.page)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center transition-colors ${
                          active ? 'bg-terracotta/10 border border-terracotta' : 'border border-transparent hover:bg-linen/60'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                            active ? 'bg-terracotta/15 text-terracotta-deep' : 'bg-linen text-slateink-dark'
                          }`}
                        >
                          <Icon className="w-5 h-5" aria-hidden />
                        </span>
                        <span className={`block text-xs font-medium leading-tight ${active ? 'text-terracotta-deep' : 'text-charcoal'}`}>
                          {tab.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* The bar itself: classic 5-slot row with the plus centered; the
            3-dots sit in a narrow slot at the far right so they never shift
            the five main items. */}
        <nav
          aria-label="Mobile navigation"
          className="relative grid items-center gap-0 bg-paper/95 backdrop-blur border-t border-linen-dark/70 shadow-[0_-2px_12px_rgba(32,35,33,0.06)] h-16 pb-[max(0rem,env(safe-area-inset-bottom))]"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 20px' }}
        >
          {/* 5 evenly-distributed slots; the center slot hosts the
              absolutely-centered plus button so padding never offsets it.
              A narrow 20px column is reserved at the far right for the
              3-dots menu so it never overlaps Twin. */}
          <div className="grid grid-cols-5 items-center gap-0 min-w-0 h-full">
            {NAV_TABS.slice(0, 2).map((tab) => (
              <TabButton
                key={tab.page}
                tab={tab}
                active={currentPage === tab.page}
                onClick={() => goPage(tab.page)}
              />
            ))}

            {/* Center add button, absolutely centered within its slot. */}
            <div className="relative flex items-center justify-center h-full">
              <button
                type="button"
                onClick={() => setTray((t) => (t === 'add' ? null : 'add'))}
                aria-expanded={tray === 'add'}
                aria-haspopup="menu"
                aria-label={tray === 'add' ? 'Close add menu' : 'Add something'}
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-terracotta text-paper shadow-lifted ring-4 ring-paper transition-transform duration-200 ${
                  tray === 'add' ? 'rotate-45 scale-95' : 'hover:bg-terracotta-dark'
                }`}
              >
                {tray === 'add' ? <X className="w-6 h-6" aria-hidden /> : <Plus className="w-6 h-6" aria-hidden />}
              </button>
            </div>

            {NAV_TABS.slice(2).map((tab) => (
              <TabButton
                key={tab.page}
                tab={tab}
                active={currentPage === tab.page}
                onClick={() => goPage(tab.page)}
              />
            ))}
          </div>

          {/* Far-right 3-dots: narrow 20px reserved column so Twin is not
              overlapped. Visible icon stays small; clickable area extends
              invisibly above/below for usable touch targets. */}
          <div className="flex justify-center items-center h-full">
            <button
              type="button"
              onClick={() => setTray((t) => (t === 'more' ? null : 'more'))}
              aria-expanded={tray === 'more'}
              aria-haspopup="menu"
              aria-label={tray === 'more' ? 'Close more menu' : 'More navigation'}
              aria-current={moreActive ? 'page' : undefined}
              className={`grid place-items-center w-5 h-12 p-0 border-0 bg-transparent cursor-pointer transition-colors ${
                moreActive || tray === 'more' ? 'text-terracotta-deep' : 'text-slateink-light hover:text-charcoal'
              }`}
            >
              <MoreVertical className="w-[15px] h-5" aria-hidden />
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: NavTab;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px] rounded-lg transition-colors ${
        active ? 'text-terracotta-deep' : 'text-slateink-light hover:text-charcoal'
      }`}
    >
      <Icon className="w-5 h-5" aria-hidden />
      <span className="text-[10px] font-medium leading-none">{tab.label}</span>
    </button>
  );
}
