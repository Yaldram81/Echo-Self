# EchoSelf

An evidence-grounded self-reflection companion. You record memories, state beliefs and values, and work through decisions — and a "twin" answers questions about you using **only** what you actually recorded, with every claim citable back to its source memory. No fabrication, no fortune-telling: when the records don't cover something, the twin says so.

> **This is a demo.** The app ships pre-seeded with a clearly labeled fictional sample persona. Every page shows a "Sample data" banner, and nothing here pretends to be real user data, real traction, or capabilities the app doesn't have.

---

## What the app does

### Seven destinations (hash-routed, no page reloads)

| Route | Page | What it does |
|---|---|---|
| `#/home` | Overview | Stats (memories, open decisions, beliefs in motion), recent memories, unresolved decisions, evolving beliefs, and a link into Twin Chat. |
| `#/memories` | Memories | Create, edit, search, filter (category / tag / date range), and delete evidence records. Each has a detail page at `#/memory/:id`. |
| `#/chat` | Twin Chat | Ask questions; get structured, evidence-grounded answers with expandable source panels, stated inferences, declared gaps, and follow-up suggestions. |
| `#/decisions` | Decision Mirror | Structured decision workspace: options, constraints, values with adjustable weights, a deterministic analysis, recorded choices, reopen, and outcome reflection. Detail page at `#/decision/:id`. |
| `#/beliefs` | Beliefs & Values | Beliefs and values with strength scores, evolution history, AI-suggested patterns (explicitly labeled until you confirm or dismiss them), and contradiction detection against recorded memories. |
| `#/timeline` | Timeline | Unified chronology assembled from memories, decisions, belief changes, and reflections — with deep links into each source record. |
| `#/settings` | Settings & Privacy | Record counts, full JSON/CSV export, delete-everything, and an honest statement of what this build does and does not guarantee. |

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
  App.tsx                  # hash router: pages + memory/decision detail views
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
- **Live mode:** calls the `twin-chat` edge function. The function ranks relevant memories server-side (keyword score × recency × your confidence rating), builds a strict evidence-only system prompt, calls Anthropic (Claude), then **coerces and validates the response**: citations that don't resolve to supplied memory IDs are dropped, inline `[id]` citations in the answer text are honored, and malformed responses surface a generic error instead of partial fabrications. A missing provider key returns a distinct `503 AI_NOT_CONFIGURED`, which the UI renders as a setup notice — not a fake answer.

The API key lives only in the edge function's server-side secrets. Nothing sensitive ships to the browser.

### Deterministic decision analysis

The Decision Mirror's analysis is a rules engine, not a model call: relevant memories are retrieved and scored against the decision's context and stated values; each value's alignment per option is computed from how recorded experiences classify (for/against) with your adjustable weights; contradictions between stated beliefs and recorded behavior are pattern-matched; missing information (no constraints, no success definition, an unconsulted party in your records) becomes experiment suggestions. Everything it outputs is derived from real rows.

---

## Data model

Six tables in the `public` schema (migrations in `supabase/migrations/`):

- **memories** — title, content, category (`relationship | health | work | personal_growth | travel | finance | other`), source (`journal | conversation | photo | audio | note`), mood, confidence 0–100, tags, `ai_interpretation` (kept strictly separate from the user's original text in the UI), `occurred_at`.
- **beliefs** — statement, kind (`belief | value`), strength, status (`active | evolving | revisited`), `origin` (`user | suggestion | confirmed_suggestion`), `last_reviewed`.
- **beliefs_history** — strength snapshots with notes, for before/after evolution views.
- **decisions** — title, context, status (`unresolved | decided | archived`), options (JSON), constraints, uncertainties, values, `value_weights`, `success_definition`, chosen option + rationale, structured `analysis`, and an outcome `reflection` (what happened, whether it matched the reasoning, surprises, lesson).
- **timeline_events** — typed chronological entries.
- **interpretation_flags** — user corrections attached to flagged AI interpretations.

**Security posture:** row-level security is enabled on all six tables with explicit per-operation policies. This build is an intentional single-tenant, no-sign-in demo, so policies allow the anon role to read and write — the sample data is meant to be shared and is labeled as such. The Settings page states plainly that per-user data isolation is **not** implemented and requires authentication (a documented next step, not a claim). The Supabase security advisor currently reports zero findings.

The demo seed (first migration) is idempotent — it only inserts when tables are empty — and creates the fictional persona: eight memories, three open decisions plus one decided, six beliefs with history, and six timeline events.

---

## Design system

A "luxury editorial" direction: warm paper background (`#F7F3EB`), linen borders, terracotta accent, charcoal serif headlines (Fraunces) over Inter body text. Semantic color ramps (sage = positive, amberclay = AI-generated content, clayred = destructive) are used consistently — AI-generated content is always amber-tinted and labeled, user-authored content is never confused with it. Cards use a shared `card-surface` style with two shadow depths; spacing follows an 8px rhythm; focus-visible rings are styled globally; icon-only buttons carry aria-labels; dialogs are keyboard-accessible.

---

## Running it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # strict TS check
npm run lint       # eslint (currently 0 errors)
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

- **No authentication.** Single shared dataset; any visitor can read, edit, or delete everything. Isolation requires adding sign-in and scoping policies to `auth.uid()`.
- **Live AI requires the provider key** (see above). Nothing in the app pretends otherwise.
- **Retrieval is keyword-based.** Both the demo composer and the server-side ranking use keyword scoring with recency/confidence weighting — not embeddings. It's honest about this in its own "gaps" output.
- **The sample persona is fiction.** All seeded content (memories, beliefs, decisions) is invented for demonstration and labeled as sample data on every page.
- **One correction channel.** Flagged interpretations are stored for review; nothing automatically rewrites the twin's behavior yet.
