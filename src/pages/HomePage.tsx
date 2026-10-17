import { Brain, MessageCircle, Scale, TrendingUp, ArrowRight } from 'lucide-react';
import { memoriesService, beliefsService, decisionsService } from '@/lib/services';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
  Card,
  SectionHeading,
  LoadingState,
  ErrorState,
  Badge,
  ConfidenceBar,
  StrengthMeter,
  DemoModeBanner,
} from '@/components/ui';

export function HomePage() {
  const memories = useAsyncData(() => memoriesService.list(), []);
  const beliefs = useAsyncData(() => beliefsService.listWithHistory(), []);
  const decisions = useAsyncData(() => decisionsService.list(), []);

  const loading = memories.loading || beliefs.loading || decisions.loading;
  const error = memories.error || beliefs.error || decisions.error;

  const unresolved = (decisions.data ?? []).filter((d) => d.status === 'unresolved');

  const recentMemories = (memories.data ?? []).slice(0, 3);

  const evolvingBeliefs = (beliefs.data ?? [])
    .filter((b) => b.status !== 'active')
    .slice(0, 3);

  const retryAll = () => {
    memories.reload();
    beliefs.reload();
    decisions.reload();
  };

  return (
    <div className="space-y-10">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-terracotta-deep font-medium mb-3">
          Twin Overview
        </p>
        <h1 className="font-serif text-4xl md:text-5xl font-light leading-[1.1] text-charcoal max-w-2xl">
          Meet the self you can <em className="not-italic text-terracotta-deep">examine</em>.
        </h1>
        <p className="mt-4 max-w-xl text-slateink leading-relaxed">
          Your twin reflects only what has been recorded — memories, beliefs, and open
          decisions, each traceable to its source.
        </p>
        <div className="mt-6">
          <DemoModeBanner />
        </div>
      </section>

      {loading ? (
        <LoadingState label="Gathering your evidence" />
      ) : error ? (
        <ErrorState message={error} onRetry={retryAll} />
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Brain className="w-4 h-4" />}
              label="Recorded memories"
              value={memories.data?.length ?? 0}
            />
            <StatCard
              icon={<Scale className="w-4 h-4" />}
              label="Open decisions"
              value={unresolved.length}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Beliefs in motion"
              value={evolvingBeliefs.length}
            />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section aria-labelledby="recent-memories">
              <SectionHeading
                eyebrow="Latest evidence"
                title="Recent memories"
                action={
                  <a
                    href="/memories"
                    className="inline-flex items-center gap-1 text-sm text-terracotta-deep hover:text-terracotta-dark font-medium"
                  >
                    All memories <ArrowRight className="w-4 h-4" aria-hidden />
                  </a>
                }
              />
              <div className="space-y-4">
                {recentMemories.map((m) => (
                  <Card key={m.id}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-serif text-lg leading-snug text-charcoal">{m.title}</h3>
                      <Badge tone="terracotta">{m.category.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-sm text-slateink leading-relaxed line-clamp-2">{m.content}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-slateink-light">
                        {new Date(m.occurred_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                      <ConfidenceBar value={m.confidence} />
                    </div>
                  </Card>
                ))}
                {recentMemories.length === 0 && (
                  <Card>
                    <p className="text-sm text-slateink">No memories recorded yet.</p>
                  </Card>
                )}
              </div>
            </section>

            <section aria-labelledby="open-decisions">
              <SectionHeading
                eyebrow="Unresolved"
                title="Decisions waiting"
                action={
                  <a
                    href="/decisions"
                    className="inline-flex items-center gap-1 text-sm text-terracotta-deep hover:text-terracotta-dark font-medium"
                  >
                    Decision Mirror <ArrowRight className="w-4 h-4" aria-hidden />
                  </a>
                }
              />
              <div className="space-y-4">
                {unresolved.slice(0, 3).map((d) => (
                  <Card key={d.id}>
                    <h3 className="font-serif text-lg leading-snug text-charcoal mb-1.5">{d.title}</h3>
                    <p className="text-sm text-slateink leading-relaxed line-clamp-2">{d.context}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="amber">{d.options.length} options</Badge>
                      <span className="text-xs text-slateink-light">
                        open since{' '}
                        {new Date(d.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </Card>
                ))}
                {unresolved.length === 0 && (
                  <Card>
                    <p className="text-sm text-slateink">No open decisions. Enjoy the quiet.</p>
                  </Card>
                )}
              </div>
            </section>
          </div>

          <section aria-labelledby="belief-evolution">
            <SectionHeading
              eyebrow="Evolution"
              title="Beliefs and priorities in motion"
              action={
                <a
                  href="/beliefs"
                  className="inline-flex items-center gap-1 text-sm text-terracotta-deep hover:text-terracotta-dark font-medium"
                >
                  Beliefs &amp; Values <ArrowRight className="w-4 h-4" aria-hidden />
                </a>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {evolvingBeliefs.map((b) => (
                <Card key={b.id}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge tone={b.status === 'evolving' ? 'sage' : 'clay'}>{b.status}</Badge>
                    <span className="text-[11px] uppercase tracking-wide text-slateink-light">
                      {b.kind}
                    </span>
                  </div>
                  <p className="font-serif text-[1.05rem] leading-snug text-charcoal mb-3">
                    “{b.statement}”
                  </p>
                  <StrengthMeter value={b.strength} />
                  {b.history && b.history.length > 1 && (
                    <p className="mt-3 text-xs text-slateink-light">
                      Shifted from {b.history[0].strength} to {b.history[b.history.length - 1].strength} over{' '}
                      {b.history.length} reflections.
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section className="card-surface p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-linen-light">
            <div>
              <h3 className="font-serif text-xl text-charcoal mb-1">Talk it through</h3>
              <p className="text-sm text-slateink max-w-md leading-relaxed">
                Ask your twin to weigh a choice against your recorded evidence — not opinion,
                only what you've logged.
              </p>
            </div>
            <a
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
            >
              <MessageCircle className="w-4 h-4" aria-hidden />
              Open Twin Chat
            </a>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="card-surface px-5 py-4 flex items-center gap-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta/12 text-terracotta-deep">
        {icon}
      </span>
      <div>
        <p className="font-serif text-2xl text-charcoal leading-none">{value}</p>
        <p className="text-xs text-slateink mt-1">{label}</p>
      </div>
    </div>
  );
}
