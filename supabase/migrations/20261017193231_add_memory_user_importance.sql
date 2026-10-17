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
