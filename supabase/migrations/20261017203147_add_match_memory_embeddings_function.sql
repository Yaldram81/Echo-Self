/*
# Add ownership-scoped vector similarity search function

1. Purpose
Server-side semantic match for hybrid retrieval. Given a query embedding, the
function returns the caller's OWN memory embeddings ranked by cosine
similarity. Authorization is enforced inside the function via auth.uid() —
 embeddings belonging to other users are never even considered, and row level
security on memory_embeddings applies on top.

2. New Functions
- `match_memory_embeddings(query_embedding vector(768), match_count int,
  p_model text)`
  - SECURITY INVOKER (runs with the caller's privileges; RLS applies).
  - Returns memory_id + cosine similarity (1 − distance), best first.
  - Filters: user_id = auth.uid() AND model = p_model. Model filtering is the
    documented model-version mismatch guard: vectors from a different
    embedding model are never compared against a query embedding.
  - STABLE, SET search_path = public (advisor-clean).

3. Security
- EXECUTE granted to authenticated only; revoked from anon and public. The
  function reads personal embeddings, so signed-in callers only.
- No data is modified; SELECT-only.

4. Notes
- Idempotent: CREATE OR REPLACE + conditional grants/revokes — safe to re-run.
- The 768-dimension signature must match the memory_embeddings column. If the
  embedding model changes, BOTH the column and this function need a new
  migration; dimensions are never silently mixed.
*/

CREATE OR REPLACE FUNCTION match_memory_embeddings(
  query_embedding vector(768),
  match_count int DEFAULT 20,
  p_model text DEFAULT 'text-embedding-004'
)
RETURNS TABLE (memory_id uuid, similarity float)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.memory_id, 1 - (e.embedding <=> query_embedding) AS similarity
  FROM memory_embeddings e
  WHERE e.user_id = auth.uid() AND e.model = p_model
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 100));
$$;

REVOKE EXECUTE ON FUNCTION match_memory_embeddings(vector, int, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION match_memory_embeddings(vector, int, text) TO authenticated;
