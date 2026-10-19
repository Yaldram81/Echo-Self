/*
# Phase 4: Composite performance indexes

1. Plain-English explanation
   Adds multi-column indexes optimized for the query patterns used by
   services.ts, insightService.ts, and page components. These cover the
   most common filtered + sorted listing queries.

2. Notes
   - All CREATE INDEX IF NOT EXISTS: safe to re-run.
   - No data changes; index-only migration.
*/

-- Memories: user + category + date (MemoriesPage filter + sort)
CREATE INDEX IF NOT EXISTS idx_memories_user_category_occurred
  ON memories (user_id, category, occurred_at DESC);

-- Memories: user + mood (mood filter on MemoriesPage)
CREATE INDEX IF NOT EXISTS idx_memories_user_mood
  ON memories (user_id, mood);

-- Beliefs: user + kind + status (BeliefsPage filters)
CREATE INDEX IF NOT EXISTS idx_beliefs_user_kind_status
  ON beliefs (user_id, kind, status);

-- Decisions: user + status + date (DecisionMirrorPage listing)
CREATE INDEX IF NOT EXISTS idx_decisions_user_status_created
  ON decisions (user_id, status, created_at DESC);

-- Timeline: user + event_type + date (TimelinePage filters)
CREATE INDEX IF NOT EXISTS idx_timeline_user_type_occurred
  ON timeline_events (user_id, event_type, occurred_at DESC);

-- Captures: user + date (CaptureInboxPage reverse-chron listing)
CREATE INDEX IF NOT EXISTS idx_captures_user_created
  ON captures (user_id, created_at DESC);

-- Insights: user + evidence quality (InsightsPage quality filter)
CREATE INDEX IF NOT EXISTS idx_insights_user_quality
  ON insights (user_id, evidence_quality);

-- Reflections: user + period type (ReflectionWorkspacePage filter)
CREATE INDEX IF NOT EXISTS idx_reflections_user_type
  ON reflections (user_id, period_type);
