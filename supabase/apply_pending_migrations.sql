-- ==========================================
-- EchoSelf: Consolidated Pending Migrations
-- Project: nepcxqvuavdgrzizvnov
-- Generated for Supabase SQL Editor
-- ==========================================



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261017190950_add_twin_chat_quotas.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Twin Chat AI quotas and rate limiting

1. Purpose
Server-side cost and abuse protection for the `twin-chat` edge function. Limits are
enforced BEFORE any provider call, atomically, in shared Postgres state so that
multiple edge function instances cannot race past the limits.

2. New Tables
- `ai_quota_config` — one row per quota key, server-managed limits:
  - `quota_key` (text, primary key): either `user:<uuid>` for an authenticated
    workspace or `demo:<sha256 hex>` for an anonymous demo bucket (hashed id).
  - `per_minute_limit` (int): max requests per rolling 60s window.
  - `daily_limit` (int): max requests per UTC day.
  - `updated_at` (timestamptz).
  No RLS policies are created: the table is locked by default (RLS enabled, zero
  policies), so API clients cannot read or write it. Only the security-definer
  function below touches it.
- `ai_usage_log` — append-only audit of AI request outcomes:
  - `id`, `quota_key` (text), `outcome` (text: 'success'|'rate_limited'|'provider_error'|
    'timeout'|'rejected'), `provider` (text, default 'google/gemini-2.5-flash'),
  - `input_tokens` / `output_tokens` (int, nullable — reported by the provider when available),
  - `created_at` (timestamptz default now()).
  RLS enabled with zero policies: clients cannot read or write it. No raw IPs, no
  question text, no memory content is stored.

3. New Functions
- `enforce_ai_quota(p_quota_key text, p_per_minute_limit int, p_daily_limit int)`
  returns `allowed boolean, retry_after int` — SECURITY DEFINER, ATOMIC:
  inside one INSERT .. ON CONFLICT .. UPDATE statement it (a) creates the config
  row with the caller-supplied defaults on first use, (b) prunes stale window
  counts, (c) checks the per-minute window and the UTC-daily count, and (d) either
  consumes one request slot (returns allowed=true) or returns allowed=false with a
  computed `retry_after` seconds. All inputs validated (bucket key format, limit
  bounds 1..1000). The daily count is maintained on the same row (requests_today,
  day_start) so no second statement is needed.

4. Security changes
- Both tables: RLS enabled, NO policies → invisible to anon and authenticated
  API clients (deny by default). Table grants: none for anon/authenticated.
- `enforce_ai_quota`: EXECUTE granted to `service_role` ONLY. Never callable by
  anon or authenticated roles; the edge function invokes it with the server-side
  service-role client while all personal-data reads stay on the caller's JWT.
- Function has a locked `search_path` and strict input validation; callers cannot
  alter limits for other buckets (limits are passed only as defaults applied at
  first creation, then owned server-side).

5. Important notes
- Failure policy: if the rate-limit store is unavailable, the edge function FAILS
  CLOSED for expensive provider calls (returns a generic 503) — documented in code.
- Daily budget is per UTC day; per-minute window is a fixed 60s bucket, both
  stored atomically per quota_key.
*/

-- --- tables ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_quota_config (
  quota_key         text PRIMARY KEY,
  per_minute_limit  int  NOT NULL DEFAULT 5  CHECK (per_minute_limit BETWEEN 1 AND 1000),
  daily_limit       int  NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 1 AND 10000),
  window_count      int  NOT NULL DEFAULT 0,
  window_start      timestamptz NOT NULL DEFAULT now(),
  requests_today    int  NOT NULL DEFAULT 0,
  day_start         date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id            bigserial PRIMARY KEY,
  quota_key     text NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('success','rate_limited','provider_error','timeout','rejected')),
  provider      text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_quota_key_created_idx
  ON public.ai_usage_log (quota_key, created_at DESC);

ALTER TABLE public.ai_quota_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log   ENABLE ROW LEVEL SECURITY;

-- No policies: RLS leaves both tables fully closed to anon/authenticated.

-- --- atomic enforcement function ------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_ai_quota(
  p_quota_key        text,
  p_per_minute_limit int,
  p_daily_limit      int
)
RETURNS TABLE (allowed boolean, retry_after int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per_minute int;
  v_daily      int;
  v_allowed    boolean;
  v_retry      int;
BEGIN
  -- Validate inputs: bucket key shape and limit bounds.
  IF p_quota_key IS NULL OR p_quota_key NOT IN
      ('user:' || COALESCE(NULLIF(split_part(p_quota_key, ':', 2), ''), ''))
     OR (p_quota_key LIKE 'user:%'
         AND split_part(p_quota_key, ':', 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     OR (p_quota_key LIKE 'demo:%'
         AND split_part(p_quota_key, ':', 2) !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid quota key';
  END IF;
  IF p_per_minute_limit IS NULL OR p_per_minute_limit NOT BETWEEN 1 AND 1000
     OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid limits';
  END IF;

  -- Single atomic statement: upsert + window checks + slot consumption.
  INSERT INTO public.ai_quota_config AS c
    (quota_key, per_minute_limit, daily_limit, window_count, window_start, requests_today, day_start)
  VALUES
    (p_quota_key, p_per_minute_limit, p_daily_limit, 1, now(), 1, (now() AT TIME ZONE 'utc')::date)
  ON CONFLICT (quota_key) DO UPDATE SET
    per_minute_limit = EXCLUDED.per_minute_limit,
    daily_limit      = EXCLUDED.daily_limit,
    window_count = CASE
      WHEN c.window_start < now() - interval '60 seconds' THEN 1
      ELSE c.window_count + 1 END,
    window_start = CASE
      WHEN c.window_start < now() - interval '60 seconds' THEN now()
      ELSE c.window_start END,
    requests_today = CASE
      WHEN c.day_start < (now() AT TIME ZONE 'utc')::date THEN 1
      ELSE c.requests_today + 1 END,
    day_start = GREATEST(c.day_start, (now() AT TIME ZONE 'utc')::date),
    updated_at = now()
  RETURNING
    (CASE
       WHEN ai_quota_config.window_count > ai_quota_config.per_minute_limit THEN false
       WHEN ai_quota_config.requests_today > ai_quota_config.daily_limit THEN false
       ELSE true
     END,
     CASE
       WHEN ai_quota_config.requests_today > ai_quota_config.daily_limit
         THEN GREATEST(1, (86220 - EXTRACT(EPOCH FROM (now() - (c.day_start::timestamptz + interval '1 day'))))::int)
       WHEN c.window_start >= now() - interval '60 seconds'
         THEN GREATEST(1, (60 - EXTRACT(EPOCH FROM (now() - c.window_start)))::int)
       ELSE 60
     END)
  INTO v_allowed, v_retry;

  RETURN QUERY SELECT v_allowed, v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_quota(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ai_quota(text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.enforce_ai_quota(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ai_quota(text, int, int) TO service_role;

REVOKE ALL ON public.ai_quota_config FROM anon, authenticated;
REVOKE ALL ON public.ai_usage_log FROM anon, authenticated;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261017193231_add_memory_user_importance.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Add user-controlled importance to memories

1. Purpose
Adds an optional, user-assigned importance rating to memory records — how
significant this memory is to the user. This is deliberately distinct from the
existing `confidence` field (how reliably the user remembers the recorded
information). One never substitutes for the other, and neither affects the
other. Records without a rating stay valid: the column is nullable and no
default is invented for existing rows.

2. Modified Tables
- `memories`
  - add `user_importance` (smallint, nullable) — user-assigned significance on
    a documented 1–5 scale: 1 = minor, 2 = low, 3 = notable, 4 = very
    significant, 5 = among the most important things I've recorded.
    NULL means "not rated" — treated by retrieval as no signal, not as low.

3. Security
- No RLS or policy changes; the column rides the table's existing
  ownership-aware policies and column grants (client roles already hold table
  INSERT/SELECT, so no new grants are required).

4. Notes
- Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.
- No backfill: existing and demo records keep NULL importance by design.
*/

ALTER TABLE memories ADD COLUMN IF NOT EXISTS user_importance smallint;
ALTER TABLE memories ADD CONSTRAINT memories_user_importance_range
  CHECK (user_importance BETWEEN 1 AND 5) NOT VALID;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261018235800_create_profiles_table.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019001000_create_captures_inbox_table.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019004500_create_review_center_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Create Review Center Schema and Atomic Governance Operations

1. Plain-English Summary
   Adds backend support for EchoSelf's unified Review Center:
   - `review_actions_log`: An immutable audit trail tracking all approvals,
     dismissals, and edits made in the Review Center.
   - `apply_decision_proposal`: An atomic stored procedure ensuring that
     approving a decision-motivated belief change updates the decision's
     proposal status, adjusts the belief's strength, and logs the change to
     `beliefs_history` in a single ACID transaction.
   - `log_review_action`: A helper procedure for logging review decisions with
     caller authentication.

2. New Tables
   - `review_actions_log`
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users(id) on delete cascade)
     - `item_id` (text, unique address of the review item)
     - `item_kind` (text, check constrained)
     - `action` (text: 'approved', 'dismissed', 'amended')
     - `decision_context` (jsonb)
     - `created_at` (timestamptz, default now())

3. Security
   - Row-Level Security (RLS) enabled on `review_actions_log`.
   - Authenticated users have full SELECT, INSERT, DELETE on their own logs.
   - Anonymous access is prohibited.
   - Database operations derive user_id from `auth.uid()`, preventing spoofing.
*/

-- 1. Create audit log table
CREATE TABLE IF NOT EXISTS public.review_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN (
    'belief_suggestion',
    'interpretation_flag',
    'statement_relationship',
    'graph_edge',
    'decision_proposal'
  )),
  action text NOT NULL CHECK (action IN ('approved', 'dismissed', 'amended')),
  decision_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices for efficient history lookups and duplicate prevention
CREATE INDEX IF NOT EXISTS idx_review_actions_user_created 
  ON public.review_actions_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_actions_lookup 
  ON public.review_actions_log (user_id, item_kind, action);

-- Enable RLS
ALTER TABLE public.review_actions_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "select_own_review_actions" ON public.review_actions_log;
DROP POLICY IF EXISTS "insert_own_review_actions" ON public.review_actions_log;
DROP POLICY IF EXISTS "delete_own_review_actions" ON public.review_actions_log;

-- Policy: Select own review logs
CREATE POLICY "select_own_review_actions"
  ON public.review_actions_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Insert own review logs
CREATE POLICY "insert_own_review_actions"
  ON public.review_actions_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Delete own review logs
CREATE POLICY "delete_own_review_actions"
  ON public.review_actions_log
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Stored Procedure: Atomic Decision Proposal Application
CREATE OR REPLACE FUNCTION public.apply_decision_proposal(
  p_decision_id uuid,
  p_proposal_id text,
  p_belief_id uuid,
  p_next_strength int,
  p_status text DEFAULT 'approved'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_decision record;
  v_proposal jsonb;
  v_updated_proposals jsonb := '[]'::jsonb;
  v_p jsonb;
  v_found boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to apply decision proposal';
  END IF;

  -- Verify ownership of decision
  SELECT * INTO v_decision 
  FROM public.decisions 
  WHERE id = p_decision_id AND (user_id = v_user_id OR user_id IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision record not found or not owned by user';
  END IF;

  -- Iterate over proposals and update the target proposal
  FOR v_p IN SELECT * FROM jsonb_array_elements(COALESCE(v_decision.proposals, '[]'::jsonb))
  LOOP
    IF (v_p->>'id') = p_proposal_id THEN
      v_proposal := v_p || jsonb_build_object(
        'status', p_status,
        'resolvedAt', now()::text
      );
      v_updated_proposals := v_updated_proposals || jsonb_build_array(v_proposal);
      v_found := true;
    ELSE
      v_updated_proposals := v_updated_proposals || jsonb_build_array(v_p);
    END IF;
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Proposal % not found in decision %', p_proposal_id, p_decision_id;
  END IF;

  -- Update decision row
  UPDATE public.decisions
  SET proposals = v_updated_proposals
  WHERE id = p_decision_id;

  -- If approved, update belief strength and add entry to beliefs_history
  IF p_status = 'approved' AND p_belief_id IS NOT NULL THEN
    UPDATE public.beliefs
    SET strength = p_next_strength,
        last_reviewed = now()
    WHERE id = p_belief_id AND (user_id = v_user_id OR user_id IS NULL);

    -- Record in beliefs_history for audit trail
    INSERT INTO public.beliefs_history (belief_id, user_id, strength, note, recorded_at)
    VALUES (
      p_belief_id,
      v_user_id,
      p_next_strength,
      'Adjusted via Review Center from decision: ' || v_decision.title,
      now()
    );
  END IF;

  -- Record audit log entry
  INSERT INTO public.review_actions_log (user_id, item_id, item_kind, action, decision_context)
  VALUES (
    v_user_id,
    'decision_proposal:' || p_decision_id::text || ':' || p_proposal_id,
    'decision_proposal',
    p_status,
    jsonb_build_object(
      'decision_id', p_decision_id,
      'proposal_id', p_proposal_id,
      'belief_id', p_belief_id,
      'new_strength', p_next_strength
    )
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- 3. Helper Function: Log Review Action
CREATE OR REPLACE FUNCTION public.log_review_action(
  p_item_id text,
  p_item_kind text,
  p_action text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.review_actions_log (user_id, item_id, item_kind, action, decision_context)
  VALUES (auth.uid(), p_item_id, p_item_kind, p_action, p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019005000_create_insights_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Create Insights & Patterns Schema

1. Plain-English Summary
   Adds backend persistence for EchoSelf's Evidence-Grounded Insights & Patterns:
   - `insights`: Stores candidate, confirmed, and dismissed pattern interpretations
     grounded in the user's recorded memories, decisions, and beliefs.
   - Preserves provenance by referencing supporting and counter-evidence record IDs.
   - Supports user confirmation, in-place corrections, and promotion to permanent beliefs.

2. Table Structure
   - `id` (uuid, primary key)
   - `user_id` (uuid, references auth.users(id) on delete cascade)
   - `category` (text: recurring_theme, decision_pattern, belief_evolution, repeated_obstacle, value_alignment, stated_vs_choice_tension, reflection_prompt)
   - `title` (text, concise headline)
   - `statement` (text, plain-language description of the pattern)
   - `scope_label` (text, e.g. "Work & Projects • Last 6 Months")
   - `evidence_quality` (text: multiple_examples, single_example, conflicting_evidence, limited_recent, insufficient_evidence)
   - `evidence_coverage` (text, plain-English summary of record counts)
   - `status` (text: candidate, confirmed, dismissed, default candidate)
   - `user_correction` (text, optional user override)
   - `supporting_memory_ids` (uuid[], array of memory IDs backing the pattern)
   - `counter_memory_ids` (uuid[], array of conflicting or counter-example memory IDs)
   - `related_decision_ids` (uuid[], array of relevant decision IDs)
   - `related_belief_ids` (uuid[], array of relevant belief IDs)
   - `reasoning` (text, full explanation of how the pattern was identified)
   - `uncertainty_notes` (text, explicit limitations and ambiguities)
   - `promoted_belief_id` (uuid, references beliefs(id) on delete set null)
   - `generated_at` (timestamptz, default now())
   - `reviewed_at` (timestamptz, null until user acts)
   - `created_at`, `updated_at` (timestamptz)

3. Security
   - Row-Level Security (RLS) enabled on `insights`.
   - Authenticated users have full CRUD on their own rows.
   - Anonymous visitors have read-only access to demo persona rows (user_id IS NULL)
     and zero write access.
   - Insert and update defaults enforce auth.uid() = user_id.
*/

CREATE TABLE IF NOT EXISTS public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'recurring_theme',
    'decision_pattern',
    'belief_evolution',
    'repeated_obstacle',
    'value_alignment',
    'stated_vs_choice_tension',
    'reflection_prompt'
  )),
  title text NOT NULL,
  statement text NOT NULL,
  scope_label text NOT NULL DEFAULT 'All recorded history',
  evidence_quality text NOT NULL CHECK (evidence_quality IN (
    'multiple_examples',
    'single_example',
    'conflicting_evidence',
    'limited_recent',
    'insufficient_evidence'
  )),
  evidence_coverage text NOT NULL,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'dismissed')),
  user_correction text,
  supporting_memory_ids uuid[] NOT NULL DEFAULT '{}',
  counter_memory_ids uuid[] NOT NULL DEFAULT '{}',
  related_decision_ids uuid[] NOT NULL DEFAULT '{}',
  related_belief_ids uuid[] NOT NULL DEFAULT '{}',
  reasoning text NOT NULL,
  uncertainty_notes text NOT NULL,
  promoted_belief_id uuid REFERENCES public.beliefs(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices for efficient filtering and listing
CREATE INDEX IF NOT EXISTS idx_insights_user_status 
  ON public.insights (user_id, status);

CREATE INDEX IF NOT EXISTS idx_insights_user_category 
  ON public.insights (user_id, category);

CREATE INDEX IF NOT EXISTS idx_insights_user_generated 
  ON public.insights (user_id, generated_at DESC);

-- Enable Row-Level Security
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "select_public_or_own_insights" ON public.insights;
DROP POLICY IF EXISTS "insert_own_insights" ON public.insights;
DROP POLICY IF EXISTS "update_own_insights" ON public.insights;
DROP POLICY IF EXISTS "delete_own_insights" ON public.insights;

-- Policy: Select own or public sample demo insights
CREATE POLICY "select_public_or_own_insights"
  ON public.insights
  FOR SELECT
  TO public
  USING (user_id IS NULL OR (auth.role() = 'authenticated' AND auth.uid() = user_id));

-- Policy: Insert own insights
CREATE POLICY "insert_own_insights"
  ON public.insights
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Update own insights
CREATE POLICY "update_own_insights"
  ON public.insights
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Delete own insights
CREATE POLICY "delete_own_insights"
  ON public.insights
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019011500_create_reflections_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019014000_create_privacy_data_center_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261019020000_add_onboarding_state_to_profiles.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020001000_backfill_profiles_and_upgrade_trigger.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020002000_default_user_id_on_core_tables.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Phase 2: Default user_id to auth.uid() on legacy core tables

1. Plain-English explanation
   The original core tables (memories, beliefs, decisions, timeline_events,
   beliefs_history, interpretation_flags) were created without a DEFAULT on
   their user_id column. Newer tables (insights, reflections, etc.) already
   have DEFAULT auth.uid(). This migration aligns the legacy tables so that
   if a client omits user_id on insert, it is automatically filled from the
   authenticated session JWT.

2. Notes
   - user_id stays NULLABLE so pre-seeded demo data (user_id IS NULL)
     continues to work for anonymous visitors.
   - Idempotent: ALTER COLUMN SET DEFAULT is a no-op if already set.
   - No data is modified; only the default expression changes.
*/

ALTER TABLE memories ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE decisions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE timeline_events ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs_history ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE interpretation_flags ALTER COLUMN user_id SET DEFAULT auth.uid();



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020003000_auto_updated_at_trigger.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/*
# Phase 3: Auto-update updated_at trigger

1. Plain-English explanation
   Adds a generic trigger function `set_updated_at()` that automatically
   advances the `updated_at` column on every UPDATE. Then:
   (a) Adds `updated_at` columns to core tables that lack them
       (memories, beliefs, decisions, timeline_events).
   (b) Attaches the trigger to ALL tables that have an `updated_at` column.

2. Notes
   - Idempotent: ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF EXISTS.
   - The trigger is a simple BEFORE UPDATE that sets NEW.updated_at = now().
*/

-- Generic trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add updated_at to core tables that lack it
ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Attach trigger to all tables with updated_at
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles',
      'memories',
      'beliefs',
      'decisions',
      'timeline_events',
      'captures',
      'insights',
      'reflections'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I; '
      'CREATE TRIGGER trg_set_updated_at '
      'BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020004000_add_composite_indexes.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020005000_enhance_account_deletion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020006000_add_user_stats_function.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 20261020007000_strict_workspace_isolation_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

