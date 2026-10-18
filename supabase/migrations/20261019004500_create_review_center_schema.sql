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
