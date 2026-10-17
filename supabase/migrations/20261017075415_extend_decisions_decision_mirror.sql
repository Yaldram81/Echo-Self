/*
# Extend decisions for the Decision Mirror experience

1. Plain-English explanation
The Decision Mirror now captures much more than two options: the constraints and
uncertainties around a decision, the personal values it touches, what a
successful outcome would mean, the user's own rationale for the choice they
record, and — after time passes — a reflection comparing what they expected with
what actually happened. Users can also edit the twin's generated analysis and
set their own importance weights for each value, so any alignment scores
reflect their preferences, not predictions.

2. Modified Tables
- `decisions` — new nullable columns:
  - constraints (text): limits the user is working within.
  - uncertainties (text): what they don't know or can't control.
  - values (text[]): ids or short names of their relevant personal values.
  - success_definition (text): what a successful outcome would mean.
  - analysis (jsonb): the twin's structured analysis (editable by the user).
  - analysis_edited (boolean, default false): whether the user overrode the generated analysis.
  - value_weights (jsonb): user-adjusted weights per value name, e.g. {"family": 0.8}.
  - rationale (text): the user's own reasoning when recording their choice.
  - reflection (jsonb): outcome reflection — what happened vs. original reasoning.
  - reflected_at (timestamptz): when the reflection was recorded.

3. Data changes (idempotent)
- Backfills the three existing demo decisions with constraints, uncertainties,
  values, and success definitions, plus one fully-worked example including
  analysis, weights, a recorded choice with rationale, and an outcome
  reflection — so the fictional demo persona shows the complete lifecycle.

4. Security
- RLS is already enabled on `decisions` with anon+authenticated CRUD policies.
  No policy changes; all new columns inherit those grants (single-tenant demo,
  intentionally shared sample data).

5. Notes
- All statements idempotent; safe to re-run.
- `analysis` and `reflection` are jsonb so their structure can evolve without
  further migrations. Frontend validates the shape before rendering.
*/

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS constraints text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS uncertainties text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS values text[] NOT NULL DEFAULT '{}';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS success_definition text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS analysis jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS analysis_edited boolean NOT NULL DEFAULT false;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS value_weights jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS rationale text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS reflection jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS reflected_at timestamptz;

-- Backfill demo decisions (only when the columns are still empty)
UPDATE decisions
SET constraints = 'One of the two roles requires relocating within four months. Family visits are currently weekly and non-negotiable.',
    uncertainties = 'Whether the director role would still allow hands-on work. Whether staying put hurts long-term earning power.',
    values = '{family,freedom,craft}',
    success_definition = 'A year from now, I look forward to most Mondays and still make it to my parents'' every week.'
WHERE title = 'Take the promotion or keep building the small team'
  AND constraints IS NULL;

UPDATE decisions
SET constraints = 'Current lease runs eight more months. Nadia''s work is city-bound for at least a year.',
    uncertainties = 'Dad''s actual trajectory. Whether proximity guilt would survive the move.',
    values = '{family,home,honesty}',
    success_definition = 'Whoever needs me can reach me in under an hour, and I do not resent the life I moved into.'
WHERE title = 'Move closer to my parents'
  AND constraints IS NULL;

UPDATE decisions
SET constraints = 'Both families have strong expectations. Budget is capped and we will not take on debt for one day.',
    uncertainties = 'Whether a small ceremony regret arrives late. Whether Dad''s hurt fades or calcifies.',
    values = '{honesty,family,partnership}',
    success_definition = 'We remember the day as ours — not as an event we hosted for others.'
WHERE title = 'When to schedule the wedding with Nadia'
  AND constraints IS NULL;

-- Fully-worked example on the decided decision, only if not already populated
UPDATE decisions
SET constraints = 'One of the two roles requires relocating within four months. Family visits are currently weekly and non-negotiable.',
    uncertainties = 'Whether the director role would still allow hands-on work. Whether staying put hurts long-term earning power.',
    values = '{family,freedom,craft}',
    success_definition = 'A year from now, I look forward to most Mondays and still make it to my parents'' every week.',
    value_weights = '{"family":0.9,"freedom":0.7,"craft":0.6}'::jsonb,
    analysis = '{
      "summary": "This decision sets up a collision between two recorded priorities: family proximity and the kind of work that makes you feel alive. Your records consistently show small-team, hands-on work as your strongest evidence of engagement, and weekly family presence as a value you have repeatedly reinforced through action.",
      "options": [
        {
          "label": "Director role",
          "valueAlignment": [
            {"value":"family","alignment":"against","note":"Relocation would break the weekly visit pattern you have kept for years."},
            {"value":"freedom","alignment":"against","note":"Back-to-back leadership meetings contradict the autonomy you recorded in the Amsterdam reflection."},
            {"value":"craft","alignment":"mixed","note":"More scope, but your records tie craft satisfaction to building, not managing."}
          ],
          "tradeoffs": ["Comp jump that eases money conversations at home","A door that may not reopen","Distance from the team you chose"],
          "risks": ["Becoming the meeting-dweller you recorded disliking","Proximity guilt if Dad''s health turns"],
          "opportunityCosts": ["The platform team''s momentum may stall without you"]
        },
        {
          "label": "Stay with the team",
          "valueAlignment": [
            {"value":"family","alignment":"for","note":"Keeps the weekly rhythm intact with zero relocation."},
            {"value":"freedom","alignment":"for","note":"Deep-work days match every record of your best weeks."},
            {"value":"craft","alignment":"for","note":"Direct continuation of the hands-on pattern in your records."}
          ],
          "tradeoffs": ["Slower title path","Family pressure about money continues","Promotion door may close"],
          "risks": ["Resentment if money pressure grows","Being passed over could sting later"],
          "opportunityCosts": ["The comp and network that come with the director seat"]
        }
      ],
      "contradictions": [
        "You say family outweighs career convenience, yet you recorded that the small team evenings make you feel most alive — the director role offers neither convenience nor small rooms.",
        "Your five-year picture mentions building more than managing, but money freedom also appears in the same document — the roles split that tension differently."
      ],
      "missingInformation": [
        "Whether the director role could be negotiated with a hands-on charter",
        "Dad''s own preference — you have not recorded asking him",
        "The actual comp delta, which you have not written down"
      ],
      "experiments": [
        "Ask Dad directly what he would prefer; record his answer as a memory",
        "Request a one-month trial of the director scope before committing",
        "Write down the actual comp delta to see if it changes the picture"
      ]
    }'::jsonb,
    analysis_edited = false,
    rationale = 'Chose the team. The records kept pointing the same way: every good week in my journal happened in small rooms, close to home. The money conversation was harder than the work question.',
    reflection = '{
      "whatHappened": "Ten months in: the team shipped the platform migration and I made every Sunday visit. The comp gap stung exactly once — during the kitchen renovation.",
      "matchesOriginalReasoning": true,
      "surprises": "The title thing mattered less than I feared, but more than I admitted: two moments of real envy at industry events.",
      "lesson": "My five-year picture was right about rooms and wrong about how much I would notice the door closing."
    }'::jsonb,
    reflected_at = now() - interval '2 months'
WHERE title = 'Adopt a second dog' AND analysis IS NULL;

-- Re-title the worked example to match its actual content (idempotent guard)
UPDATE decisions
SET title = 'Take the director role or keep building the small team'
WHERE title = 'Adopt a second dog' AND analysis IS NOT NULL AND rationale IS NOT NULL;

INSERT INTO decisions (title, context, status, options, chosen_option, created_at, decided_at, constraints, uncertainties, values, success_definition, value_weights, analysis, rationale, reflection, reflected_at)
SELECT 'Take the director role or keep building the small team',
 'Two offers inside the company: a director role on a large org, or staying with the four-person platform team I helped build. Different kinds of days, different kinds of selves.',
 'decided',
 '[{"label":"Director role","pros":["Comp jump","Career door that may close"],"cons":["Back-to-back meetings","Further from hands-on work"]},{"label":"Stay with the team","pros":["Deep work","The team I chose"],"cons":["Slower title path","Family pressure about money"]}]'::jsonb,
 'Stay with the team',
 now() - interval '14 months', now() - interval '10 months',
 'One of the two roles requires relocating within four months. Family visits are currently weekly and non-negotiable.',
 'Whether the director role would still allow hands-on work. Whether staying put hurts long-term earning power.',
 '{family,freedom,craft}',
 'A year from now, I look forward to most Mondays and still make it to my parents'' every week.',
 '{"family":0.9,"freedom":0.7,"craft":0.6}'::jsonb,
 '{
   "summary": "This decision sets up a collision between two recorded priorities: family proximity and the kind of work that makes you feel alive.",
   "options": [
     {"label":"Director role","valueAlignment":[{"value":"family","alignment":"against","note":"Relocation would break the weekly visit pattern."},{"value":"freedom","alignment":"against","note":"Leadership meetings contradict recorded autonomy."},{"value":"craft","alignment":"mixed","note":"More scope, less building."}],"tradeoffs":["Comp jump","A door that may not reopen","Distance from the team"],"risks":["Becoming the meeting-dweller you recorded disliking"],"opportunityCosts":["The team''s momentum may stall"]},
     {"label":"Stay with the team","valueAlignment":[{"value":"family","alignment":"for","note":"Keeps the weekly rhythm intact."},{"value":"freedom","alignment":"for","note":"Deep-work days match your best recorded weeks."},{"value":"craft","alignment":"for","note":"Continues the hands-on pattern."}],"tradeoffs":["Slower title path","Family money pressure"],"risks":["Resentment if money pressure grows"],"opportunityCosts":["Comp and network of the director seat"]}
   ],
   "contradictions": ["You say family outweighs career convenience, yet your records show the small team makes you feel most alive."],
   "missingInformation": ["Whether the director role could include a hands-on charter","Dad''s own preference","The actual comp delta"],
   "experiments": ["Ask Dad directly and record his answer","Request a one-month trial of the director scope"]
 }'::jsonb,
 'Chose the team. The records kept pointing the same way: every good week in my journal happened in small rooms, close to home.',
 '{
   "whatHappened": "Ten months in: the team shipped the platform migration and I made every Sunday visit. The comp gap stung exactly once.",
   "matchesOriginalReasoning": true,
   "surprises": "The title mattered less than I feared, but more than I admitted.",
   "lesson": "My five-year picture was right about rooms and wrong about how much I would notice the door closing."
 }'::jsonb,
 now() - interval '2 months'
WHERE NOT EXISTS (SELECT 1 FROM decisions WHERE title = 'Take the director role or keep building the small team');
