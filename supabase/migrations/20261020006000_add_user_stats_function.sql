/*
# Phase 6: User stats aggregation function

1. Plain-English explanation
   Creates a `get_user_stats()` function that returns aggregated counts
   across all user-owned tables in a single database round-trip. This
   replaces the N separate count queries that each page currently runs.

2. Security
   - SECURITY INVOKER: runs under the caller's RLS context.
   - STABLE: does not modify data, safe for read replicas.
   - auth.uid() scopes all counts to the authenticated user.
   - Returns empty JSON for unauthenticated callers.
*/

CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'memories_count',     (SELECT count(*) FROM memories WHERE user_id = uid),
    'beliefs_count',      (SELECT count(*) FROM beliefs WHERE user_id = uid),
    'active_beliefs',     (SELECT count(*) FROM beliefs WHERE user_id = uid AND status = 'active'),
    'evolving_beliefs',   (SELECT count(*) FROM beliefs WHERE user_id = uid AND status = 'evolving'),
    'revisited_beliefs',  (SELECT count(*) FROM beliefs WHERE user_id = uid AND status = 'revisited'),
    'values_count',       (SELECT count(*) FROM beliefs WHERE user_id = uid AND kind = 'value'),
    'decisions_count',    (SELECT count(*) FROM decisions WHERE user_id = uid),
    'open_decisions',     (SELECT count(*) FROM decisions WHERE user_id = uid AND status = 'unresolved'),
    'decided_count',      (SELECT count(*) FROM decisions WHERE user_id = uid AND status = 'decided'),
    'timeline_count',     (SELECT count(*) FROM timeline_events WHERE user_id = uid),
    'captures_total',     (SELECT count(*) FROM captures WHERE user_id = uid),
    'captures_inbox',     (SELECT count(*) FROM captures WHERE user_id = uid AND status = 'inbox'),
    'captures_promoted',  (SELECT count(*) FROM captures WHERE user_id = uid AND status = 'promoted'),
    'insights_count',     (SELECT count(*) FROM insights WHERE user_id = uid),
    'candidate_insights', (SELECT count(*) FROM insights WHERE user_id = uid AND status = 'candidate'),
    'confirmed_insights', (SELECT count(*) FROM insights WHERE user_id = uid AND status = 'confirmed'),
    'reflections_count',  (SELECT count(*) FROM reflections WHERE user_id = uid),
    'pending_reviews',    (SELECT count(*) FROM statement_relationships WHERE user_id = uid AND status = 'candidate'),
    'confirmed_edges',    (SELECT count(*) FROM graph_edge_confirmations WHERE user_id = uid AND status = 'confirmed'),
    'embeddings_count',   (SELECT count(*) FROM memory_embeddings WHERE user_id = uid),
    'account_created_at', (SELECT created_at FROM profiles WHERE id = uid)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_stats() TO authenticated;
