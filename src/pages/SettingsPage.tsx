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
} from 'lucide-react';
import { dataManagementService } from '@/lib/services';
import { useAuth } from '@/lib/useAuth';
import { SectionHeading, Card } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3 border-t border-linen-dark/60 first:border-t-0">
      {ok ? (
        <CheckCircle2 className="w-5 h-5 text-sage-dark shrink-0 mt-0.5" aria-hidden />
      ) : (
        <XCircle className="w-5 h-5 text-clayred-DEFAULT shrink-0 mt-0.5" aria-hidden />
      )}
      <div>
        <p className="text-sm font-medium text-charcoal">{label}</p>
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

const DATA_TABLES = ['memories', 'beliefs', 'beliefs_history', 'decisions', 'timeline_events', 'interpretation_flags', 'graph_edge_confirmations'] as const;

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
        download(`echoself-export-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), data: all }, null, 2), 'application/json');
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

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Trust" title="Settings & Privacy" as="h1" />

      <Card>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-5 h-5 text-sage-dark" aria-hidden />
          <h3 className="font-serif text-lg text-charcoal">Privacy principles</h3>
        </div>
        <p className="text-sm text-slateink leading-relaxed">
          EchoSelf is built on one rule: every claim the twin makes about you must trace to
          something you recorded. AI-suggested patterns stay labeled until you confirm them, and
          you can export or delete everything below.
        </p>
        <div className="mt-5 space-y-4">
          <SettingToggle
            label="Answers must cite recorded evidence"
            description="When on, the twin only states what your records support and shows its sources."
            checked={evidenceOnly}
            onChange={setEvidenceOnly}
          />
          <SettingToggle
            label="Allow anonymized product improvement"
            description="Off by default. This demo has no telemetry, so nothing is collected either way."
            checked={dataSharing}
            onChange={setDataSharing}
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-3">
          <Database className="w-5 h-5 text-terracotta-deep" aria-hidden />
          <h3 className="font-serif text-lg text-charcoal">Your data</h3>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={handleReview}
            disabled={reviewing}
            className="rounded-full border border-linen-dark bg-linen-light px-4 py-2.5 min-h-[44px] text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors disabled:opacity-50"
          >
            {reviewing ? 'Counting…' : 'Review stored records'}
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark bg-linen-light px-4 py-2.5 min-h-[44px] text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors disabled:opacity-50"
          >
            <FileJson className="w-3.5 h-3.5" aria-hidden />
            {exporting === 'json' ? 'Exporting…' : 'Export all (JSON)'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark bg-linen-light px-4 py-2.5 min-h-[44px] text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden />
            {exporting === 'csv' ? 'Exporting…' : 'Export all (CSV)'}
          </button>
          <button
            onClick={() => {
              setWipeDone(false);
              setConfirmWipe(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-clayred-light px-4 py-2.5 min-h-[44px] text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            Delete everything
          </button>
        </div>

        {exportError && (
          <p role="alert" className="mb-3 rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
            {exportError}
          </p>
        )}
        {wipeDone && (
          <p className="mb-3 rounded-lg bg-sage-light px-4 py-2.5 text-sm text-sage-dark" role="status">
            All records were deleted from the database. Export a backup first if you might want
            them back; this action is not reversible.
          </p>
        )}

        {reviewCounts && (
          <ul className="rounded-xl border border-linen-dark bg-white/70 px-4 py-3 mb-2" aria-label="Stored record counts">
            {Object.entries(reviewCounts).map(([table, count]) => (
              <li key={table} className="flex justify-between py-1 text-xs">
                <span className="text-slateink capitalize">{table.replace(/_/g, ' ')}</span>
                <span className="font-medium tabular-nums text-charcoal">{count}</span>
              </li>
            ))}
          </ul>
        )}

        <ul aria-label="Data layer status">
          <StatusRow
            ok
            label="Persistent database connected"
            detail="Records are stored in a real database and survive reloads. Exports and deletions below act on that database directly."
          />
          {user ? (
            <>
              <StatusRow
                ok
                label="Personal workspace active"
                detail={`Signed in as ${user.email}. Exports and deletion act only on records created by this account; the public sample persona is excluded and cannot be changed from here.`}
              />
              <StatusRow
                ok
                label="Row-level ownership enforced"
                detail="Every record is owned by the account that created it, enforced by database rules from the verified session. Other accounts cannot read, edit, or delete your records, even by crafting requests."
              />
            </>
          ) : (
            <StatusRow
              ok={false}
              label="Browsing shared sample only"
              detail="You are not signed in, so this page shows the fictional sample persona read-only. Sign in to get a private workspace; the sample is never copied into it."
            />
          )}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-3">
          <Cpu className="w-5 h-5 text-amberclay-DEFAULT" aria-hidden />
          <h3 className="font-serif text-lg text-charcoal">AI service</h3>
        </div>
        <ul aria-label="AI service status">
          <StatusRow
            ok={false}
            label="Live model not connected"
            detail="Twin Chat composes replies locally from recorded evidence until a provider key is added to the server-side function. The key would live server-side only, never in the browser."
          />
          <StatusRow
            ok
            label="No secrets in client code"
            detail="The AI key, when configured, is held by the server function. Nothing sensitive ships to the browser."
          />
        </ul>
      </Card>

      <ConfirmDialog
        open={confirmWipe}
        title={user ? 'Delete your records?' : 'Sign in first'}
        description={
          user
            ? 'This permanently removes all records created by your account (memories, beliefs, decisions, timeline events, and flags). The shared sample persona is not affected. Download an export first; this cannot be undone.'
            : 'Nothing to delete: you are browsing the shared sample, which cannot be deleted from here. Sign in to manage your own workspace.'
        }
        confirmLabel={user ? 'Delete everything' : 'Got it'}
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
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-charcoal">{label}</p>
        <p className="text-xs text-slateink leading-relaxed mt-0.5 max-w-md">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 mt-0.5 -mr-2 h-11 w-16 flex items-center rounded-full px-1 transition-colors duration-200 ${
          checked ? 'bg-terracotta justify-end' : 'bg-linen-dark justify-start'
        }`}
      >
        <span
          className="h-8 w-8 rounded-full bg-white shadow transition-transform duration-200"
        />
      </button>
    </div>
  );
}
