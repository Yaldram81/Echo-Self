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
