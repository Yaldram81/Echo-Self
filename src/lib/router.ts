/**
 * Path-based routing with the History API: every destination is a real URL
 * (/memories, /memory/<id>, /decision/<id>, ...) that survives refresh and can
 * be deep-linked. No router dependency — a small module the whole app shares.
 */

export type PageId =
  | 'home'
  | 'memories'
  | 'chat'
  | 'decisions'
  | 'beliefs'
  | 'timeline'
  | 'graph'
  | 'settings'
  | 'profile'
  | 'signin'
  | 'signup';

export const NAV_PAGES: PageId[] = ['home', 'memories', 'chat', 'decisions', 'beliefs', 'timeline', 'graph', 'settings', 'profile'];

/** Pages that show a user's own records; signed-out visitors are sent to sign-in. */
export const PROTECTED_PAGES: PageId[] = ['memories', 'decisions', 'beliefs', 'timeline', 'graph', 'settings', 'profile'];

export type Route =
  | { kind: 'auth'; mode: 'signin' | 'signup' }
  | { kind: 'notFound' }
  | {
      kind: 'app';
      page: PageId;
      detailKind: 'memory' | 'decision' | null;
      detailId: string | null;
      action?: 'new' | 'edit' | null;
    };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function routeFromPath(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/signin' || p === '/signup') return { kind: 'auth', mode: p === '/signin' ? 'signin' : 'signup' };

  if (p === '/decision/new' || p === '/decisions/new') {
    return { kind: 'app', page: 'decisions', detailKind: 'decision', detailId: null, action: 'new' };
  }
  const decisionEditMatch = p.match(/^\/decision\/([^/]+)\/edit$/) || p.match(/^\/decisions\/([^/]+)\/edit$/);
  if (decisionEditMatch) {
    return UUID_RE.test(decisionEditMatch[1])
      ? { kind: 'app', page: 'decisions', detailKind: 'decision', detailId: decisionEditMatch[1], action: 'edit' }
      : { kind: 'notFound' };
  }
  const decisionMatch = p.match(/^\/decision\/([^/]+)$/) || p.match(/^\/decisions\/([^/]+)$/);
  if (decisionMatch) {
    return UUID_RE.test(decisionMatch[1])
      ? { kind: 'app', page: 'decisions', detailKind: 'decision', detailId: decisionMatch[1], action: null }
      : { kind: 'notFound' };
  }

  const memoryMatch = p.match(/^\/memory\/([^/]+)$/);
  if (memoryMatch) {
    return UUID_RE.test(memoryMatch[1])
      ? { kind: 'app', page: 'memories', detailKind: 'memory', detailId: memoryMatch[1], action: null }
      : { kind: 'notFound' };
  }

  const raw = p.replace(/^\//, '') || 'home';
  if (NAV_PAGES.includes(raw as PageId)) {
    return { kind: 'app', page: raw as PageId, detailKind: null, detailId: null, action: null };
  }
  return { kind: 'notFound' };
}

export function hrefFor(
  target:
    | PageId
    | { page: 'memory' | 'decision'; id?: string; action?: 'new' | 'edit' }
): string {
  if (typeof target === 'string') return `/${target}`;
  if (target.action === 'new') return `/${target.page}/new`;
  if (target.action === 'edit' && target.id) return `/${target.page}/${target.id}/edit`;
  if (target.id) return `/${target.page}/${target.id}`;
  return `/${target.page}`;
}

/** Per-route document titles and descriptions (also used for og/twitter). */
export const ROUTE_META: Record<string, { title: string; description: string }> = {
  home: { title: 'EchoSelf: Meet the self you can examine', description: 'EchoSelf organizes your recorded memories, beliefs, values, and decisions into an evidence-grounded personal model.' },
  memories: { title: 'Memories: EchoSelf', description: 'Record, search, and inspect the moments your personal model is built from.' },
  chat: { title: 'Twin Chat: EchoSelf', description: 'Ask your digital twin questions; every claim traces to recorded evidence.' },
  decisions: { title: 'Decision Mirror: EchoSelf', description: 'Weight your values, compare options, and reflect on outcomes with transparent arithmetic.' },
  beliefs: { title: 'Beliefs & Values: EchoSelf', description: 'Track how your beliefs and values evolve, with AI suggestions clearly labeled.' },
  timeline: { title: 'Timeline: EchoSelf', description: 'Your recorded life in chronological order, cross-linked with beliefs and decisions.' },
  graph: { title: 'Evidence Graph: EchoSelf', description: 'See how memories, beliefs, and decisions connect; every line traced to a record.' },
  settings: { title: 'Settings & Privacy: EchoSelf', description: 'Export or delete your records; review what the app stores and what it never does.' },
  profile: { title: 'My Profile: EchoSelf', description: 'Your personal model identity, activity statistics, and workspace settings.' },
  signin: { title: 'Sign in: EchoSelf', description: 'Sign in to your private EchoSelf workspace.' },
  signup: { title: 'Create account: EchoSelf', description: 'Create a private EchoSelf workspace with just an email and password.' },
  notFound: { title: 'Page not found: EchoSelf', description: 'This address does not match any page in EchoSelf.' },
};

export function metaFor(route: Route) {
  if (route.kind === 'auth') return ROUTE_META[route.mode];
  if (route.kind === 'notFound') return ROUTE_META.notFound;
  if (route.detailKind === 'memory') return { title: 'Memory — EchoSelf', description: ROUTE_META.memories.description };
  if (route.detailKind === 'decision') {
    if (route.action === 'new') return { title: 'New Decision — EchoSelf', description: 'Open a new deliberation in EchoSelf' };
    if (route.action === 'edit') return { title: 'Edit Decision — EchoSelf', description: 'Refine decision parameters and options' };
    return { title: 'Decision — EchoSelf', description: ROUTE_META.decisions.description };
  }
  return ROUTE_META[route.page] ?? ROUTE_META.home;
}

export function navigateTo(
  target: PageId | { page: 'memory' | 'decision'; id?: string; action?: 'new' | 'edit' },
  { replace = false } = {}
) {
  const href = hrefFor(target);
  if (replace) history.replaceState({}, '', href);
  else history.pushState({}, '', href);
  // New in-app navigation should land at the top of the page, not wherever
  // the previous scroll position happened to be.
  window.scrollTo(0, 0);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function observeRoutes(onRoute: (r: Route) => void): () => void {
  const emit = () => onRoute(routeFromPath(window.location.pathname));
  window.addEventListener('popstate', emit);
  return () => window.removeEventListener('popstate', emit);
}
