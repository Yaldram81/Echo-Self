import { supabase } from './supabaseClient';
import { beliefsService, decisionsService, memoriesService, relationshipsService } from './services';
import type {
  Belief,
  Decision,
  InsightCategory,
  InsightInput,
  InsightItem,
  InsightStatus,
  Memory,
} from './types';

const INSIGHTS_CACHE_PREFIX = 'echoself:insights_cache:';

// Per-user in-memory fallback cache to isolate demo and authenticated contexts in Node or offline
const userCacheMap = new Map<string, InsightItem[]>();

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function getCacheKey(userId: string | null): string {
  return `${INSIGHTS_CACHE_PREFIX}${userId ?? 'demo'}`;
}

function getCachedInsights(userId: string | null): InsightItem[] {
  const key = getCacheKey(userId);
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return userCacheMap.get(key) ?? [];
}

function setCachedInsights(userId: string | null, items: InsightItem[]) {
  const key = getCacheKey(userId);
  userCacheMap.set(key, items);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {}
  }
}

export const insightService = {
  /**
   * List all stored insights for the authenticated user (or demo context).
   */
  async list(statusFilter?: InsightStatus): Promise<InsightItem[]> {
    const userId = await getCurrentUserId();
    try {
      let query = supabase.from('insights').select('*').order('generated_at', { ascending: false });
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await query;
      if (!error && data) {
        const items = data as InsightItem[];
        setCachedInsights(userId, items);
        return items;
      }
    } catch {
      // Fall through to cache
    }

    const cached = getCachedInsights(userId);
    return statusFilter ? cached.filter((i) => i.status === statusFilter) : cached;
  },

  /**
   * Retrieve a single insight by ID.
   */
  async get(id: string): Promise<InsightItem | null> {
    const userId = await getCurrentUserId();
    try {
      let query = supabase.from('insights').select('*').eq('id', id);
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) return data as InsightItem;
    } catch {}
    const cached = getCachedInsights(userId);
    return cached.find((i) => i.id === id) ?? null;
  },

  /**
   * Confirm an insight as a pattern that resonates with the user.
   */
  async confirm(id: string): Promise<InsightItem> {
    const userId = await getCurrentUserId();
    const patch = {
      status: 'confirmed' as const,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase.from('insights').update(patch).eq('id', id).select().maybeSingle();
      if (!error && data) {
        const item = data as InsightItem;
        const cached = getCachedInsights(userId).map((i) => (i.id === id ? item : i));
        setCachedInsights(userId, cached);
        return item;
      }
    } catch {}

    const cached = getCachedInsights(userId);
    const idx = cached.findIndex((i) => i.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...patch };
      setCachedInsights(userId, cached);
      return cached[idx];
    }
    throw new Error('Insight not found');
  },

  /**
   * Dismiss an insight suggestion.
   * Dismissed items remain archived so the engine does not regenerate the same insight unchanged.
   */
  async dismiss(id: string): Promise<InsightItem> {
    const userId = await getCurrentUserId();
    const patch = {
      status: 'dismissed' as const,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase.from('insights').update(patch).eq('id', id).select().maybeSingle();
      if (!error && data) {
        const item = data as InsightItem;
        const cached = getCachedInsights(userId).map((i) => (i.id === id ? item : i));
        setCachedInsights(userId, cached);
        return item;
      }
    } catch {}

    const cached = getCachedInsights(userId);
    const idx = cached.findIndex((i) => i.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...patch };
      setCachedInsights(userId, cached);
      return cached[idx];
    }
    throw new Error('Insight not found');
  },

  /**
   * Correct an insight in the user's own words.
   */
  async correct(id: string, userCorrection: string): Promise<InsightItem> {
    const userId = await getCurrentUserId();
    const patch = {
      user_correction: userCorrection.trim(),
      status: 'confirmed' as const,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase.from('insights').update(patch).eq('id', id).select().maybeSingle();
      if (!error && data) {
        const item = data as InsightItem;
        const cached = getCachedInsights(userId).map((i) => (i.id === id ? item : i));
        setCachedInsights(userId, cached);
        return item;
      }
    } catch {}

    const cached = getCachedInsights(userId);
    const idx = cached.findIndex((i) => i.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...patch };
      setCachedInsights(userId, cached);
      return cached[idx];
    }
    throw new Error('Insight not found');
  },

  /**
   * Revisit a confirmed or dismissed insight (return to candidate review).
   */
  async revisit(id: string): Promise<InsightItem> {
    const userId = await getCurrentUserId();
    const patch = {
      status: 'candidate' as const,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase.from('insights').update(patch).eq('id', id).select().maybeSingle();
      if (!error && data) {
        const item = data as InsightItem;
        const cached = getCachedInsights(userId).map((i) => (i.id === id ? item : i));
        setCachedInsights(userId, cached);
        return item;
      }
    } catch {}

    const cached = getCachedInsights(userId);
    const idx = cached.findIndex((i) => i.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...patch };
      setCachedInsights(userId, cached);
      return cached[idx];
    }
    throw new Error('Insight not found');
  },

  /**
   * Explicitly promote a confirmed insight into a permanent belief in Beliefs & Values.
   */
  async promoteToBelief(insightId: string): Promise<{ insight: InsightItem; beliefId: string }> {
    const userId = await getCurrentUserId();
    const insight = await this.get(insightId);
    if (!insight) throw new Error('Insight not found');

    const statementToUse = insight.user_correction?.trim() || insight.statement;
    const { data: newBelief, error } = await supabase
      .from('beliefs')
      .insert({
        statement: statementToUse,
        description: `Promoted from insight: "${insight.title}". ${insight.reasoning}`,
        kind: insight.category === 'value_alignment' ? 'value' : 'belief',
        category: 'personal_growth',
        strength: 75,
        status: 'active',
        origin: 'confirmed_suggestion',
        last_reviewed: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error || !newBelief) {
      throw new Error(error?.message || 'Failed to create belief from insight');
    }

    // Link promoted_belief_id on the insight
    const patch = {
      promoted_belief_id: newBelief.id,
      updated_at: new Date().toISOString(),
    };
    try {
      await supabase.from('insights').update(patch).eq('id', insightId);
    } catch {}

    const updatedInsight: InsightItem = { ...insight, ...patch };
    const cached = getCachedInsights(userId).map((i) => (i.id === insightId ? updatedInsight : i));
    setCachedInsights(userId, cached);

    return { insight: updatedInsight, beliefId: newBelief.id };
  },

  /**
   * Synthesize evidence-grounded insights from the user's authentic records.
   * If existing candidate insights exist and forceRefresh is false, returns cached items.
   */
  async generateOrRefresh(forceRefresh = false): Promise<{
    items: InsightItem[];
    insights: InsightItem[];
    sparseData: boolean;
    scopeSummary: string;
    dataSummary: { memories: number; beliefs: number; decisions: number };
  }> {
    const userId = await getCurrentUserId();
    const [allMemories, allBeliefs, allDecisions, existingInsights] = await Promise.all([
      memoriesService.list().catch(() => [] as Memory[]),
      beliefsService.listWithHistory().catch(() => [] as Belief[]),
      decisionsService.list().catch(() => [] as Decision[]),
      this.list().catch(() => [] as InsightItem[]),
    ]);

    // Scope records to current user (or demo persona if unauthenticated)
    const memories = userId
      ? allMemories.filter((m) => m.user_id === userId)
      : allMemories.filter((m) => !m.user_id);
    const beliefs = userId
      ? allBeliefs.filter((b) => b.user_id === userId)
      : allBeliefs.filter((b) => !b.user_id);
    const decisions = userId
      ? allDecisions.filter((d) => d.user_id === userId)
      : allDecisions.filter((d) => !d.user_id);

    const dataSummary = {
      memories: memories.length,
      beliefs: beliefs.length,
      decisions: decisions.length,
    };

    const isSparse = memories.length < 2 && decisions.length === 0;
    const scopeSummary = isSparse
      ? `Examining ${memories.length} memories, ${decisions.length} decisions (Data limited)`
      : `Examining ${memories.length} memories, ${decisions.length} decisions, ${beliefs.length} beliefs`;

    // Data sparsity check: an evidence-grounded system requires genuine records
    if (isSparse) {
      return {
        items: existingInsights,
        insights: existingInsights,
        sparseData: true,
        scopeSummary,
        dataSummary,
      };
    }

    // If we already have stored insights and refresh is not forced, return current set
    if (!forceRefresh && existingInsights.length > 0) {
      return {
        items: existingInsights,
        insights: existingInsights,
        sparseData: false,
        scopeSummary,
        dataSummary,
      };
    }

    // Existing active/dismissed statements set to avoid duplicate generation
    const existingTitles = new Set(existingInsights.map((i) => i.title.toLowerCase().trim()));

    const generatedInputs: InsightInput[] = [];

    // =========================================================================
    // 1. RECURRING THEMES IN RECORDED EXPERIENCES
    // =========================================================================
    // Group memories by category
    const catMap = new Map<string, Memory[]>();
    for (const m of memories) {
      const list = catMap.get(m.category) ?? [];
      list.push(m);
      catMap.set(m.category, list);
    }

    for (const [category, mems] of catMap.entries()) {
      // Find theme keywords mentioned in >= 2 memories
      const wordsMap = new Map<string, string[]>();
      for (const m of mems) {
        const textWords = `${m.title} ${m.content} ${m.tags.join(' ')}`
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 4 && !['about', 'after', 'before', 'their', 'which', 'would', 'could', 'should'].includes(w));
        const uniqueWords = Array.from(new Set(textWords));
        for (const w of uniqueWords) {
          const ids = wordsMap.get(w) ?? [];
          ids.push(m.id);
          wordsMap.set(w, ids);
        }
      }

      for (const [word, matchingIds] of wordsMap.entries()) {
        if (matchingIds.length >= 2) {
          const title = `Recurring focus on "${word}" in ${category} experiences`;
          if (!existingTitles.has(title.toLowerCase())) {
            // Check for potential counterevidence (memories in same category with difficult mood vs positive)
            const supporting = mems.filter((m) => matchingIds.includes(m.id));
            const positiveCount = supporting.filter((m) => m.mood === 'positive').length;
            const mixedDifficult = supporting.filter((m) => m.mood === 'difficult' || m.mood === 'mixed');
            const hasConflict = positiveCount > 0 && mixedDifficult.length > 0;

            const evidenceQuality = hasConflict
              ? 'conflicting_evidence'
              : matchingIds.length >= 3
                ? 'multiple_examples'
                : 'multiple_examples';

            generatedInputs.push({
              category: 'recurring_theme',
              title,
              statement: `You frequently reflect on "${word}" across multiple ${category} experiences (${matchingIds.length} recorded instances).`,
              scope_label: `${category.charAt(0).toUpperCase() + category.slice(1)} records`,
              evidence_quality: evidenceQuality,
              evidence_coverage: `${matchingIds.length} of ${mems.length} recorded ${category} experiences`,
              supporting_memory_ids: matchingIds,
              counter_memory_ids: hasConflict ? mixedDifficult.map((m) => m.id) : [],
              reasoning: `Found repeated references to "${word}" across records: ${supporting.map((s) => `"${s.title}"`).join(', ')}. ${hasConflict ? 'However, conflicting emotional outcomes exist across these moments.' : 'All recorded instances point consistently to this topic.'}`,
              uncertainty_notes: matchingIds.length < 3 ? 'Based on 2 examples; consider if this represents an enduring focus or a temporary phase.' : null,
            });
            existingTitles.add(title.toLowerCase());
          }
        }
      }
    }

    // =========================================================================
    // 2. REPEATED DECISION APPROACHES & REFLECTIONS
    // =========================================================================
    if (decisions.length > 0) {
      const decidedWithReflection = decisions.filter((d) => d.status === 'decided' && d.reflection);
      if (decidedWithReflection.length >= 1) {
        const primaryDomain = decidedWithReflection[0].values?.[0] || 'deliberation';
        const title = `Deliberation pattern: structured value evaluation in ${primaryDomain}`;
        if (!existingTitles.has(title.toLowerCase())) {
          generatedInputs.push({
            category: 'decision_approach',
            title,
            statement: `When making pivotal choices in ${primaryDomain}, you prioritize explicit value comparisons and documented reflections.`,
            scope_label: 'Decisions Mirror',
            evidence_quality: decidedWithReflection.length >= 2 ? 'multiple_examples' : 'single_example',
            evidence_coverage: `${decidedWithReflection.length} decided deliberations`,
            related_decision_ids: decidedWithReflection.map((d) => d.id),
            reasoning: (() => {
              const reflText = typeof decidedWithReflection[0].reflection === 'object'
                ? (decidedWithReflection[0].reflection as any)?.whatHappened || ''
                : String(decidedWithReflection[0].reflection || '');
              return `Documented decisions like "${decidedWithReflection[0].title}" demonstrate an explicit scoring framework rather than intuitive impulse. Post-decision reflection: "${reflText.slice(0, 120)}..."`;
            })(),
            uncertainty_notes: decidedWithReflection.length < 2 ? 'Deliberation sample size is currently limited to 1 resolved decision.' : null,
          });
          existingTitles.add(title.toLowerCase());
        }
      }
    }

    // =========================================================================
    // 3. BELIEF EVOLUTION OVER TIME
    // =========================================================================
    for (const b of beliefs) {
      const historyList = b.history || [];
      if (historyList.length > 0) {
        const title = `Evolution of principle: "${b.statement.slice(0, 48)}…"`;
        if (!existingTitles.has(title.toLowerCase())) {
          const earliest = historyList[0];
          generatedInputs.push({
            category: 'belief_evolution',
            title,
            statement: `Your stance on this principle has shifted from previous revisions to its current formulation.`,
            scope_label: 'Beliefs & Values history',
            evidence_quality: 'multiple_examples',
            evidence_coverage: `${historyList.length + 1} recorded revisions over time`,
            related_belief_ids: [b.id],
            reasoning: `Recorded principle: "${b.statement}". Strength transitioned from ${earliest.strength}% to ${b.strength}%. Historical reflection note: "${earliest.note || 'Initial formulation'}"`,
            uncertainty_notes: 'Shifts in stated principles reflect intentional updates rather than inconsistent behavior.',
          });
          existingTitles.add(title.toLowerCase());
        }
      }
    }

    // =========================================================================
    // 4. REPEATED OBSTACLES OR CONCERNS
    // =========================================================================
    const difficultMemories = memories.filter((m) => m.mood === 'difficult');
    if (difficultMemories.length >= 2) {
      const title = `Friction points in ${difficultMemories[0].category} context`;
      if (!existingTitles.has(title.toLowerCase())) {
        generatedInputs.push({
          category: 'repeated_obstacle',
          title,
          statement: `Multiple experiences in ${difficultMemories[0].category} have been recorded with difficult emotional valence or friction.`,
          scope_label: 'Difficult recorded moments',
          evidence_quality: 'multiple_examples',
          evidence_coverage: `${difficultMemories.length} difficult memories`,
          supporting_memory_ids: difficultMemories.map((m) => m.id),
          reasoning: `Records include: ${difficultMemories.map((m) => `"${m.title}"`).join(', ')}. Examining common precursors may clarify recurring stressors.`,
          uncertainty_notes: 'Emotional categorization is subjective; review whether external circumstance or personal friction caused the difficulty.',
        });
        existingTitles.add(title.toLowerCase());
      }
    }

    // Persist newly synthesized candidates
    const savedInsights: InsightItem[] = [];
    for (const inp of generatedInputs) {
      try {
        const { data, error } = await supabase
          .from('insights')
          .insert({
            category: inp.category,
            title: inp.title,
            statement: inp.statement,
            scope_label: inp.scope_label || 'All recorded history',
            evidence_quality: inp.evidence_quality,
            evidence_coverage: inp.evidence_coverage,
            status: 'candidate',
            supporting_memory_ids: inp.supporting_memory_ids || [],
            counter_memory_ids: inp.counter_memory_ids || [],
            related_decision_ids: inp.related_decision_ids || [],
            related_belief_ids: inp.related_belief_ids || [],
            reasoning: inp.reasoning,
            uncertainty_notes: inp.uncertainty_notes || null,
            generated_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (!error && data) {
          savedInsights.push(data as InsightItem);
        } else {
          // Local fallback
          savedInsights.push({
            id: `local-ins-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            status: 'candidate',
            scope_label: inp.scope_label || 'All recorded history',
            evidence_coverage: inp.evidence_coverage || 'Recorded experiences',
            supporting_memory_ids: inp.supporting_memory_ids || [],
            counter_memory_ids: inp.counter_memory_ids || [],
            related_decision_ids: inp.related_decision_ids || [],
            related_belief_ids: inp.related_belief_ids || [],
            generated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...inp,
          });
        }
      } catch {
        savedInsights.push({
          id: `local-ins-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          status: 'candidate',
          scope_label: inp.scope_label || 'All recorded history',
          evidence_coverage: inp.evidence_coverage || 'Recorded experiences',
          supporting_memory_ids: inp.supporting_memory_ids || [],
          counter_memory_ids: inp.counter_memory_ids || [],
          related_decision_ids: inp.related_decision_ids || [],
          related_belief_ids: inp.related_belief_ids || [],
          generated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...inp,
        });
      }
    }

    const merged = [...savedInsights, ...existingInsights];
    setCachedInsights(userId, merged);

    return {
      items: merged,
      insights: merged,
      sparseData: false,
      scopeSummary,
      dataSummary,
    };
  },
};
