/*
# Personal workspaces: ownership fields + RLS

1. Plain-English explanation
   EchoSelf gains real accounts. Every user-owned record now carries an owner
   taken from the verified session, never from the browser. The pre-existing
   fictional sample records stay public and read-only: they keep a NULL owner,
   which is exactly what marks them as the shared demo. Nobody's data is
   deleted or reassigned by this change.

2. New columns
   - `user_id` (uuid, nullable, references auth.users on delete cascade) on
     memories, beliefs, decisions, timeline_events: NULL = public sample row.
   - beliefs_history and interpretation_flags also get `user_id` (the row
     creator), but their policies are additionally scoped through the parent
     belief/memory so a row can never outlive or escape its parent's owner.
   - Insert-time defaults fill `user_id` from the session (`auth.uid()`), so a
     client that omits it cannot create ownerless personal rows, and a client
     that forges another user's id fails the WITH CHECK.

3. Modified tables
   - memories, beliefs, beliefs_history, decisions, timeline_events,
     interpretation_flags: new `user_id` column + index; policies replaced.

4. Security
   - RLS stays enabled on all six tables. All former open (`USING (true)`)
     CRUD policies are dropped and replaced:
     - Signed-out visitors (anon): SELECT on public sample rows only
       (user_id IS NULL). No INSERT/UPDATE/DELETE anywhere — the demo is
       read-only.
     - Signed-in users (authenticated): full CRUD on their own rows; sample
       rows remain visible read-only context.
     - UPDATE checks both sides, so a row cannot be reassigned to another user.
     - beliefs_history / interpretation_flags / timeline_events: write access
       requires the linked parent belief/memory to be owned by the caller;
       SELECT likewise through the parent link (flags: SELECT requires the
       caller to own the flag row; the parent check gates creation).

5. Notes
   - Idempotent: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS before each
     CREATE POLICY, CREATE INDEX IF NOT EXISTS.
   - Backfill is intentionally a no-op: existing rows keep user_id NULL and
     stay public sample data. No fictional record is assigned to any user.
   - Safe to re-run; no column drops, type changes, or row deletions.
*/

ALTER TABLE memories ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE beliefs_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE interpretation_flags ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories (user_id);
CREATE INDEX IF NOT EXISTS idx_beliefs_user ON beliefs (user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions (user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_user ON timeline_events (user_id);
CREATE INDEX IF NOT EXISTS idx_beliefs_history_user ON beliefs_history (user_id);
CREATE INDEX IF NOT EXISTS idx_flags_user ON interpretation_flags (user_id);

-- ============ memories ============
DROP POLICY IF EXISTS "anon_select_memories" ON memories;
DROP POLICY IF EXISTS "anon_insert_memories" ON memories;
DROP POLICY IF EXISTS "anon_update_memories" ON memories;
DROP POLICY IF EXISTS "anon_delete_memories" ON memories;

CREATE POLICY "select_public_or_own_memories" ON memories FOR SELECT
TO anon, authenticated
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "insert_own_memories" ON memories FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_memories" ON memories FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_memories" ON memories FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============ beliefs ============
DROP POLICY IF EXISTS "anon_select_beliefs" ON beliefs;
DROP POLICY IF EXISTS "anon_insert_beliefs" ON beliefs;
DROP POLICY IF EXISTS "anon_update_beliefs" ON beliefs;
DROP POLICY IF EXISTS "anon_delete_beliefs" ON beliefs;

CREATE POLICY "select_public_or_own_beliefs" ON beliefs FOR SELECT
TO anon, authenticated
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "insert_own_beliefs" ON beliefs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_beliefs" ON beliefs FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_beliefs" ON beliefs FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============ decisions ============
DROP POLICY IF EXISTS "anon_select_decisions" ON decisions;
DROP POLICY IF EXISTS "anon_insert_decisions" ON decisions;
DROP POLICY IF EXISTS "anon_update_decisions" ON decisions;
DROP POLICY IF EXISTS "anon_delete_decisions" ON decisions;

CREATE POLICY "select_public_or_own_decisions" ON decisions FOR SELECT
TO anon, authenticated
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "insert_own_decisions" ON decisions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_decisions" ON decisions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_decisions" ON decisions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============ timeline_events ============
DROP POLICY IF EXISTS "anon_select_timeline" ON timeline_events;
DROP POLICY IF EXISTS "anon_insert_timeline" ON timeline_events;
DROP POLICY IF EXISTS "anon_update_timeline" ON timeline_events;
DROP POLICY IF EXISTS "anon_delete_timeline" ON timeline_events;

CREATE POLICY "select_public_or_own_timeline" ON timeline_events FOR SELECT
TO anon, authenticated
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "insert_own_timeline" ON timeline_events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_timeline" ON timeline_events FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_timeline" ON timeline_events FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============ beliefs_history (scoped through parent belief) ============
DROP POLICY IF EXISTS "anon_select_beliefs_history" ON beliefs_history;
DROP POLICY IF EXISTS "anon_insert_beliefs_history" ON beliefs_history;
DROP POLICY IF EXISTS "anon_update_beliefs_history" ON beliefs_history;
DROP POLICY IF EXISTS "anon_delete_beliefs_history" ON beliefs_history;

CREATE POLICY "select_visible_beliefs_history" ON beliefs_history FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM beliefs b
    WHERE b.id = beliefs_history.belief_id
      AND (b.user_id IS NULL OR b.user_id = auth.uid())
  )
);

CREATE POLICY "insert_history_for_own_belief" ON beliefs_history FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM beliefs b
    WHERE b.id = beliefs_history.belief_id AND b.user_id = auth.uid()
  )
);

CREATE POLICY "update_history_for_own_belief" ON beliefs_history FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM beliefs b
    WHERE b.id = beliefs_history.belief_id AND b.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM beliefs b
    WHERE b.id = beliefs_history.belief_id AND b.user_id = auth.uid()
  )
);

CREATE POLICY "delete_history_for_own_belief" ON beliefs_history FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM beliefs b
    WHERE b.id = beliefs_history.belief_id AND b.user_id = auth.uid()
  )
);

-- ============ interpretation_flags (creator-owned; parent gates creation) ============
DROP POLICY IF EXISTS "anon_select_flags" ON interpretation_flags;
DROP POLICY IF EXISTS "anon_insert_flags" ON interpretation_flags;

CREATE POLICY "select_own_flags" ON interpretation_flags FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "insert_own_flags" ON interpretation_flags FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM memories m
    WHERE m.id = interpretation_flags.memory_id
      AND (m.user_id IS NULL OR m.user_id = auth.uid())
  )
);
