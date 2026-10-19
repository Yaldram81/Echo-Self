/*
# Phase 2: Default user_id to auth.uid() on legacy core tables

1. Plain-English explanation
   The original core tables (memories, beliefs, decisions, timeline_events,
   beliefs_history, interpretation_flags) were created without a DEFAULT on
   their user_id column. Newer tables (insights, reflections, etc.) already
   have DEFAULT auth.uid(). This migration aligns the legacy tables so that
   if a client omits user_id on insert, it is automatically filled from the
   authenticated session JWT.

2. Notes
   - user_id stays NULLABLE so pre-seeded demo data (user_id IS NULL)
     continues to work for anonymous visitors.
   - Idempotent: ALTER COLUMN SET DEFAULT is a no-op if already set.
   - No data is modified; only the default expression changes.
*/

ALTER TABLE memories ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE decisions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE timeline_events ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs_history ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE interpretation_flags ALTER COLUMN user_id SET DEFAULT auth.uid();
