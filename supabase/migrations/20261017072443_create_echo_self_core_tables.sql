/*
# Create EchoSelf core tables (single-tenant demo)

1. Plain-English explanation
EchoSelf is a personal AI-twin app that stores recorded evidence about one person.
This initial version is a single-tenant, no-sign-in demo pre-seeded with clearly
labeled fictional sample data. All seven product destinations read from these tables.

2. New Tables
- `memories`: recorded memories/evidence entries.
  - id (uuid pk), title (text), content (text), category (text: relationship|health|work|personal_growth|travel|finance|other),
    source (text: journal|conversation|photo|audio|note), mood (text: positive|neutral|mixed|difficult),
    confidence (integer 0-100), occurred_at (timestamptz), created_at (timestamptz).
- `beliefs`: beliefs and values statements.
  - id (uuid pk), statement (text), kind (text: belief|value), category (text), strength (integer 0-100),
    status (text: active|evolving|revisited), formed_at (timestamptz), last_reflected_at (timestamptz), created_at (timestamptz).
- `beliefs_history`: evolution snapshots of beliefs.
  - id (uuid pk), belief_id (fk -> beliefs), strength (integer), note (text), recorded_at (timestamptz).
- `decisions`: decisions for the Decision Mirror.
  - id (uuid pk), title (text), context (text), status (text: unresolved|decided|archived),
    options (jsonb array of {label, pros[], cons[]}), chosen_option (text nullable),
    created_at (timestamptz), decided_at (timestamptz nullable).
- `timeline_events`: chronological life events.
  - id (uuid pk), title (text), description (text), event_type (text: memory|decision|belief|milestone),
    importance (text: high|medium|low), occurred_at (timestamptz), created_at (timestamptz).

3. Security
- RLS enabled on all five tables.
- Single-tenant, no-sign-in demo: all policies allow anon + authenticated full CRUD,
  which is intentional because this demo data is intentionally shared sample content.
- Later stages may add sign-in and scope rows to individual users.

4. Notes
- Indexes on occurred_at / created_at / status columns for listing queries.
- Seed INSERTs are idempotent: they only run when each table is empty.
*/

CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  source text NOT NULL DEFAULT 'note',
  mood text NOT NULL DEFAULT 'neutral',
  confidence integer NOT NULL DEFAULT 80,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beliefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement text NOT NULL,
  kind text NOT NULL DEFAULT 'belief',
  category text NOT NULL DEFAULT 'personal',
  strength integer NOT NULL DEFAULT 70,
  status text NOT NULL DEFAULT 'active',
  formed_at timestamptz NOT NULL DEFAULT now(),
  last_reflected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beliefs_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  belief_id uuid NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
  strength integer NOT NULL,
  note text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  context text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unresolved',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_option text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'memory',
  importance text NOT NULL DEFAULT 'medium',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE beliefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beliefs_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_memories" ON memories;
CREATE POLICY "anon_select_memories" ON memories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_memories" ON memories;
CREATE POLICY "anon_insert_memories" ON memories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_memories" ON memories;
CREATE POLICY "anon_update_memories" ON memories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_memories" ON memories;
CREATE POLICY "anon_delete_memories" ON memories FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_beliefs" ON beliefs;
CREATE POLICY "anon_select_beliefs" ON beliefs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_beliefs" ON beliefs;
CREATE POLICY "anon_insert_beliefs" ON beliefs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_beliefs" ON beliefs;
CREATE POLICY "anon_update_beliefs" ON beliefs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_beliefs" ON beliefs;
CREATE POLICY "anon_delete_beliefs" ON beliefs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_beliefs_history" ON beliefs_history;
CREATE POLICY "anon_select_beliefs_history" ON beliefs_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_beliefs_history" ON beliefs_history;
CREATE POLICY "anon_insert_beliefs_history" ON beliefs_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_beliefs_history" ON beliefs_history;
CREATE POLICY "anon_update_beliefs_history" ON beliefs_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_beliefs_history" ON beliefs_history;
CREATE POLICY "anon_delete_beliefs_history" ON beliefs_history FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_decisions" ON decisions;
CREATE POLICY "anon_select_decisions" ON decisions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_decisions" ON decisions;
CREATE POLICY "anon_insert_decisions" ON decisions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_decisions" ON decisions;
CREATE POLICY "anon_update_decisions" ON decisions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_decisions" ON decisions;
CREATE POLICY "anon_delete_decisions" ON decisions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_timeline" ON timeline_events;
CREATE POLICY "anon_select_timeline" ON timeline_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_timeline" ON timeline_events;
CREATE POLICY "anon_insert_timeline" ON timeline_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_timeline" ON timeline_events;
CREATE POLICY "anon_update_timeline" ON timeline_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_timeline" ON timeline_events;
CREATE POLICY "anon_delete_timeline" ON timeline_events FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_memories_occurred ON memories (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_beliefs_status ON beliefs (status);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON timeline_events (occurred_at DESC);

DO $$
DECLARE
  b_juggle uuid; b_rest uuid; b_father uuid; b_depth uuid;
BEGIN
  IF (SELECT count(*) FROM memories) = 0 THEN
    INSERT INTO memories (id, title, content, category, source, mood, confidence, occurred_at, created_at) VALUES
    (gen_random_uuid(), 'Morning runs replaced scrolling',
     'Two weeks into the new habit. The first ten minutes are still hard, but the air is quiet and my head is clearer all morning afterward. Noticed I stopped reaching for my phone in bed.',
     'personal_growth', 'journal', 'positive', 92, now() - interval '3 days', now() - interval '3 days'),
    (gen_random_uuid(), 'The argument with Dad about the wedding',
     'He wants a big traditional reception; I keep avoiding the conversation. What actually bothered me was the assumption, not the guest list. Said less than I meant to.',
     'relationship', 'conversation', 'difficult', 88, now() - interval '9 days', now() - interval '9 days'),
    (gen_random_uuid(), 'Realized I like leading the small team more than the big one',
     'When it was three of us shipping the billing fix in one evening, I felt alive. In the all-hands leadership meetings I mostly rehearse my sentences. Data point, not a verdict.',
     'work', 'note', 'mixed', 76, now() - interval '16 days', now() - interval '16 days'),
    (gen_random_uuid(), 'Amsterdam trip with Nadia',
     'Six days without a laptop. The museum afternoon and the long dinner where we planned nothing were the best parts. Confirmed: I travel best with one unstructured day per two planned ones.',
     'travel', 'photo', 'positive', 95, now() - interval '2 months', now() - interval '2 months'),
    (gen_random_uuid(), 'Cancelled the gym membership I never used',
     'Kept paying for fourteen months out of guilt. Walked instead. Cheaper and I actually do it.',
     'health', 'note', 'positive', 97, now() - interval '5 months', now() - interval '5 months'),
    (gen_random_uuid(), 'The salary negotiation I fumbled',
     'Accepted the first number for the senior role. I had a counter prepared and did not say it. Worth recording so the pattern is visible, not just felt.',
     'work', 'audio', 'difficult', 90, now() - interval '11 months', now() - interval '11 months'),
    (gen_random_uuid(), 'Reading before bed again',
     'Twenty pages most nights for a month now. Fell asleep reading instead of doom-scrolling maybe four nights in five.',
     'personal_growth', 'journal', 'positive', 85, now() - interval '6 weeks', now() - interval '6 weeks'),
    (gen_random_uuid(), 'Said no to the consulting side gig',
     'A former colleague offered a well-paid three-week engagement. I said no because evenings are the only time I see my family. First time declining money on purpose felt like a choice, not a loss.',
     'finance', 'conversation', 'positive', 93, now() - interval '3 weeks', now() - interval '3 weeks');

    INSERT INTO decisions (title, context, status, options, created_at) VALUES
    ('Take the promotion or keep building the small team',
     'Two offers inside the company: a director role on a large org, or staying with the four-person platform team I helped build. Different kinds of days, different kinds of selves.',
     'unresolved',
     '[{"label":"Director role","pros":["Comp jump","Career door that may close"],"cons":["Back-to-back meetings","Further from hands-on work"]},{"label":"Stay with the team","pros":["Deep work","The team I chose"],"cons":["Slower title path","Family pressure about money"]}]'::jsonb,
     now() - interval '2 weeks'),
    ('Move closer to my parents',
     'Dad''s health is not what it was. A move means leaving the city routines that keep me sane and the friendships that keep me honest.',
     'unresolved',
     '[{"label":"Move this year","pros":["Time with Dad","Lower rent"],"cons":["Disruption","Losing my city rhythms"]},{"label":"Wait a year","pros":["Stability","Time to plan properly"],"cons":["Guilt every visit","Health is unpredictable"]}]'::jsonb,
     now() - interval '6 weeks'),
    ('When to schedule the wedding with Nadia',
     'We agreed on the marriage long ago; the ceremony keeps sliding because the planning surfaces old family patterns.',
     'unresolved',
     '[{"label":"Small civil ceremony","pros":["No family negotiation","Honest to who we are"],"cons":["Dad will be hurt"],"cons2":null}]'::jsonb,
     now() - interval '3 months');

    UPDATE decisions SET options = '[{"label":"Small civil ceremony","pros":["No family negotiation","Honest to who we are"],"cons":["Dad will be hurt"]},{"label":"Traditional reception","pros":["Dad''s joy","One big shared day"],"cons":["Months of planning","We become hosts instead of couple"]}]'::jsonb
    WHERE title = 'When to schedule the wedding with Nadia';

    INSERT INTO decisions (title, context, status, options, chosen_option, created_at, decided_at) VALUES
    ('Adopt a second dog',
     'We debated for eight months. Finally decided our routines and the apartment genuinely had room for one more.',
     'decided',
     '[{"label":"Adopt","pros":[],"cons":[]},{"label":"Wait","pros":[],"cons":[]}]'::jsonb,
     'Adopt', now() - interval '14 months', now() - interval '10 months');

    INSERT INTO beliefs (statement, kind, category, strength, status, formed_at, last_reflected_at, created_at) VALUES
    ('I do my best work in small rooms with people I trust.', 'belief', 'work', 90, 'evolving', now() - interval '3 years', now() - interval '4 days', now() - interval '3 years'),
    ('Family obligations outweigh career convenience.', 'value', 'family', 84, 'evolving', now() - interval '8 years', now() - interval '9 days', now() - interval '8 years'),
    ('Rest is productive. My best ideas arrive when I stop.', 'belief', 'health', 78, 'active', now() - interval '2 years', now() - interval '2 months', now() - interval '2 years'),
    ('I must earn my place by being constantly available.', 'belief', 'personal_growth', 34, 'revisited', now() - interval '12 years', now() - interval '3 weeks', now() - interval '12 years'),
    ('Money is a tool for freedom, not a scoreboard.', 'value', 'finance', 88, 'active', now() - interval '5 years', now() - interval '1 month', now() - interval '5 years'),
    ('Long-term commitment is chosen daily, not declared once.', 'belief', 'relationship', 91, 'active', now() - interval '4 years', now() - interval '2 weeks', now() - interval '4 years');

    SELECT id INTO b_juggle FROM beliefs WHERE statement LIKE 'I do my best work in small rooms%' LIMIT 1;
    SELECT id INTO b_father FROM beliefs WHERE statement LIKE 'Family obligations%' LIMIT 1;
    SELECT id INTO b_rest FROM beliefs WHERE statement LIKE 'Rest is productive%' LIMIT 1;

    INSERT INTO beliefs_history (belief_id, strength, note, recorded_at)
    SELECT b_juggle, 82, 'After the Amsterdam trip: small-team joy felt strongest abroad, not at the office.', now() - interval '2 months'
    UNION ALL SELECT b_juggle, 90, 'Leading the billing fix evening confirmed it.', now() - interval '4 days'
    UNION ALL SELECT b_father, 92, 'Stronger when Dad''s health news arrived; obligation and love blur together.', now() - interval '9 days'
    UNION ALL SELECT b_father, 84, 'The wedding argument made me question whether obligation is the right frame.', now() - interval '7 days'
    UNION ALL SELECT b_rest, 70, 'Originally a suspicious comfort idea; the reading habit gave it evidence.', now() - interval '2 months'
    UNION ALL SELECT b_rest, 78, 'Mornings without phone scrolling are measurably better days.', now() - interval '2 weeks';

    INSERT INTO timeline_events (title, description, event_type, importance, occurred_at, created_at) VALUES
    ('Recorded the salary negotiation pattern', 'Named the pattern of not stating prepared counters, from audio memory.', 'memory', 'high', now() - interval '11 months', now() - interval '11 months'),
    ('Twin identified a recurring belief: availability as worth', 'Evidence from work memories clustered into a statement I can now challenge.', 'milestone', 'high', now() - interval '10 months', now() - interval '10 months'),
    ('Declined the consulting engagement', 'First time saying no to money on purpose. Logged with the reasoning attached.', 'decision', 'medium', now() - interval '3 weeks', now() - interval '3 weeks'),
    ('Wedding argument with Dad', 'Avoided the real conversation. Flagged as unresolved tension feeding two open decisions.', 'memory', 'high', now() - interval '9 days', now() - interval '9 days'),
    ('Promotion offer arrived', 'Director role vs. staying with the platform team. Opened in the Decision Mirror.', 'decision', 'high', now() - interval '2 weeks', now() - interval '2 weeks'),
    ('Two-week morning run streak', 'Habit took hold. Feed for the rest-as-productive belief.', 'milestone', 'low', now() - interval '3 days', now() - interval '3 days');
  END IF;

  IF (SELECT count(*) FROM beliefs_history) = 0 THEN
    NULL;
  END IF;
END $$;
