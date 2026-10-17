/*
# Add classification overrides to decisions

1. Plain-English explanation
   The Decision Mirror classifies memories as "for", "against", "neutral", or
   "unknown" for each option and value. Inferred classifications (from keyword
   matching) can now be corrected by the user. To make those corrections
   survive reloads, they must be stored with the decision.

2. New columns
   - `decisions.classification_overrides` (jsonb, default '{}'::jsonb):
     a map keyed by "<decisionId>:<optionLabel>:<value>:<memoryId>" whose value
     is the user's corrected classification ("for", "against", "neutral", or
     "unknown"). Only user-corrected entries are stored; the engine treats
     them as explicit user judgments.

3. Modified tables
   - `decisions`: one new nullable-safe jsonb column with a default; no
     existing data is touched.

4. Security
   - No changes. RLS and existing policies on `decisions` remain as-is; the
     new column inherits the table's existing access rules.

5. Notes
   - Idempotent: uses ADD COLUMN IF NOT EXISTS.
   - No backfill needed: decisions with no corrections use the default '{}'.
*/

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS classification_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;