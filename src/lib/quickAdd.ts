/**
 * Tiny intent bus so the mobile bottom bar can ask whatever page is on screen
 * to open its "add" form, without each page exposing custom props upward.
 * The bar dispatches an intent; the matching page listens and opens its form.
 */

export type QuickAddKind = 'memory' | 'belief' | 'decision' | 'capture';

export const QUICK_ADD_PAGE: Record<QuickAddKind, import('@/lib/router').PageId> = {
  memory: 'memories',
  belief: 'beliefs',
  decision: 'decisions',
  capture: 'inbox',
};

const CHANNEL = 'echoself:quick-add';

/** Fire an add intent. If the listener page is already mounted it opens its form;
 * otherwise the caller should navigate to the page first, then fire. */
export function requestQuickAdd(kind: QuickAddKind) {
  window.dispatchEvent(new CustomEvent<QuickAddKind>(CHANNEL, { detail: kind }));
}

/** Subscribe to add intents. Returns an unsubscribe function. */
export function onQuickAddRequest(handler: (kind: QuickAddKind) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<QuickAddKind>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(CHANNEL, listener);
  return () => window.removeEventListener(CHANNEL, listener);
}
