/*
# Default record owners to the authenticated session

1. Plain-English explanation
   When a signed-in user creates a record, the database now fills in the owner
   automatically from their verified session. The browser cannot choose (or
   fake) an owner: supplying someone else's id still fails the ownership
   check, and omitting it simply works.

2. Modified tables
   - memories, beliefs, decisions, timeline_events, beliefs_history,
     interpretation_flags: `user_id` gains DEFAULT auth.uid().

3. Security
   - No policy changes. Defaults strengthen the guarantee that ownership is
     derived from the session, not the request.

4. Notes
   - Sample rows keep user_id NULL: the default only applies to NEW rows and
     backfills nothing, so the public demo is untouched. Idempotent.
*/

ALTER TABLE memories ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE decisions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE timeline_events ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE beliefs_history ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE interpretation_flags ALTER COLUMN user_id SET DEFAULT auth.uid();
