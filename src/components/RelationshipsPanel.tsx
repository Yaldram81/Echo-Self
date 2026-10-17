import { useMemo, useState } from 'react';
import { Scale, Sparkles, Check, X, Pencil, ShieldAlert } from 'lucide-react';
import { relationshipsService, type StatementRelationshipRow } from '@/lib/services';
import { findBeliefContradictions } from '@/lib/beliefContradictions';
import {
  RELATION_LABELS, TENSION_CATEGORIES,
  RelationshipUnavailableError,
  analyzeRelationships,
  patternRelationshipFromContradiction,
  type PersistedRelationshipInput,
} from '@/lib/relationshipService';
import type { Belief, Memory } from '@/lib/types';
import { Card, Badge, DemoModeBanner } from '@/components/ui';

/**
 * Statement relationships panel (Upgrade 3).
 *
 * Shows candidate relationships between the user's own statements with dates,
 * the flagged reason, and an uncertainty explanation. Candidates from the
 * deterministic pattern detector and from model-assisted analysis are kept
 * visually separate from established (user-confirmed) relationships. Confirm,
 * dismiss, and correct are explicit user actions; nothing applies itself.
 */

type Filter = 'tensions' | 'all' | 'confirmed';

export function RelationshipsPanel({ beliefs, memories }: { beliefs: Belief[]; memories: Memory[] }) {
  const [rows, setRows] = useState<StatementRelationshipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [amendText, setAmendText] = useState('');
  const [filter, setFilter] = useState<Filter>('tensions');
  const [loaded, setLoaded] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, { title: string; text: string; date: string | null }>();
    for (const b of beliefs) {
      m.set(b.id, { title: b.kind === 'value' ? 'Value' : 'Belief', text: b.statement, date: b.formed_at });
    }
    for (const mem of memories) {
      m.set(mem.id, { title: 'Memory', text: `${mem.title}. ${mem.content}`, date: mem.occurred_at });
    }
    return m;
  }, [beliefs, memories]);

  async function refresh() {
    const list = await relationshipsService.list();
    setRows(list);
  }

  async function handleLoad() {
    setLoading(true);
    setActionError(null);
    try {
      await refresh();
      setLoaded(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not load saved relationships.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setActionError(null);
    setNotice(null);
    try {
      // 1. Deterministic baseline: always refreshed, cheap, no provider.
      const patternInputs: PersistedRelationshipInput[] = [];
      for (const p of candidatePatternPairs(beliefs, memories)) patternInputs.push(p);
      for (const input of patternInputs) {
        await relationshipsService.saveCandidate({
          a_type: input.a.kind,
          b_type: input.b.kind,
          a_id: input.a.id,
          b_id: input.b.id,
          relation: input.relation,
          explanation: input.explanation,
          source: 'pattern',
        });
      }
      // 2. Model-assisted leg; unavailable states surface as a notice, and the
      // pattern results stay — never presented as model-verified.
      let modelNote: string | null = null;
      try {
        const outcome = await analyzeRelationships(beliefs, memories);
        for (const rel of outcome.relationships) {
          if (!TENSION_CATEGORIES.includes(rel.relation) && rel.relation !== 'compatible') continue;
          if (rel.relation === 'compatible') continue; // stored candidates only when reviewed
          await relationshipsService.saveCandidate({
            a_type: rel.a.kind,
            b_type: rel.b.kind,
            a_id: rel.a.id,
            b_id: rel.b.id,
            relation: rel.relation,
            explanation: rel.explanation,
            source: 'model',
          });
        }
        modelNote = outcome.detail;
      } catch (modelErr) {
        if (modelErr instanceof RelationshipUnavailableError) {
          modelNote = `Model-assisted comparison is unavailable (${modelErr.message}) — pattern-detected tensions below come from the deterministic detector only, whose coverage is narrower.`;
        } else {
          throw modelErr;
        }
      }
      await refresh();
      setNotice(
        [
          patternInputs.length > 0
            ? `${patternInputs.length} pattern-detected candidate${patternInputs.length === 1 ? '' : 's'} refreshed.`
            : 'The deterministic pattern detector found no opposing-cue pairs.',
          modelNote,
        ]
          .filter(Boolean)
          .join(' ')
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSetStatus(row: StatementRelationshipRow, status: 'confirmed' | 'dismissed') {
    setActionError(null);
    try {
      await relationshipsService.setStatus(row.id, status);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save your decision.');
    }
  }

  async function handleAmend(row: StatementRelationshipRow) {
    setActionError(null);
    try {
      await relationshipsService.amendExplanation(row.id, amendText.trim());
      setAmendingId(null);
      setAmendText('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save the correction.');
    }
  }

  const visible = rows.filter((r) => {
    if (filter === 'confirmed') return r.status === 'confirmed';
    if (filter === 'tensions') return r.status !== 'dismissed' && TENSION_CATEGORIES.includes(r.relation);
    return true;
  });

  return (
    <section aria-label="Statement relationships" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-clayred-DEFAULT font-medium">
          <Scale className="w-4 h-4" aria-hidden />
          Relationships between your statements
        </h2>
        <div className="flex items-center gap-2">
          {!loaded && (
            <button
              onClick={handleLoad}
              disabled={loading}
              className="rounded-full border border-linen-dark px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-charcoal transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Show saved'}
            </button>
          )}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-1.5 rounded-full bg-charcoal px-4 py-1.5 text-xs font-medium text-paper hover:bg-slateink-dark transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            {analyzing ? 'Analyzing…' : 'Analyze relationships'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slateink-light max-w-2xl">
        Candidates flagged by the deterministic pattern detector and, when the AI provider is
        available, a model-assisted comparison of your own statements. A candidate becomes an
        established relationship only when you confirm it. Records differing is never a judgment
        about you.
      </p>
      <DemoModeBanner />

      <div className="flex flex-wrap gap-2">
        {(['tensions', 'all', 'confirmed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              filter === f ? 'bg-charcoal text-paper' : 'bg-linen/70 text-slateink-dark hover:bg-linen'
            }`}
          >
            {f === 'tensions' ? 'Tensions' : f === 'all' ? 'All candidates' : 'Confirmed'}
          </button>
        ))}
      </div>

      {notice && (
        <p className="rounded-lg bg-amberclay-light/50 px-4 py-2.5 text-xs text-slateink">{notice}</p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-clayred-light px-4 py-2.5 text-sm text-clayred-DEFAULT">
          {actionError}
        </p>
      )}

      {loaded && rows.length === 0 && !analyzing && (
        <p className="text-sm text-slateink-light">
          No saved relationship candidates yet. Run an analysis to look for tensions, changes over
          time, and context differences between your statements.
        </p>
      )}

      <div className="space-y-3">
        {visible.map((row) => {
          const a = byId.get(row.a_id);
          const b = byId.get(row.b_id);
          const established = row.status === 'confirmed';
          return (
            <Card key={row.id} className={established ? 'border-sage' : 'border-clayred-light'}>
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={established ? 'sage' : row.source === 'model' ? 'amber' : 'neutral'}>
                    {established ? 'Established (you confirmed)' : row.source === 'model' ? 'AI candidate' : 'Pattern candidate'}
                  </Badge>
                  <Badge tone={row.relation === 'direct_contradiction' ? 'clay' : 'neutral'}>
                    {RELATION_LABELS[row.relation]}
                  </Badge>
                </div>
                {row.reviewed_at && (
                  <span className="text-[11px] text-slateink-light">
                    reviewed {new Date(row.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[{ id: row.a_id, ...a }, { id: row.b_id, ...b }].map((side, i) => (
                  <div key={i} className="rounded-xl bg-linen-light/60 border border-linen-dark/60 p-3">
                    <p className="text-[11px] text-slateink-light mb-1">
                      {side?.title ?? 'Statement'} · {side?.date ? new Date(side.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'no date'}
                    </p>
                    <p className="font-serif text-[0.95rem] leading-snug text-charcoal">“{side?.text ?? 'record no longer available'}”</p>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-xs text-slateink leading-relaxed">{row.explanation}</p>
              {row.status === 'candidate' && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    onClick={() => handleSetStatus(row, 'confirmed')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sage-light px-3.5 py-1 text-xs font-medium text-sage-dark hover:bg-sage hover:text-paper transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden /> Confirm as established
                  </button>
                  <button
                    onClick={() => handleSetStatus(row, 'dismissed')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark px-3.5 py-1 text-xs font-medium text-slateink-dark hover:border-clayred-DEFAULT hover:text-clayred-DEFAULT transition-colors"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden /> Dismiss
                  </button>
                  <button
                    onClick={() => { setAmendingId(row.id); setAmendText(row.explanation); }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-linen-dark px-3.5 py-1 text-xs font-medium text-slateink-dark hover:border-charcoal transition-colors"
                  >
                    <Pencil className="w-3 h-3" aria-hidden /> Correct the explanation
                  </button>
                </div>
              )}
              {amendingId === row.id && (
                <div className="mt-3 space-y-2">
                  <label htmlFor={`amend-${row.id}`} className="text-xs text-slateink-dark font-medium">
                    Your correction of this explanation (the original is kept as provenance in the record history)
                  </label>
                  <textarea
                    id={`amend-${row.id}`}
                    value={ amendText }
                    onChange={(e) => setAmendText(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-linen-dark bg-paper px-3 py-2 text-sm text-charcoal focus:border-terracotta focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAmend(row)}
                      className="rounded-full bg-terracotta px-4 py-1.5 text-xs font-medium text-paper hover:bg-terracotta-dark transition-colors"
                    >
                      Save correction
                    </button>
                    <button
                      onClick={() => { setAmendingId(null); setAmendText(''); }}
                      className="rounded-full border border-linen-dark px-4 py-1.5 text-xs font-medium text-slateink-dark hover:border-charcoal transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {established && (
                <p className="mt-2 text-[11px] text-sage-dark flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3" aria-hidden />
                  Established relationships appear in your evidence graph via your stored records.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/** Deterministic pattern detector, expressed in shared relationship shape. */
function candidatePatternPairs(beliefs: Belief[], memories: Memory[]): PersistedRelationshipInput[] {
  return findBeliefContradictions(
    beliefs.filter((b) => b.origin === 'user' || b.origin === 'confirmed_suggestion'),
    memories
  ).map(patternRelationshipFromContradiction);
}
