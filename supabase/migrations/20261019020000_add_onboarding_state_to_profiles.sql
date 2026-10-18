/*
# Add onboarding state columns to profiles

1. Plain-English explanation
   Tracks the first-run onboarding progress and completion status for authenticated
   users in `public.profiles`. This allows new users to be welcomed, guided through
   EchoSelf's core principles and expectations, optionally configure preferences,
   and choose their first action, while ensuring established users are not repeatedly
   prompted across browsers or devices.

2. Schema Additions
   - `public.profiles`:
     - `onboarding_completed` (boolean NOT NULL DEFAULT false)
     - `onboarding_step` (integer NOT NULL DEFAULT 1)

3. Security
   - Existing Row Level Security (RLS) on `public.profiles` ensures authenticated users
     can only inspect and modify their own row (`auth.uid() = id`).
   - Unauthenticated demo visitors never touch `public.profiles`.
*/

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 1;

-- Index to quickly query onboarding completion if needed
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON public.profiles (id, onboarding_completed);
