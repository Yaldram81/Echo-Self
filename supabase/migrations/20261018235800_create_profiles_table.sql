/*
# Create profiles table with user ownership, RLS, and auth sync trigger

1. Plain-English explanation
   Provides a dedicated `profiles` table to store user identity (display name,
   preferred form of address, bio, avatar tint, and twin personalization preferences)
   in PostgreSQL. A trigger on `auth.users` automatically initializes a profile row
   when an account is created with metadata, and strict Row Level Security ensures users
   can only inspect and modify their own profile.

2. New Tables
   - `public.profiles`:
     - id (uuid pk, references auth.users(id) on delete cascade)
     - display_name (text not null default '')
     - preferred_name (text not null default '')
     - bio (text not null default '')
     - avatar_color (text not null default 'terracotta')
     - twin_tone (text not null default 'contemplative')
     - response_style (text not null default 'balanced')
     - twin_context (text not null default '')
     - date_format (text not null default 'relative')
     - grounding_level (text not null default 'strict')
     - created_at (timestamptz not null default now())
     - updated_at (timestamptz not null default now())

3. Security
   - Row Level Security (RLS) enabled on `public.profiles`.
   - Authenticated users can SELECT, INSERT, UPDATE, and DELETE only their own row (`auth.uid() = id`).
   - Table privileges granted to `authenticated` and `anon` roles.

4. Trigger
   - `on_auth_user_created` trigger on `auth.users` fires after insert, copying
     `raw_user_meta_data->>'display_name'` into `public.profiles`.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  preferred_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_color text NOT NULL DEFAULT 'terracotta',
  twin_tone text NOT NULL DEFAULT 'contemplative',
  response_style text NOT NULL DEFAULT 'balanced',
  twin_context text NOT NULL DEFAULT '',
  date_format text NOT NULL DEFAULT 'relative',
  grounding_level text NOT NULL DEFAULT 'strict',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles (updated_at DESC);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Policies
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON public.profiles;
CREATE POLICY "delete_own_profile" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Trigger function to automatically create profile on auth.users insert
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
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = CASE
      WHEN public.profiles.display_name = '' THEN EXCLUDED.display_name
      ELSE public.profiles.display_name
    END,
    updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
