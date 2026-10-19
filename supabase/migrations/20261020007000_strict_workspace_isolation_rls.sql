/*
# Strict Workspace Isolation RLS Migration

1. Plain-English explanation
   Previously, the select policy on memories, beliefs, decisions, and timeline_events was:
     USING (user_id IS NULL OR auth.uid() = user_id)
   This allowed authenticated users to see BOTH their own records AND the public demo persona (user_id IS NULL).
   This migration replaces those policies with strict workspace isolation:
   - When authenticated (auth.uid() IS NOT NULL): ONLY rows where user_id = auth.uid() are visible.
   - When anonymous/guest (auth.uid() IS NULL): ONLY rows where user_id IS NULL are visible.
   This guarantees that authenticated user workspaces never see public demo seed data.
*/

-- ============ memories ============
DROP POLICY IF EXISTS "select_public_or_own_memories" ON public.memories;
DROP POLICY IF EXISTS "select_memories" ON public.memories;
CREATE POLICY "select_memories" ON public.memories FOR SELECT
TO anon, authenticated
USING (
  CASE 
    WHEN auth.uid() IS NOT NULL THEN user_id = auth.uid()
    ELSE user_id IS NULL
  END
);

-- ============ beliefs ============
DROP POLICY IF EXISTS "select_public_or_own_beliefs" ON public.beliefs;
DROP POLICY IF EXISTS "select_beliefs" ON public.beliefs;
CREATE POLICY "select_beliefs" ON public.beliefs FOR SELECT
TO anon, authenticated
USING (
  CASE 
    WHEN auth.uid() IS NOT NULL THEN user_id = auth.uid()
    ELSE user_id IS NULL
  END
);

-- ============ decisions ============
DROP POLICY IF EXISTS "select_public_or_own_decisions" ON public.decisions;
DROP POLICY IF EXISTS "select_decisions" ON public.decisions;
CREATE POLICY "select_decisions" ON public.decisions FOR SELECT
TO anon, authenticated
USING (
  CASE 
    WHEN auth.uid() IS NOT NULL THEN user_id = auth.uid()
    ELSE user_id IS NULL
  END
);

-- ============ timeline_events ============
DROP POLICY IF EXISTS "select_public_or_own_timeline" ON public.timeline_events;
DROP POLICY IF EXISTS "select_timeline" ON public.timeline_events;
CREATE POLICY "select_timeline" ON public.timeline_events FOR SELECT
TO anon, authenticated
USING (
  CASE 
    WHEN auth.uid() IS NOT NULL THEN user_id = auth.uid()
    ELSE user_id IS NULL
  END
);

-- ============ interpretation_flags ============
DROP POLICY IF EXISTS "select_own_flags" ON public.interpretation_flags;
DROP POLICY IF EXISTS "select_flags" ON public.interpretation_flags;
CREATE POLICY "select_flags" ON public.interpretation_flags FOR SELECT
TO anon, authenticated
USING (
  CASE 
    WHEN auth.uid() IS NOT NULL THEN user_id = auth.uid()
    ELSE user_id IS NULL
  END
);
