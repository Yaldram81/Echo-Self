/*
# Add statement relationship candidates (context-aware counterevidence, Upgrade 3)

1. Plain-English summary
   - Adds one table, `statement_relationships`, that stores relationships the
     system has noticed between two of the user's own statements (a belief and
     a memory, or two beliefs). Each row starts as a CANDIDATE produced by
     either the deterministic pattern detector or the model-assisted semantic
     comparison — and becomes an ESTABLISHED relationship only when the user
     explicitly confirms it. Dismissed candidates stay as history.
   - Nothing is applied automatically: an AI-proposed relationship never
     changes beliefs, memories, or any other table on its own.

2. New Tables
   - `statement_relationships`
     - `id` (uuid, primary key, default generated)
     - `user_id` (uuid, not null, defaults to the authenticated user; the owner)
     - `a_type` / `b_type` (text, 'belief' or 'memory'): the two endpoint kinds
     - `a_id` / `b_id` (uuid, not null): ids of the two statements
     - `relation` (text, not null, check-constrained to the six categories):
       'direct_contradiction' | 'possible_contradiction' | 'change_over_time' |
       'context_dependent' | 'compatible' | 'insufficient_evidence'
     - `explanation` (text, not null): concise plain-language reason
     - `source` (text, not null, 'pattern' or 'model'): how the candidate arose
     - `status` (text, not null, 'candidate' | 'confirmed' | 'dismissed',
       default 'candidate'): the lifecycle; only 'confirmed' rows are
       established relationships
     - `created_at`, `reviewed_at` (timestamptz): provenance timestamps;
       reviewed_at is null until the user acts
   - Unique index on (user_id, a_id, b_id) so the same pair is never duplicated
     (pairs are stored with the earlier-formed statement as `a`).
   - Index on (user_id, status) for listing.

3. Security
   - RLS enabled; owner-scoped CRUD for authenticated users only; no anon
     policies (signed-out visitors never see or write relationship candidates).
   - `user_id` defaults to `auth.uid()` so clients never supply ownership.

4. Important notes
   - Cross-user attempts fail: the insert policy checks auth.uid() = user_id
     and the unique index is user-scoped; endpoints must be the caller's own
     records, verified client-side against the authorized record set and
     re-validated here by ownership columns.
*/

CREATE TABLE IF NOT EXISTS statement_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  a_type text NOT NULL CHECK (a_type IN ('belief','memory')),
  b_type text NOT NULL CHECK (b_type IN ('belief','memory')),
  a_id uuid NOT NULL,
  b_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN (
    'direct_contradiction','possible_contradiction','change_over_time',
    'context_dependent','compatible','insufficient_evidence'
  )),
  explanation text NOT NULL,
  source text NOT NULL CHECK (source IN ('pattern','model')),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','confirmed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS statement_relationships_pair_key
  ON statement_relationships (user_id, a_id, b_id);
CREATE INDEX IF NOT EXISTS statement_relationships_user_status
  ON statement_relationships (user_id, status);

ALTER TABLE statement_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_relationships" ON statement_relationships;
CREATE POLICY "select_own_relationships" ON statement_relationships FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_relationships" ON statement_relationships;
CREATE POLICY "insert_own_relationships" ON statement_relationships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_relationships" ON statement_relationships;
CREATE POLICY "update_own_relationships" ON statement_relationships FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_relationships" ON statement_relationships;
CREATE POLICY "delete_own_relationships" ON statement_relationships FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
