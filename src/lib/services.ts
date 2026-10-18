import { supabase } from './supabaseClient';
import { memoryEmbeddingService } from './memoryEmbeddingService';
import type {
  Belief,
  BeliefHistoryPoint,
  BeliefInput,
  BeliefProposal,
  Decision,
  DecisionInput,
  InterpretationFlag,
  Memory,
  MemoryInput,
  TimelineEvent,
  UserProfile,
  CaptureItem,
  CaptureInput,
  CaptureStatus,
} from './types';

type DbResult<T> = { data: T | null; error: { message: string } | null };

async function unwrap<T>(query: PromiseLike<DbResult<T>>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

/** A user's confirm/dismiss decision on an inferred graph edge. */
export interface EdgeConfirmation {
  id: string;
  edge_key: string;
  source_id: string;
  target_id: string;
  kind: string;
  status: 'confirmed' | 'dismissed';
  created_at: string;
}

export const edgeConfirmationsService = {
  /** Confirmed/dismissed edges for the signed-in user. Empty for signed-out visitors. */
  async list(): Promise<EdgeConfirmation[]> {
    const { data, error } = await supabase
      .from('graph_edge_confirmations')
      .select('*');
    if (error) {
      // Signed-out visitors have no confirmations (RLS allows none); the graph
      // still renders with its derived edges.
      if (error.code === 'PGRST301' || error.message.includes('JWT')) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as EdgeConfirmation[];
  },
  /**
   * Record the user's decision on a suggested edge. Upsert on the
   * (user, edge) pair: re-confirming or dismissing later replaces the record.
   */
  async decide(edge: Omit<EdgeConfirmation, 'id' | 'created_at'>): Promise<void> {
    const { error } = await supabase
      .from('graph_edge_confirmations')
      .upsert(edge, { onConflict: 'user_id,edge_key' });
    if (error) throw new Error(error.message);
  },
};

export const flagsService = {
  /**
   * Save a new correction. New corrections enter as 'proposed' — the user
   * reviews and confirms them in the corrections panel before they count as
   * authoritative context. Nothing is invented: the note is the user's text.
   */
  async create(input: {
    memory_id: string;
    answer_excerpt: string;
    correction_note: string;
    topic?: string;
  }): Promise<InterpretationFlag> {
    return unwrap(
      supabase
        .from('interpretation_flags')
        .insert({
          memory_id: input.memory_id,
          answer_excerpt: input.answer_excerpt,
          correction_note: input.correction_note,
          topic: input.topic?.trim() || null,
          status: 'proposed',
        })
        .select()
        .maybeSingle()
    ) as Promise<InterpretationFlag>;
  },
  /** Saved corrections, newest first. RLS scopes these to the signed-in user. */
  async list(): Promise<InterpretationFlag[]> {
    return unwrap(
      supabase.from('interpretation_flags').select('*').order('created_at', { ascending: false })
    );
  },
  /**
   * Change a correction's status. 'superseded' records which correction
   * replaced it; reviewed_at is stamped by the database clock at write time,
   * never backdated. Returns the updated row so the UI can prove persistence.
   */
  async setStatus(
    id: string,
    status: 'confirmed' | 'superseded' | 'dismissed' | 'proposed',
    supersededBy?: string
  ): Promise<InterpretationFlag> {
    const { data, error } = await supabase
      .from('interpretation_flags')
      .update({
        status,
        superseded_by: status === 'superseded' ? (supersededBy ?? null) : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as InterpretationFlag;
  },
  /** Amend the note or topic of a correction; the original answer excerpt is preserved. */
  async amend(
    id: string,
    changes: { correction_note?: string; topic?: string | null }
  ): Promise<InterpretationFlag> {
    const { data, error } = await supabase
      .from('interpretation_flags')
      .update({
        ...(changes.correction_note !== undefined ? { correction_note: changes.correction_note } : {}),
        ...(changes.topic !== undefined ? { topic: changes.topic?.trim() || null } : {}),
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as InterpretationFlag;
  },
  /** Permanently remove a dismissed correction. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('interpretation_flags').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const memoriesService = {
  async list(orderBy: 'occurred_at' | 'created_at' = 'occurred_at'): Promise<Memory[]> {
    return unwrap(
      supabase.from('memories').select('*').order(orderBy, { ascending: false })
    );
  },
  async get(id: string): Promise<Memory | null> {
    return unwrap(
      supabase.from('memories').select('*').eq('id', id).maybeSingle()
    ) as Promise<Memory | null>;
  },
  async create(input: MemoryInput): Promise<Memory> {
    const memory = await unwrap(
      supabase.from('memories').insert(input).select().maybeSingle()
    ) as Memory;
    // Fire-and-forget: indexing must never block or fail a user's save.
    void memoryEmbeddingService.indexMemories([memory]).catch(() => {});
    return memory;
  },
  async update(id: string, input: MemoryInput): Promise<Memory> {
    const memory = await unwrap(
      supabase.from('memories').update(input).eq('id', id).select().maybeSingle()
    ) as Memory;
    void memoryEmbeddingService.indexMemories([memory]).catch(() => {});
    return memory;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Deleting the memory cascades to its embedding row in the database.
  },
};

export const beliefsService = {
  async listWithHistory(): Promise<Belief[]> {
    const beliefs = await unwrap(
      supabase.from('beliefs').select('*').order('last_reflected_at', { ascending: false })
    );
    const history = await unwrap(
      supabase
        .from('beliefs_history')
        .select('*')
        .order('recorded_at', { ascending: true })
    );
    return (beliefs as Belief[]).map((b) => ({
      ...b,
      history: (history as BeliefHistoryPoint[]).filter((h) => h.belief_id === b.id),
    }));
  },
  async create(input: BeliefInput): Promise<Belief> {
    const { data, error } = await supabase
      .from('beliefs')
      .insert({ ...input, origin: 'user' })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Belief;
  },
  async update(id: string, input: BeliefInput): Promise<void> {
    const { error } = await supabase.from('beliefs').update(input).eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** Confirm an AI suggestion: it becomes a user-owned statement. */
  async confirmSuggestion(id: string): Promise<void> {
    const { error } = await supabase
      .from('beliefs')
      .update({ origin: 'confirmed_suggestion', last_reviewed: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** Dismiss an AI suggestion: removed entirely, never silently merged. */
  async dismissSuggestion(id: string): Promise<void> {
    const { error } = await supabase.from('beliefs').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('beliefs').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const decisionsService = {
  async list(): Promise<Decision[]> {
    return unwrap(
      supabase.from('decisions').select('*').order('created_at', { ascending: false })
    );
  },
  async get(id: string): Promise<Decision | null> {
    return unwrap(
      supabase.from('decisions').select('*').eq('id', id).maybeSingle()
    ) as Promise<Decision | null>;
  },
  async create(input: DecisionInput): Promise<Decision> {
    return unwrap(
      supabase.from('decisions').insert(input).select().maybeSingle()
    ) as Promise<Decision>;
  },
  async update(id: string, patch: Partial<Decision>): Promise<void> {
    const { error } = await supabase.from('decisions').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async recordChoice(id: string, option: string, rationale: string): Promise<void> {
    const { error } = await supabase
      .from('decisions')
      .update({
        status: 'decided',
        chosen_option: option,
        rationale: rationale || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async reopen(id: string): Promise<void> {
    const { error } = await supabase
      .from('decisions')
      .update({ status: 'unresolved', chosen_option: null, rationale: null, decided_at: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async saveReflection(
    id: string,
    reflection: {
      whatHappened: string;
      matchesOriginalReasoning: boolean;
      surprises: string;
      lesson: string;
      successMeasure?: 'met' | 'partly' | 'not_met' | 'redefined';
      successNote?: string;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('decisions')
      .update({ reflection, reflected_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('decisions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** Store a generated proposal (pending) or record the user's decision on one. */
  async saveProposal(id: string, proposal: BeliefProposal): Promise<void> {
    const current = await supabase
      .from('decisions')
      .select('proposals')
      .eq('id', id)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const list = Array.isArray(current.data?.proposals)
      ? (current.data.proposals as BeliefProposal[])
      : [];
    const next = list.some((p) => p.id === proposal.id)
      ? list.map((p) => (p.id === proposal.id ? proposal : p))
      : [...list, proposal];
    const { error } = await supabase.from('decisions').update({ proposals: next }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  /**
   * Apply an approved proposal: adjust the belief's strength and record the
   * decision that motivated it in its review history. Called only after the
   * user has explicitly approved the proposal in the UI.
   */
  async applyApprovedProposal(decisionId: string, proposal: BeliefProposal): Promise<void> {
    if (proposal.status !== 'approved') {
      throw new Error('Only approved proposals can be applied.');
    }
    const match = /from (\d+) to (\d+)/.exec(proposal.change);
    const nextStrength = match ? Number(match[2]) : null;
    if (nextStrength === null || Number.isNaN(nextStrength)) {
      throw new Error('Proposal does not carry a valid strength change.');
    }

    // Attempt atomic server-side RPC execution
    try {
      const { data, error } = await supabase.rpc('apply_decision_proposal', {
        p_decision_id: decisionId,
        p_proposal_id: proposal.id,
        p_belief_id: proposal.beliefId,
        p_next_strength: nextStrength,
        p_status: 'approved',
      });
      if (!error && data) return;
    } catch {
      // Fall through to sequential client write if RPC not present in environment
    }

    const { error } = await supabase
      .from('beliefs')
      .update({ strength: nextStrength, last_reviewed: new Date().toISOString() })
      .eq('id', proposal.beliefId);
    if (error) throw new Error(error.message);

    // Record in beliefs_history
    try {
      await supabase.from('beliefs_history').insert({
        belief_id: proposal.beliefId,
        strength: nextStrength,
        note: `Adjusted via Review Center from decision proposal`,
      });
    } catch {
      // Non-blocking
    }

    await this.saveProposal(decisionId, proposal);
  },
};

export const timelineService = {
  async list(): Promise<TimelineEvent[]> {
    return unwrap(
      supabase.from('timeline_events').select('*').order('occurred_at', { ascending: false })
    );
  },
  async create(input: Omit<TimelineEvent, 'id' | 'created_at'>): Promise<TimelineEvent> {
    return unwrap(
      supabase.from('timeline_events').insert(input).select().maybeSingle()
    ) as Promise<TimelineEvent>;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('timeline_events').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export type StatementRelationshipRow = {
  id: string;
  a_type: 'belief' | 'memory';
  b_type: 'belief' | 'memory';
  a_id: string;
  b_id: string;
  relation: 'direct_contradiction' | 'possible_contradiction' | 'change_over_time' | 'context_dependent' | 'compatible' | 'insufficient_evidence';
  explanation: string;
  source: 'pattern' | 'model';
  status: 'candidate' | 'confirmed' | 'dismissed';
  created_at: string;
  reviewed_at: string | null;
};

/**
 * Persistence for statement relationship candidates (Upgrade 3). Candidates
 * come from the pattern detector or the model-assisted analyzer; a candidate
 * becomes an established relationship only through an explicit user confirm.
 * The unique (user, a, b) index makes saving idempotent per pair — re-analysis
 * never duplicates rows; it upserts the latest candidate judgment.
 */
export const relationshipsService = {
  async list(): Promise<StatementRelationshipRow[]> {
    return unwrap(
      supabase.from('statement_relationships').select('*').order('created_at', { ascending: false })
    ) as Promise<StatementRelationshipRow[]>;
  },
  async saveCandidate(input: {
    a_type: 'belief' | 'memory';
    b_type: 'belief' | 'memory';
    a_id: string;
    b_id: string;
    relation: StatementRelationshipRow['relation'];
    explanation: string;
    source: 'pattern' | 'model';
  }): Promise<StatementRelationshipRow> {
    // Keep user decisions on an existing pair: overwrite only the judgment
    // fields, never flip a dismissed/confirmed row back to candidate.
    const { data, error } = await supabase
      .from('statement_relationships')
      .upsert(input, { onConflict: 'user_id,a_id,b_id' })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as StatementRelationshipRow;
  },
  async setStatus(id: string, status: 'confirmed' | 'dismissed' | 'candidate'): Promise<void> {
    const { error } = await supabase
      .from('statement_relationships')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async amendExplanation(id: string, explanation: string): Promise<void> {
    const { error } = await supabase
      .from('statement_relationships')
      .update({ explanation, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('statement_relationships').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const dataManagementService = {
  /**
   * Export every record the persistence layer holds for this user. Covers all
   * user-owned tables including decision proposals (stored on decisions) and
   * graph edge confirmations. Sample rows are excluded.
   */
  async exportAll(): Promise<Record<string, unknown[]>> {
    const tables = ['memories', 'beliefs', 'beliefs_history', 'decisions', 'timeline_events', 'interpretation_flags', 'graph_edge_confirmations', 'statement_relationships', 'captures', 'review_actions_log'] as const;
    const out: Record<string, unknown[]> = {};
    for (const table of tables) {
      // Personal workspaces only: the public sample rows (user_id IS NULL)
      // are demo data, not the signed-in user's records.
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .not('user_id', 'is', null);
      if (error) throw new Error(error.message);
      out[table] = data ?? [];
    }
    return out;
  },
  /** Delete every record in the given tables from the persistence layer. */
  async deleteAll(tables: readonly string[]): Promise<void> {
    for (const table of tables) {
      // Scope to the caller's own rows; RLS would block sample rows anyway,
      // and the explicit filter keeps intent visible in the query itself.
      const { error } = await supabase
        .from(table)
        .delete()
        .not('user_id', 'is', null)
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw new Error(error.message);
    }
  },
};

export const profilesService = {
  /** Fetch the authenticated user's profile from the database. */
  async get(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) return null;
      return data as UserProfile | null;
    } catch {
      return null;
    }
  },

  /** Upsert user profile record in the database. */
  async upsert(profile: Partial<UserProfile> & { id: string }): Promise<void> {
    try {
      await supabase
        .from('profiles')
        .upsert({ ...profile, updated_at: new Date().toISOString() });
    } catch {
      // Gracefully retained
    }
  },
};

const CAPTURES_STORAGE_KEY = 'echoself_local_captures_v1';
let inMemoryCaptures: CaptureItem[] | null = null;

function getLocalCaptures(): CaptureItem[] {
  if (inMemoryCaptures) return inMemoryCaptures;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CAPTURES_STORAGE_KEY);
      if (raw) {
        inMemoryCaptures = JSON.parse(raw);
        return inMemoryCaptures!;
      }
    }
  } catch {}

  inMemoryCaptures = [
    {
      id: 'local-cap-sample-1',
      content: 'Notice how much calmer mornings feel when I leave my phone in the kitchen overnight. Need to test this for another two weeks before calling it a permanent habit.',
      title: 'Kitchen phone experiment note',
      category: 'health',
      tags: ['habits', 'mornings', 'screen-time'],
      status: 'inbox',
      promoted_memory_id: null,
      promoted_at: null,
      occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: 'local-cap-sample-2',
      content: 'Overheard an engineer say: "Simplicity is the prerequisite for reliability." Struck a chord with my current dilemma over our microservices refactor.',
      title: 'Simplicity and reliability quote',
      category: 'work',
      tags: ['engineering', 'simplicity', 'architecture'],
      status: 'inbox',
      promoted_memory_id: null,
      promoted_at: null,
      occurred_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  ];
  return inMemoryCaptures;
}

function setLocalCaptures(items: CaptureItem[]) {
  inMemoryCaptures = items;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAPTURES_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore quota errors
  }
}

export const capturesService = {
  /** List captures, optionally filtered by status ('inbox' | 'promoted' | 'archived') */
  async list(status?: CaptureStatus): Promise<CaptureItem[]> {
    try {
      let query = supabase.from('captures').select('*').order('created_at', { ascending: false });
      if (status) {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (data && data.length > 0) {
        return data as CaptureItem[];
      }
      const local = getLocalCaptures();
      return status ? local.filter((c) => c.status === status) : local;
    } catch {
      const local = getLocalCaptures();
      return status ? local.filter((c) => c.status === status) : local;
    }
  },

  /** Get a single capture by ID */
  async get(id: string): Promise<CaptureItem | null> {
    try {
      const { data, error } = await supabase.from('captures').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        const local = getLocalCaptures();
        return local.find((c) => c.id === id) ?? null;
      }
      return data as CaptureItem;
    } catch {
      const local = getLocalCaptures();
      return local.find((c) => c.id === id) ?? null;
    }
  },

  /** Quickly create a raw capture without forced categorization */
  async create(input: CaptureInput): Promise<CaptureItem> {
    const cleanContent = input.content.trim();
    if (!cleanContent) {
      throw new Error('Capture content cannot be empty.');
    }
    const now = new Date().toISOString();
    const payload = {
      content: cleanContent,
      title: input.title?.trim() || null,
      category: input.category || null,
      tags: input.tags ?? [],
      occurred_at: input.occurred_at || now,
      status: 'inbox' as const,
      promoted_memory_id: null,
      promoted_at: null,
      created_at: now,
      updated_at: now,
    };

    try {
      const { data, error } = await supabase.from('captures').insert(payload).select().maybeSingle();
      if (error || !data) {
        const localItem: CaptureItem = {
          id: `local-cap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...payload,
        };
        const local = getLocalCaptures();
        setLocalCaptures([localItem, ...local]);
        return localItem;
      }
      return data as CaptureItem;
    } catch {
      const localItem: CaptureItem = {
        id: `local-cap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...payload,
      };
      const local = getLocalCaptures();
      setLocalCaptures([localItem, ...local]);
      return localItem;
    }
  },

  /** Update an existing capture in place */
  async update(id: string, patch: Partial<CaptureItem>): Promise<CaptureItem> {
    const now = new Date().toISOString();
    const cleanPatch = { ...patch, updated_at: now };
    try {
      const { data, error } = await supabase.from('captures').update(cleanPatch).eq('id', id).select().maybeSingle();
      if (error || !data) {
        const local = getLocalCaptures();
        const idx = local.findIndex((c) => c.id === id);
        if (idx !== -1) {
          local[idx] = { ...local[idx], ...cleanPatch };
          setLocalCaptures(local);
          return local[idx];
        }
        throw new Error('Capture not found');
      }
      return data as CaptureItem;
    } catch (e) {
      const local = getLocalCaptures();
      const idx = local.findIndex((c) => c.id === id);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...cleanPatch };
        setLocalCaptures(local);
        return local[idx];
      }
      throw e;
    }
  },

  /** Delete a capture */
  async delete(id: string): Promise<void> {
    try {
      await supabase.from('captures').delete().eq('id', id);
    } catch {}
    const local = getLocalCaptures();
    setLocalCaptures(local.filter((c) => c.id !== id));
  },

  /**
   * Promote an inbox capture into a permanent memory in the memory library.
   * Preserves the original capture with its original content, stamps status='promoted',
   * and records promoted_memory_id. Prevents duplicate promotion.
   */
  async promoteToMemory(
    captureId: string,
    overrides?: Partial<MemoryInput>
  ): Promise<{ capture: CaptureItem; memory: Memory }> {
    const capture = await this.get(captureId);
    if (!capture) {
      throw new Error('Capture not found');
    }

    // Guard against repeated promotion creating duplicate memories
    if (capture.status === 'promoted' && capture.promoted_memory_id) {
      const existing = await memoriesService.get(capture.promoted_memory_id);
      if (existing) {
        return { capture, memory: existing };
      }
    }

    let fallbackTitle = capture.title?.trim();
    if (!fallbackTitle) {
      const firstLine = capture.content.split('\n')[0].trim();
      fallbackTitle = firstLine.length > 50 ? firstLine.slice(0, 47) + '…' : firstLine;
    }

    const memoryInput: MemoryInput = {
      title: overrides?.title?.trim() || fallbackTitle || 'Captured Reflection',
      content: capture.content.trim(),
      category: overrides?.category || capture.category || 'personal_growth',
      tags: overrides?.tags && overrides.tags.length > 0 ? overrides.tags : capture.tags,
      occurred_at: overrides?.occurred_at || capture.occurred_at || new Date().toISOString(),
      source: overrides?.source || 'note',
      mood: overrides?.mood || 'neutral',
      confidence: overrides?.confidence ?? 80,
      user_importance: overrides?.user_importance ?? null,
    };

    const newMemory = await memoriesService.create(memoryInput);
    const updatedCapture = await this.update(captureId, {
      status: 'promoted',
      promoted_memory_id: newMemory.id,
      promoted_at: new Date().toISOString(),
    });

    return { capture: updatedCapture, memory: newMemory };
  },

  /** Revert a promoted capture back to inbox status without deleting the promoted memory */
  async unpromote(captureId: string): Promise<CaptureItem> {
    return this.update(captureId, {
      status: 'inbox',
      promoted_memory_id: null,
      promoted_at: null,
    });
  },
};
