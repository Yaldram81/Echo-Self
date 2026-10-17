import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import {
  routeFromPath,
  observeRoutes,
  navigateTo,
  metaFor,
  type Route,
} from '@/lib/router';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/HomePage';
import { MemoriesPage } from '@/pages/MemoriesPage';
import { TwinChatPage } from '@/pages/TwinChatPage';
import { MemoryDetailPage } from '@/pages/MemoryDetailPage';
import { DecisionMirrorPage } from '@/pages/DecisionMirrorPage';
import { DecisionDetailPage } from '@/pages/DecisionDetailPage';
import { BeliefsPage } from '@/pages/BeliefsPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { EvidenceGraphPage } from '@/pages/EvidenceGraphPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AuthPage } from '@/pages/AuthPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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
  if (route.detailId && route.detailKind === 'decision') {
    return <DecisionDetailPage decisionId={route.detailId} />;
  }
  if (route.detailId && route.detailKind === 'memory') {
    return <MemoryDetailPage memoryId={route.detailId} />;
  }
  switch (route.page) {
    case 'memories': return <MemoriesPage />;
    case 'chat': return <TwinChatPage />;
    case 'decisions': return <DecisionMirrorPage />;
    case 'beliefs': return <BeliefsPage />;
    case 'timeline': return <TimelinePage />;
    case 'graph': return <EvidenceGraphPage />;
    case 'settings': return <SettingsPage />;
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
  // Auth redirect: signed-out visitors to personal pages go to sign-in (and
  // are sent back after signing in); signed-in users skip the sign-in page.
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
