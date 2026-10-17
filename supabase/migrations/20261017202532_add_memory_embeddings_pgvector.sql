/*
# Add pgvector-backed memory embeddings for hybrid semantic retrieval

1. Purpose
Enables hybrid retrieval (keyword + semantic) for signed-in users. Memory
records are embedded by a server-side process (the `memory-embed` edge
function, using the configured embedding provider key that never reaches the
browser) and stored here. Retrieval then fuses keyword ranking with vector
similarity.

2. New Tables
- `memory_embeddings`
  - `memory_id` (uuid, primary key, references memories(id) ON DELETE CASCADE)
    — one embedding per memory; deleting a memory deletes its embedding
    automatically.
  - `user_id` (uuid, references auth.users) — mirrors the owning memory's
    owner so row level security can authorize directly on this table without
    joining. Nullable only for consistency with memories' public sample rows.
  - `embedding` (vector(768), not null) — the embedding vector. 768 dimensions
    matches the configured embedding model (gemini text-embedding-004). If a
    different model is configured later, a NEW migration with a new dimension
    and column is required — dimensions are never silently mixed.
  - `model` (text, not null) — the model name that produced the vector.
    Retrieval ignores rows whose model does not match the query embedding's
    model (model-version mismatch handling).
  - `content_hash` (text, not null) — sha-256 of the exact embedded text. Used
    for idempotent backfill: a row is refreshed only when the hash no longer
    matches the memory's current text, so re-running backfill never
    duplicates work or corrupts rows.
  - `created_at` / `updated_at` (timestamptz).

3. Security
- Row level security ENABLED on `memory_embeddings`.
- Owner-scoped policies only (authenticated users): SELECT / INSERT / UPDATE /
  DELETE restricted to `auth.uid() = user_id`. There is NO anon access and NO
  public access: demo (sample) memories are deliberately never embedded, so
  the fictional demo dataset and real user records can never share a
  retrieval index.
- The table holds derived data only; the authoritative record lives in
  `memories`.

4. Indexes
- HNSW index on `embedding` (vector_cosine_ops) for approximate nearest
  neighbor search.
- Index on `user_id` for owner-scoped fetches.

5. Notes
- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP
  POLICY IF EXISTS before CREATE — safe to re-run.
- Embeddings are optional: when the provider is unconfigured or a row is
  missing, retrieval falls back to keyword-only mode and reports it.
*/

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id uuid PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  embedding vector(768) NOT NULL,
  model text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw
  ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_embeddings_user_idx
  ON memory_embeddings (user_id);

ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "embeddings_select_own" ON memory_embeddings;
CREATE POLICY "embeddings_select_own" ON memory_embeddings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "embeddings_insert_own" ON memory_embeddings;
CREATE POLICY "embeddings_insert_own" ON memory_embeddings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "embeddings_update_own" ON memory_embeddings;
CREATE POLICY "embeddings_update_own" ON memory_embeddings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "embeddings_delete_own" ON memory_embeddings;
CREATE POLICY "embeddings_delete_own" ON memory_embeddings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
