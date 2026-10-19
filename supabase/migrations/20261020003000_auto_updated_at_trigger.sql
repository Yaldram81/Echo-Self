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
