import { useMemo, useState } from 'react';
import {
  Brain,
  Scale,
  Compass,
  Eye,
  Milestone,
  Link2,
  Search,
  X,
  ArrowDownUp,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
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
} from '@/components/ui';

const KIND_META: Record<
  TimelineEntry['kind'],
  {
    icon: typeof Brain;
    tone: 'terracotta' | 'sage' | 'amber' | 'neutral';
    label: string;
    singular: string;
    nodeBg: string;
    nodeBorder: string;
    nodeIconColor: string;
  }
> = {
  memory: {
    icon: Brain,
    tone: 'terracotta',
    label: 'Memories',
    singular: 'Memory',
    nodeBg: 'bg-terracotta/10',
    nodeBorder: 'border-terracotta/40',
    nodeIconColor: 'text-terracotta-deep',
  },
  decision: {
    icon: Scale,
    tone: 'amber',
    label: 'Decisions',
    singular: 'Decision',
    nodeBg: 'bg-amberclay-light/40',
    nodeBorder: 'border-amberclay-DEFAULT/40',
    nodeIconColor: 'text-amberclay-DEFAULT',
  },
  'belief-change': {
    icon: Compass,
    tone: 'neutral',
    label: 'Belief shifts',
    singular: 'Belief shift',
    nodeBg: 'bg-linen-dark/50',
    nodeBorder: 'border-slateink-light/40',
    nodeIconColor: 'text-slateink',
  },
  reflection: {
    icon: Eye,
    tone: 'sage',
    label: 'Reflections',
    singular: 'Reflection',
    nodeBg: 'bg-sage-light/50',
    nodeBorder: 'border-sage/40',
    nodeIconColor: 'text-sage-dark',
  },
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
          ? `Chose "${d.chosen_option}"${d.rationale ? `; ${d.rationale}` : ''}`
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  const allEntries = useMemo(
    () => buildEntries(memories.data ?? [], decisions.data ?? [], beliefs.data ?? []),
    [memories.data, decisions.data, beliefs.data]
  );

  // Counts across all items
  const kindCounts = useMemo(() => {
    const counts: Record<TimelineEntry['kind'], number> = {
      memory: 0,
      decision: 0,
      'belief-change': 0,
      reflection: 0,
    };
    for (const e of allEntries) {
      counts[e.kind]++;
    }
    return counts;
  }, [allEntries]);

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    let list = allEntries;

    if (kindFilter !== 'all') {
      list = list.filter((e) => e.kind === kindFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    if (sortOrder === 'asc') {
      return [...list].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    } else {
      return [...list].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    }
  }, [allEntries, kindFilter, searchQuery, sortOrder]);

  // Group by month
  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineEntry[]>();
    for (const e of filteredEntries) {
      const key = new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filteredEntries]);

  const toggleExpand = (id: string) => {
    setExpandedDescriptions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const hasActiveFilters = kindFilter !== 'all' || searchQuery.trim().length > 0;

  const resetFilters = () => {
    setKindFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-28 sm:pb-16 px-1 sm:px-0">
      {/* Page Header */}
      <div className="space-y-3">
        <SectionHeading
          eyebrow="Chronology"
          title="Timeline"
          as="h1"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-linen-dark bg-paper text-charcoal hover:bg-linen/60 transition-colors shadow-2xs"
                title={`Currently sorted ${sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}. Click to reverse.`}
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-terracotta" aria-hidden />
                <span>{sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}</span>
              </button>
            </div>
          }
        />

        {/* Narrative & Statistics Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slateink border-b border-linen-dark/60 pb-4">
          <p className="max-w-xl text-xs sm:text-sm leading-relaxed text-slateink-dark">
            Memories, decisions, confirmed belief changes, and outcome reflections in chronological sequence.
          </p>

          {!loading && allEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs shrink-0 font-medium">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-linen/80 text-charcoal">
                <Layers className="w-3.5 h-3.5 text-terracotta" aria-hidden />
                {allEntries.length} moments
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-linen/80 text-charcoal">
                <Calendar className="w-3.5 h-3.5 text-amberclay-DEFAULT" aria-hidden />
                {grouped.length} {grouped.length === 1 ? 'month' : 'months'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3 bg-linen/35 border border-linen-dark/60 rounded-2xl p-3 sm:p-4">
        {/* Search Input Row */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slateink-light pointer-events-none" aria-hidden />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search moments by keyword..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-linen-dark bg-paper text-charcoal placeholder:text-slateink-light focus:outline-none focus:ring-1 focus:ring-terracotta/50 focus:border-terracotta transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen transition-colors"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="self-start sm:self-auto px-3 py-2 text-xs font-medium text-terracotta-deep hover:text-terracotta-dark hover:bg-terracotta/10 rounded-xl transition-colors cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Kind Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1" role="group" aria-label="Filter by record kind">
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            aria-pressed={kindFilter === 'all'}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              kindFilter === 'all'
                ? 'bg-charcoal text-paper shadow-2xs'
                : 'bg-paper text-slateink-dark border border-linen-dark/80 hover:bg-linen/60'
            }`}
          >
            <span>All moments</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                kindFilter === 'all' ? 'bg-paper/20 text-paper' : 'bg-linen-dark/70 text-slateink-dark'
              }`}
            >
              {allEntries.length}
            </span>
          </button>

          {(['memory', 'decision', 'belief-change', 'reflection'] as const).map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            const count = kindCounts[k];
            const isActive = kindFilter === k;

            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-charcoal text-paper shadow-2xs'
                    : 'bg-paper text-slateink-dark border border-linen-dark/80 hover:bg-linen/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-paper' : meta.nodeIconColor}`} aria-hidden />
                <span>{meta.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-paper/20 text-paper' : 'bg-linen-dark/70 text-slateink-dark'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState label="Weaving your chronological timeline" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { memories.reload(); decisions.reload(); beliefs.reload(); }} />
      ) : filteredEntries.length === 0 ? (
        allEntries.length === 0 ? (
          <EmptyState
            icon={<Milestone className="w-8 h-8 text-terracotta" aria-hidden />}
            title="The timeline is quiet"
            description="As you record memories, decisions, and reflections, they gather here in chronological order."
          />
        ) : (
          <div className="text-center py-12 px-4 bg-linen/20 rounded-2xl border border-dashed border-linen-dark">
            <Search className="w-7 h-7 mx-auto text-slateink-light mb-2.5" aria-hidden />
            <h3 className="font-serif text-base font-semibold text-charcoal mb-1">No matching moments</h3>
            <p className="text-xs sm:text-sm text-slateink max-w-sm mx-auto mb-4">
              None of your recorded moments match the selected filter or search term.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-charcoal text-paper hover:bg-charcoal/90 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )
      ) : (
        <div className="space-y-8 sm:space-y-10">
          {grouped.map(([month, monthEntries]) => (
            <section key={month} aria-label={month} className="relative">
              {/* Sticky Month Section Header */}
              <div className="sticky top-14 sm:top-16 bg-paper/95 backdrop-blur-md py-2 px-1 z-10 border-b border-linen-dark/50 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-terracotta" aria-hidden />
                  <h2 className="font-serif text-base sm:text-lg font-semibold text-charcoal">
                    {month}
                  </h2>
                </div>
                <span className="text-[11px] font-medium text-slateink-light bg-linen/80 px-2.5 py-0.5 rounded-full">
                  {monthEntries.length} {monthEntries.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* Spine List */}
              <ol className="relative border-l-2 border-linen-dark/70 ml-3.5 sm:ml-5 space-y-5 sm:space-y-6 pt-1">
                {monthEntries.map((e) => {
                  const meta = KIND_META[e.kind];
                  const Icon = meta.icon;
                  const isExpanded = Boolean(expandedDescriptions[e.id]);
                  const linked = e.linkedIds
                    .map((id) => allEntries.find((x) => x.id === id))
                    .filter((x): x is TimelineEntry => Boolean(x));

                  const isLongDescription = e.description && e.description.length > 220;

                  return (
                    <li key={e.id} className="relative pl-6 sm:pl-8 group">
                      {/* Timeline Node Badge Icon */}
                      <span
                        className={`absolute -left-[14px] sm:-left-[17px] top-2 h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-paper flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 ${meta.nodeBg} ${meta.nodeBorder}`}
                        aria-hidden
                      >
                        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${meta.nodeIconColor}`} />
                      </span>

                      {/* Entry Card */}
                      <div className="bg-paper hover:bg-linen/25 border border-linen-dark/70 hover:border-linen-dark rounded-xl sm:rounded-2xl p-3.5 sm:p-5 transition-all shadow-2xs hover:shadow-xs space-y-2.5">
                        {/* Card Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={meta.tone}>
                              <Icon className="w-3 h-3" aria-hidden />
                              <span>{meta.singular}</span>
                            </Badge>

                            <time
                              dateTime={e.occurredAt}
                              className="text-[11px] sm:text-xs font-medium text-slateink-light"
                            >
                              {new Date(e.occurredAt).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </time>
                          </div>

                          {e.linkDemonstrated && linked.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta-deep bg-terracotta/10 px-2 py-0.5 rounded-full">
                              <Link2 className="w-3 h-3" aria-hidden />
                              <span>{linked.length} linked in data</span>
                            </span>
                          )}
                        </div>

                        {/* Title & Link */}
                        <div>
                          <a
                            href={e.href}
                            className="inline-flex items-baseline gap-1.5 font-serif text-base sm:text-lg font-medium text-charcoal hover:text-terracotta-deep transition-colors leading-snug group/link"
                          >
                            <span>{e.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-100 text-terracotta transition-opacity shrink-0 translate-y-0.5" aria-hidden />
                          </a>
                        </div>

                        {/* Description */}
                        {e.description && (
                          <div className="text-xs sm:text-sm text-slateink leading-relaxed">
                            <p className={isExpanded ? '' : 'line-clamp-2'}>
                              {e.description}
                            </p>
                            {isLongDescription && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(e.id)}
                                className="mt-1 text-[11px] font-medium text-terracotta-deep hover:text-terracotta-dark flex items-center gap-0.5 cursor-pointer"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Show less</span>
                                    <ChevronUp className="w-3 h-3" />
                                  </>
                                ) : (
                                  <>
                                    <span>Read more</span>
                                    <ChevronDown className="w-3 h-3" />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Linked Records Subpanel */}
                        {linked.length > 0 && (
                          <div className="pt-2 border-t border-linen-dark/50 mt-2 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-slateink-light font-medium">
                              <Link2 className="w-3 h-3 text-terracotta" aria-hidden />
                              <span>Connected records:</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {linked.map((l) => (
                                <a
                                  key={l.id}
                                  href={l.href}
                                  className="inline-flex items-center gap-1 rounded-lg bg-linen/70 px-2.5 py-1 text-[11px] font-medium text-slateink-dark hover:bg-terracotta/15 hover:text-terracotta-deep border border-linen-dark/50 transition-colors"
                                >
                                  <span>{l.title.length > 36 ? `${l.title.slice(0, 36)}…` : l.title}</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" aria-hidden />
                                </a>
                              ))}
                            </div>

                            <p className="text-[10px] text-slateink-light italic flex items-center gap-1 pt-0.5">
                              <Info className="w-3 h-3 text-slateink-light shrink-0" aria-hidden />
                              {e.linkDemonstrated
                                ? 'Linked directly through recorded values or explicit citations in the record.'
                                : 'Chronologically adjacent in time; not a recorded causal link.'}
                            </p>
                          </div>
                        )}
                      </div>
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
