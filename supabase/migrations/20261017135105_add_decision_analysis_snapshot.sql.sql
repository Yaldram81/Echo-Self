-- Transparent decision analysis: persisted analysis snapshot.
--
-- Adds `decisions.analysis_snapshot` (jsonb, nullable):
--   { engineVersion, inputHash, computedAt,
--     inputs: { valueWeights, evidenceMemoryIds, explicitItems, overrideCount } }
--
-- The snapshot records exactly which inputs produced the report the user saw.
-- It is written whenever a generated analysis is rendered, and compared against
-- the current inputs to detect staleness (a changed weight, a new record, an
-- override) — stale snapshots are labeled in the UI, never silently reused.
-- JSONB keeps the structure versioned alongside the decision row; NULL rows
-- (decisions never analyzed, or user-edited analyses) need no backfill.

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS analysis_snapshot jsonb;