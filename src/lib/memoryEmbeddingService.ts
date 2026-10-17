import type { Memory } from './types';
import type { EmbeddingPort } from './hybridRetrieval';

/**
 * Client port to the `memory-embed` edge function (Upgrade 1).
 *
 * All embedding work happens server-side: the provider key never reaches the
 * browser, and both query embeddings and vector matches go through the
 * caller's own authenticated session. Vector matching uses the
 * `match_memory_embeddings` RPC, which scopes to auth.uid() inside the
 * database — other users' embeddings are unreachable by construction.
 *
 * Every method degrades gracefully: when the edge function is unreachable or
 * unconfigured, callers fall back to keyword-only retrieval and the mode is
 * reported as 'keyword'. Nothing here throws into the user's save path.
 */

const FN_URL = `${(import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? ''}/functions/v1/memory-embed`;

/**
 * Dynamic import keeps the Supabase client (which reads import.meta.env at
 * module load) out of non-Vite runtimes — the same pattern twinService uses
 * for its pure-function callers such as the test suites.
 */
async function getSupabase() {
  const { supabase } = await import('./supabaseClient');
  return supabase;
}

async function callFn<T>(body: unknown): Promise<T | null> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null; // signed-out (demo) callers never embed
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const memoryEmbeddingService = {
  /** True when the server reports embeddings configured. Cheap probe. */
  async status(): Promise<{ configured: boolean; model: string; dim: number } | null> {
    return callFn({ op: 'status' });
  },

  async embedQuery(question: string): Promise<{ embedding: number[]; model: string } | null> {
    const res = await callFn<{ embedding: number[]; model: string; dim: number }>({ op: 'query', question });
    if (!res || !Array.isArray(res.embedding) || res.embedding.length === 0) return null;
    return { embedding: res.embedding, model: res.model };
  },

  /**
   * Ownership-scoped vector match via RPC. Returns [] on any failure —
   * callers treat that as "semantic leg empty" and run keyword-only.
   */
  async matchEmbeddings(
    query: number[],
    model: string,
    limit: number
  ): Promise<{ memoryId: string; similarity: number }[]> {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('match_memory_embeddings', {
      query_embedding: query,
      match_count: limit,
      p_model: model,
    });
    if (error) return [];
    return ((data ?? []) as { memory_id: string; similarity: number }[]).map((r) => ({
      memoryId: r.memory_id,
      similarity: r.similarity,
    }));
  },

  /**
   * Index (or refresh) embeddings for the given memories. Idempotent: the
   * server re-embeds only rows whose content hash changed. Batched at 100.
   * Returns the number indexed; null/0 on failure (callers fire-and-forget).
   */
  async indexMemories(memories: Memory[]): Promise<number | null> {
    if (!memories.length) return 0;
    let indexed = 0;
    for (let i = 0; i < memories.length; i += 100) {
      const batch = memories.slice(i, i + 100).map((m) => ({
        id: m.id,
        title: m.title ?? '',
        content: m.content ?? '',
        tags: m.tags ?? [],
        category: m.category,
      }));
      const res = await callFn<{ indexed: number }>({ op: 'index', memories: batch });
      if (res === null) return indexed > 0 ? indexed : null;
      indexed += res.indexed;
    }
    return indexed;
  },

  /**
   * Idempotent backfill of all the signed-in user's memories. Safe to call
   * repeatedly (e.g. at sign-in): unchanged rows are skipped server-side by
   * content hash; failed batches can be retried without duplication.
   *
   * User-owned rows carry a non-null `user_id`; demo/sample rows (null) are
   * never embedded, keeping demo and personal data in separate retrieval
   * spaces.
   */
  async backfillAll(memories: (Memory & { user_id?: string | null })[]): Promise<number | null> {
    // Only user-owned rows: demo/sample rows (user_id IS NULL) are never
    // embedded, keeping demo and personal data in separate retrieval spaces.
    const own = memories.filter((m) => (m as Memory & { user_id?: string | null }).user_id != null);
    return this.indexMemories(own);
  },
};

/** EmbeddingPort implementation wired to the edge function + RPC. */
export const embeddingPort: EmbeddingPort = {
  embedQuery: async (question) => {
    const res = await memoryEmbeddingService.embedQuery(question);
    if (!res) throw new Error('embeddings unavailable');
    return res;
  },
  matchEmbeddings: (query, model, limit) => memoryEmbeddingService.matchEmbeddings(query, model, limit),
};
