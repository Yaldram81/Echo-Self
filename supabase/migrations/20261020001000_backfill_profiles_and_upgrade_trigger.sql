/*
# Phase 1: Backfill profiles & upgrade auth sync trigger

1. Plain-English explanation
   Users who signed up before the profiles migration (20261018235800) have no
   `public.profiles` row, causing profile page crashes and missing settings.
   This migration:
   (a) Backfills a profiles row for every `auth.users` entry that lacks one.
   (b) Upgrades the `handle_new_user()` trigger to fire on INSERT *and* UPDATE
       so that auth metadata changes (e.g., display_name update via Supabase
       dashboard) propagate to the profiles table automatically.

2. Security
   - `handle_new_user()` remains SECURITY DEFINER with locked search_path.
   - No new RLS policies; existing profiles RLS is sufficient.

3. Notes
   - Idempotent: INSERT ... WHERE NOT EXISTS, ON CONFLICT DO UPDATE.
   - Safe to re-run.
*/

-- 1a. Backfill: create profile rows for any auth.users that lack one
INSERT INTO public.profiles (id, display_name, created_at, updated_at)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'display_name',
    split_part(COALESCE(u.email, 'User'), '@', 1)
  ),
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 1b. Upgraded trigger function: fires on INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    preferred_name,
    bio,
    avatar_color,
    created_at,
    updated_at
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(COALESCE(new.email, 'User'), '@', 1)),
    COALESCE(new.raw_user_meta_data->>'preferred_name', ''),
    COALESCE(new.raw_user_meta_data->>'bio', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_color', 'terracotta'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = CASE
      WHEN public.profiles.display_name = '' THEN EXCLUDED.display_name
      ELSE public.profiles.display_name
    END,
    updated_at = now();
  RETURN new;
END;
$$;

-- Re-create trigger: fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
