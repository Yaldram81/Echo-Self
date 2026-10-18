import type { Memory } from './types';
import { retrieve, DEFAULT_WEIGHTS, type RetrievalResult, type ScoredCandidate } from './retrieval';
import type { InterpretationFlag } from './types';
import { profilesService } from './services';

/**
 * Hybrid semantic + keyword retrieval (Upgrade 1).
 *
 * Architecture:
 *   keyword leg: the existing explainable retrieve() engine (unchanged)
 *   semantic leg: query embedding vs stored memory embeddings (pgvector,
 *     cosine), fetched ONLY via an ownership-scoped RPC (auth.uid() inside
 *     the function) so cross-user vectors are never reachable, plus RLS on
 *     the underlying table.
 *   fusion: Reciprocal Rank Fusion (RRF) — rank-based, so the two legs'
 *     incomparable score scales never meet directly. k=60 is the standard
 *     constant from the RRF literature.
 *
 * Modes (reported explicitly, never silently):
 *   'hybrid'    — both legs ran and fused.
 *   'keyword'   — embeddings unconfigured/unavailable/failed: keyword-only,
 *                 the pre-upgrade behavior. A failure degrades, never breaks.
 *   'hybrid_unavailable_semantic' — semantic leg returned no rows for this
 *                 user yet (nothing indexed); keyword results still returned.
 *
 * Demo separation: demo rows (user_id IS NULL) are never embedded and never
 * enter the semantic leg; demo callers never call this module's semantic path.
 */

export type HybridMode = 'hybrid' | 'keyword' | 'hybrid_unavailable_semantic';

export interface HybridStatus {
  mode: HybridMode;
  /** Human-readable explanation for the UI/logs. */
  detail: string;
  /** True when the semantic leg contributed results to this query. */
  semanticUsed: boolean;
}

export interface EmbeddingPort {
  /** Fetch query embedding from the trusted server-side path. */
  embedQuery(question: string): Promise<{ embedding: number[]; model: string }>;
  /**
   * Ownership-scoped vector match. The implementation MUST scope to the
   * caller's own rows (auth.uid() RPC); it returns memory ids ranked by
   * cosine similarity, best first.
   */
  matchEmbeddings(query: number[], model: string, limit: number): Promise<{ memoryId: string; similarity: number }[]>;
}

/** RRF constant; larger = flatter fusion. 60 is the literature standard. */
export const RRF_K = 60;
/** Weight of the semantic leg relative to the keyword leg in RRF. */
export const SEMANTIC_WEIGHT = 0.8;
export const KEYWORD_WEIGHT = 1.0;

export interface HybridRetrieveOptions {
  flags?: InterpretationFlag[];
  limit?: number;
  now?: number;
  /** How many semantic neighbors to fetch. */
  semanticLimit?: number;
}

export interface HybridRetrievalResult {
  result: RetrievalResult;
  status: HybridStatus;
}

/**
 * Fuses two ranked id lists with Reciprocal Rank Fusion.
 * score(id) = Σ weight_leg / (k + rank_leg). Deterministic; ties broken by
 * keyword rank then insertion order.
 */
export function rrfFuse(
  keywordIds: string[],
  semanticIds: string[],
  k: number = RRF_K,
  keywordWeight = KEYWORD_WEIGHT,
  semanticWeight = SEMANTIC_WEIGHT
): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (ids: string[], weight: number) => {
    ids.forEach((id, i) => {
      const rank = i + 1;
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank));
    });
  };
  add(keywordIds, keywordWeight);
  add(semanticIds, semanticWeight);
  return scores;
}

export function createHybridRetriever(embedding: EmbeddingPort) {
  return async function hybridRetrieve(
    question: string,
    memories: Memory[],
    options: HybridRetrieveOptions = {}
  ): Promise<HybridRetrievalResult> {
    const { flags = [], limit = 8, now = Date.now(), semanticLimit = 20 } = options;

    // Keyword leg always runs first — it is the foundation and the fallback.
    const keywordResult = retrieve(question, memories, { flags, limit, now });
    const keywordIds = keywordResult.candidates
      .filter((c) => !c.isNearDuplicateOf)
      .map((c) => c.memory.id);

    // Check if semantic vector retrieval is enabled by user privacy preference
    const semanticRetrievalAllowed = profilesService.getPrivacyPreferences().semantic_retrieval_enabled;

    // Semantic leg: best-effort; any failure or privacy disable degrades to keyword mode.
    let semanticIds: string[] = [];
    let semanticUsed = false;

    if (semanticRetrievalAllowed) {
      try {
        const { embedding: queryVec, model } = await embedding.embedQuery(question);
        const matches = await embedding.matchEmbeddings(queryVec, model, semanticLimit);
        const memoryIdSet = new Set(memories.map((m) => m.id));
        // Only ids that are in the caller-supplied set survive: the semantic leg
        // can widen relevance ordering but never introduce records the caller
        // was not authorized to pass in.
        semanticIds = matches
          .map((m) => m.memoryId)
          .filter((id) => memoryIdSet.has(id));
        semanticUsed = semanticIds.length > 0;
      } catch {
        semanticUsed = false;
      }
    }

    if (!semanticUsed) {
      return {
        result: keywordResult,
        status: {
          mode: 'keyword',
          detail: !semanticRetrievalAllowed
            ? 'Semantic vector retrieval disabled by user privacy preference; keyword ranking active.'
            : 'Semantic retrieval unavailable or empty; keyword ranking active.',
          semanticUsed: false,
        },
      };
    }

    const fused = rrfFuse(keywordIds, semanticIds);
    const byId = new Map(keywordResult.candidates.map((c) => [c.memory.id, c]));
    // Semantic-only candidates (vector found them, keywords did not): scored
    // at zero keyword relevance, marked so the explanation is honest.
    for (const id of semanticIds) {
      if (!byId.has(id)) {
        const m = memories.find((x) => x.id === id)!;
        byId.set(id, {
          memory: m,
          rank: 0,
          relevance: 0,
          recency: 0,
          score: 0,
          signals: {
            titleHits: [], tagHits: [], categoryHits: [], bodyHits: [],
            synonymHits: [], phraseMatch: false, correctionMatch: false,
            incidentalOnly: false, importance: m.user_importance ?? null,
          },
          reason: 'surfaced by semantic similarity to your question (no keyword overlap)',
          isNearDuplicateOf: undefined,
        });
      }
    }

    const fusedIds = [...fused.entries()]
      .sort((a, b) => b[1] - a[1] || keywordIds.indexOf(a[0]) - keywordIds.indexOf(b[0]))
      .map(([id]) => id)
      .slice(0, limit);

    const candidates: ScoredCandidate[] = [];
    let rank = 1;
    for (const id of fusedIds) {
      const c = byId.get(id)!;
      candidates.push(rank === 1 ? c : { ...c, rank });
      rank += 1;
    }
    // Dedup marking preserved from the keyword leg for candidates that have it.
    const withDups = keywordResult.candidates.filter((c) => c.isNearDuplicateOf && candidates.some((x) => x.memory.id === c.isNearDuplicateOf));

    const result: RetrievalResult = {
      ...keywordResult,
      candidates: [...candidates, ...withDups],
    };

    return {
      result,
      status: {
        mode: 'hybrid',
        detail: 'Keyword and semantic rankings fused (reciprocal rank fusion).',
        semanticUsed: true,
      },
    };
  };
}

// Re-exported so callers can share one weights object.
export { DEFAULT_WEIGHTS };
