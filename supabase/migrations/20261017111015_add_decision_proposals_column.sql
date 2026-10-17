/*
# Add proposals store to decisions

1. Modified Tables
- `decisions`: add `proposals` (jsonb, nullable). Stores belief/value update
  proposals the mirror generates after a divergent outcome reflection.
  Each entry: { id, beliefId, beliefStatement, change, reason,
  status: 'pending' | 'approved' | 'dismissed', createdAt, resolvedAt }.
  JSONB keeps proposals versioned with the decision row they belong to and
  requires no new table or joins; the column is nullable so existing rows and
  reruns of the seed are unaffected (no backfill needed — proposals only
  exist after a user records a reflection).

2. Security
- No policy changes. The column lives on `decisions`, whose existing
  owner-scoped row-level security already governs every read and write:
  rows are visible if user_id IS NULL (public sample) or user_id = auth.uid(),
  and only owners can update. Proposals therefore inherit exactly the same
  isolation as the decision they belong to.

3. Notes
- Idempotent: guarded by information_schema check, safe to re-run.
- No data is dropped, deleted, or type-changed.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'decisions'
      AND column_name = 'proposals'
  ) THEN
    ALTER TABLE public.decisions ADD COLUMN proposals jsonb;
  END IF;
END
$$;