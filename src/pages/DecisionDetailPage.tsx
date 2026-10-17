import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Scale,
  BookOpen,
  AlertTriangle,
  FlaskConical,
  Eye,
  Pencil,
  Flag,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Calculator,
} from 'lucide-react';
import { decisionsService, memoriesService, beliefsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Belief, Decision, DecisionAnalysis, Memory } from '@/lib/types';
import { DecisionForm } from '@/components/DecisionForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  analysisToEditableText,
  analyzeDecision,
  buildAnalysisSnapshot,
  buildBeliefProposal,
  explainRanking,
  findAffectedBeliefs,
  isSnapshotStale,
} from '@/lib/decisionAnalysis';
import { LoadingState, ErrorState, Badge } from '@/components/ui';
import { navigateTo } from '@/lib/router';

type Report = ReturnType<typeof analyzeDecision>;

/**
 * Belief/value updates the mirror proposes after a reflection. Strictly
 * opt-in: the proposal is stored pending, applied only on explicit approval,
 * and dismissed proposals are kept as a record (never auto-retried).
 */
function ProposalSection({
  decision,
  beliefs,
  onChanged,
}: {
  decision: Decision;
  beliefs: Belief[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposals = decision.proposals ?? [];
  const affected = findAffectedBeliefs(decision, beliefs);

  async function generate() {
    setBusy('generate');
    setError(null);
    try {
      for (const belief of affected) {
        const proposal = buildBeliefProposal(decision, belief);
        await decisionsService.saveProposal(decision.id, proposal);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the proposal.');
    } finally {
      setBusy(null);
    }
  }

  async function resolve(proposalId: string, action: 'approved' | 'dismissed') {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) return;
    setBusy(proposalId);
    setError(null);
    try {
      const resolved: typeof proposal = { ...proposal, status: action, resolvedAt: new Date().toISOString() };
      if (action === 'approved') {
        await decisionsService.applyApprovedProposal(decision.id, resolved);
      } else {
        await decisionsService.saveProposal(decision.id, resolved);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your decision.');
      setBusy(null);
    }
  }

  const pending = proposals.filter((p) => p.status === 'pending');
  const resolved = proposals.filter((p) => p.status !== 'pending');
  if (!decision.reflection) return null;

  return (
    <section aria-label="Proposed belief updates" className="card-surface p-6 md:p-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-serif text-xl text-charcoal">Proposed belief updates</h2>
        {decision.reflection && pending.length === 0 && resolved.length === 0 && (
          <button
            onClick={generate}
            disabled={busy === 'generate' || affected.length === 0}
            className="rounded-full border border-linen-dark bg-linen-light px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors disabled:opacity-50"
          >
            {busy === 'generate' ? 'Preparing…' : 'Review suggestions'}
          </button>
      )}
      </div>
      <p className="text-xs text-slateink-light leading-relaxed mb-4">
        After a reflection, the mirror may suggest revisiting a belief. Suggestions are shown
        with the exact change; <strong>nothing is applied unless you approve it</strong>.
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-clayred-light px-4 py-2 text-sm text-clayred-DEFAULT">{error}</p>
      )}
      {pending.length === 0 && resolved.length === 0 && (
        <p className="text-xs text-slateink-light italic">
          {affected.length === 0
            ? 'No recorded beliefs match this decision\'s themes, so no suggestions are available.'
            : 'No suggestions prepared yet.'}
        </p>
      )}
      <ul className="space-y-3">
        {proposals.map((p) => (
          <li key={p.id} className="rounded-xl border border-linen-dark bg-linen-light/40 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-charcoal leading-relaxed">{p.change}</p>
                <p className="mt-1 text-xs text-slateink leading-relaxed">{p.reason}</p>
              </div>
              {p.status === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => resolve(p.id, 'approved')}
                    disabled={busy === p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-sage-light px-3.5 py-1.5 text-xs font-medium text-sage-dark hover:brightness-95 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Approve
                  </button>
                  <button
                    onClick={() => resolve(p.id, 'dismissed')}
                    disabled={busy === p.id}
                    className="rounded-full px-3.5 py-1.5 text-xs font-medium text-slateink-dark hover:bg-linen transition disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <Badge tone={p.status === 'approved' ? 'sage' : 'neutral'}>{p.status}</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DecisionDetailPage({ decisionId }: { decisionId: string }) {
  const decision = useAsyncData(() => decisionsService.get(decisionId), [decisionId]);
  const memories = useAsyncData(() => memoriesService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);

  const loading = decision.loading || memories.loading;
  const error = decision.error || memories.error || beliefs.error;

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Opening the mirror" />;
  if (error) return <ErrorState message={error} onRetry={() => { decision.reload(); memories.reload(); }} />;
  if (!decision.data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="card-surface p-10 text-center">
          <p className="font-serif text-xl text-charcoal mb-2">Decision not found</p>
          <p className="text-sm text-slateink">It may have been deleted, or the link is out of date.</p>
        </div>
      </div>
    );
  }

  const d = decision.data;

  async function handleDelete() {
    if (!d) return;
    setActionError(null);
    try {
      await decisionsService.remove(d.id);
      navigateTo('decisions');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the decision.');
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-8">
      <BackLink />

      {showEdit ? (
        <DecisionForm
          existing={d}
          onSaved={() => {
            setShowEdit(false);
            decision.reload();
          }}
          onCancel={() => setShowEdit(false)}
        />
      ) : (
        <MirrorView
          decision={d}
          memories={memories.data ?? []}
          beliefs={beliefs.data ?? []}
          onEdit={() => setShowEdit(true)}
          onDelete={() => setConfirmDelete(true)}
          onChanged={() => decision.reload()}
        />
      )}

      {actionError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this decision?"
        description={`"${d.title}" and its preserved reasoning will be permanently removed. This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function MirrorView({
  decision,
  memories,
  beliefs,
  onEdit,
  onDelete,
  onChanged,
}: {
  decision: Decision;
  memories: Memory[];
  beliefs: Belief[];
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-8">
      <DecisionHeader decision={decision} onEdit={onEdit} onDelete={onDelete} />
      <DecisionAnalysisSection decision={decision} memories={memories} beliefs={beliefs} onChanged={onChanged} />
      <ChoiceSection decision={decision} onChanged={onChanged} />
      <ReflectionSection decision={decision} onChanged={onChanged} />
      <ProposalSection decision={decision} beliefs={beliefs} onChanged={onChanged} />
    </div>
  );
}

function BackLink() {
  return (
    <a href="/decisions" className="inline-flex items-center gap-1.5 text-sm text-slateink hover:text-charcoal transition-colors">
      <ArrowLeft className="w-4 h-4" aria-hidden />
      Decision Mirror
    </a>
  );
}

function DecisionHeader({
  decision,
  onEdit,
  onDelete,
}: {
  decision: Decision;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="card-surface p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={decision.status === 'unresolved' ? 'amber' : 'sage'}>{decision.status}</Badge>
          {decision.analysis_edited && (
            <Badge tone="neutral">
              <Pencil className="w-3 h-3" aria-hidden /> analysis edited by you
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="rounded-full border border-linen-dark bg-linen-light px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
          >
            Edit setup
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-clayred-light px-4 py-1.5 text-xs font-medium text-clayred-DEFAULT hover:bg-clayred-light transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <h1 className="font-serif text-2xl md:text-3xl font-light leading-tight text-charcoal mb-2">
        {decision.title}
      </h1>
      <p className="text-sm md:text-[15px] text-slateink leading-relaxed mb-5">{decision.context}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoBlock label="Constraints" text={decision.constraints} icon={<Scale className="w-3.5 h-3.5" aria-hidden />} />
        <InfoBlock label="Uncertainties" text={decision.uncertainties} icon={<AlertTriangle className="w-3.5 h-3.5" aria-hidden />} />
        <InfoBlock label="A successful outcome" text={decision.success_definition} icon={<Eye className="w-3.5 h-3.5" aria-hidden />} />
      </div>

      {decision.values.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {decision.values.map((v) => (
            <span key={v} className="rounded-md bg-terracotta/10 px-2 py-0.5 text-[11px] text-terracotta-deep">
              {v}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function InfoBlock({ label, text, icon }: { label: string; text: string | null; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-linen-light/70 border border-linen-dark/60 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-slateink font-medium mb-1">
        {icon} {label}
      </p>
      <p className="text-xs leading-relaxed text-charcoal-soft">
        {text || <span className="italic text-slateink-light">Not recorded</span>}
      </p>
    </div>
  );
}

function DecisionAnalysisSection({
  decision,
  memories,
  beliefs,
  onChanged,
}: {
  decision: Decision;
  memories: Memory[];
  beliefs: Belief[];
  onChanged: () => void;
}) {
  const [weights, setWeights] = useState<Record<string, number>>(decision.value_weights ?? {});
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEvidence, setShowEvidence] = useState(true);

  // The report is always computed from the CURRENT sliders, so scores update
  // live while a slider moves. Persistence happens on commit (release/keyup).
  const liveDecision: Decision = useMemo(
    () => ({ ...decision, value_weights: weights }),
    [decision, weights]
  );
  const report: Report = useMemo(
    () => analyzeDecision(liveDecision, memories, beliefs, decision.classification_overrides ?? {}),
    // exhaustive-deps: classification_overrides is read from `decision` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveDecision, memories, beliefs]
  );
  // The report at the SAVED weights, for "the ranking changed" comparisons.
  const savedReport: Report = useMemo(
    () => analyzeDecision(decision, memories, beliefs, decision.classification_overrides ?? {}),
    [decision, memories, beliefs]
  );
  const weightsDirty = useMemo(() => {
    const saved = decision.value_weights ?? {};
    const keys = new Set([...Object.keys(saved), ...Object.keys(weights)]);
    return Array.from(keys).some((k) => (saved[k] ?? 0.5) !== (weights[k] ?? 0.5));
  }, [decision.value_weights, weights]);

  // Persist which inputs produced the stored analysis — only when the sliders
  // match the saved decision, so a mid-drag state is never recorded.
  useEffect(() => {
    if (decision.analysis_edited || weightsDirty) return;
    const snapshot = buildAnalysisSnapshot(
      decision, memories, beliefs, decision.classification_overrides ?? {}, savedReport
    );
    decisionsService.update(decision.id, { analysis_snapshot: snapshot }).catch(() => {});
  }, [decision, memories, beliefs, savedReport, weightsDirty]);

  function commitWeights(next: Record<string, number>) {
    setWeights(next);
    if (!weightsDirty) return;
    setSaving(true);
    decisionsService.update(decision.id, { value_weights: next })
      .then(onChanged)
      .catch((err) => setAnalysisText(err instanceof Error ? err.message : 'Could not save weights.'))
      .finally(() => setSaving(false));
  }

  function startEditingAnalysis() {
    setAnalysisText(analysisToEditableText(report));
    setEditingAnalysis(true);
  }

  async function saveAnalysis() {
    setSaving(true);
    try {
      await decisionsService.update(decision.id, {
        analysis_edited: true,
        analysis: {
          summary: analysisText,
          options: [],
          contradictions: [],
          missingInformation: [],
          experiments: [],
        } as DecisionAnalysis,
      });
      setEditingAnalysis(false);
      onChanged();
    } catch (err) {
      setAnalysisText(err instanceof Error ? err.message : 'Could not save the edited analysis.');
    } finally {
      setSaving(false);
    }
  }

  async function saveOverride(key: string, value: 'for' | 'against' | 'neutral' | 'unknown') {
    try {
      await decisionsService.update(decision.id, {
        classification_overrides: { ...(decision.classification_overrides ?? {}), [key]: value },
      });
      onChanged();
    } catch (err) {
      setAnalysisText(err instanceof Error ? err.message : 'Could not save the correction.');
    }
  }

  return (
    <section aria-label="Decision analysis" className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-charcoal">The mirror's analysis</h2>
        <button
          onClick={editingAnalysis ? () => setEditingAnalysis(false) : startEditingAnalysis}
          className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark bg-linen-light px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-terracotta transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
          {editingAnalysis ? 'Cancel' : 'Edit analysis'}
        </button>
      </header>

      {editingAnalysis ? (
        <div className="card-surface p-6 space-y-4">
          <label htmlFor="analysis-edit" className="block text-xs font-medium text-slateink-dark">
            Rewrite the analysis in your own words. Your version is preserved as the record.
          </label>
          <textarea
            id="analysis-edit"
            rows={10}
            value={analysisText}
            onChange={(e) => setAnalysisText(e.target.value)}
            className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta font-mono"
          />
          <button
            onClick={saveAnalysis}
            disabled={saving || !analysisText.trim()}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save my version'}
          </button>
        </div>
      ) : decision.analysis_edited && decision.analysis ? (
        <div className="card-surface p-6 md:p-8">
          <Badge tone="neutral">
            <Pencil className="w-3 h-3" aria-hidden /> Your edited version
          </Badge>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-charcoal">
            {decision.analysis.summary}
          </pre>
        </div>
      ) : (
        <GeneratedReport
          report={report}
          savedReport={savedReport}
          weights={weights}
          weightsDirty={weightsDirty}
          savingWeights={saving}
          onWeightChange={setWeights}
          onWeightsCommit={commitWeights}
          showEvidence={showEvidence}
          onToggleEvidence={() => setShowEvidence((s) => !s)}
          decision={decision}
          memories={memories}
          onOverride={saveOverride}
        />
      )}
    </section>
  );
}

function GeneratedReport({
  report,
  savedReport,
  weights,
  weightsDirty,
  savingWeights,
  onWeightChange,
  onWeightsCommit,
  showEvidence,
  onToggleEvidence,
  decision,
  memories,
  onOverride,
}: {
  report: Report;
  savedReport: Report;
  weights: Record<string, number>;
  weightsDirty: boolean;
  savingWeights: boolean;
  onWeightChange: (w: Record<string, number>) => void;
  onWeightsCommit: (w: Record<string, number>) => void;
  showEvidence: boolean;
  onToggleEvidence: () => void;
  decision: Decision;
  memories: Memory[];
  onOverride: (key: string, value: 'for' | 'against' | 'neutral' | 'unknown') => void;
}) {
  const snapshotStale = isSnapshotStale(
    decision.analysis_snapshot, decision, memories, decision.classification_overrides ?? {}
  );
  return (
    <div className="space-y-6">
      <div className="card-surface p-6 md:p-8">
        <p className="text-sm md:text-[15px] leading-relaxed text-charcoal">{report.summary}</p>
        {snapshotStale && (
          <p className="mt-3 rounded-lg bg-amberclay-light/50 px-3 py-2 text-[11px] text-charcoal-soft">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden />
            Inputs changed since this analysis was last recorded (weights, records, or your
            corrections). The numbers below reflect the current inputs; the stored snapshot
            documents what was recorded before.
          </p>
        )}
        <div className="mt-4 rounded-xl bg-amberclay-light/40 border border-amberclay-DEFAULT/30 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-charcoal-soft">
            <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden />
            These comparisons show <strong>preference alignment</strong>: how each option sits
            with the values as you weighted them. They are not predictions of success, and they
            are not recommendations. The choice is yours.
          </p>
        </div>
      </div>

      <OptionComparison
        alignments={report.optionAlignments}
        weights={weights}
        weightsDirty={weightsDirty}
        savingWeights={savingWeights}
        onWeightChange={onWeightChange}
        onWeightsCommit={onWeightsCommit}
        decision={decision}
        onOverride={onOverride}
      />

      {weightsDirty && savedReport.preferredOption !== report.preferredOption && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-xs text-terracotta-deep" role="status">
          With the slider change, the lead moves
          {savedReport.preferredOption ? <> from “{savedReport.preferredOption}”</> : ' from (no leader)'}
          {report.preferredOption ? <> to “{report.preferredOption}”</> : ' to (no leader)'}. Release the slider to save;
          the comparison is always recalculated from the actual inputs.
        </p>
      )}

      <RankingExplainer alignments={report.optionAlignments} />

      {report.counterevidence.length > 0 && (
        <div className="card-surface p-6 md:p-8">
          <h3 className="flex items-center gap-2 font-serif text-lg text-charcoal mb-1">
            <ShieldAlert className="w-4 h-4 text-clayred-DEFAULT" aria-hidden />
            Counterevidence
          </h3>
          <p className="text-xs text-slateink-light mb-3">
            Every record or statement that points against an option, with its source. Unknown and
            unresolved items are never counted here; only directional evidence appears.
          </p>
          <ul className="space-y-2.5">
            {report.counterevidence.map((ce, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className="font-medium text-charcoal">{ce.optionLabel}</span>
                {' '}-{' '}
                {ce.memoryId ? (
                  <a href={`/memory/${ce.memoryId}`} className="text-terracotta-deep hover:underline underline-offset-2">{ce.memoryTitle}</a>
                ) : (
                  <span className="text-charcoal-soft italic">your own con: "{ce.memoryTitle}"</span>
                )}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${ce.origin === 'explicit' ? 'bg-terracotta/10 text-terracotta-deep' : ce.origin === 'override' ? 'bg-sage-light text-sage-dark' : 'bg-linen text-slateink'}`}>{ce.origin}</span>
                <span className="ml-2 text-slateink-light capitalize">on {ce.value}</span>
                <p className="text-slateink mt-0.5">{ce.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.weightSensitivities.length > 0 && (
        <div className="card-surface border-amberclay-DEFAULT/40 p-6 md:p-8">
          <h3 className="flex items-center gap-2 font-serif text-lg text-charcoal mb-1">
            <AlertTriangle className="w-4 h-4 text-amberclay-DEFAULT" aria-hidden />
            Weight-sensitive result
          </h3>
          <p className="text-xs text-slateink-light mb-3">
            The current leader depends on how you weighted a value: shifting one slider by 0.1
            changes the preferred option. Treat the ranking as unsettled.
          </p>
          <ul className="space-y-2">
            {report.weightSensitivities.map((s, i) => (
              <li key={i} className="text-xs leading-relaxed text-charcoal-soft">
                · Nudging <span className="font-medium capitalize text-charcoal">{s.value}</span> to
                {' '}{s.testedAt.toFixed(1)} moves the lead{' '}
                {s.baseline ? <>from "{s.baseline}"</> : 'from (no leader)'}{' '}
                {s.shifted ? <>to "{s.shifted}"</> : 'to (no leader)'}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.stabilityRanges.length > 0 && (
        <div className="card-surface p-6 md:p-8">
          <h3 className="flex items-center gap-2 font-serif text-lg text-charcoal mb-1">
            <Calculator className="w-4 h-4 text-terracotta-deep" aria-hidden />
            How far the lead stretches
          </h3>
          <p className="text-xs text-slateink-light mb-3">
            Sweeping one value's weight across its full range (everything else fixed): the span
            where “{report.preferredOption}” stays ahead. A narrow span means the option wins
            only under a narrow weighting. These are scenarios, not predictions.
          </p>
          <ul className="space-y-2">
            {report.stabilityRanges.map((r) => {
              const narrow = r.span < 0.5;
              return (
                <li key={r.value} className="text-xs leading-relaxed text-charcoal-soft">
                  · <span className="font-medium capitalize text-charcoal">{r.value}</span>:
                  {' '}“{r.leader}” leads for weights {r.low.toFixed(2)}–{r.high.toFixed(2)}
                  {' '}(span {r.span.toFixed(2)}{narrow ? ': narrow; the lead is fragile here' : ': robust to this value'}).
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {report.constraintStatuses.length > 0 && (
        <div className="card-surface p-6 md:p-8">
          <h3 className="font-serif text-lg text-charcoal mb-1">Constraints</h3>
          <p className="text-xs text-slateink-light mb-3">
            The mirror never marks a constraint satisfied unless your records support it; an
            unchecked constraint stays unknown.
          </p>
          <ul className="space-y-2">
            {report.constraintStatuses.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  c.status === 'evidence_against'
                    ? 'bg-clayred-light text-clayred-DEFAULT'
                    : c.status === 'evidence_for'
                      ? 'bg-sage-light text-sage-dark'
                      : 'bg-linen text-slateink-dark'
                }`}>
                  {c.status.replace('_', ' ')}
                </span>{' '}
                <span className="text-charcoal">{c.constraint}</span>
                <p className="text-slateink mt-0.5">{c.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-surface p-6 md:p-8">
        <h3 className="font-serif text-lg text-charcoal mb-1">Method &amp; inputs</h3>
        <p className="text-xs leading-relaxed text-charcoal-soft mb-2">{report.method.explanation}</p>
        <ul className="text-[11px] text-slateink space-y-1">
          <li>· Engine version: <span className="tabular-nums">{report.method.version}</span></li>
          <li>· Value weights in effect: {Object.entries(report.method.inputs.valueWeights).map(([k, v]) => `${k}=${v}`).join(', ') || 'none set (defaults 0.5)'}</li>
          <li>· Evidence records used: {report.method.inputs.evidenceMemoryIds.length}</li>
          <li>· Explicit pros/cons counted: {report.method.inputs.explicitItems.length}; user-corrected classifications: {report.method.inputs.overrideCount}</li>
          <li>· Generated from: {report.method.inputs.generatedFrom}</li>
        </ul>
      </div>

      <EvidencePanel report={report} open={showEvidence} onToggle={onToggleEvidence} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportList
          title="Contradictions with your records"
          icon={<Flag className="w-4 h-4 text-clayred-DEFAULT" aria-hidden />}
          items={report.contradictions}
          emptyLabel="No contradictions found between stated priorities and records."
        />
        <ReportList
          title="Missing information"
          icon={<AlertTriangle className="w-4 h-4 text-amberclay-DEFAULT" aria-hidden />}
          items={report.missingInformation}
          emptyLabel="Nothing significant is missing."
        />
        <ReportList
          title="Experiments to reduce uncertainty"
          icon={<FlaskConical className="w-4 h-4 text-sage-dark" aria-hidden />}
          items={report.experiments}
          emptyLabel="No experiments suggested."
        />
        <ReportList
          title="Limits of this analysis"
          icon={<Eye className="w-4 h-4 text-slateink" aria-hidden />}
          items={report.evidenceLimitations}
          emptyLabel=""
        />
      </div>
    </div>
  );
}

function RankingExplainer({ alignments }: { alignments: Report['optionAlignments'] }) {
  const lines = explainRanking(alignments);
  if (lines.length === 0) return null;
  return (
    <div className="card-surface p-6 md:p-8">
      <h3 className="flex items-center gap-2 font-serif text-lg text-charcoal mb-1">
        <Calculator className="w-4 h-4 text-terracotta-deep" aria-hidden />
        Why the comparison looks this way
      </h3>
      <p className="text-xs text-slateink-light mb-3">
        The decisive value contributions at the current weights, the same numbers the sliders
        change. Move a weight below and this explanation updates with it.
      </p>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="text-xs leading-relaxed text-charcoal-soft font-mono">· {l}</li>
        ))}
      </ul>
    </div>
  );
}

function ScoreTraceView({ trace }: { trace: Report['optionAlignments'][number]['trace'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta-deep hover:text-terracotta-dark"
      >
        <Calculator className="w-3 h-3" aria-hidden />
        {open ? 'Hide the arithmetic' : 'Show the arithmetic behind this score'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-linen-light/60 border border-linen-dark px-4 py-3">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-left text-slateink-light">
                <th className="py-1 pr-2 font-medium">Value</th>
                <th className="py-1 pr-2 font-medium">For</th>
                <th className="py-1 pr-2 font-medium">Against</th>
                <th className="py-1 pr-2 font-medium">Weight</th>
                <th className="py-1 font-medium">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {trace.lines.map((l) => (
                <tr key={l.value} className="border-t border-linen-dark/50">
                  <td className="py-1 pr-2 capitalize">{l.value}</td>
                  <td className="py-1 pr-2">{l.supporting}</td>
                  <td className="py-1 pr-2">{l.contradicting}</td>
                  <td className="py-1 pr-2">{l.weight.toFixed(1)}</td>
                  <td className="py-1">({l.supporting}−{l.contradicting})×{l.weight.toFixed(1)} = {l.contribution.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t border-linen-dark font-medium">
                <td className="py-1 pr-2" colSpan={4}>Net / mass → score</td>
                <td className="py-1">{trace.net.toFixed(2)} / {trace.classifiedMass.toFixed(2)} = {trace.score.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-relaxed text-slateink-light">
            Counts include your explicit pros/cons ({trace.lines.reduce((a, l) => a + l.explicitCount, 0)}),
            keyword-inferred classifications ({trace.lines.reduce((a, l) => a + l.inferredCount, 0)} correctable),
            and your corrections ({trace.lines.reduce((a, l) => a + l.overrideCount, 0)}).
            Unknown and neutral records are never in these counts.
          </p>
        </div>
      )}
    </div>
  );
}

function OptionComparison({
  alignments,
  weights,
  weightsDirty,
  savingWeights,
  onWeightChange,
  onWeightsCommit,
  decision,
  onOverride,
}: {
  alignments: Report['optionAlignments'];
  weights: Record<string, number>;
  weightsDirty: boolean;
  savingWeights: boolean;
  onWeightChange: (w: Record<string, number>) => void;
  onWeightsCommit: (w: Record<string, number>) => void;
  decision: Decision;
  onOverride: (key: string, value: 'for' | 'against' | 'neutral' | 'unknown') => void;
}) {
  const allValues = Array.from(new Set(alignments.flatMap((a) => a.values.map((v) => v.value))));

  return (
    <div className="card-surface p-6 md:p-8 space-y-6">
      <div>
        <h3 className="font-serif text-lg text-charcoal mb-1">Side by side</h3>
        <p className="text-xs text-slateink-light">
          Alignment scores are weighted by your preference sliders below. They are preferences,
          not odds. Scores are normalized within each option's own classified evidence.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {alignments.map((a) => (
          <div key={a.label} className="rounded-2xl border border-linen-dark bg-linen-light/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-serif text-lg text-charcoal">{a.label}</h4>
              <AlignmentBadge score={a.score} insufficient={a.insufficientEvidence} />
            </div>
            <ScoreTraceView trace={a.trace} />
            {a.incompleteness && (
              <p className="mb-3 rounded-lg bg-amberclay-light/50 px-3 py-2 text-[11px] text-charcoal-soft">
                {a.incompleteness}
              </p>
            )}
            <ul className="space-y-2.5">
              {a.values.map((v) => (
                <li key={v.value} className="text-xs leading-relaxed">
                  <span className="font-medium capitalize text-charcoal">{v.value}</span>{' '}
                  <span className={v.supportingMemories > v.contradictingMemories ? 'text-sage-dark' : v.contradictingMemories > v.supportingMemories ? 'text-clayred-DEFAULT' : 'text-slateink'}>
                    ({v.supportingMemories} for / {v.contradictingMemories} against{v.unknownMemories > 0 ? ` / ${v.unknownMemories} unknown` : ''} in your records)
                  </span>
                  <p className="text-slateink mt-0.5">{v.alignmentNote}</p>
                  <ClassificationReview
                    classifications={a.classifications.filter((c) => c.value === v.value)}
                    decisionId={decision.id}
                    optionLabel={a.label}
                    value={v.value}
                    onOverride={onOverride}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-linen-dark pt-5">
        <h4 className="text-xs uppercase tracking-[0.15em] text-slateink font-medium mb-3">
          How much does each value matter to you here?
        </h4>
        <div className="space-y-3">
          {allValues.map((v) => {
            const w = typeof weights[v] === 'number' ? weights[v] : 0.5;
            return (
              <div key={v} className="flex items-center gap-3">
                <span className="w-24 text-xs capitalize text-charcoal">{v}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={w}
                  onChange={(e) => onWeightChange({ ...weights, [v]: Number(e.target.value) })}
                  onMouseUp={() => onWeightsCommit(weights)}
                  onTouchEnd={() => onWeightsCommit(weights)}
                  onKeyUp={() => onWeightsCommit(weights)}
                  aria-label={`Weight for value ${v}`}
                  className="flex-1 accent-terracotta"
                />
                <span className="w-10 text-right text-xs tabular-nums text-slateink">{w.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slateink-light italic">
          Scores shift live as you move the sliders and are saved when you release; they express
          how you value things, not how likely outcomes are.
          {weightsDirty && savingWeights ? ' Saving…' : weightsDirty ? ' Unsaved.' : ''}
        </p>
      </div>
    </div>
  );
}

function ClassificationReview({
  classifications,
  decisionId,
  optionLabel,
  value,
  onOverride,
}: {
  classifications: Report['optionAlignments'][number]['classifications'];
  decisionId: string;
  optionLabel: string;
  value: string;
  onOverride: (key: string, value: 'for' | 'against' | 'neutral' | 'unknown') => void;
}) {
  const [open, setOpen] = useState(false);
  if (classifications.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] font-medium text-terracotta-deep hover:text-terracotta-dark"
      >
        {open ? 'Hide classifications' : `Review ${classifications.length} classification${classifications.length === 1 ? '' : 's'}`}
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-l-2 border-linen-dark pl-3">
          {classifications.map((c) => {
            const key = `${decisionId}:${optionLabel}:${value}:${c.memoryId}`;
            return (
              <li key={key} className="text-[11px] leading-relaxed">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${
                    c.classification === 'for' ? 'bg-sage-light text-sage-dark'
                    : c.classification === 'against' ? 'bg-clayred-light text-clayred-DEFAULT'
                    : c.classification === 'neutral' ? 'bg-linen text-slateink-dark'
                    : 'bg-amberclay-light text-amberclay-DEFAULT'
                  }`}>{c.classification}</span>
                  <span className={`rounded px-1.5 py-0.5 ${c.origin === 'explicit' ? 'bg-terracotta/10 text-terracotta-deep' : c.origin === 'override' ? 'bg-sage-light text-sage-dark' : 'bg-linen text-slateink'}`}>{c.origin}</span>
                  {c.memoryId.startsWith('explicit:') ? (
                    <span className="text-charcoal-soft">{c.memoryTitle}</span>
                  ) : (
                    <a href={`/memory/${c.memoryId}`} className="text-charcoal hover:text-terracotta-deep">{c.memoryTitle}</a>
                  )}
                </div>
                <p className="mt-0.5 text-slateink">{c.rationale}</p>
                {!c.memoryId.startsWith('explicit:') && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-slateink-light">Correct to:</span>
                    {(['for', 'against', 'neutral', 'unknown'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => onOverride(key, opt)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          c.origin === 'override' && c.classification === opt
                            ? 'bg-sage-light text-sage-dark'
                            : 'bg-linen/70 text-slateink-dark hover:bg-terracotta/10 hover:text-terracotta-deep'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AlignmentBadge({ score, insufficient }: { score: number; insufficient?: boolean }) {
  if (insufficient) {
    return (
      <span className="rounded-full bg-amberclay-light px-3 py-1 text-[11px] font-medium text-amberclay-DEFAULT" title="No directional evidence: unknown, not neutral">
        unknown
      </span>
    );
  }
  const pct = Math.round(((score + 1) / 2) * 100);
  const tone = score > 0.15 ? 'sage' : score < -0.15 ? 'clay' : 'neutral';
  const cls =
    tone === 'sage'
      ? 'bg-sage-light text-sage-dark'
      : tone === 'clay'
        ? 'bg-clayred-light text-clayred-DEFAULT'
        : 'bg-linen text-slateink-dark';
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-medium tabular-nums ${cls}`} title="Preference alignment, not a prediction">
      {pct}% aligned
    </span>
  );
}

function EvidencePanel({
  report,
  open,
  onToggle,
}: {
  report: Report;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card-surface p-6 md:p-8">
      <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-2 mb-1">
        <BookOpen className="w-4 h-4 text-terracotta-deep" aria-hidden />
        <span className="font-serif text-lg text-charcoal">
          Evidence ({report.relevantMemories.length})
        </span>
        <span className="text-xs text-slateink-light">{open ? 'hide' : 'show'}</span>
      </button>
      <p className="text-xs text-slateink-light mb-4">
        Every reference is a real record. Click through to read the original text.
      </p>
      {open && (
        <ul className="space-y-3">
          {report.relevantMemories.map((r) => (
            <li key={r.memory.id} className="rounded-xl border border-linen-dark bg-white/70 px-4 py-3">
              <a href={`/memory/${r.memory.id}`} className="font-serif text-sm text-charcoal hover:text-terracotta-deep">
                {r.memory.title}
              </a>
              <p className="text-[11px] text-slateink-light mt-0.5">
                {new Date(r.memory.occurred_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}: {r.reason}
              </p>
              <p className="text-xs text-slateink-dark leading-relaxed mt-1.5 line-clamp-2">{r.memory.content}</p>
            </li>
          ))}
          {report.relevantMemories.length === 0 && (
            <li className="text-sm text-slateink italic">
              No recorded memories relate to this decision. The analysis runs on stated values
              and gaps only.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ReportList({
  title,
  icon,
  items,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="card-surface p-5">
      <h3 className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-slateink font-medium mb-3">
        {icon} {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slateink-light italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed text-charcoal-soft">
              · {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChoiceSection({ decision, onChanged }: { decision: Decision; onChanged: () => void }) {
  const [chosen, setChosen] = useState(decision.chosen_option ?? '');
  const [rationale, setRationale] = useState(decision.rationale ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);

  async function recordChoice() {
    if (!chosen || saving) return;
    setSaving(true);
    setError(null);
    try {
      await decisionsService.recordChoice(decision.id, chosen, rationale);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the choice.');
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    setSaving(true);
    try {
      await decisionsService.reopen(decision.id);
      setConfirmReopen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen the decision.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Record your choice" className="card-surface p-6 md:p-8">
      <h2 className="font-serif text-xl text-charcoal mb-1">Record your choice</h2>
      <p className="text-xs text-slateink-light mb-5">
        The mirror keeps your reasoning so a later reflection can compare it with what happened.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        {decision.options.map((o) => (
          <button
            key={o.label}
            onClick={() => setChosen(o.label)}
            aria-pressed={chosen === o.label}
            className={`rounded-xl border px-4 py-3 text-sm text-left transition-colors ${
              chosen === o.label
                ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-medium'
                : 'border-linen-dark bg-white/70 text-slateink-dark hover:border-terracotta/50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <label htmlFor="rationale" className="block text-xs font-medium text-slateink-dark mb-1.5">
        Your rationale, in your own words
      </label>
      <textarea
        id="rationale"
        rows={3}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
        placeholder="Why this one? What did you weigh?"
      />

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={recordChoice}
          disabled={!chosen || saving}
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : decision.status === 'decided' ? 'Update choice' : 'Record choice'}
        </button>
        {decision.status === 'decided' && (
          <button
            onClick={() => setConfirmReopen(true)}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
          >
            Reopen
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmReopen}
        title="Reopen this decision?"
        description="The recorded choice and rationale will be cleared. The reflection, if any, is kept."
        confirmLabel="Reopen"
        onConfirm={reopen}
        onCancel={() => setConfirmReopen(false)}
      />
    </section>
  );
}

function ReflectionSection({ decision, onChanged }: { decision: Decision; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [whatHappened, setWhatHappened] = useState(decision.reflection?.whatHappened ?? '');
  const [surprises, setSurprises] = useState(decision.reflection?.surprises ?? '');
  const [lesson, setLesson] = useState(decision.reflection?.lesson ?? '');
  const [matches, setMatches] = useState(decision.reflection?.matchesOriginalReasoning ?? true);
  const [successMeasure, setSuccessMeasure] = useState<'' | 'met' | 'partly' | 'not_met' | 'redefined'>(
    decision.reflection?.successMeasure ?? ''
  );
  const [successNote, setSuccessNote] = useState(decision.reflection?.successNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReflect = decision.status === 'decided';

  if (!canReflect) return null;

  async function save() {
    if (!whatHappened.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await decisionsService.saveReflection(decision.id, {
        whatHappened: whatHappened.trim(),
        matchesOriginalReasoning: matches,
        surprises: surprises.trim(),
        lesson: lesson.trim(),
        successMeasure: successMeasure || undefined,
        successNote: successNote.trim() || undefined,
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the reflection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Outcome reflection" className="card-surface p-6 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-xl text-charcoal">Outcome reflection</h2>
        {decision.reflection && !open && (
          <button
            onClick={() => {
              setWhatHappened(decision.reflection!.whatHappened);
              setSurprises(decision.reflection!.surprises);
              setLesson(decision.reflection!.lesson);
              setMatches(decision.reflection!.matchesOriginalReasoning);
              setSuccessMeasure(decision.reflection!.successMeasure ?? '');
              setSuccessNote(decision.reflection!.successNote ?? '');
              setOpen(true);
            }}
            className="text-xs font-medium text-terracotta-deep hover:text-terracotta-dark"
          >
            Revise
          </button>
        )}
      </div>

      {decision.reflection && !open ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-linen-light/70 border border-linen-dark/60 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slateink font-medium mb-1.5">
              Original reasoning
            </p>
            <p className="text-sm leading-relaxed text-charcoal-soft italic">
              {decision.rationale || 'Not recorded at the time of the choice.'}
            </p>
          </div>
          <div className="rounded-xl bg-white/70 border border-linen-dark px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slateink font-medium mb-1.5">
              What happened
            </p>
            <p className="text-sm leading-relaxed text-charcoal">{decision.reflection.whatHappened}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={decision.reflection.matchesOriginalReasoning ? 'sage' : 'clay'}>
              {decision.reflection.matchesOriginalReasoning
                ? 'outcome matched original reasoning'
                : 'outcome diverged from original reasoning'}
            </Badge>
            {decision.reflected_at && (
              <span className="text-xs text-slateink-light">
                {new Date(decision.reflected_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          {decision.reflection.surprises && (
            <p className="text-sm text-slateink leading-relaxed">
              <span className="font-medium text-charcoal">Surprises: </span>
              {decision.reflection.surprises}
            </p>
          )}
          {decision.reflection.lesson && (
            <p className="text-sm text-slateink leading-relaxed">
              <span className="font-medium text-charcoal">Lesson: </span>
              {decision.reflection.lesson}
            </p>
          )}
          {decision.reflection.successMeasure && (
            <div className="rounded-xl bg-linen-light/70 border border-linen-dark/60 px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slateink font-medium mb-1.5">
                Against your definition of success
              </p>
              {decision.success_definition && (
                <p className="text-xs text-charcoal-soft italic mb-2">"{decision.success_definition}"</p>
              )}
              <Badge
                tone={
                  decision.reflection.successMeasure === 'met' ? 'sage'
                  : decision.reflection.successMeasure === 'partly' ? 'neutral'
                  : 'clay'
                }
              >
                {decision.reflection.successMeasure.replace('_', ' ')}
              </Badge>
              {decision.reflection.successNote && (
                <p className="mt-2 text-sm text-slateink leading-relaxed">{decision.reflection.successNote}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slateink-light leading-relaxed">
            Time has passed. Compare what you expected with what actually happened; this is how
            the mirror turns decisions into self-knowledge.
          </p>
          <div>
            <label htmlFor="ref-what" className="block text-xs font-medium text-slateink-dark mb-1.5">
              What actually happened?
            </label>
            <textarea
              id="ref-what"
              rows={3}
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slateink-dark">Did it match your original reasoning?</span>
            <button
              onClick={() => setMatches(true)}
              aria-pressed={matches === true}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${matches ? 'bg-sage-light text-sage-dark' : 'bg-linen/70 text-slateink-dark'}`}
            >
              Yes
            </button>
            <button
              onClick={() => setMatches(false)}
              aria-pressed={matches === false}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${!matches ? 'bg-clayred-light text-clayred-DEFAULT' : 'bg-linen/70 text-slateink-dark'}`}
            >
              No
            </button>
          </div>
          <div>
            <p className="block text-xs font-medium text-slateink-dark mb-1.5">Against your definition of success</p>
            {decision.success_definition ? (
              <p className="text-xs text-charcoal-soft italic mb-2">"{decision.success_definition}"</p>
            ) : (
              <p className="text-xs text-slateink-light italic mb-2">No success definition was recorded for this decision.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {(['met', 'partly', 'not_met', 'redefined'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSuccessMeasure(m)}
                  aria-pressed={successMeasure === m}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
                    successMeasure === m
                      ? m === 'met' ? 'bg-sage-light text-sage-dark'
                        : m === 'not_met' ? 'bg-clayred-light text-clayred-DEFAULT'
                        : 'bg-terracotta/15 text-terracotta-deep'
                      : 'bg-linen/70 text-slateink-dark'
                  }`}
                >
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
            {successMeasure === 'redefined' && (
              <textarea
                aria-label="How you now define success for this decision"
                rows={2}
                value={successNote}
                onChange={(e) => setSuccessNote(e.target.value)}
                placeholder="How do you now define success?"
                className="mt-2 w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
              />
            )}
          </div>
          <div>
            <label htmlFor="ref-surprises" className="block text-xs font-medium text-slateink-dark mb-1.5">
              Surprises (optional)
            </label>
            <textarea
              id="ref-surprises"
              rows={2}
              value={surprises}
              onChange={(e) => setSurprises(e.target.value)}
              className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
            />
          </div>
          <div>
            <label htmlFor="ref-lesson" className="block text-xs font-medium text-slateink-dark mb-1.5">
              Lesson (optional)
            </label>
            <textarea
              id="ref-lesson"
              rows={2}
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              className="w-full rounded-xl border border-linen-dark bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed focus:border-terracotta"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={!whatHappened.trim() || saving}
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save reflection'}
            </button>
            {decision.reflection && (
              <button
                onClick={() => setOpen(false)}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
