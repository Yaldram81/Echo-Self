/*
# Phase 5: Enhanced delete_user_account() covering all tables

1. Plain-English explanation
   Replaces the existing `delete_user_account()` with an enhanced version
   that deletes data from ALL 16 user-owned tables in FK-safe dependency
   order, including AI quota/usage records keyed by 'user:<uuid>'.

2. Security
   - SECURITY DEFINER with locked search_path.
   - auth.uid() prevents unauthenticated or cross-user calls.
   - EXECUTE granted only to authenticated role.
*/

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  curr_uid uuid := auth.uid();
BEGIN
  IF curr_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: cannot delete unauthenticated account';
  END IF;

  -- 1. Derived / child data first (FK dependency order)
  DELETE FROM public.memory_embeddings WHERE user_id = curr_uid;
  DELETE FROM public.graph_edge_confirmations WHERE user_id = curr_uid;
  DELETE FROM public.statement_relationships WHERE user_id = curr_uid;
  DELETE FROM public.review_actions_log WHERE user_id = curr_uid;
  DELETE FROM public.interpretation_flags WHERE user_id = curr_uid;
  DELETE FROM public.beliefs_history WHERE user_id = curr_uid;

  -- 2. Captures (may FK to memories via promoted_memory_id)
  DELETE FROM public.captures WHERE user_id = curr_uid;

  -- 3. Insights (FKs to beliefs via promoted_belief_id)
  DELETE FROM public.insights WHERE user_id = curr_uid;

  -- 4. Reflections
  DELETE FROM public.reflections WHERE user_id = curr_uid;

  -- 5. Primary data tables
  DELETE FROM public.memories WHERE user_id = curr_uid;
  DELETE FROM public.beliefs WHERE user_id = curr_uid;
  DELETE FROM public.decisions WHERE user_id = curr_uid;
  DELETE FROM public.timeline_events WHERE user_id = curr_uid;

  -- 6. User profile
  DELETE FROM public.profiles WHERE id = curr_uid;

  -- 7. AI quota and usage records keyed by 'user:<uuid>'
  DELETE FROM public.ai_quota_config WHERE quota_key = 'user:' || curr_uid::text;
  DELETE FROM public.ai_usage_log WHERE quota_key = 'user:' || curr_uid::text;

  -- 8. Delete auth user (cascades remaining sessions/identities)
  DELETE FROM auth.users WHERE id = curr_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;
