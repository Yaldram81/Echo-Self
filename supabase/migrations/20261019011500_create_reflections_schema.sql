/*
# Reflections & Weekly Reviews Schema

1. Plain-English explanation
   Adds a dedicated `reflections` table for periodic reviews (e.g., weekly reflections).
   Users can examine actual recorded experiences from a selected period, write free-form
   or guided reflections, link relevant memories and decisions, and preserve lessons.
   RLS isolates personal reviews strictly to the authenticated owner.
   A unique index on (user_id, period_start, period_end) guarantees idempotency and
   prevents duplicate records on retries or rapid double-clicks.

2. New tables
   - `reflections`:
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users(id) on delete cascade, default auth.uid())
     - `period_start` (timestamptz, not null)
     - `period_end` (timestamptz, not null)
     - `period_type` (text, not null default 'weekly')
     - `title` (text, not null default '')
     - `content` (text, not null default '')
     - `guided_answers` (jsonb, not null default '{}'::jsonb)
     - `summary` (text)
     - `memory_ids` (uuid[], not null default '{}'::uuid[])
     - `decision_ids` (uuid[], not null default '{}'::uuid[])
     - `belief_ids` (uuid[], not null default '{}'::uuid[])
     - `proposed_belief_update` (jsonb)
     - `status` (text, not null default 'saved')
     - `created_at` (timestamptz, not null default now())
     - `updated_at` (timestamptz, not null default now())

3. Security & Isolation
   - RLS enabled on `reflections`.
   - Authenticated users have full CRUD on their own reflections (`auth.uid() = user_id`).
   - Anon visitors can only read public sample rows (`user_id IS NULL`).
*/

CREATE TABLE IF NOT EXISTS public.reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text NOT NULL DEFAULT 'weekly' CHECK (period_type IN ('weekly', 'custom', 'monthly')),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  guided_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  memory_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  decision_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  belief_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  proposed_belief_update jsonb,
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('draft', 'saved', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency constraint: exactly one reflection per user per period range
CREATE UNIQUE INDEX IF NOT EXISTS idx_reflections_user_period
  ON public.reflections (user_id, period_start, period_end);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_reflections_user_start
  ON public.reflections (user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_reflections_status
  ON public.reflections (user_id, status);

-- Enable RLS
ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "select_public_or_own_reflections" ON public.reflections;
DROP POLICY IF EXISTS "insert_own_reflections" ON public.reflections;
DROP POLICY IF EXISTS "update_own_reflections" ON public.reflections;
DROP POLICY IF EXISTS "delete_own_reflections" ON public.reflections;

-- RLS Policies
CREATE POLICY "select_public_or_own_reflections" ON public.reflections FOR SELECT
TO anon, authenticated
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "insert_own_reflections" ON public.reflections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_reflections" ON public.reflections FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_reflections" ON public.reflections FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
