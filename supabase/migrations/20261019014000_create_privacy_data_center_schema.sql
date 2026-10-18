/*
# Privacy & Data Center: Account Deletion RPC & Privacy Controls

1. Plain-English explanation
   Provides explicit database-level privacy controls:
   - Adds `ai_personalization_enabled`, `semantic_retrieval_enabled`, and `data_retention_period`
     columns to `public.profiles` so user privacy preferences are securely stored in PostgreSQL.
   - Creates a transactional server-side function `delete_user_account()` with SECURITY DEFINER
     that allows an authenticated user to purge all personal data across all 12 tables and delete
     their account row from `auth.users`.
   - Guaranteed security: `curr_uid := auth.uid()` guarantees that only the authenticated caller's
     records can be deleted. Public demo seed data (where `user_id IS NULL`) is strictly preserved.

2. Schema Modifications
   - `public.profiles`:
     - `ai_personalization_enabled` (boolean NOT NULL DEFAULT true)
     - `semantic_retrieval_enabled` (boolean NOT NULL DEFAULT true)
     - `data_retention_period` (text NOT NULL DEFAULT 'indefinite')

3. Functions
   - `delete_user_account()`: Deletes user data across all tables and deletes user from `auth.users`.
*/

-- 1. Extend profiles with privacy and data controls
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_personalization_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS semantic_retrieval_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS data_retention_period text NOT NULL DEFAULT 'indefinite';

-- 2. Transactional procedure for complete user account & data deletion
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

  -- Delete all user-owned records in dependency-safe order
  DELETE FROM public.memory_embeddings WHERE user_id = curr_uid;
  DELETE FROM public.captures WHERE user_id = curr_uid;
  DELETE FROM public.interpretation_flags WHERE user_id = curr_uid;
  DELETE FROM public.memories WHERE user_id = curr_uid;
  DELETE FROM public.beliefs_history WHERE user_id = curr_uid;
  DELETE FROM public.beliefs WHERE user_id = curr_uid;
  DELETE FROM public.decisions WHERE user_id = curr_uid;
  DELETE FROM public.reflections WHERE user_id = curr_uid;
  DELETE FROM public.insights WHERE user_id = curr_uid;
  DELETE FROM public.timeline_events WHERE user_id = curr_uid;
  DELETE FROM public.statement_relationships WHERE user_id = curr_uid;
  DELETE FROM public.graph_edge_confirmations WHERE user_id = curr_uid;
  DELETE FROM public.review_actions_log WHERE user_id = curr_uid;
  DELETE FROM public.profiles WHERE id = curr_uid;

  -- Delete user from auth.users (cascades any remaining auth sessions/identities)
  DELETE FROM auth.users WHERE id = curr_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;
