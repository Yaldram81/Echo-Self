import { supabase } from './supabaseClient';
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

export const flagsService = {  async create(input: { memory_id: string; answer_excerpt: string; correction_note: string }): Promise<void> {
    const { error } = await supabase.from('interpretation_flags').insert(input);
    if (error) throw new Error(error.message);
  },
  /** Saved corrections, newest first. RLS scopes these to the signed-in user. */
  async list(): Promise<InterpretationFlag[]> {
    return unwrap(
      supabase.from('interpretation_flags').select('*').order('created_at', { ascending: false })
    );
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
    return unwrap(
      supabase.from('memories').insert(input).select().maybeSingle()
    ) as Promise<Memory>;
  },
  async update(id: string, input: MemoryInput): Promise<Memory> {
    return unwrap(
      supabase.from('memories').update(input).eq('id', id).select().maybeSingle()
    ) as Promise<Memory>;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) throw new Error(error.message);
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
    const { error } = await supabase
      .from('beliefs')
      .update({ strength: nextStrength, last_reviewed: new Date().toISOString() })
      .eq('id', proposal.beliefId);
    if (error) throw new Error(error.message);
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

export const dataManagementService = {
  /** Export every record the persistence layer holds for this user. */
  async exportAll(): Promise<Record<string, unknown[]>> {
    const tables = ['memories', 'beliefs', 'beliefs_history', 'decisions', 'timeline_events', 'interpretation_flags'] as const;
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
