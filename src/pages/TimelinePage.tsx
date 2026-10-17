import { useMemo, useState } from 'react';
import {
  Brain,
  Scale,
  Compass,
  Eye,
  Milestone,
  Link2,
} from 'lucide-react';
import { memoriesService, decisionsService, beliefsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Belief, Decision, Memory, TimelineEntry } from '@/lib/types';
import {
  SectionHeading,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
  DemoModeBanner,
} from '@/components/ui';

const KIND_META: Record<TimelineEntry['kind'], { icon: typeof Brain; tone: 'terracotta' | 'sage' | 'amber' | 'neutral'; label: string }> = {
  memory: { icon: Brain, tone: 'terracotta', label: 'memory' },
  decision: { icon: Scale, tone: 'amber', label: 'decision' },
  'belief-change': { icon: Compass, tone: 'neutral', label: 'belief change' },
  reflection: { icon: Eye, tone: 'sage', label: 'outcome reflection' },
};

function buildEntries(memories: Memory[], decisions: Decision[], beliefs: Belief[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const m of memories) {
    entries.push({
      id: `memory:${m.id}`,
      kind: 'memory',
      title: m.title,
      description: m.content,
      occurredAt: m.occurred_at,
      href: `/memory/${m.id}`,
      linkedIds: [],
      linkDemonstrated: false,
    });
  }

  for (const d of decisions) {
    // Demonstrated links: the decision record itself names its values/context;
    // memories sharing those recorded values are connected through data.
    const valueTerms = d.values.map((v) => v.toLowerCase());
    const related = memories.filter((m) => {
      const hay = `${m.title} ${m.content} ${(m.tags ?? []).join(' ')}`.toLowerCase();
      return valueTerms.some((v) => hay.includes(v));
    });
    entries.push({
      id: `decision:${d.id}`,
      kind: 'decision',
      title: d.title,
      description:
        d.status === 'decided'
          ? `Chose "${d.chosen_option}"${d.rationale ? ` — ${d.rationale}` : ''}`
          : d.context,
      occurredAt: d.status === 'decided' && d.decided_at ? d.decided_at : d.created_at,
      href: `/decision/${d.id}`,
      linkedIds: related.slice(0, 3).map((m) => `memory:${m.id}`),
      linkDemonstrated: related.length > 0,
    });

    if (d.reflection) {
      entries.push({
        id: `reflection:${d.id}`,
        kind: 'reflection',
        title: `Reflection: ${d.title}`,
        description: d.reflection.whatHappened,
        occurredAt: d.reflected_at ?? d.decided_at ?? d.created_at,
        href: `/decision/${d.id}`,
        linkedIds: [`decision:${d.id}`],
        linkDemonstrated: true,
      });
    }
  }

  // Belief changes: confirmed suggestions and meaningful history snapshots.
  for (const b of beliefs) {
    if (b.origin === 'confirmed_suggestion') {
      entries.push({
        id: `belief-confirm:${b.id}`,
        kind: 'belief-change',
        title: `Confirmed: ${b.statement}`,
        description: 'You confirmed this twin-suggested pattern as true of you.',
        occurredAt: b.last_reviewed ?? b.last_reflected_at,
        href: '/beliefs',
        linkedIds: [],
        linkDemonstrated: false,
      });
    }
    const history = b.history ?? [];
    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      if (last.strength !== first.strength) {
        entries.push({
          id: `belief-shift:${b.id}`,
          kind: 'belief-change',
          title: `${last.strength > first.strength ? 'Strengthened' : 'Weakened'}: ${b.statement}`,
          description: `Confidence moved from ${first.strength} to ${last.strength}. Latest note: ${last.note}`,
          occurredAt: last.recorded_at,
          href: '/beliefs',
          linkedIds: [],
          linkDemonstrated: false,
        });
      }
    }
  }

  return entries.sort((x, y) => new Date(y.occurredAt).getTime() - new Date(x.occurredAt).getTime());
}

export function TimelinePage() {
  const memories = useAsyncData(() => memoriesService.list(), []);
  const decisions = useAsyncData(() => decisionsService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);

  const loading = memories.loading || decisions.loading || beliefs.loading;
  const error = memories.error || decisions.error || beliefs.error;

  const [kindFilter, setKindFilter] = useState<'all' | TimelineEntry['kind']>('all');

  const entries = useMemo(
    () => buildEntries(memories.data ?? [], decisions.data ?? [], beliefs.data ?? []),
    [memories.data, decisions.data, beliefs.data]
  );

  const filtered = useMemo(
    () => entries.filter((e) => kindFilter === 'all' || e.kind === kindFilter),
    [entries, kindFilter]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineEntry[]>();
    for (const e of filtered) {
      const key = new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Chronology" title="Timeline" />
      <DemoModeBanner />

      <p className="max-w-2xl text-sm text-slateink leading-relaxed">
        Memories, decisions, confirmed belief changes, and outcome reflections in one sequence.
        Connections shown with a link icon come from the records themselves; everything else is
        simply neighboring in time.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by record kind">
        {(['all', 'memory', 'decision', 'belief-change', 'reflection'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            aria-pressed={kindFilter === k}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              kindFilter === k ? 'bg-charcoal text-paper' : 'bg-linen/70 text-slateink-dark hover:bg-linen'
            }`}
          >
            {k === 'all' ? 'Everything' : KIND_META[k].label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Weaving your timeline" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { memories.reload(); decisions.reload(); beliefs.reload(); }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Milestone className="w-7 h-7" aria-hidden />}
          title="The timeline is quiet"
          description="As you record memories, decisions, and reflections, they gather here in order."
        />
      ) : (
        <div className="space-y-10">
          {grouped.map(([month, monthEntries]) => (
            <section key={month} aria-label={month}>
              <h2 className="font-serif text-lg text-charcoal mb-5 sticky top-16 bg-paper/95 backdrop-blur py-1.5 z-10">
                {month}
              </h2>
              <ol className="relative border-l border-linen-dark ml-3 space-y-7">
                {monthEntries.map((e) => {
                  const meta = KIND_META[e.kind];
                  const Icon = meta.icon;
                  const linked = e.linkedIds
                    .map((id) => entries.find((x) => x.id === id))
                    .filter((x): x is TimelineEntry => Boolean(x));
                  return (
                    <li key={e.id} className="relative pl-8">
                      <span
                        className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-paper flex items-center justify-center ${
                          meta.tone === 'terracotta'
                            ? 'bg-terracotta'
                            : meta.tone === 'sage'
                              ? 'bg-sage'
                              : meta.tone === 'amber'
                                ? 'bg-amberclay-DEFAULT'
                                : 'bg-slateink-light'
                        }`}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge tone={meta.tone}>
                          <Icon className="w-3 h-3" aria-hidden />
                          {meta.label}
                        </Badge>
                        <span className="text-[11px] text-slateink-light">
                          {new Date(e.occurredAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {e.linkDemonstrated && linked.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-terracotta-deep">
                            <Link2 className="w-3 h-3" aria-hidden />
                            {linked.length} record{linked.length === 1 ? '' : 's'} linked in data
                          </span>
                        )}
                      </div>
                      <a href={e.href} className="font-serif text-[1.1rem] leading-snug text-charcoal hover:text-terracotta-deep transition-colors">
                        {e.title}
                      </a>
                      {e.description && (
                        <p className="mt-1 text-sm text-slateink leading-relaxed line-clamp-2">{e.description}</p>
                      )}
                      {linked.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {linked.map((l) => (
                            <a
                              key={l.id}
                              href={l.href}
                              className="inline-flex items-center gap-1 rounded-full bg-linen px-2.5 py-0.5 text-[11px] text-slateink-dark hover:bg-terracotta/15 hover:text-terracotta-deep transition-colors"
                            >
                              <Link2 className="w-3 h-3" aria-hidden />
                              {l.title.length > 40 ? `${l.title.slice(0, 40)}…` : l.title}
                            </a>
                          ))}
                          <span className="text-[10px] text-slateink-light self-center italic">
                            {e.linkDemonstrated
                              ? 'linked through recorded values in the decision itself'
                              : 'nearby in time only — not a demonstrated cause'}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
