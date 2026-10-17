/*
# Narrow UPDATE to user-content columns (correct the previous attempt)

1. Summary

   The previous migration revoked UPDATE on (id, user_id, created_at) per
   column, but each role also holds a TABLE-level UPDATE grant, and in
   PostgreSQL a table-level privilege implies all columns — so the column
   revokes had no effect. This migration replaces the table-level UPDATE
   grant with explicit column-level grants covering only the columns clients
   legitimately edit. Identity, ownership, and creation-time columns become
   non-writable through the data API, even though RLS row rules are unchanged.

2. Privilege changes (anon + authenticated, all 7 public tables)

   - REVOKE UPDATE ON TABLE for each table, then GRANT UPDATE on the
     user-content columns only:
     - memories: title, content, category, source, mood, confidence, tags,
       ai_interpretation, occurred_at
     - beliefs: statement, kind, category, description, strength, status,
       origin, formed_at, last_reflected_at, last_reviewed
     - beliefs_history: belief_id, strength, note, recorded_at
     - decisions: title, context, status, options, constraints, uncertainties,
       values, value_weights, success_definition, chosen_option, rationale,
       decided_at, analysis, analysis_edited, analysis_snapshot, reflection,
       reflected_at, classification_overrides, proposals
     - timeline_events: title, description, event_type, importance, occurred_at
     - interpretation_flags: correction_note, topic, reviewed_at, status,
       superseded_by (memory_id and answer_excerpt are intentionally NOT
       updatable: a correction stays attached to the record and excerpt it
       was created against)
     - graph_edge_confirmations: edge_key, source_id, target_id, kind, status
       (these are included because the confirm/dismiss flow is an upsert that
       rewrites the same columns on conflict)
   - Non-updatable system columns: id, user_id, created_at everywhere.

3. Security

   - Column privileges are checked BEFORE row-level policies, so a client can
     no longer rewrite ownership or identity on its own rows through any API
     path, even where a row policy would permit it.
   - No RLS policy is changed; row visibility and ownership checks are
     unaffected.

4. Notes

   - Idempotent: re-running produces the same privilege state.
   - All existing UI flows keep working: they never update id, user_id, or
     created_at.
*/

REVOKE UPDATE ON public.memories FROM anon, authenticated;
REVOKE UPDATE ON public.beliefs FROM anon, authenticated;
REVOKE UPDATE ON public.beliefs_history FROM anon, authenticated;
REVOKE UPDATE ON public.decisions FROM anon, authenticated;
REVOKE UPDATE ON public.timeline_events FROM anon, authenticated;
REVOKE UPDATE ON public.interpretation_flags FROM anon, authenticated;
REVOKE UPDATE ON public.graph_edge_confirmations FROM anon, authenticated;

GRANT UPDATE (title, content, category, source, mood, confidence, tags, ai_interpretation, occurred_at) ON public.memories TO anon, authenticated;
GRANT UPDATE (statement, kind, category, description, strength, status, origin, formed_at, last_reflected_at, last_reviewed) ON public.beliefs TO anon, authenticated;
GRANT UPDATE (belief_id, strength, note, recorded_at) ON public.beliefs_history TO anon, authenticated;
GRANT UPDATE (title, context, status, options, constraints, uncertainties, values, value_weights, success_definition, chosen_option, rationale, decided_at, analysis, analysis_edited, analysis_snapshot, reflection, reflected_at, classification_overrides, proposals) ON public.decisions TO anon, authenticated;
GRANT UPDATE (title, description, event_type, importance, occurred_at) ON public.timeline_events TO anon, authenticated;
GRANT UPDATE (correction_note, topic, reviewed_at, status, superseded_by) ON public.interpretation_flags TO anon, authenticated;
GRANT UPDATE (edge_key, source_id, target_id, kind, status) ON public.graph_edge_confirmations TO anon, authenticated;
