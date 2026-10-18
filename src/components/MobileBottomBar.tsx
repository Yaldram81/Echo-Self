import { useEffect, useRef, useState } from 'react';
import { Plus, X, BookOpen, Compass, Scale, Brain } from 'lucide-react';
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

export function MobileBottomBar({ route }: { route: Route }) {
  const { loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [burstKind, setBurstKind] = useState<QuickAddKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Don't show the bar on auth or not-found screens, or while session is unknown.
  const showBar = !loading && (route.kind === 'app');

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

        {/* The bar itself. */}
        <nav
          aria-label="Mobile quick actions"
          className="relative bg-paper/95 backdrop-blur border-t border-linen-dark/70 shadow-[0_-2px_12px_rgba(32,35,33,0.06)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 px-6"
        >
          <div className="flex items-center justify-center">
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
          <div className="flex items-center justify-center pt-0.5 pb-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-slateink-light">
              <Brain className="w-3 h-3" aria-hidden />
              {open ? 'Choose what to add' : 'Quick add'}
            </span>
          </div>
        </nav>
      </div>
    </>
  );
}
