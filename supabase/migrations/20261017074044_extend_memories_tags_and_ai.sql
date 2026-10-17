/*
# Extend memories: tags, AI interpretations, richer demo persona

1. Plain-English explanation
The Memories feature now supports optional tags (user-added labels like
"father" or "career"), and keeps user-written content strictly separate from
AI-generated interpretations of that content. We also add more diverse demo
memories (learning, goals, values, decisions) so the fictional demo persona
spans every category the product uses.

2. Modified Tables
- `memories`
  - add `tags` (text array, default empty) — user-authored labels.
  - add `ai_interpretation` (text, nullable) — AI-written observation; always
    distinguishable from the user's original text. Null until generated.

3. Data changes (idempotent backfills, only when missing)
- Existing seeded memories get sensible tags.
- Insert several new fictional demo memories across work, learning, goals,
  personal values, and important decisions, with tags and some AI
  interpretations to demonstrate the user-vs-AI distinction.

4. Security
- RLS is already enabled on `memories` with anon+authenticated CRUD policies
  (single-tenant demo, intentionally shared sample data). No policy changes.

5. Notes
- All statements are idempotent: safe to re-run.
- Uses IF NOT EXISTS for columns and guards inserts on a marker tag so the
  demo rows are only added once.
*/

ALTER TABLE memories ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS ai_interpretation text;

CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin (tags);

-- Backfill tags for the original seed rows (only if they currently have none)
UPDATE memories SET tags = '{habits,mornings}'
WHERE title = 'Morning runs replaced scrolling' AND tags = '{}';

UPDATE memories SET tags = '{father,family,wedding}'
WHERE title = 'The argument with Dad about the wedding' AND tags = '{}';

UPDATE memories SET tags = '{work,leadership}'
WHERE title = 'Realized I like leading the small team more than the big one' AND tags = '{}';

UPDATE memories SET tags = '{travel,relationship,nadia}'
WHERE title = 'Amsterdam trip with Nadia' AND tags = '{}';

UPDATE memories SET tags = '{health,money}'
WHERE title = 'Cancelled the gym membership I never used' AND tags = '{}';

UPDATE memories SET tags = '{work,career,patterns}'
WHERE title = 'The salary negotiation I fumbled' AND tags = '{}';

UPDATE memories SET tags = '{habits,reading}'
WHERE title = 'Reading before bed again' AND tags = '{}';

UPDATE memories SET tags = '{boundaries,family,choices}'
WHERE title = 'Said no to the consulting side gig' AND tags = '{}';

-- Give a couple of the original rows AI interpretations to show the split
UPDATE memories
SET ai_interpretation = 'This memory shows a consistent theme: mornings with low friction and no screen set up the rest of the day. Combined with the reading habit, there is emerging evidence that replacing phone time — not adding willpower — is what makes habits stick for you.'
WHERE title = 'Morning runs replaced scrolling' AND ai_interpretation IS NULL;

UPDATE memories
SET ai_interpretation = 'Recorded here is a repeated pattern across work memories: you prepare a position, then soften it in the moment. Worth naming not as a flaw but as a behavior to watch before the next negotiation or family conversation.'
WHERE title = 'The salary negotiation I fumbled' AND ai_interpretation IS NULL;

-- New diverse demo rows; the marker tag guarantees they are inserted once
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memories WHERE 'demo-wave-2' = ANY (tags)) THEN
    INSERT INTO memories (id, title, content, category, source, mood, confidence, tags, ai_interpretation, occurred_at, created_at) VALUES
    (gen_random_uuid(), 'Finished the systems design course',
     'Eleven weeks, one evening a week, and I actually finished it — the first course I have completed since university. The caching module was the hardest and the most useful. Next step is applying it to the platform''s slow endpoints, not just collecting the certificate.',
     'personal_growth', 'journal', 'positive', 94, '{learning,systems-design,demo-wave-2}',
     'Evidence of a pattern: you finish self-directed learning only when it maps to a real problem you already have. Certificates alone have never carried you past week three.',
     now() - interval '5 weeks', now() - interval '5 weeks'),

    (gen_random_uuid(), 'Taught Nadia to make my grandmother''s stew',
     'We cooked it together on a slow Sunday and wrote the recipe down properly for the first time — half of it was never written, just felt. Nadia noticed I add the salt before the tomatoes, which I learned from watching, not from any card.',
     'relationship', 'conversation', 'positive', 91, '{family,traditions,nadia,demo-wave-2}',
     'This memory anchors a value that appears elsewhere in your records: the things you care most about keeping were passed on by doing, not by documenting.',
     now() - interval '7 weeks', now() - interval '7 weeks'),

    (gen_random_uuid(), 'Wrote down the five-year picture',
     'Sat with coffee and drafted what a good 2031 looks like: a house with a garden, work where I build more than I manage, parents within an hour''s drive, and running still part of most mornings. It surprised me how little of it is about titles.',
     'personal_growth', 'note', 'positive', 86, '{goals,five-year,demo-wave-2}',
     'The five-year picture is consistent with your recorded values — freedom over scoreboard, family proximity, small rooms over big ones. The only tension is the "build more than manage" line versus the director offer still open in your Decision Mirror.',
     now() - interval '4 weeks', now() - interval '4 weeks'),

    (gen_random_uuid(), 'First 10k under fifty minutes',
     'Forty-nine twelve. After the cancelled-gym winter I doubted running would last, but the legs came back faster than expected. Celebrated with breakfast alone, which honestly was part of the appeal.',
     'health', 'note', 'positive', 98, '{running,milestones,demo-wave-2}',
     'A measurable milestone that confirms the morning-runs habit has survived past the novelty window — three independent records now reference the same routine.',
     now() - interval '2 weeks', now() - interval '2 weeks'),

    (gen_random_uuid(), 'Skepticism about busy-ness as worth',
     'A colleague bragged about working the weekend and I felt no envy, just tiredness on their behalf. I used to perform exhaustion like a resume. Writing it down to mark the change: I now treat being busy as a scheduling failure, not a status symbol.',
     'personal_growth', 'journal', 'positive', 82, '{values,work-in-progress,demo-wave-2}',
     'Directly contradicts an older recorded belief — "I must earn my place by being constantly available" — which is already flagged as revisited. This memory is the strongest counter-evidence so far.',
     now() - interval '10 days', now() - interval '10 days'),

    (gen_random_uuid(), 'The mentor conversation that reframed my job',
     'M. said: "You keep asking whether you deserve the room. Start asking whether the room deserves your hour." It landed harder than any performance review. Sitting with it before deciding anything about the promotion.',
     'work', 'conversation', 'mixed', 88, '{mentor,career,decisions,demo-wave-2}',
     'This is the hinge memory for the promotion decision: it reframes the question from worthiness to fit. Any reasoning about the director role should cite this.',
     now() - interval '12 days', now() - interval '12 days'),

    (gen_random_uuid(), 'Dad''s first video call',
     'He fumbled the mute button for four minutes and then showed me the tomatoes. Something about seeing his hands — the ones that taught me to drive — made the distance feel stupid and fixable. Visiting next month regardless of the move question.',
     'relationship', 'photo', 'mixed', 93, '{father,family,move,demo-wave-2}',
     'Strong emotional evidence feeding the "move closer to my parents" decision. Note it cuts both ways: it argues for proximity, but the visit also satisfied the pull for a while.',
     now() - interval '18 days', now() - interval '18 days'),

    (gen_random_uuid(), 'Sold the road bike',
     'Kept it six years for the rides I stopped taking. Sold it to a teenager who was thrilled, which felt better than the sale itself. The garage has room for one bike now, and it is the one I actually ride.',
     'finance', 'note', 'positive', 96, '{decluttering,choices,demo-wave-2}', NULL,
     now() - interval '1 month', now() - interval '1 month');
  END IF;
END $$;
