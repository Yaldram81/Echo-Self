/*
# Graph edge confirmations

1. Plain-English explanation
   The Evidence Graph derives its connections from stored records. Inferred
   edges (keyword-derived suggestions) are labeled as such and were previously
   display-only. This change lets a signed-in user explicitly confirm or
   dismiss an inferred relationship. A confirmed suggestion becomes an
   established, solid-line connection attributed to the user; a dismissed one
   is kept as a record so it is not re-presented as new. Direct (recorded)
   edges need no confirmation — they already exist in the data.

2. New Tables
   - `graph_edge_confirmations`
     - id (uuid pk)
     - user_id (uuid, references auth.users on delete cascade, defaults to the
       authenticated user) — the confirmer
     - edge_key (text, required) — canonical edge signature
       "<sourceId>|<kind>|<targetId>" matching the graph engine's edge ids
     - source_id (text, required) / target_id (text, required) — node ids
       ("memory:<uuid>", "belief:<uuid>", …) for cleanup when records die
     - kind (text, required) — the edge kind confirmed or dismissed
     - status (text, required) — 'confirmed' | 'dismissed'
     - created_at (timestamptz)
     - unique on (user_id, edge_key): one decision per user per edge; a later
       action updates the row (re-confirm or re-dismiss) via upsert

3. Security
   - RLS enabled. Creator-owned: SELECT/UPDATE/DELETE require auth.uid() =
     user_id; INSERT additionally requires the caller to own both endpoint
     records (or the endpoint to be a public sample row with NULL owner), so a
     user cannot attach confirmations to records they cannot see. Endpoint
     ownership is checked by comparing the record id as text, avoiding casts.
     Anon is read-free: signed-out visitors see suggested edges unconfirmed,
     which matches the read-only demo model.

4. Notes
   - Idempotent: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS first.
   - No data is dropped, deleted, or type-changed. When a source record dies,
     the app drops the stale confirmation from display (edges re-derive, so
     nothing dangles).
*/

CREATE TABLE IF NOT EXISTS graph_edge_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  edge_key text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, edge_key)
);

ALTER TABLE graph_edge_confirmations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_edge_confirmations_user ON graph_edge_confirmations (user_id);

DROP POLICY IF EXISTS "select_own_edge_confirmations" ON graph_edge_confirmations;
CREATE POLICY "select_own_edge_confirmations" ON graph_edge_confirmations FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_edge_confirmations" ON graph_edge_confirmations;
CREATE POLICY "insert_own_edge_confirmations" ON graph_edge_confirmations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- endpoints may be memories, beliefs, or decisions; each must be the
    -- caller's own row or a public sample row (NULL owner)
    source_id LIKE 'memory:%' AND EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id::text = right(source_id, length(source_id) - 7)
        AND (m.user_id IS NULL OR m.user_id = auth.uid())
    )
    OR source_id LIKE 'belief:%' AND EXISTS (
      SELECT 1 FROM beliefs b
      WHERE b.id::text = right(source_id, length(source_id) - 7)
        AND (b.user_id IS NULL OR b.user_id = auth.uid())
    )
    OR source_id LIKE 'decision:%' AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id::text = right(source_id, length(source_id) - 9)
        AND (d.user_id IS NULL OR d.user_id = auth.uid())
    )
  )
  AND (
    target_id LIKE 'memory:%' AND EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id::text = right(target_id, length(target_id) - 7)
        AND (m.user_id IS NULL OR m.user_id = auth.uid())
    )
    OR target_id LIKE 'belief:%' AND EXISTS (
      SELECT 1 FROM beliefs b
      WHERE b.id::text = right(target_id, length(target_id) - 7)
        AND (b.user_id IS NULL OR b.user_id = auth.uid())
    )
    OR target_id LIKE 'decision:%' AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id::text = right(target_id, length(target_id) - 9)
        AND (d.user_id IS NULL OR d.user_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "update_own_edge_confirmations" ON graph_edge_confirmations;
CREATE POLICY "update_own_edge_confirmations" ON graph_edge_confirmations FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_edge_confirmations" ON graph_edge_confirmations;
CREATE POLICY "delete_own_edge_confirmations" ON graph_edge_confirmations FOR DELETE
TO authenticated
USING (auth.uid() = user_id);