import { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Database,
  Lock,
  Download,
  Trash2,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  Sliders,
  RefreshCw,
  Eye,
  Server,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { dataManagementService, profilesService } from '@/lib/services';
import type { PrivacyRecordCounts, DataExportBundle, UserProfile } from '@/lib/types';
import { SectionHeading } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { navigateTo } from '@/lib/router';

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PrivacyDataCenterPage() {
  const { user, loading: authLoading } = useAuth();

  // Counts & stats
  const [counts, setCounts] = useState<PrivacyRecordCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Privacy preferences
  const [aiPersonalization, setAiPersonalization] = useState(true);
  const [semanticRetrieval, setSemanticRetrieval] = useState(true);
  const [retentionPeriod, setRetentionPeriod] = useState<'indefinite' | '1_year' | '2_years'>('indefinite');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsNotice, setPrefsNotice] = useState<string | null>(null);

  // Destructive actions state
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(false);
  const [accountDeleteInput, setAccountDeleteInput] = useState('');
  const [destructiveInProgress, setDestructiveInProgress] = useState(false);
  const [destructiveError, setDestructiveError] = useState<string | null>(null);
  const [destructiveNotice, setDestructiveNotice] = useState<string | null>(null);

  // Load live counts and preferences
  useEffect(() => {
    if (!user) return;

    let mounted = true;
    const fetchCountsAndPrefs = async () => {
      setLoadingCounts(true);
      try {
        const [c, profile] = await Promise.all([
          dataManagementService.getRecordCounts(),
          profilesService.get(user.id),
        ]);
        if (!mounted) return;

        setCounts(c);

        const localPrefs = profilesService.getPrivacyPreferences();
        setAiPersonalization(profile?.ai_personalization_enabled ?? localPrefs.ai_personalization_enabled);
        setSemanticRetrieval(profile?.semantic_retrieval_enabled ?? localPrefs.semantic_retrieval_enabled);
        setRetentionPeriod(profile?.data_retention_period ?? localPrefs.data_retention_period);
      } catch (err) {
        console.error('Failed to load privacy data:', err);
      } finally {
        if (mounted) setLoadingCounts(false);
      }
    };

    fetchCountsAndPrefs();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Update privacy preference toggles
  async function handleTogglePersonalization(enabled: boolean) {
    if (!user) return;
    setAiPersonalization(enabled);
    setSavingPrefs(true);
    setPrefsNotice(null);
    try {
      await profilesService.updatePrivacyPreferences(user.id, {
        ai_personalization_enabled: enabled,
      });
      setPrefsNotice(enabled ? 'AI personalization enabled.' : 'AI personalization disabled: prompt context will be anonymous.');
      setTimeout(() => setPrefsNotice(null), 3500);
    } catch {
      setPrefsNotice('Could not save preference to server (retained in browser).');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleToggleSemanticRetrieval(enabled: boolean) {
    if (!user) return;
    setSemanticRetrieval(enabled);
    setSavingPrefs(true);
    setPrefsNotice(null);
    try {
      await profilesService.updatePrivacyPreferences(user.id, {
        semantic_retrieval_enabled: enabled,
      });
      setPrefsNotice(enabled ? 'Semantic vector retrieval active.' : 'Semantic vector retrieval disabled: using keyword ranking only.');
      setTimeout(() => setPrefsNotice(null), 3500);
    } catch {
      setPrefsNotice('Could not save preference to server (retained in browser).');
    } finally {
      setSavingPrefs(false);
    }
  }

  // Handle comprehensive JSON export
  async function handleExportJson() {
    setExportingFormat('json');
    setExportError(null);
    setExportNotice(null);

    try {
      const bundle = await dataManagementService.exportAll();
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `echoself-data-export-${dateStamp}.json`;
      const totalExported = (Object.values(bundle.counts) as number[]).reduce((a, b) => a + b, 0);
      setExportNotice(`Export ready: saved ${filename} with ${totalExported} records.`);
    } catch (err: any) {
      setExportError(err?.message || 'Export failed. Please check network connectivity.');
    } finally {
      setExportingFormat(null);
    }
  }

  // Handle Tabular CSV exports
  async function handleExportCsv() {
    setExportingFormat('csv');
    setExportError(null);
    setExportNotice(null);

    try {
      const bundle = await dataManagementService.exportAll();
      const dateStamp = new Date().toISOString().slice(0, 10);
      let exportedTables = 0;

      const tabularTables = ['memories', 'captures', 'decisions', 'beliefs', 'reflections'];
      for (const table of tabularTables) {
        const rows = (bundle.data[table] || []) as Record<string, unknown>[];
        if (rows.length > 0) {
          const csvContent = dataManagementService.toCsv(rows);
          downloadFile(`echoself-${table}-${dateStamp}.csv`, csvContent, 'text/csv');
          exportedTables++;
        }
      }

      if (exportedTables === 0) {
        setExportNotice('No tabular records found to export as CSV.');
      } else {
        setExportNotice(`Exported ${exportedTables} CSV collection${exportedTables > 1 ? 's' : ''}.`);
      }
    } catch (err: any) {
      setExportError(err?.message || 'CSV export failed.');
    } finally {
      setExportingFormat(null);
    }
  }

  // Handle Complete Workspace Purge
  async function handlePurgeAllData() {
    setDestructiveInProgress(true);
    setDestructiveError(null);
    try {
      await dataManagementService.purgeAllUserData();
      setConfirmPurge(false);
      setDestructiveNotice('All personal records have been permanently purged from the database.');
      // Refresh counts
      const updatedCounts = await dataManagementService.getRecordCounts();
      setCounts(updatedCounts);
    } catch (err: any) {
      setDestructiveError(err?.message || 'Could not purge data.');
      setConfirmPurge(false);
    } finally {
      setDestructiveInProgress(false);
    }
  }

  // Handle Full Account Deletion
  async function handleConfirmAccountDelete() {
    if (accountDeleteInput.trim().toLowerCase() !== 'delete') {
      setDestructiveError('Please type "DELETE" exactly to confirm account deletion.');
      return;
    }

    setDestructiveInProgress(true);
    setDestructiveError(null);
    try {
      await dataManagementService.deleteUserAccount();
      setConfirmAccountDelete(false);
      navigateTo('home', { replace: true });
    } catch (err: any) {
      setDestructiveError(err?.message || 'Account deletion failed. Please try again.');
      setConfirmAccountDelete(false);
    } finally {
      setDestructiveInProgress(false);
    }
  }

  if (authLoading) {
    return (
      <div className="py-24 text-center text-sm text-slateink" role="status">
        Loading Privacy & Data Center…
      </div>
    );
  }

  // Unauthenticated guard state
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
        <div className="card-surface p-8 rounded-3xl border border-linen-dark/80 bg-paper text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-sage-light text-sage-dark flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Privacy & Data</h1>
          <p className="text-sm text-slateink max-w-md mx-auto leading-relaxed">
            Understand your information and manage the records you have chosen to keep in EchoSelf.
          </p>
          <div className="p-4 rounded-2xl bg-linen text-left text-xs text-slateink space-y-2 border border-linen-dark/60 max-w-lg mx-auto">
            <p className="font-semibold text-charcoal">Demo Persona Active (Jordan)</p>
            <p>
              You are currently viewing EchoSelf as a public guest. Guest sessions display read-only sample records and do not persist private personal data.
            </p>
            <p>
              To inspect your own records, configure data controls, and export your personal model, please sign in.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => navigateTo('signin')}
              className="px-6 py-2.5 rounded-full bg-charcoal text-paper font-semibold text-sm hover:bg-charcoal/90 transition"
            >
              Sign In to Your Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-28 sm:pb-16 px-2 sm:px-0">
      {/* Header */}
      <div className="space-y-2">
        <SectionHeading eyebrow="Governance" title="Privacy & Data" as="h1" />
        <p className="max-w-2xl text-xs sm:text-sm text-slateink leading-relaxed">
          Understand your information and manage the records you have chosen to keep in EchoSelf.
        </p>
      </div>

      {/* Global Alerts / Notices */}
      {destructiveNotice && (
        <div className="p-4 rounded-2xl bg-sage-light/70 border border-sage/60 text-xs sm:text-sm text-sage-dark flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{destructiveNotice}</span>
        </div>
      )}
      {destructiveError && (
        <div className="p-4 rounded-2xl bg-clayred-light/80 border border-clayred-DEFAULT/40 text-xs sm:text-sm text-clayred-dark flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{destructiveError}</span>
        </div>
      )}

      {/* SECTION A: Your Data at a Glance */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-linen-dark/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sage-light text-sage-dark flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Your Data at a Glance</h2>
              <p className="text-xs text-slateink">Authentic count of records currently persisted under your authenticated account.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              setLoadingCounts(true);
              const c = await dataManagementService.getRecordCounts();
              setCounts(c);
              setLoadingCounts(false);
            }}
            disabled={loadingCounts}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-linen-dark bg-linen text-xs font-medium text-slateink hover:text-charcoal transition disabled:opacity-50"
            title="Refresh record counts"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCounts ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Memories</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.memories : '—'}</p>
            <p className="text-[10px] text-slateink">Permanent experiences</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Quick Captures</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.captures : '—'}</p>
            <p className="text-[10px] text-slateink">Inbox observations</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Beliefs & Values</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.beliefs : '—'}</p>
            <p className="text-[10px] text-slateink">Recorded principles</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Decisions</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.decisions : '—'}</p>
            <p className="text-[10px] text-slateink">Deliberations & reflections</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Saved Reviews</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.reflections : '—'}</p>
            <p className="text-[10px] text-slateink">Weekly reflections</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Corrections</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.interpretation_flags : '—'}</p>
            <p className="text-[10px] text-slateink">Interpretation flags</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Insights</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.insights : '—'}</p>
            <p className="text-[10px] text-slateink">Synthesized patterns</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 space-y-1">
            <p className="text-[11px] font-semibold text-slateink uppercase tracking-wider">Timeline Milestones</p>
            <p className="text-xl font-bold font-serif text-charcoal">{counts ? counts.timeline_events : '—'}</p>
            <p className="text-[10px] text-slateink">Audited chronological events</p>
          </div>
        </div>

        <p className="text-[11px] text-slateink italic pt-1">
          * Counts reflect only verified rows owned by your account (<code className="text-charcoal font-mono">user_id = {user.id.slice(0, 8)}…</code>). Public demo sample data and other accounts are strictly excluded.
        </p>
      </section>

      {/* SECTION B: How Your Information is Used */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 border-b border-linen-dark/60 pb-3">
          <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">How Your Information is Used</h2>
            <p className="text-xs text-slateink">An honest, verified explanation of internal storage versus external AI processing.</p>
          </div>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slateink leading-relaxed">
          <div className="p-4 rounded-2xl bg-linen/70 border border-linen-dark/60 space-y-2">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <Server className="w-4 h-4 text-sage-dark" />
              1. Local Database Storage (Supabase PostgreSQL)
            </h3>
            <p>
              Your memories, beliefs, decisions, captures, and weekly reviews are stored in a dedicated PostgreSQL database. Every table enforces Row Level Security (RLS) policies requiring an authenticated JWT matching your user ID.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-linen/70 border border-linen-dark/60 space-y-2">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terracotta" />
              2. Twin Context Retrieval & Deliberation
            </h3>
            <p>
              When you ask your Digital Twin a question or structure a decision, EchoSelf queries your authentic records for relevant context. Retrieved excerpts are attached to the prompt so the answer remains grounded in facts.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-linen/70 border border-linen-dark/60 space-y-2">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <Layers className="w-4 h-4 text-slateink" />
              3. Vector Embeddings (pgvector)
            </h3>
            <p>
              If vector search is configured, EchoSelf derives mathematical representations (768-dimensional numerical vectors) from memory text to support semantic similarity matching. Vectors contain no raw text and cascade delete when the parent memory is deleted.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-linen/70 border border-linen-dark/60 space-y-2">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-ochre-DEFAULT" />
              4. External Processing (Google Gemini API)
            </h3>
            <p>
              When AI assistance is triggered, prompt text and retrieved excerpts are transmitted over TLS to Google Gemini. Under Google’s developer API terms, data submitted via paid/standard API endpoints is not used to train foundation models. Your API keys are kept client-side or in secure environment variables.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-linen/70 border border-linen-dark/60 space-y-2">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sage-dark" />
              5. Zero Third-Party Advertising or Behavioral Telemetry
            </h3>
            <p>
              EchoSelf does not run tracking cookies, Meta Pixels, Google Analytics, or third-party behavioral trackers. Your data is never sold, brokered, or monetized.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION C: Data Access and Account Boundaries */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-linen-dark/60 pb-3">
          <div className="w-8 h-8 rounded-full bg-sage-light text-sage-dark flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Data Access & Boundaries</h2>
            <p className="text-xs text-slateink">Technical architecture protecting multi-user isolation.</p>
          </div>
        </div>

        <ul className="space-y-3 text-xs sm:text-sm text-slateink">
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-charcoal">Cryptographic Session Verification</p>
              <p className="text-xs text-slateink">Supabase Auth issues signed JSON Web Tokens (JWT) verified on every database request.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-charcoal">PostgreSQL Row Level Security (RLS)</p>
              <p className="text-xs text-slateink">Database-enforced authorization rules ensure accounts can only query and mutate their own rows (<code className="text-charcoal font-mono">auth.uid() = user_id</code>).</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-charcoal">Clean Persona Isolation</p>
              <p className="text-xs text-slateink">Public demo data is pinned to <code className="text-charcoal font-mono">user_id IS NULL</code> and separated from personal workspaces.</p>
            </div>
          </li>
        </ul>
      </section>

      {/* SECTION F: Real Processing and Personalization Controls */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-linen-dark/60 pb-3">
          <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Processing & Personalization Controls</h2>
            <p className="text-xs text-slateink">Adjust how external AI models interact with your profile and data.</p>
          </div>
        </div>

        {prefsNotice && (
          <div className="p-3 rounded-xl bg-sage-light/70 border border-sage/60 text-xs text-sage-dark flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{prefsNotice}</span>
          </div>
        )}

        <div className="space-y-4 pt-1">
          {/* AI Personalization Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-linen border border-linen-dark/60">
            <div className="space-y-1 pr-2">
              <p className="text-sm font-semibold text-charcoal">AI Personalization & Identity Framing</p>
              <p className="text-xs text-slateink leading-relaxed">
                When enabled, your preferred name, twin tone, and bio are attached to prompts for a personal tone. When disabled, queries are stripped of personal identity context.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={aiPersonalization}
                onChange={(e) => handleTogglePersonalization(e.target.checked)}
                disabled={savingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-linen-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-paper after:border-linen-dark after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sage-dark"></div>
            </label>
          </div>

          {/* Semantic Vector Retrieval Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-linen border border-linen-dark/60">
            <div className="space-y-1 pr-2">
              <p className="text-sm font-semibold text-charcoal">Semantic Vector Retrieval (pgvector)</p>
              <p className="text-xs text-slateink leading-relaxed">
                When enabled, mathematical embeddings assist keyword matching for deeper contextual search. When disabled, retrieval runs exclusively via exact keyword search.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={semanticRetrieval}
                onChange={(e) => handleToggleSemanticRetrieval(e.target.checked)}
                disabled={savingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-linen-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-paper after:border-linen-dark after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sage-dark"></div>
            </label>
          </div>

          {/* Data Retention Stance */}
          <div className="p-4 rounded-2xl bg-linen border border-linen-dark/60 space-y-1.5">
            <p className="text-sm font-semibold text-charcoal">Data Retention Policy</p>
            <p className="text-xs text-slateink leading-relaxed">
              EchoSelf retains your records indefinitely until you explicitly delete them. We do not apply unannounced auto-expirations or silent purges.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION D: Genuine Personal-Data Export */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-linen-dark/60 pb-3">
          <div className="w-8 h-8 rounded-full bg-sage-light text-sage-dark flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Export Your Personal Data</h2>
            <p className="text-xs text-slateink">Download every memory, decision, reflection, and belief in portable formats.</p>
          </div>
        </div>

        {exportNotice && (
          <div className="p-3.5 rounded-2xl bg-sage-light/70 border border-sage/60 text-xs text-sage-dark flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{exportNotice}</span>
          </div>
        )}
        {exportError && (
          <div className="p-3.5 rounded-2xl bg-clayred-light/80 border border-clayred-DEFAULT/40 text-xs text-clayred-dark flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{exportError}</span>
          </div>
        )}

        <p className="text-xs sm:text-sm text-slateink leading-relaxed">
          Your data is completely your own. You can export everything at any time without locks or restrictions.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            onClick={handleExportJson}
            disabled={exportingFormat !== null}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-charcoal text-paper font-semibold text-xs sm:text-sm hover:bg-charcoal/90 transition disabled:opacity-50 shadow-xs"
          >
            <FileJson className="w-4 h-4" />
            <span>{exportingFormat === 'json' ? 'Generating JSON…' : 'Export Full Archive (JSON)'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exportingFormat !== null}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-linen-dark bg-linen text-charcoal font-semibold text-xs sm:text-sm hover:bg-linen-dark/40 transition disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exportingFormat === 'csv' ? 'Generating CSVs…' : 'Export Tabular Files (CSV)'}</span>
          </button>
        </div>
      </section>

      {/* SECTION E: Meaningful Record Deletion */}
      <section className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-clayred-DEFAULT/30 bg-paper shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 border-b border-linen-dark/60 pb-3">
          <div className="w-8 h-8 rounded-full bg-clayred-light text-clayred-dark flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-clayred-dark">Irreversible Data Deletion</h2>
            <p className="text-xs text-slateink">Destructive controls to wipe your personal records or remove your account permanently.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Action 1: Purge All Workspace Data */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-clayred-light/30 border border-clayred-DEFAULT/20">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-charcoal">Purge All Personal Records</p>
              <p className="text-xs text-slateink leading-relaxed">
                Permanently deletes every memory, capture, belief, decision, reflection, and insight. Keeps your user account and login active with a clean slate.
              </p>
            </div>
            <button
              onClick={() => setConfirmPurge(true)}
              disabled={destructiveInProgress}
              className="self-start sm:self-auto px-4 py-2 rounded-xl border border-clayred-DEFAULT/50 text-clayred-dark font-semibold text-xs hover:bg-clayred-light transition disabled:opacity-50 shrink-0"
            >
              Purge Records
            </button>
          </div>

          {/* Action 2: Delete Entire Account */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-clayred-light/50 border border-clayred-DEFAULT/30">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-clayred-dark">Delete EchoSelf Account</p>
              <p className="text-xs text-slateink leading-relaxed">
                Permanently deletes all personal records, profile settings, and your authentication account. This action cannot be undone.
              </p>
            </div>
            <button
              onClick={() => {
                setAccountDeleteInput('');
                setConfirmAccountDelete(true);
              }}
              disabled={destructiveInProgress}
              className="self-start sm:self-auto px-4 py-2 rounded-xl bg-clayred-dark text-paper font-semibold text-xs hover:bg-clayred-dark/90 transition disabled:opacity-50 shrink-0"
            >
              Delete Account
            </button>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-linen border border-linen-dark/60 text-[11px] text-slateink space-y-1">
          <p className="font-semibold text-charcoal">Distinction: Database Deletion vs. Provider Backups</p>
          <p>
            When you confirm deletion, records are removed immediately from the active PostgreSQL database. Any cached memory embeddings and sessions are purged. Note that point-in-time disaster-recovery database backups may retain snapshots for up to 30 days before automated rotation, and past API calls handled by external providers are governed by the provider’s audit log retention.
          </p>
        </div>
      </section>

      {/* Confirmation Dialog: Purge Data */}
      <ConfirmDialog
        open={confirmPurge}
        title="Purge All Personal Records?"
        description="This will permanently delete all your memories, captures, decisions, reflections, and beliefs from the database. Public sample demo records are preserved. This action cannot be reversed."
        confirmLabel={destructiveInProgress ? 'Purging…' : 'Yes, Delete All Records'}
        tone="danger"
        onConfirm={handlePurgeAllData}
        onCancel={() => setConfirmPurge(false)}
      />

      {/* Modal Dialog: Full Account Deletion */}
      {confirmAccountDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-xs">
          <div className="card-surface p-6 rounded-3xl border border-clayred-DEFAULT/40 bg-paper max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-clayred-light text-clayred-dark flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-clayred-dark">Delete Account Permanently</h3>
                <p className="text-xs text-slateink">This will delete your credentials and all personal records.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slateink leading-relaxed">
              To prevent accidental deletion, please type <strong className="text-charcoal font-mono">DELETE</strong> in the box below to authorize permanent deletion of your account.
            </p>

            <input
              type="text"
              value={accountDeleteInput}
              onChange={(e) => setAccountDeleteInput(e.target.value)}
              placeholder='Type "DELETE"'
              className="w-full px-3.5 py-2.5 rounded-xl border border-linen-dark bg-linen text-sm text-charcoal font-mono focus:outline-hidden focus:border-clayred-DEFAULT"
              autoFocus
            />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAccountDelete(false)}
                className="px-4 py-2 rounded-full border border-linen-dark text-xs font-semibold text-slateink hover:text-charcoal transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAccountDelete}
                disabled={destructiveInProgress || accountDeleteInput.trim().toLowerCase() !== 'delete'}
                className="px-5 py-2 rounded-full bg-clayred-dark text-paper text-xs font-semibold hover:bg-clayred-dark/90 transition disabled:opacity-50"
              >
                {destructiveInProgress ? 'Deleting Account…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
