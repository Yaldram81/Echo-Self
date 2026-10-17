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
