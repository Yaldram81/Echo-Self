import { useState } from 'react';
import {
  ShieldCheck,
  Database,
  Cpu,
  CheckCircle2,
  XCircle,
  Trash2,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  RotateCcw,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { dataManagementService } from '@/lib/services';
import { geminiService } from '@/lib/geminiService';
import { useAuth } from '@/lib/useAuth';
import { SectionHeading } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3 border-t border-linen-dark/60 first:border-t-0">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-sage-dark shrink-0 mt-0.5" aria-hidden />
      ) : (
        <XCircle className="w-4 h-4 text-clayred-DEFAULT shrink-0 mt-0.5" aria-hidden />
      )}
      <div>
        <p className="text-xs sm:text-sm font-semibold text-charcoal">{label}</p>
        <p className="text-xs text-slateink leading-relaxed mt-0.5">{detail}</p>
      </div>
    </li>
  );
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

const DATA_TABLES = [
  'memories',
  'beliefs',
  'beliefs_history',
  'decisions',
  'timeline_events',
  'interpretation_flags',
  'graph_edge_confirmations',
  'statement_relationships',
  'captures',
  'review_actions_log',
  'insights',
] as const;

export function SettingsPage() {
  const { user } = useAuth();
  const [dataSharing, setDataSharing] = useState(false);
  const [evidenceOnly, setEvidenceOnly] = useState(true);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipeDone, setWipeDone] = useState(false);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number> | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function handleExport(format: 'json' | 'csv') {
    setExporting(format);
    setExportError(null);
    try {
      const all = await dataManagementService.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        download(
          `echoself-export-${stamp}.json`,
          JSON.stringify({ exported_at: new Date().toISOString(), data: all }, null, 2),
          'application/json'
        );
      } else {
        for (const [table, rows] of Object.entries(all)) {
          if (rows.length > 0) {
            download(`echoself-${table}-${stamp}.csv`, toCsv(rows as Record<string, unknown>[]), 'text/csv');
          }
        }
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the records.');
    } finally {
      setExporting(null);
    }
  }

  async function handleReview() {
    setReviewing(true);
    try {
      const all = await dataManagementService.exportAll();
      const counts: Record<string, number> = {};
      for (const [table, rows] of Object.entries(all)) counts[table] = rows.length;
      setReviewCounts(counts);
    } catch {
      setReviewCounts(null);
    } finally {
      setReviewing(false);
    }
  }

  async function handleWipe() {
    setWipeDone(false);
    if (!user) {
      setConfirmWipe(false);
      return;
    }
    try {
      await dataManagementService.deleteAll(DATA_TABLES);
      setWipeDone(true);
      setConfirmWipe(false);
      setReviewCounts(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not delete the records.');
      setConfirmWipe(false);
    }
  }

  // Gemini API Key management (multi-key pool + auto-failover rotation)
  const [apiKeys, setApiKeys] = useState<string[]>(() => geminiService.getApiKeys());
  const [activeKeyIdx, setActiveKeyIdx] = useState<number>(() => geminiService.getActiveKeyIndex());
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [revealedKeyIdxs, setRevealedKeyIdxs] = useState<Record<number, boolean>>({});
  const [keyNotice, setKeyNotice] = useState<string | null>(null);

  function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    const clean = newKeyInput.trim();
    if (!clean) return;
    const added = geminiService.addApiKey(clean);
    if (added) {
      const updated = geminiService.getApiKeys();
      setApiKeys(updated);
      setNewKeyInput('');
      setKeyNotice(`Key added! You have ${updated.length} key${updated.length > 1 ? 's' : ''} in the auto-rotation pool.`);
    } else {
      setKeyNotice('This key is already in your rotation pool.');
    }
    setTimeout(() => setKeyNotice(null), 4000);
  }

  function handleRemoveKey(idx: number) {
    geminiService.removeApiKey(idx);
    const updated = geminiService.getApiKeys();
    setApiKeys(updated);
    setActiveKeyIdx(geminiService.getActiveKeyIndex());
    setKeyNotice('API key removed from rotation.');
    setTimeout(() => setKeyNotice(null), 3000);
  }

  function handleSetActive(idx: number) {
    geminiService.setActiveKeyIndex(idx);
    setActiveKeyIdx(idx);
    setKeyNotice(`Key #${idx + 1} set as active.`);
    setTimeout(() => setKeyNotice(null), 3000);
  }

  function handleClearAllKeys() {
    geminiService.setApiKeys([]);
    setApiKeys([]);
    setActiveKeyIdx(0);
    setKeyNotice('All Gemini API keys removed.');
    setTimeout(() => setKeyNotice(null), 3000);
  }

  function toggleRevealKey(idx: number) {
    setRevealedKeyIdxs((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function maskKey(key: string): string {
    if (key.length <= 10) return '••••••••';
    return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-28 sm:pb-16 px-1 sm:px-0">
      {/* Header */}
      <div className="space-y-2">
        <SectionHeading eyebrow="Trust" title="Settings & Privacy" as="h1" />
        <p className="max-w-xl text-xs sm:text-sm text-slateink leading-relaxed">
          Manage your AI configuration, key rotation pool, data export, privacy choices, and account security.
        </p>
      </div>

      {/* Gemini AI Configuration & Multi-Key Auto-Rotation Card */}
      <div className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Gemini AI Configuration & Key Pool</h2>
              <p className="text-xs text-slateink">Add multiple API keys to enable seamless auto-failover whenever quota is reached.</p>
            </div>
          </div>

          {apiKeys.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-light/60 border border-sage/40 px-3 py-1 text-[11px] font-semibold text-sage-dark self-start sm:self-auto">
              <CheckCircle2 className="w-3.5 h-3.5 text-sage-dark" />
              <span>{apiKeys.length} {apiKeys.length === 1 ? 'key configured' : 'keys in rotation'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-linen border border-linen-dark/80 px-2.5 py-1 text-[11px] font-medium text-slateink self-start sm:self-auto">
              Not configured
            </span>
          )}
        </div>

        <p className="text-xs sm:text-sm text-slateink leading-relaxed">
          Google AI Studio provides free Gemini API access with per-minute rate limits. By adding <strong>multiple API keys</strong>, EchoSelf automatically rotates to the next available key upon receiving a rate-limit (HTTP 429), ensuring uninterrupted deliberation.
        </p>

        {/* Existing Keys Pool List */}
        {apiKeys.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-charcoal uppercase tracking-wider flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-terracotta" />
                <span>Rotation Pool ({apiKeys.length})</span>
              </p>
              <button
                type="button"
                onClick={handleClearAllKeys}
                className="text-[11px] text-clayred-DEFAULT hover:underline font-medium cursor-pointer"
              >
                Clear all keys
              </button>
            </div>

            <div className="space-y-2">
              {apiKeys.map((key, idx) => {
                const isActive = (activeKeyIdx % apiKeys.length) === idx;
                const isRevealed = Boolean(revealedKeyIdxs[idx]);
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-amberclay-light/20 border-terracotta/40 shadow-2xs'
                        : 'bg-linen/35 border-linen-dark/70 hover:border-linen-dark'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-linen-dark/70 text-charcoal text-xs font-mono font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-charcoal font-medium truncate">
                            {isRevealed ? key : maskKey(key)}
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-terracotta/15 px-2 py-0.2 text-[10px] font-bold text-terracotta uppercase tracking-wide shrink-0">
                              Active primary
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleRevealKey(idx)}
                        className="p-1.5 rounded-lg text-slateink-light hover:text-charcoal hover:bg-linen transition-colors cursor-pointer"
                        title={isRevealed ? 'Mask key' : 'Reveal key'}
                        aria-label={isRevealed ? 'Mask key' : 'Reveal key'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActive(idx)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium text-slateink hover:text-charcoal hover:bg-linen border border-linen-dark/70 transition-colors cursor-pointer"
                        >
                          Use next
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveKey(idx)}
                        className="p-1.5 rounded-lg text-slateink-light hover:text-clayred-DEFAULT hover:bg-clayred-light/40 transition-colors cursor-pointer"
                        title="Remove key"
                        aria-label="Remove key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add New Key Input */}
        <form onSubmit={handleAddKey} className="space-y-3 pt-1">
          <div>
            <label htmlFor="new-gemini-key" className="block text-xs font-semibold text-charcoal mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slateink-light" />
              <span>{apiKeys.length === 0 ? 'Add Google AI Studio API Key' : 'Add Another Key for Auto-Rotation'}</span>
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="new-gemini-key"
                  type={showKeyText ? 'text' : 'password'}
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  placeholder="Paste key: AIzaSy..."
                  className="w-full h-10 rounded-xl border border-linen-dark bg-white px-3.5 pr-10 text-xs sm:text-sm font-mono text-charcoal focus:border-terracotta focus:outline-none shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slateink-light hover:text-charcoal p-1 cursor-pointer"
                  aria-label={showKeyText ? 'Hide API key' : 'Show API key'}
                >
                  {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={!newKeyInput.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 px-5 rounded-full bg-terracotta text-paper text-xs sm:text-sm font-semibold hover:bg-terracotta-dark disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add key</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slateink-light pt-0.5">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-terracotta hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>Get free Gemini API keys from Google AI Studio</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {keyNotice && (
              <span className="text-sage-dark font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{keyNotice}</span>
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Privacy Principles Card */}
      <div className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-sage-light/60 text-sage-dark flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Privacy Principles</h2>
        </div>
        <p className="text-xs sm:text-sm text-slateink leading-relaxed">
          Every claim the twin makes about you traces back to recorded evidence. Twin-suggested patterns remain marked until explicitly approved, and your data can be exported or wiped at any time.
        </p>

        <div className="pt-2 space-y-4">
          <SettingToggle
            label="Enforce strict evidence citations"
            description="When enabled, the twin only states what your records support and shows verifiable sources."
            checked={evidenceOnly}
            onChange={setEvidenceOnly}
          />
          <SettingToggle
            label="Allow anonymized telemetry"
            description="Disabled by default. EchoSelf runs with no third-party tracking or telemetry."
            checked={dataSharing}
            onChange={setDataSharing}
          />
        </div>
      </div>

      {/* Data Management & Export Card */}
      <div className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">Data Ownership & Portability</h2>
        </div>
        <p className="text-xs sm:text-sm text-slateink leading-relaxed">
          Your records belong exclusively to you. Export your complete timeline, beliefs, and memories in open formats, or permanently delete your account's workspace.
        </p>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={handleReview}
            disabled={reviewing}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-linen-dark bg-linen/40 hover:bg-linen/80 text-xs font-semibold text-charcoal transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Database className="w-4 h-4 text-terracotta" aria-hidden />
            <span>{reviewing ? 'Counting…' : 'Inspect records'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting !== null}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-linen-dark bg-linen/40 hover:bg-linen/80 text-xs font-semibold text-charcoal transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <FileJson className="w-4 h-4 text-amberclay-DEFAULT" aria-hidden />
            <span>{exporting === 'json' ? 'Exporting…' : 'Export JSON'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-linen-dark bg-linen/40 hover:bg-linen/80 text-xs font-semibold text-charcoal transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-sage-dark" aria-hidden />
            <span>{exporting === 'csv' ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWipeDone(false);
              setConfirmWipe(true);
            }}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-clayred-light bg-clayred-light/20 hover:bg-clayred-light/50 text-xs font-semibold text-clayred-DEFAULT transition-all cursor-pointer shadow-2xs"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
            <span>Wipe workspace</span>
          </button>
        </div>

        {exportError && (
          <div role="alert" className="rounded-xl bg-clayred-light/60 border border-clayred-light p-3 text-xs text-clayred-DEFAULT flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            <span>{exportError}</span>
          </div>
        )}

        {wipeDone && (
          <div className="rounded-xl bg-sage-light/60 border border-sage/40 p-3 text-xs text-sage-dark flex items-center gap-2" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
            <span>All personal workspace records were deleted from the database.</span>
          </div>
        )}

        {reviewCounts && (
          <div className="rounded-xl border border-linen-dark/80 bg-white/80 p-3 space-y-1.5 shadow-2xs">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slateink-light">Stored records breakdown</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(reviewCounts).map(([table, count]) => (
                <div key={table} className="flex justify-between items-center text-xs p-1.5 rounded-lg bg-linen/30 border border-linen-dark/40">
                  <span className="text-slateink capitalize">{table.replace(/_/g, ' ')}</span>
                  <span className="font-mono font-bold text-charcoal">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Database Status Rows */}
        <div className="pt-2">
          <ul aria-label="Data layer status">
            <StatusRow
              ok
              label="Persistent database connected"
              detail="Records are securely stored in Supabase PostgreSQL and survive browser refreshes."
            />
            {user ? (
              <>
                <StatusRow
                  ok
                  label="Personal workspace active"
                  detail={`Signed in as ${user.email}. Exports and deletion actions apply strictly to records created by this account.`}
                />
                <StatusRow
                  ok
                  label="Row-level security enforced"
                  detail="PostgreSQL RLS ensures no account can read, edit, or delete another account's records."
                />
              </>
            ) : (
              <StatusRow
                ok={false}
                label="Browsing shared sample persona"
                detail="You are currently browsing the public demo persona read-only. Sign in to start your own private workspace."
              />
            )}
          </ul>
        </div>
      </div>

      {/* AI Service Status Card */}
      <div className="card-surface p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-linen-dark/80 bg-paper shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-amberclay-light/60 text-amberclay-DEFAULT flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-serif text-base sm:text-lg font-bold text-charcoal">AI Service Architecture</h2>
        </div>

        <ul aria-label="AI service status">
          <StatusRow
            ok={apiKeys.length > 0}
            label={apiKeys.length > 0 ? 'Gemini AI configured and active' : 'Gemini AI not configured'}
            detail={
              apiKeys.length > 0
                ? `${apiKeys.length} API key(s) in local rotation pool. Deliberation and twin analysis will invoke Gemini 2.5 Flash.`
                : 'Twin Chat composes replies using local deterministic synthesis until a Gemini key is configured in the section above.'
            }
          />
          <StatusRow
            ok
            label="Client-side secret protection"
            detail="Your API keys are stored locally in your browser session and never sent to any centralized telemetry or server."
          />
        </ul>
      </div>

      {/* Wipe Confirmation Modal */}
      <ConfirmDialog
        open={confirmWipe}
        title={user ? 'Permanently wipe your workspace?' : 'Sign in first'}
        description={
          user
            ? 'This permanently deletes all records created by your account (memories, beliefs, decisions, timeline events, and flags). The shared sample persona is not affected. Download an export first if you need a backup; this cannot be undone.'
            : 'Nothing to delete: you are browsing the shared sample persona. Sign in to manage your private workspace.'
        }
        confirmLabel={user ? 'Delete everything' : 'Understood'}
        onConfirm={handleWipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <p className="text-xs sm:text-sm font-semibold text-charcoal">{label}</p>
        <p className="text-xs text-slateink leading-relaxed mt-0.5 max-w-md">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 mt-0.5 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-terracotta/50 ${
          checked ? 'bg-terracotta' : 'bg-linen-dark'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
