-- Persistent corrections: status lifecycle, topic scoping, and provenance.
--
-- Extends the existing interpretation_flags table (no second correction
-- system). Additive only; existing rows keep working with safe backfills that
-- never invent content.
--
-- New columns:
--   status (text, default 'confirmed'):
--     'proposed'   — saved but not yet reviewed by the user
--     'confirmed'  — reviewed by the user; participates in retrieval as
--                    authoritative user text
--     'superseded' — replaced by a later correction on the same memory; kept
--                    for history, never retrieved as current context
--     'dismissed'  — the user decided the correction was wrong; kept for
--                    history, never retrieved
--   topic (text, nullable): free-text context tag supplied by the user at
--     save time; retrieval matches it against the question so a correction
--     about one event is not applied to unrelated topics.
--   reviewed_at (timestamptz, nullable): when the user last changed the
--     status; never backfilled with an invented time.
--   superseded_by (uuid, nullable): the correction that replaced this one
--     (self-reference); provenance for the supersede chain.
--
-- RLS: the existing creator-owned policies (select_own_flags / insert_own_flags)
-- are joined by update/delete policies so users can amend or dismiss their own
-- corrections and cannot touch anyone else's. The user_id default (auth.uid())
-- from migration 20261017110500 stays; a forged owner id fails the WITH CHECK.

ALTER TABLE interpretation_flags
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('proposed', 'confirmed', 'superseded', 'dismissed'));
ALTER TABLE interpretation_flags
  ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE interpretation_flags
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE interpretation_flags
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES interpretation_flags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flags_status ON interpretation_flags (status);

-- Amend or retire your own corrections. Row-level owner check mirrors the
-- existing select/insert policies.
DROP POLICY IF EXISTS "update_own_flags" ON interpretation_flags;
CREATE POLICY "update_own_flags" ON interpretation_flags FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND user_id IS NOT NULL)
WITH CHECK (user_id = auth.uid() AND user_id IS NOT NULL);

DROP POLICY IF EXISTS "delete_own_flags" ON interpretation_flags;
CREATE POLICY "delete_own_flags" ON interpretation_flags FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND user_id IS NOT NULL);

-- Backfill: existing rows are treated as reviewed confirmations (they were
-- created through the "save correction" flow and have been in use), but no
-- reviewed_at timestamp is invented — review time stays NULL until the user
-- next changes the status.
UPDATE interpretation_flags SET status = 'confirmed' WHERE status IS NULL;