/*
# Extend beliefs for origin tracking and add AI suggestions

1. Plain-English explanation
Beliefs & Values now distinguishes who authored each statement. Anything the
user wrote or confirmed themselves is a "confirmed" record; anything the twin
noticed as a pattern across memories is a "suggestion" that stays clearly
labeled until the user explicitly accepts or dismisses it. Confirmed statements
and AI inferences are kept apart by the origin column and never mixed. Beliefs
also gain an optional longer description and a "last reviewed" date the user
controls.

2. Modified Tables
- `beliefs` — new columns:
  - description (text, nullable): optional longer explanation in the user's words.
  - origin (text, not null, default 'user'): 'user' | 'suggestion' | 'confirmed_suggestion'.
    * 'user': written directly by the user.
    * 'suggestion': AI-inferred pattern; visible but labeled, not yet confirmed.
    * 'confirmed_suggestion': AI-inferred pattern the user has explicitly accepted.
  - last_reviewed (timestamptz, nullable): when the user last reviewed this belief.

3. New Rows (idempotent, only when missing)
- Two AI 'suggestion' rows for the fictional demo persona, so the suggestion
  workflow can be demonstrated. These are clearly AI inferences and are NOT
  confirmed user statements.

4. Security
- RLS is already enabled on `beliefs` with anon+authenticated CRUD policies
  (single-tenant demo, intentionally shared sample data). No policy changes.

5. Notes
- All statements idempotent; safe to re-run.
*/

ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'user'
  CHECK (origin IN ('user', 'suggestion', 'confirmed_suggestion'));
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS last_reviewed timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM beliefs WHERE statement LIKE 'You repeatedly choose %'
  ) THEN
    INSERT INTO beliefs (statement, description, kind, category, strength, status, origin, formed_at, last_reflected_at, created_at)
    VALUES
    ('You repeatedly choose deep work in small teams over visibility, even when it costs status.',
     'Twin suggestion: across several work memories you describe small-room work as your best weeks, while leadership settings appear as rehearsed and draining. Confirm only if this reads true to you.',
     'belief', 'work', 62, 'evolving', 'suggestion',
     now() - interval '2 months', now() - interval '2 months', now() - interval '2 months'),
    ('You treat unstructured time as a requirement, not a reward.',
     'Twin suggestion: your travel and habit memories consistently reserve empty space on purpose. Confirm only if this matches how you actually operate.',
     'belief', 'health', 55, 'active', 'suggestion',
     now() - interval '1 month', now() - interval '1 month', now() - interval '1 month');
  END IF;
END $$;
