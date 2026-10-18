import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  BookOpen,
  Compass,
  Scale,
  Home,
  MoreHorizontal,
  MessageCircle,
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
// (Timeline, Graph, Settings) live behind the "More" tab, which opens the
// same drawer the header hamburger uses.
const NAV_TABS: NavTab[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'memories', label: 'Memories', icon: BookOpen },
  { page: 'decisions', label: 'Decisions', icon: Scale },
  { page: 'chat', label: 'Twin', icon: MessageCircle },
];

export function MobileBottomBar({
  route,
  onOpenMore,
}: {
  route: Route;
  onOpenMore: () => void;
}) {
  const { loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [burstKind, setBurstKind] = useState<QuickAddKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Don't show the bar on auth or not-found screens, or while session is unknown.
  const showBar = !loading && route.kind === 'app';
  const currentPage: PageId | null = route.kind === 'app' ? route.page : null;

  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

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
    setOpen(false);
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
    setOpen(false);
    if (currentPage === p && route.kind === 'app' && route.detailId === null) return;
    navigateTo(p);
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close quick add"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-charcoal/30 backdrop-blur-[1px]"
        />
      )}
      <div
        ref={rootRef}
        className="lg:hidden fixed inset-x-0 bottom-0 z-50"
        aria-label="Quick actions"
      >
        {/* Fan menu: sits above the bar. */}
        {open && (
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

        {/* The bar itself: nav tabs with a raised center add button. */}
        <nav
          aria-label="Mobile navigation"
          className="relative bg-paper/95 backdrop-blur border-t border-linen-dark/70 shadow-[0_-2px_12px_rgba(32,35,33,0.06)] pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1"
        >
          <div className="grid grid-cols-5 items-end gap-0.5 px-1">
            {NAV_TABS.slice(0, 2).map((tab) => (
              <TabButton
                key={tab.page}
                tab={tab}
                active={currentPage === tab.page}
                onClick={() => goPage(tab.page)}
              />
            ))}

            {/* Center add button, raised above the bar. */}
            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={open ? 'Close add menu' : 'Add something'}
                className={`flex h-14 w-14 -mt-7 items-center justify-center rounded-full bg-terracotta text-paper shadow-lifted ring-4 ring-paper transition-transform duration-200 ${
                  open ? 'rotate-45 scale-95' : 'hover:bg-terracotta-dark'
                }`}
              >
                {open ? <X className="w-6 h-6" aria-hidden /> : <Plus className="w-6 h-6" aria-hidden />}
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

            <TabButton
              tab={{ page: 'settings', label: 'More', icon: MoreHorizontal }}
              active={
                currentPage === 'timeline' ||
                currentPage === 'graph' ||
                currentPage === 'settings' ||
                currentPage === 'beliefs'
              }
              onClick={() => {
                setOpen(false);
                onOpenMore();
              }}
            />
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
