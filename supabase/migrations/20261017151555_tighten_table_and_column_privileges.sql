/*
# Tighten table and column privileges (defense in depth on top of RLS)

1. Summary

   The application's authorization is enforced by row-level security policies
   (verified separately). This migration removes SURPLUS privileges that RLS
   does not need and that widen the attack surface if a policy is ever weakened
   or a new access path (RPC, view, direct connection) appears. It changes no
   row and no policy, so it cannot affect what existing users see.

2. Privilege changes (all 7 public tables: memories, beliefs, beliefs_history,
   decisions, timeline_events, interpretation_flags, graph_edge_confirmations)

   - REVOKE TRUNCATE from anon and authenticated. TRUNCATE is not filtered by
     RLS: any role holding it could empty a table in one statement, including
     other users' rows and the public demo. The app never truncates.
   - REVOKE REFERENCES from anon and authenticated. REFERENCES would let a
     caller read foreign-key structure and attach constraints; the app never
     creates constraints through the API.
   - REVOKE UPDATE on system-owned columns (id, user_id, created_at) from
     anon and authenticated. Ownership and identity columns are set by the
     database (defaults + WITH CHECK), never edited by clients. Column-level
     privileges are checked BEFORE policies, so this holds even where a policy
     would allow the row.
   - UPDATE on all user-content columns remains granted, so every existing
     editing flow keeps working unchanged.
   - INSERT grants remain table-wide (all columns): the client never supplies
     user_id, the column DEFAULTs to auth.uid(), and the INSERT policies'
     WITH CHECK (auth.uid() = user_id) reject any forged owner. Narrowing
     INSERT column grants is deliberately NOT done here because the upsert
     path for graph_edge_confirmations legitimately sends user_id = own id;
     revoking INSERT(user_id) on that table would break confirm/dismiss.
   - SELECT and DELETE remain unchanged (row visibility is entirely a policy
     matter; RLS filters DELETE and SELECT rows).

3. Security

   - No policy is added, removed, or altered. RLS stays enabled on all tables.
   - Least-privilege hardening only: removes capabilities that no legitimate
     flow uses and that would bypass or weaken isolation if misused
     (TRUNCATE bypasses RLS entirely).

4. Notes

   - Idempotent: REVOKE statements are safe to re-run.
   - Additive in effect on safety, zero-effect on data: no column, table, or
     row is created, dropped, or modified.
*/

REVOKE TRUNCATE ON public.memories FROM anon, authenticated;
REVOKE TRUNCATE ON public.beliefs FROM anon, authenticated;
REVOKE TRUNCATE ON public.beliefs_history FROM anon, authenticated;
REVOKE TRUNCATE ON public.decisions FROM anon, authenticated;
REVOKE TRUNCATE ON public.timeline_events FROM anon, authenticated;
REVOKE TRUNCATE ON public.interpretation_flags FROM anon, authenticated;
REVOKE TRUNCATE ON public.graph_edge_confirmations FROM anon, authenticated;

REVOKE REFERENCES ON public.memories FROM anon, authenticated;
REVOKE REFERENCES ON public.beliefs FROM anon, authenticated;
REVOKE REFERENCES ON public.beliefs_history FROM anon, authenticated;
REVOKE REFERENCES ON public.decisions FROM anon, authenticated;
REVOKE REFERENCES ON public.timeline_events FROM anon, authenticated;
REVOKE REFERENCES ON public.interpretation_flags FROM anon, authenticated;
REVOKE REFERENCES ON public.graph_edge_confirmations FROM anon, authenticated;

-- System-owned columns: clients may not rewrite identity, ownership, or timestamps.
-- (beliefs_history has no created_at column; graph_edge_confirmations.user_id is
-- still INSERT-able via the upsert path — UPDATE of it is never needed.)
REVOKE UPDATE (id, user_id, created_at) ON public.memories FROM anon, authenticated;
REVOKE UPDATE (id, user_id, created_at) ON public.beliefs FROM anon, authenticated;
REVOKE UPDATE (id, user_id) ON public.beliefs_history FROM anon, authenticated;
REVOKE UPDATE (id, user_id, created_at) ON public.decisions FROM anon, authenticated;
REVOKE UPDATE (id, user_id, created_at) ON public.timeline_events FROM anon, authenticated;
REVOKE UPDATE (id, user_id, created_at) ON public.interpretation_flags FROM anon, authenticated;
REVOKE UPDATE (id, user_id, created_at) ON public.graph_edge_confirmations FROM anon, authenticated;
