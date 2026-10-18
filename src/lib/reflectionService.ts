import { supabase } from './supabaseClient';
import {
  memoriesService,
  decisionsService,
  beliefsService,
  timelineService,
} from './services';
import { insightService } from './insightService';
import type {
  Belief,
  Decision,
  Memory,
  PeriodSummary,
  PeriodType,
  ProposedBeliefUpdate,
  ReflectionInput,
  ReflectionItem,
  ReflectionPrompt,
} from './types';

const REFLECTIONS_CACHE_PREFIX = 'echoself:reflections_cache:';
const userCacheMap = new Map<string, ReflectionItem[]>();

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function getCacheKey(userId: string | null): string {
  return `${REFLECTIONS_CACHE_PREFIX}${userId ?? 'demo'}`;
}

function getCachedReflections(userId: string | null): ReflectionItem[] {
  const key = getCacheKey(userId);
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return userCacheMap.get(key) ?? [];
}

function setCachedReflections(userId: string | null, items: ReflectionItem[]) {
  const key = getCacheKey(userId);
  userCacheMap.set(key, items);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {}
  }
}

// In-flight save locks to prevent double-clicks or concurrent network race conditions
const pendingSaveLocks = new Set<string>();

export const reflectionService = {
  /**
   * Calculate standard ISO week boundaries (Monday 00:00:00 to Sunday 23:59:59).
   * Correctly handles month and year boundary crossings.
   */
  getWeekBoundaries(referenceDate: Date | string = new Date()): {
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
  } {
    const d = new Date(referenceDate);
    // Standardize to Monday as start of week
    const day = d.getDay();
    // In JS: 0 is Sunday, 1 is Monday... 6 is Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const periodStart = monday.toISOString();
    const periodEnd = sunday.toISOString();
    const periodLabel = this.formatPeriodLabel(periodStart, periodEnd);

    return { periodStart, periodEnd, periodLabel };
  },

  /**
   * Formats a human-readable period label respecting month and year boundaries.
   * e.g., "Oct 13 – Oct 19, 2026" or "Dec 28, 2026 – Jan 3, 2027"
   */
  formatPeriodLabel(periodStart: string, periodEnd: string): string {
    const s = new Date(periodStart);
    const e = new Date(periodEnd);

    const startMonth = s.toLocaleDateString(undefined, { month: 'short' });
    const startDay = s.getDate();
    const startYear = s.getFullYear();

    const endMonth = e.toLocaleDateString(undefined, { month: 'short' });
    const endDay = e.getDate();
    const endYear = e.getFullYear();

    if (startYear !== endYear) {
      return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
    }
    if (startMonth !== endMonth) {
      return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
    }
    return `${startMonth} ${startDay} – ${endDay}, ${startYear}`;
  },

  /**
   * Calculate previous or next week boundaries offset by N weeks.
   */
  getAdjacentWeek(periodStart: string, offsetWeeks: number): {
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
  } {
    const currentMonday = new Date(periodStart);
    currentMonday.setDate(currentMonday.getDate() + offsetWeeks * 7);
    return this.getWeekBoundaries(currentMonday);
  },

  /**
   * Aggregate authentic records created, resolved, or evolved within the chosen period.
   * Scopes strictly to current authenticated user (or demo persona if unauthenticated).
   */
  async summarizePeriod(periodStart: string, periodEnd: string): Promise<PeriodSummary> {
    const userId = await getCurrentUserId();
    const startTime = new Date(periodStart).getTime();
    const endTime = new Date(periodEnd).getTime();

    const [allMemories, allDecisions, allBeliefs, allInsights] = await Promise.all([
      memoriesService.list().catch(() => [] as Memory[]),
      decisionsService.list().catch(() => [] as Decision[]),
      beliefsService.listWithHistory().catch(() => [] as Belief[]),
      insightService.list().catch(() => []),
    ]);

    // Scope to user
    const memories = (userId
      ? allMemories.filter((m) => m.user_id === userId)
      : allMemories.filter((m) => !m.user_id)
    ).filter((m) => {
      const t = new Date(m.occurred_at || m.created_at).getTime();
      return t >= startTime && t <= endTime;
    });

    const userDecisions = userId
      ? allDecisions.filter((d) => d.user_id === userId)
      : allDecisions.filter((d) => !d.user_id);

    // Period decisions: created in period, or decided in period, or reflected upon in period
    const periodDecisions = userDecisions.filter((d) => {
      const createdT = new Date(d.created_at).getTime();
      const decidedT = d.decided_at ? new Date(d.decided_at).getTime() : 0;
      const reflectedT = d.reflected_at ? new Date(d.reflected_at).getTime() : 0;
      return (
        (createdT >= startTime && createdT <= endTime) ||
        (decidedT >= startTime && decidedT <= endTime) ||
        (reflectedT >= startTime && reflectedT <= endTime)
      );
    });

    const unresolvedDecisions = userDecisions.filter((d) => d.status === 'unresolved');

    // Beliefs changed in period (via history or last_reflected_at)
    const periodBeliefs = (userId
      ? allBeliefs.filter((b) => b.user_id === userId)
      : allBeliefs.filter((b) => !b.user_id)
    ).filter((b) => {
      const historyInPeriod = (b.history || []).some((h) => {
        const t = new Date(h.recorded_at).getTime();
        return t >= startTime && t <= endTime;
      });
      const lastT = b.last_reflected_at ? new Date(b.last_reflected_at).getTime() : 0;
      return historyInPeriod || (lastT >= startTime && lastT <= endTime);
    });

    // Insights confirmed in period
    const periodInsights = allInsights.filter((i) => {
      const t = new Date(i.reviewed_at || i.generated_at).getTime();
      return i.status === 'confirmed' && t >= startTime && t <= endTime;
    });

    const isEmpty =
      memories.length === 0 &&
      periodDecisions.length === 0 &&
      periodBeliefs.length === 0 &&
      periodInsights.length === 0;

    return {
      periodStart,
      periodEnd,
      periodLabel: this.formatPeriodLabel(periodStart, periodEnd),
      memories,
      decisions: periodDecisions,
      beliefs: periodBeliefs,
      insights: periodInsights,
      unresolvedDecisions,
      isEmpty,
    };
  },

  /**
   * Generate evidence-grounded reflection prompts based on the actual records in the period.
   * If records are absent, provides clean, quiet personal prompts without fabricating motives.
   */
  generatePrompts(summary: PeriodSummary): ReflectionPrompt[] {
    const prompts: ReflectionPrompt[] = [];

    // 1. Memory-grounded prompt
    if (summary.memories.length > 0) {
      const sortedByImportance = [...summary.memories].sort(
        (a, b) => (b.user_importance ?? 0) - (a.user_importance ?? 0)
      );
      const topMemory = sortedByImportance[0];

      prompts.push({
        id: `prompt-mem-${topMemory.id}`,
        question: `What made "${topMemory.title}" stand out to you this week?`,
        rationale: `Recorded in ${topMemory.category} with mood "${topMemory.mood}".`,
        sourceType: 'memory',
        sourceId: topMemory.id,
        sourceTitle: topMemory.title,
        sourceUrl: `/memory/${topMemory.id}`,
      });

      // Difficult mood memory prompt if present
      const difficultMem = summary.memories.find((m) => m.mood === 'difficult');
      if (difficultMem && difficultMem.id !== topMemory.id) {
        prompts.push({
          id: `prompt-diff-${difficultMem.id}`,
          question: `You noted friction in "${difficultMem.title}". Looking back, what was the primary cause or lesson?`,
          rationale: `Recorded as a difficult emotional experience in ${difficultMem.category}.`,
          sourceType: 'memory',
          sourceId: difficultMem.id,
          sourceTitle: difficultMem.title,
          sourceUrl: `/memory/${difficultMem.id}`,
        });
      }
    }

    // 2. Decision-grounded prompt
    if (summary.decisions.length > 0) {
      const decidedWithReflection = summary.decisions.find((d) => d.status === 'decided' && d.reflection);
      if (decidedWithReflection) {
        prompts.push({
          id: `prompt-dec-refl-${decidedWithReflection.id}`,
          question: `You resolved "${decidedWithReflection.title}" with chosen option "${decidedWithReflection.chosen_option}". Did the outcome align with your original reasoning?`,
          rationale: 'Recorded resolution with outcome reflection in Decision Mirror.',
          sourceType: 'decision',
          sourceId: decidedWithReflection.id,
          sourceTitle: decidedWithReflection.title,
          sourceUrl: `/decision/${decidedWithReflection.id}`,
        });
      }
    }

    // 3. Unresolved decision prompt
    if (summary.unresolvedDecisions.length > 0) {
      const unresolved = summary.unresolvedDecisions[0];
      prompts.push({
        id: `prompt-dec-unres-${unresolved.id}`,
        question: `Deliberation on "${unresolved.title}" remains unresolved. What missing information or clarity would help you move forward?`,
        rationale: 'Open deliberation in Decision Mirror.',
        sourceType: 'decision',
        sourceId: unresolved.id,
        sourceTitle: unresolved.title,
        sourceUrl: `/decision/${unresolved.id}`,
      });
    }

    // 4. Belief evolution prompt
    if (summary.beliefs.length > 0) {
      const b = summary.beliefs[0];
      prompts.push({
        id: `prompt-belief-${b.id}`,
        question: `Your recorded stance on "${b.statement}" was updated during this period. What experience influenced this shift?`,
        rationale: 'Audited update in Beliefs & Values.',
        sourceType: 'belief',
        sourceId: b.id,
        sourceTitle: b.statement,
        sourceUrl: '/beliefs',
      });
    }

    // 5. Grounded synthesis fallback prompts
    if (prompts.length < 3) {
      prompts.push({
        id: 'prompt-priority',
        question: 'Which of your stated priorities or values mattered most in practice this week?',
        rationale: 'Examines practical alignment between choices and values.',
        sourceType: 'general',
      });
      prompts.push({
        id: 'prompt-lesson',
        question: 'Is there an insight, boundary, or lesson from this period you want your future self to remember?',
        rationale: 'Helps translate immediate experiences into lasting personal understanding.',
        sourceType: 'general',
      });
    }

    return prompts.slice(0, 4);
  },

  /**
   * List saved reflections for the current authenticated user.
   */
  async list(): Promise<ReflectionItem[]> {
    const userId = await getCurrentUserId();
    try {
      const { data, error } = await supabase
        .from('reflections')
        .select('*')
        .order('period_start', { ascending: false });

      if (!error && data) {
        const items = data as ReflectionItem[];
        setCachedReflections(userId, items);
        return items;
      }
    } catch {
      // Fall through to cache
    }
    return getCachedReflections(userId);
  },

  /**
   * Retrieve an existing reflection by period boundaries.
   */
  async getByPeriod(periodStart: string, periodEnd: string): Promise<ReflectionItem | null> {
    const userId = await getCurrentUserId();
    try {
      const { data, error } = await supabase
        .from('reflections')
        .select('*')
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle();

      if (!error && data) return data as ReflectionItem;
    } catch {}

    const cached = getCachedReflections(userId);
    return (
      cached.find(
        (r) =>
          new Date(r.period_start).getTime() === new Date(periodStart).getTime() &&
          new Date(r.period_end).getTime() === new Date(periodEnd).getTime()
      ) ?? null
    );
  },

  /**
   * Save or update a reflection.
   * Guarantees idempotency via lock set and unique constraint on (user_id, period_start, period_end).
   * Automatically creates a timeline milestone event upon successful save.
   */
  async save(input: ReflectionInput): Promise<ReflectionItem> {
    const userId = await getCurrentUserId();
    const lockKey = `${userId || 'demo'}:${input.period_start}:${input.period_end}`;

    // Prevent double clicks
    if (pendingSaveLocks.has(lockKey)) {
      throw new Error('A save for this period is already in progress.');
    }
    pendingSaveLocks.add(lockKey);

    try {
      if (!input.content?.trim() && Object.keys(input.guided_answers || {}).length === 0) {
        throw new Error('Please write a reflection or answer at least one guided question.');
      }

      const periodLabel = this.formatPeriodLabel(input.period_start, input.period_end);
      const titleToUse = input.title?.trim() || `Weekly Review: ${periodLabel}`;

      const rowToUpsert = {
        period_start: input.period_start,
        period_end: input.period_end,
        period_type: (input.period_type || 'weekly') as PeriodType,
        title: titleToUse,
        content: input.content.trim(),
        guided_answers: input.guided_answers || {},
        summary: input.summary || null,
        memory_ids: input.memory_ids || [],
        decision_ids: input.decision_ids || [],
        belief_ids: input.belief_ids || [],
        proposed_belief_update: input.proposed_belief_update || null,
        status: input.status || 'saved',
        updated_at: new Date().toISOString(),
      };

      let savedItem: ReflectionItem | null = null;

      try {
        const { data, error } = await supabase
          .from('reflections')
          .upsert(rowToUpsert, { onConflict: 'user_id,period_start,period_end' })
          .select()
          .maybeSingle();

        if (!error && data) {
          savedItem = data as ReflectionItem;
        }
      } catch {
        // Fall back to local cache persistence
      }

      const cached = getCachedReflections(userId);
      const existingIdx = cached.findIndex(
        (r) =>
          new Date(r.period_start).getTime() === new Date(input.period_start).getTime() &&
          new Date(r.period_end).getTime() === new Date(input.period_end).getTime()
      );

      if (!savedItem) {
        if (existingIdx !== -1) {
          savedItem = {
            ...cached[existingIdx],
            ...rowToUpsert,
            id: cached[existingIdx].id,
            updated_at: new Date().toISOString(),
          };
          cached[existingIdx] = savedItem;
        } else {
          savedItem = {
            id: `local-refl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            user_id: userId,
            created_at: new Date().toISOString(),
            ...rowToUpsert,
          };
          cached.unshift(savedItem);
        }
      } else {
        if (existingIdx !== -1) {
          cached[existingIdx] = savedItem;
        } else {
          cached.unshift(savedItem);
        }
      }
      setCachedReflections(userId, cached);

      // Create a timeline milestone event (fire-and-forget; must not fail user's reflection save)
      try {
        await timelineService.create({
          title: `Weekly Review: ${periodLabel}`,
          description: input.content.slice(0, 180) + (input.content.length > 180 ? '…' : ''),
          event_type: 'milestone',
          importance: 'high',
          occurred_at: input.period_end,
        });
      } catch {
        // Timeline integration failure does not block reflection save
      }

      return savedItem;
    } finally {
      pendingSaveLocks.delete(lockKey);
    }
  },

  /**
   * Propose a belief or value update from a reflection lesson.
   * Creates a pending suggestion with origin: 'suggestion' through the human approval workflow.
   * Does NOT silently overwrite existing beliefs.
   */
  async proposeBeliefFromReflection(
    reflectionId: string,
    proposal: ProposedBeliefUpdate
  ): Promise<{ beliefId: string }> {
    if (!proposal.statement?.trim()) {
      throw new Error('Proposed belief statement cannot be empty.');
    }

    const { data, error } = await supabase
      .from('beliefs')
      .insert({
        statement: proposal.statement.trim(),
        description: `Proposed from Weekly Review. Rationale: ${proposal.rationale || 'Captured during periodic reflection.'}`,
        kind: proposal.kind || 'belief',
        category: 'personal_growth',
        strength: 70,
        status: 'evolving',
        origin: 'suggestion',
        last_reviewed: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to submit proposed belief');
    }

    // Attach proposal reference to reflection
    try {
      await supabase
        .from('reflections')
        .update({
          proposed_belief_update: proposal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reflectionId);
    } catch {}

    return { beliefId: data.id };
  },

  /**
   * Delete a reflection.
   */
  async remove(id: string): Promise<void> {
    const userId = await getCurrentUserId();
    try {
      await supabase.from('reflections').delete().eq('id', id);
    } catch {}

    const cached = getCachedReflections(userId).filter((r) => r.id !== id);
    setCachedReflections(userId, cached);
  },
};
