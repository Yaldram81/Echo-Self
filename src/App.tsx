import { useEffect, useState } from 'react';
import { AppShell, type PageId } from '@/components/AppShell';
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

const VALID_PAGES: PageId[] = ['home', 'memories', 'chat', 'decisions', 'beliefs', 'timeline', 'graph', 'settings'];

function pageFromHash(): { page: PageId; detailId: string | null; detailKind: 'memory' | 'decision' | null } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const memoryMatch = hash.match(/^memory\/([0-9a-fA-F-]{36})$/);
  if (memoryMatch) return { page: 'memories', detailId: memoryMatch[1], detailKind: 'memory' };
  const decisionMatch = hash.match(/^decision\/([0-9a-fA-F-]{36})$/);
  if (decisionMatch) return { page: 'decisions', detailId: decisionMatch[1], detailKind: 'decision' };
  const raw = hash as PageId;
  return { page: VALID_PAGES.includes(raw) ? raw : 'home', detailId: null, detailKind: null };
}

function App() {
  const [{ page, detailId, detailKind }, setRoute] = useState(pageFromHash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(pageFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (p: PageId) => {
    window.location.hash = `/${p}`;
    setRoute({ page: p, detailId: null, detailKind: null });
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
    </AppShell>
  );
}

export default App;
