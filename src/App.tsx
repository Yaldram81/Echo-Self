import { useEffect, useState } from 'react';
import { AppShell, type PageId, PROTECTED_PAGES } from '@/components/AppShell';
import { AuthProvider, useAuth } from '@/lib/auth';
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

const VALID_PAGES: PageId[] = ['home', 'memories', 'chat', 'decisions', 'beliefs', 'timeline', 'graph', 'settings'];

type Route =
  | { kind: 'auth' }
  | { kind: 'app'; page: PageId; detailId: string | null; detailKind: 'memory' | 'decision' | null };

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'signin' || hash === 'signup') return { kind: 'auth' };
  const memoryMatch = hash.match(/^memory\/([0-9a-fA-F-]{36})$/);
  if (memoryMatch) return { kind: 'app', page: 'memories', detailId: memoryMatch[1], detailKind: 'memory' };
  const decisionMatch = hash.match(/^decision\/([0-9a-fA-F-]{36})$/);
  if (decisionMatch) return { kind: 'app', page: 'decisions', detailId: decisionMatch[1], detailKind: 'decision' };
  const raw = hash as PageId;
  return {
    kind: 'app',
    page: VALID_PAGES.includes(raw) ? raw : 'home',
    detailId: null,
    detailKind: null,
  };
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<Route>(() => {
    const r = routeFromHash();
    // Signed-out visitors to a protected page land on the sign-in view,
    // remembering where they wanted to go.
    if (r.kind === 'app' && PROTECTED_PAGES.includes(r.page) && !loading && !user) {
      return { kind: 'auth' };
    }
    return r;
  });

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Once the initial session check resolves, send signed-in users on the
  // sign-in screen to the workspace they originally tried to reach.
  useEffect(() => {
    if (loading) return;
    if (user && route.kind === 'auth' && PROTECTED_PAGES.length > 0) {
      const wanted = window.location.hash.replace(/^#\/?/, '');
      const target = VALID_PAGES.includes(wanted as PageId) ? (wanted as PageId) : 'home';
      window.location.hash = `/${target}`;
      setRoute(routeFromHash());
    }
  }, [user, loading, route.kind]);

  if (route.kind === 'auth') {
    return <AuthPage />;
  }

  return children;
}

function Shell() {
  const [{ page, detailId, detailKind }, setRoute] = useState(() => {
    const r = routeFromHash();
    return r.kind === 'app' ? r : { kind: 'app' as const, page: 'home' as PageId, detailId: null, detailKind: null };
  });

  const { user, loading } = useAuth();

  useEffect(() => {
    const onHashChange = () => {
      const r = routeFromHash();
      setRoute(
        r.kind === 'app'
          ? r
          : { kind: 'app', page: 'home', detailId: null, detailKind: null }
      );
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (p: PageId) => {
    window.location.hash = `/${p}`;
    setRoute({ kind: 'app', page: p, detailId: null, detailKind: null });
    window.scrollTo({ top: 0 });
  };

  return (
    <AppShell page={page} onNavigate={navigate}>
      {detailId ? (
        detailKind === 'decision' ? (
          <DecisionDetailPage decisionId={detailId} />
        ) : (
          <MemoryDetailPage memoryId={detailId} />
        )
      ) : (
        <>
          {page === 'home' && <HomePage />}
          {page === 'memories' && <MemoriesPage />}
          {page === 'chat' && <TwinChatPage />}
          {page === 'decisions' && <DecisionMirrorPage />}
          {page === 'beliefs' && <BeliefsPage />}
          {page === 'timeline' && <TimelinePage />}
          {page === 'graph' && <EvidenceGraphPage />}
          {page === 'settings' && <SettingsPage />}
        </>
      )}
      {loading ? null : null}
      {user ? null : null}
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <Shell />
      </AuthGate>
    </AuthProvider>
  );
}

export default App;
