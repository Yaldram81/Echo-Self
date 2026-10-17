/*
# Add interpretation_flags table for Twin Chat corrections

1. Plain-English explanation
When the Twin Chat gives an interpretation the user believes is wrong, they can
flag it and add a short correction note. Each flag records which chat answer was
flagged and which memory the interpretation was about, so corrections can be
reviewed later. This stage stores flags for review; applying them back into the
memory record happens in a later step.

2. New Tables
- `interpretation_flags`
  - id (uuid pk)
  - memory_id (uuid, references memories, required) — the memory the flag is about
  - answer_excerpt (text, required) — the twin's claim that was flagged
  - correction_note (text, required) — the user's correction
  - created_at (timestamptz)

3. Security
- RLS enabled. Single-tenant no-sign-in demo: anon + authenticated may insert
  and read flags (same intentionally-shared model as the rest of the demo data).

4. Notes
- Flag rows are append-only in this stage; the UI only inserts.
*/

CREATE TABLE IF NOT EXISTS interpretation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  answer_excerpt text NOT NULL,
  correction_note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interpretation_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_flags" ON interpretation_flags;
CREATE POLICY "anon_select_flags" ON interpretation_flags FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flags" ON interpretation_flags;
CREATE POLICY "anon_insert_flags" ON interpretation_flags FOR INSERT
TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_flags_memory ON interpretation_flags (memory_id);
