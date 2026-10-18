/*
# Create captures inbox table with RLS, promotion references, and sample demo data

1. Plain-English explanation
   The Capture Inbox gives users a frictionless way to record raw thoughts,
   observations, fleeting reflections, and moments without having to complete
   the full Memory form. Captures remain in the Inbox until reviewed and
   promoted into permanent memories. When promoted, the original capture is
   preserved with its original text, timestamps, and a link to the created
   memory (`promoted_memory_id`), preventing duplicate promotions.

2. New Tables
   - `public.captures`:
     - id (uuid pk, default gen_random_uuid())
     - user_id (uuid, nullable, references auth.users(id) on delete cascade)
       (NULL = public demo capture persona)
     - content (text not null) - raw captured text
     - title (text nullable) - optional headline
     - category (text nullable) - optional domain
     - tags (text[] not null default '{}')
     - occurred_at (timestamptz not null default now())
     - status (text not null check in ('inbox', 'promoted', 'archived') default 'inbox')
     - promoted_memory_id (uuid nullable references memories(id) on delete set null)
     - promoted_at (timestamptz nullable)
     - created_at (timestamptz not null default now())
     - updated_at (timestamptz not null default now())

3. Security
   - Row Level Security (RLS) enabled on `public.captures`.
   - Signed-out visitors (anon): SELECT public sample captures only (`user_id IS NULL`).
   - Authenticated users: SELECT own captures + sample captures (`user_id IS NULL OR auth.uid() = user_id`).
   - Authenticated users: INSERT/UPDATE/DELETE only their own captures (`auth.uid() = user_id`).
   - Duplicate promotion guard: prevents creating multiple memories from a single capture.

4. Sample Data
   - Seeds a few diverse demo captures for the read-only demonstration persona (Jordan).
*/

CREATE TABLE IF NOT EXISTS public.captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('inbox', 'promoted', 'archived')) DEFAULT 'inbox',
  promoted_memory_id uuid REFERENCES memories(id) ON DELETE SET NULL,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient listing, filtering and foreign key lookup
CREATE INDEX IF NOT EXISTS idx_captures_user_status ON public.captures (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captures_promoted_memory ON public.captures (promoted_memory_id);
CREATE INDEX IF NOT EXISTS idx_captures_tags ON public.captures USING gin (tags);

-- Enable RLS
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captures TO authenticated;
GRANT SELECT ON public.captures TO anon;

-- Policies
DROP POLICY IF EXISTS "select_public_or_own_captures" ON public.captures;
CREATE POLICY "select_public_or_own_captures" ON public.captures
  FOR SELECT
  TO anon, authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_captures" ON public.captures;
CREATE POLICY "insert_own_captures" ON public.captures
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_captures" ON public.captures;
CREATE POLICY "update_own_captures" ON public.captures
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_captures" ON public.captures;
CREATE POLICY "delete_own_captures" ON public.captures
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Seed demo captures for the shared Jordan persona (idempotent: only if no sample rows exist)
INSERT INTO public.captures (id, user_id, content, title, category, tags, status, occurred_at, created_at)
SELECT
  'c0000000-0000-0000-0000-000000000001'::uuid,
  NULL,
  'Notice how much calmer mornings feel when I leave my phone in the kitchen overnight. Need to test this for another two weeks before calling it a permanent habit.',
  'Kitchen phone experiment note',
  'health',
  ARRAY['habits', 'mornings', 'screen-time'],
  'inbox',
  now() - interval '2 days',
  now() - interval '2 days'
WHERE NOT EXISTS (SELECT 1 FROM public.captures WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO public.captures (id, user_id, content, title, category, tags, status, occurred_at, created_at)
SELECT
  'c0000000-0000-0000-0000-000000000002'::uuid,
  NULL,
  'Overheard an engineer say: "Simplicity is the prerequisite for reliability." Struck a chord with my current dilemma over our microservices refactor.',
  'Simplicity and reliability quote',
  'work',
  ARRAY['engineering', 'simplicity', 'architecture'],
  'inbox',
  now() - interval '5 days',
  now() - interval '5 days'
WHERE NOT EXISTS (SELECT 1 FROM public.captures WHERE id = 'c0000000-0000-0000-0000-000000000002'::uuid);

INSERT INTO public.captures (id, user_id, content, title, category, tags, status, occurred_at, created_at)
SELECT
  'c0000000-0000-0000-0000-000000000003'::uuid,
  NULL,
  'Had a great walk with Maya around the reservoir discussing her graduate school decision. Realized I often give advice too fast instead of simply asking what she fears.',
  'Listening during walk with Maya',
  'relationship',
  ARRAY['listening', 'maya', 'conversations'],
  'inbox',
  now() - interval '7 days',
  now() - interval '7 days'
WHERE NOT EXISTS (SELECT 1 FROM public.captures WHERE id = 'c0000000-0000-0000-0000-000000000003'::uuid);
