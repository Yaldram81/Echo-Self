import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import {
  routeFromPath,
  observeRoutes,
  navigateTo,
  metaFor,
  type PageId,
  type Route,
} from '@/lib/router';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/HomePage';
import { AuthPage } from '@/pages/AuthPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Private workspace pages load on demand: a first-time visitor downloads only
// what the landing page needs, and each signed-in page is a small cached chunk.
const MemoriesPage = lazy(() => import('@/pages/MemoriesPage').then((m) => ({ default: m.MemoriesPage })));
const TwinChatPage = lazy(() => import('@/pages/TwinChatPage').then((m) => ({ default: m.TwinChatPage })));
const MemoryDetailPage = lazy(() => import('@/pages/MemoryDetailPage').then((m) => ({ default: m.MemoryDetailPage })));
const DecisionMirrorPage = lazy(() => import('@/pages/DecisionMirrorPage').then((m) => ({ default: m.DecisionMirrorPage })));
const DecisionDetailPage = lazy(() => import('@/pages/DecisionDetailPage').then((m) => ({ default: m.DecisionDetailPage })));
const BeliefsPage = lazy(() => import('@/pages/BeliefsPage').then((m) => ({ default: m.BeliefsPage })));
const TimelinePage = lazy(() => import('@/pages/TimelinePage').then((m) => ({ default: m.TimelinePage })));
const EvidenceGraphPage = lazy(() => import('@/pages/EvidenceGraphPage').then((m) => ({ default: m.EvidenceGraphPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-sm text-slateink-light" role="status">
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const PRODUCTION_ORIGIN = 'https://echoself.app';

function setDocMeta(route: Route) {
  const { title, description } = metaFor(route);
  document.title = title;

  let desc = document.querySelector('meta[name="description"]');
  if (!desc) {
    desc = document.createElement('meta');
    desc.setAttribute('name', 'description');
    document.head.appendChild(desc);
  }
  desc.setAttribute('content', description);

  // Private app pages stay out of search results; the landing and auth pages
  // are the only intentionally public, indexable surface.
  const indexable = route.kind === 'auth' || (route.kind === 'app' && route.page === 'home');
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    document.head.appendChild(robots);
  }
  robots.setAttribute('content', indexable ? 'index, follow' : 'noindex, follow');

  // Canonical: only the indexable routes declare one; others never claim a
  // canonical URL that points at indexable content.
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  if (indexable) {
    canonical.setAttribute('href', route.kind === 'auth' ? `${PRODUCTION_ORIGIN}/${route.mode}` : `${PRODUCTION_ORIGIN}/`);
  } else {
    canonical.removeAttribute('href');
  }
}

function Shell({ route }: { route: Route }) {
  if (route.kind === 'notFound') {
    return <NotFoundPage />;
  }
  if (route.kind === 'auth') {
    return <AuthPage key={route.mode} mode={route.mode} />;
  }
  return (
    <PageSuspense>
      {route.detailId && route.detailKind === 'decision' ? (
        <DecisionDetailPage decisionId={route.detailId} />
      ) : route.detailId && route.detailKind === 'memory' ? (
        <MemoryDetailPage memoryId={route.detailId} />
      ) : (
        <SwitchPage page={route.page} />
      )}
    </PageSuspense>
  );
}

function SwitchPage({ page }: { page: PageId }) {
  switch (page) {
    case 'memories': return <MemoriesPage />;
    case 'chat': return <TwinChatPage />;
    case 'decisions': return <DecisionMirrorPage />;
    case 'beliefs': return <BeliefsPage />;
    case 'timeline': return <TimelinePage />;
    case 'graph': return <EvidenceGraphPage />;
    case 'settings': return <SettingsPage />;
    case 'profile': return <ProfilePage />;
    default: return <HomePage />;
  }
}

function AppRoutes() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const { user, loading } = useAuth();

  useEffect(() => observeRoutes(setRoute), []);

  useEffect(() => {
    setDocMeta(route);
    if (route.kind === 'app') window.scrollTo({ top: 0 });
  }, [route]);
  // Signed-in users skip the sign-in page. Signed-out visitors may still browse
  // the pages above: RLS scopes every read to the public sample persona, and the
  // pages label that state with the demo banner.
  useEffect(() => {
    if (loading) return;
    if (route.kind === 'auth' && user) {
      navigateTo('home', { replace: true });
      return;
    }
    if (route.kind === 'auth' && !user && route.mode === 'signup') {
      // Keep /signup as-is; the AuthPage handles both modes.
      return;
    }
  }, [route, user, loading]);

  return (
    <AppShell route={route}>
      <Shell route={route} />
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
