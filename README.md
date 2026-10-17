# EchoSelf

An evidence-grounded self-reflection companion. You record memories, state beliefs and values, and work through decisions — and a "twin" answers questions about you using **only** what you actually recorded, with every claim citable back to its source memory. No fabrication, no fortune-telling: when the records don't cover something, the twin says so.

> **This is a demo.** The app ships pre-seeded with a clearly labeled fictional sample persona. Every page shows a "Sample data" banner, and nothing here pretends to be real user data, real traction, or capabilities the app doesn't have.

---

## What the app does

### Destinations (path-routed, real URLs)

Every destination is a distinct URL that survives refresh, supports deep links, and carries its own document title and description. Navigation uses true links (middle-click/new-tab works); a 404.html fallback ships with the build for static hosts.

| Route | Page | What it does |
|---|---|---|
| `/` | Overview | Stats (memories, open decisions, beliefs in motion), recent memories, unresolved decisions, evolving beliefs, and a link into Twin Chat. |
| `/memories` | Memories | Create, edit, search, filter (category / tag / date range), and delete evidence records. Each has a detail page at `/memory/:id`. |
| `/chat` | Twin Chat | Ask questions; get structured, evidence-grounded answers with expandable source panels, stated inferences, declared gaps, and follow-up suggestions. |
| `/decisions` | Decision Mirror | Structured decision workspace: options, constraints, values with adjustable weights, a deterministic analysis, recorded choices, reopen, and outcome reflection. Detail page at `/decision/:id`. |
| `/beliefs` | Beliefs & Values | Beliefs and values with strength scores, evolution history, AI-suggested patterns (explicitly labeled until you confirm or dismiss them), and contradiction detection against recorded memories. |
| `/timeline` | Timeline | Unified chronology assembled from memories, decisions, belief changes, and reflections — with deep links into each source record. |
| `/settings` | Settings & Privacy | Record counts, full JSON/CSV export (all seven tables), delete-everything, and an honest statement of what this build does and does not guarantee. |
| `/signin`, `/signup` | Account | Email/password sign-in and sign-up; personal pages redirect signed-out visitors here. |

### The honesty model (the core design constraint)

- **Every twin claim must trace to a record.** Answers distinguish three kinds of content: *directly supported* (cited to a memory), *interpretation* (labeled as the twin's reading), and *unknown* (declared plainly).
- **Citations are verified.** Source references are filtered against the records actually supplied to the model — invented IDs, quotes, or dates cannot survive into the UI. Each citation links to the memory's detail page.
- **AI suggestions stay labeled.** Belief suggestions carry an `origin` of `suggestion` until you confirm them (`confirmed_suggestion`) or dismiss them entirely. Nothing is silently merged.
- **You can flag a wrong interpretation.** A correction note is stored alongside the flagged record (`interpretation_flags`) rather than being lost in chat scrollback.
- **Alignment is not prediction.** Decision Mirror scores are preference weights you control, explicitly framed as "not a prediction of how either option will turn out."
- **No fake AI.** If the AI provider isn't configured, Twin Chat shows a setup message — never a fabricated reply. The public preview runs a clearly labeled sample-conversation mode that composes answers locally from the real sample records via keyword retrieval.

---

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS (no router, no state library, no UI kit). Lucide React for icons. Supabase for the database and one edge function.

### Frontend

```
src/
  App.tsx                  # path router (History API): pages + memory/decision detail views
  lib/router.ts            # route parsing, hrefs, per-route titles/descriptions
  components/
    AppShell.tsx           # header, responsive nav (desktop + mobile menu), footer, skip link
    ui.tsx                 # Card, Badge, Loading/Error/Empty states, DemoModeBanner, meters
    ConfirmDialog.tsx      # accessible confirm dialog (focus, Escape, backdrop click)
    MemoryForm.tsx         # memory create/edit
    BeliefForm.tsx         # belief/value create/edit
    DecisionForm.tsx       # decision create
  pages/                   # one file per route + two detail pages
  hooks/useAsyncData.ts    # small async data hook (loading / error / reload)
  lib/
    types.ts               # all shared types (Memory, Belief, Decision, TwinReply, …)
    services.ts            # typed Supabase CRUD for every table + export/wipe
    supabaseClient.ts      # browser client
    retrieval.ts           # keyword retrieval + memory-to-context formatting
    twinService.ts         # twin abstraction: live (edge function) vs demo (local composition)
    decisionAnalysis.ts    # deterministic decision analysis engine
    beliefContradictions.ts# belief-vs-memory contradiction detection
```

### Twin Chat, two modes

`VITE_TWIN_DEMO_MODE=true` in `.env` selects the mode:

- **Demo mode (default in this repo):** answers are composed locally from the sample persona's real records using keyword retrieval, routed by question type (priorities, conflicts, changes over time, general lookup). Replies are explicitly labeled as sample output and grounded in the records shown in the evidence panels. Missing evidence yields an honest "I don't find recorded evidence touching that" — the same behavior the live mode is required to have.
- **Live mode:** calls the `twin-chat` edge function. The function ranks relevant memories server-side (keyword score × recency × your confidence rating), injects your saved corrections into the context as authoritative user statements, builds a strict evidence-only system prompt, calls Anthropic (Claude), then **coerces and validates the response**: citations that don't resolve to supplied memory IDs are dropped, inline `[id]` citations in the answer text are honored, invented quotes and dates are stripped client-side, and malformed responses surface a generic error instead of partial fabrications. A missing provider key returns a distinct `503 AI_NOT_CONFIGURED`, which the UI renders as a setup notice — not a fake answer.

**Claim-level Evidence Inspector (both modes):** every reply is decomposed into claims, each typed as directly supported (backed by verbatim user-authored text), interpretation (the twin's reading, AI-generated), conflicting evidence, or unknown. Source previews link each claim — not just the answer — to the exact memory record. Saved user corrections are loaded with the records, rank as user-authored evidence in retrieval, and are shown **side by side** with the original record (like conflicts: both sides, no winner picked). Explicit uncertainty is declared when records are sparse (one match), stale (newest match > 6 months), or only incidentally relevant. Quoted passages that appear verbatim in no record, and dates no record supports, are removed from answers and their removal declared in the gaps list — a valid citation ID alone is never treated as proof.

The API key lives only in the edge function's server-side secrets. Nothing sensitive ships to the browser.

### Deterministic decision analysis

The Decision Mirror's analysis is a rules engine, not a model call: relevant memories are retrieved and scored against the decision's context and stated values; each value's alignment per option is computed from how recorded experiences classify (for/against) with your adjustable weights; contradictions between stated beliefs and recorded behavior are pattern-matched; missing information (no constraints, no success definition, an unconsulted party in your records) becomes experiment suggestions. Everything it outputs is derived from real rows.

**Transparency features (engine version dm-3, observed 2026-10-17):**
- **Option-by-value comparison** — each option shows its per-value evidence counts (for / against / unknown) side by side, weighted by the user's sliders.
- **Score trace** — an expandable arithmetic table per option: every value's (for − against) × weight contribution, the net, the classified mass, and the division that produces the score. Each line records how many inputs were explicit user judgments, keyword inferences, and user corrections, with links to the records. A judge can reproduce the number by hand.
- **Ranking explainer** — a plain-language account of which value contributions decide the leader (or the tie), updating live as weights move. This is the acceptance gate: change a weight, and the decisive arithmetic is named.
- **Counterevidence panel** — every record classified against an option, with origin (explicit/inferred/corrected) and rationale. Unknown and neutral records never appear: they are never evidence against.
- **Strict explicit/inferred separation** — pros/cons the user wrote are explicit; keyword-matched memories are inferred with rationale and correctable; corrections are stored and honored. The engine never counts unknown evidence in a score.
- **Sensitivity** — ±0.1 weight perturbations are tested and flagged when they flip the leader; the ranking explainer also states when the result is robust.
- **Reproducibility** — the report records its method version, weights, evidence IDs, explicit items, and override count. Same inputs → same report (tested).
- **Preference, not prediction** — scores are preference alignment only; no probabilities, success rates, or outcome predictions are produced anywhere.
- **Reflection with success comparison** — the reflection records how the outcome measured against the decision's stated success definition (met / partly / not met / redefined) with an optional note.
- **Approval-gated belief proposals** — after a divergent reflection, the mirror can propose a belief-strength revisit. Proposals are stored pending, applied only on an explicit Approve click, and dismissals are kept as a record. Nothing is applied automatically.

### Evidence Graph (relationships, confirmations, and the reflection loop)

The graph derives every node from real rows (memories, beliefs/values, decisions, outcome reflections, belief-history entries) and every edge from a stored field, a re-derivable keyword match, or a user confirmation — no edge is invented to make the picture denser. Edges carry three bases, all visible in the node inspector and legend:
- **Recorded (direct)** — a stored field points at the other record (reflection stored on the decision, history rows, a decision citing a value by name). These never require approval and cannot be dismissed.
- **Confirmed by you** — a suggested edge the signed-in user explicitly accepted. Stored per user in `graph_edge_confirmations` (owner-scoped RLS; upsert per edge, latest decision wins); drawn solid with the confirmation date in the trace.
- **Suggested (inferred)** — keyword-derived, always labeled with its method, and offered for Confirm / "Not a connection" in the inspector. Dismissed suggestions are removed from the graph but kept as a record so they are not re-surfaced as new.

**Integrity on edits and deletions:** edges re-derive from live records, so nothing dangles when a source is edited or deleted; a confirmation whose endpoint records no longer exist is inert (tested — it can never resurrect an edge or dangle a node). Contradiction edges keep both sides and never coexist with a support edge on the same pair (tested).

**Views and navigation:** a deterministic column layout (no physics/visualization library — SVG only), keyboard-navigable nodes with accessible labels, a node inspector linking to the original record, filters by entity type / time period / a specific decision, an inferred-links toggle, and a linked-list view on small screens replacing the wide diagram.

**Reflection loop connection:** decided decisions expose their reflection node in the graph, linked back to the decision; the Decision Mirror page records the outcome, compares it against the original success definition and rationale, captures surprises, and may propose a belief revisit that applies only on explicit approval (see Deterministic decision analysis above).

**Verified by test (scripts/run-graph-tests.mts, 26/26 passing against the seeded fictional sample — 16 memories, 8 beliefs, 4 decisions, 6 history rows):** every edge references existing nodes and record IDs with a non-empty trace; no fabricated edges (cross-checked against the derivable set); confirmation promotion, dismissal, re-decision, and deleted-record cleanup; support/contradiction exclusivity; disconnected records remain visible; determinism; empty inputs. Two-account security tests (37/37) additionally cover confirmation privacy, cross-account write denial, and anon read-free access.

The sample persona is fiction and is labeled as such on every page; the graph draws no edges and no outcomes that the seeded rows do not support.

---

## Data model

Six tables in the `public` schema (migrations in `supabase/migrations/`):

- **memories** — title, content, category (`relationship | health | work | personal_growth | travel | finance | other`), source (`journal | conversation | photo | audio | note`), mood, confidence 0–100, tags, `ai_interpretation` (kept strictly separate from the user's original text in the UI), `occurred_at`.
- **beliefs** — statement, kind (`belief | value`), strength, status (`active | evolving | revisited`), `origin` (`user | suggestion | confirmed_suggestion`), `last_reviewed`.
- **beliefs_history** — strength snapshots with notes, for before/after evolution views.
- **decisions** — title, context, status (`unresolved | decided | archived`), options (JSON), constraints, uncertainties, values, `value_weights`, `success_definition`, chosen option + rationale, structured `analysis`, an outcome `reflection` (what happened, whether it matched the reasoning, surprises, lesson, success measurement against the stated definition), and `proposals` (JSON — approval-gated belief revisit suggestions).
- **timeline_events** — typed chronological entries.
- **interpretation_flags** — user corrections attached to flagged AI interpretations.
- **graph_edge_confirmations** — per-user confirm/dismiss decisions on suggested graph edges, keyed by edge signature; creator-owned, endpoints must be visible to the creator.

**Security posture:** row-level security is enabled on all six tables with **ownership-aware policies applied via migration** (see below). This app now has real accounts: sign-up/sign-in (Supabase email/password, email confirmation off by default), persistent sessions, and protected personal routes.

**How isolation works (applied migrations):**
- `20261017110000_add_personal_workspaces_rls` — added `user_id` (references `auth.users`, on-delete cascade) to all six tables, then replaced the former open `USING (true)` policies with:
  - `select_public_or_own_*` on memories/beliefs/decisions/timeline_events (anon + authenticated): rows are visible if `user_id IS NULL` (public sample) or `auth.uid() = user_id`.
  - `insert_own_*` / `update_own_*` / `delete_own_*` on the same four tables (authenticated only): `auth.uid() = user_id` on both sides of UPDATE, so a row cannot be reassigned.
  - `select_visible_beliefs_history`, `insert_history_for_own_belief`, `update_history_for_own_belief`, `delete_history_for_own_belief` on beliefs_history — access is validated through the parent belief's owner.
  - `select_own_flags`, `insert_own_flags` on interpretation_flags — flag rows are private to their creator; creating one requires the target memory to be public or one's own.
- `20261017110500_default_user_id_to_auth_uid` — `user_id` defaults to `auth.uid()` at insert time, so the browser never supplies the owner; a forged owner id fails the WITH CHECK.

The **demo is now read-only for signed-out visitors**: sample rows (owner NULL) are visible to everyone but cannot be created, changed, or deleted without an account. The Settings page export and "delete everything" act only on the signed-in account's records; sample data is excluded. Backfill was intentionally a no-op: no existing (fictional) row was assigned to any user, and no data was deleted or rewritten.

**Verified by test (scripts/run-decision-tests.mts, 35/35 passing — covers empty evidence, ties, zero weights, contradictory evidence, changed weights, incomplete constraints, trace arithmetic, counterevidence isolation, proposal generation):**
- A cannot read, update, delete, or insert-on-behalf-of B's records (memories, beliefs, decisions); forged `user_id` inserts are rejected; rows remain intact after every denied attempt.
- Unauthenticated clients can read public sample rows but cannot insert, update, or delete anything.
- Linked-record rules: A cannot attach history or flags to B's records; B can manage history on its own belief; A can flag a public sample memory; flag rows are private to their creator.
- Normal owner flows work end to end (insert, update, delete own records).

**Residual limitations (not claims of security):**
- RLS policies were applied and verified via the Supabase security advisor and a two-account test, but "secure" is never a one-time claim: policy coverage was checked against these six tables only; new tables would need the same treatment.
- The twin-chat edge function now queries the database with the caller's JWT (not the service-role key), so live-mode context is scoped by the same RLS. The service-role key remains available server-side for other future needs and is never exposed to the browser.
- Rate limiting and abuse prevention on auth endpoints are Supabase platform defaults, not app-enforced.
- Email-confirmation behavior depends on project settings; the sign-up flow states this in the UI when confirmation is required.

The demo seed (first migration) is idempotent — it only inserts when tables are empty — and creates the fictional persona: eight memories, three open decisions plus one decided, six beliefs with history, and six timeline events.

---

## Design system

A "luxury editorial" direction: warm paper background (`#F7F3EB`), linen borders, terracotta accent, charcoal serif headlines (Fraunces) over Inter body text. Semantic color ramps (sage = positive, amberclay = AI-generated content, clayred = destructive) are used consistently — AI-generated content is always amber-tinted and labeled, user-authored content is never confused with it. Cards use a shared `card-surface` style with two shadow depths; spacing follows an 8px rhythm; focus-visible rings are styled globally; icon-only buttons carry aria-labels; dialogs are keyboard-accessible.

---

## Running it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build (emits 404.html SPA fallback)
npm run typecheck  # strict TS check
npm run lint       # eslint (0 errors, 0 warnings)
npx tsx --env-file=.env scripts/run-workspace-tests.mts   # two-account security suite (37 checks)
npx tsx --env-file=.env scripts/run-graph-tests.mts       # graph engine suite (26 checks)
npx tsx scripts/run-decision-tests.mts                    # decision engine suite (35 checks)
npx tsx --env-file=.env scripts/run-eval.mjs              # evidence inspector eval (26 cases)
npx tsx --env-file=.env scripts/run-e2e-journey.mts       # full visitor journey (20 checks)
```

**Database:** the bundled Supabase project is pre-provisioned; credentials live in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Migrations are applied via the Supabase tooling; the seed data is idempotent.

**Enabling live AI (the only deployment prerequisite):** add an `ANTHROPIC_API_KEY` secret to the `twin-chat` edge function, and set `VITE_TWIN_DEMO_MODE=false` (or remove it). Until then the app runs in labeled sample mode and Twin Chat states plainly that no model is connected.

**Verifying the published app:**
1. Explore each nav item; confirm sample-data banners are present everywhere.
2. Memories: record, edit, search, filter, delete one; open one from a citation panel.
3. Twin Chat: ask a suggested question; expand the evidence panel; flag an interpretation.
4. Decision Mirror: open the worked example, adjust value weights, record a choice, add a reflection, reopen it.
5. Beliefs: confirm and dismiss a suggestion; edit a statement.
6. Settings: review counts, export JSON, then delete everything (restore the demo by re-running the seed or via Version History).

---

## Known limitations (stated honestly)

- **Real accounts.** Email/password sign-up, sign-in, and sign-out with persistent sessions. Each account gets a private workspace; the fictional sample persona stays public and read-only.
- **Retrieval is keyword-based.** Both the demo composer and the server-side ranking use keyword scoring with recency/confidence weighting — not embeddings. It's honest about this in its own "gaps" output.
- **The sample persona is fiction.** All seeded content (memories, beliefs, decisions) is invented for demonstration and labeled as sample data on every page.
- **One correction channel.** Flagged interpretations are stored for review; nothing automatically rewrites the twin's behavior yet.

### Evidence Inspector evaluation (scripts/run-eval.mjs, 26 cases — observed 2026-10-17)

Categories: directly answerable (3), paraphrase (2), unsupported (4), conflicting records (3), misleading keyword overlap (3), stale memory (2), invalid citation (2), user correction (2), empty records (1), irrelevant retrieval (2), invented quote or date (2). Observed results: **26/26 passed**; citation validity 100%; abstention accuracy 100%; retrieval failures 0%; evidence-support 79% on answerable cases (paraphrase cases compose lists rather than single supported claims — the answers are still grounded and citation-valid, the metric counts a reply "supported" only when every answerable case yields at least one supported claim with evidence).

Failures found and fixed while building: the original 19-case suite had no way to detect invented quotes or dates inside an answer (now `rejectInventedContent` strips them and declares the removal); corrections were stored but never read back (now loaded per-request, ranked with the records, and surfaced side by side); sparse/stale/irrelevant retrievals produced confident-looking answers (now declared in gaps).

---

## Migrations: rerun safety

All migrations are safe to rerun. Verified guard per migration:

| Migration | Guard |
|---|---|
| `20261017072443_create_echo_self_core_tables` | `CREATE TABLE IF NOT EXISTS` everywhere; the seed block runs only when `memories` is empty |
| `20261017074044_extend_memories_tags_and_ai` | `ADD COLUMN IF NOT EXISTS`; per-row updates guarded by `tags = '{}'` / `ai_interpretation IS NULL`; new rows guarded by the `demo-wave-2` marker tag |
| `20261017074943_add_interpretation_flags` | `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` + re-`CREATE`, `CREATE INDEX IF NOT EXISTS` |
| `20261017075415_extend_decisions_decision_mirror` | `ADD COLUMN IF NOT EXISTS`; updates guarded by `constraints IS NULL` / `analysis IS NULL`; the new decided decision guarded by `WHERE NOT EXISTS (title …)` |
| `20261017080451_extend_beliefs_origin_and_suggestions` | `ADD COLUMN IF NOT EXISTS`; suggestion beliefs guarded by `WHERE NOT EXISTS (statement LIKE …)` |
| `20261017090840_add_decision_classification_overrides` | single `ADD COLUMN IF NOT EXISTS` |
| `add_decision_proposals_column` | `ADD COLUMN` guarded by an `information_schema` existence check (jsonb on decisions; inherits the table's RLS) |
| `add_graph_edge_confirmations` | `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` + re-`CREATE` per policy, `CREATE INDEX IF NOT EXISTS` |

No migration drops columns or tables, deletes rows, or changes column types. Live-state checks at audit time confirmed the guards match reality (8 marker-tagged memories, 2 suggestion beliefs, 1 stored reflection).

## External services and tools disclosure

For the Bolt Builders Week submission, the components built and running inside Bolt are: the entire React frontend, all application logic (retrieval, claim audit, decision analysis, evidence graph), the database schema and migrations, and the `twin-chat` edge function source.

External services the app calls at runtime (all secrets server-side):

- **Supabase** — Postgres database, row-level security, and edge function hosting. Credentials in `.env` are the publishable anon key (designed for browsers) plus the URL; the service-role key exists only in edge function secrets.
- **Anthropic Messages API** — called exclusively from the `twin-chat` edge function with the `ANTHROPIC_API_KEY` secret; the key never reaches client code. The endpoint is JWT-gated (see limitations).

No other third-party services, analytics, or trackers are used.
