<p align="center">
  <img src="assets/wordmark.svg" alt="EchoSelf — an evidence-grounded AI twin" width="360" />
</p>

<h1 align="center" style="border:none">EchoSelf</h1>

<p align="center">
  <em>Your experiences. Your values. Your decisions.<br/>One inspectable AI twin.</em>
</p>

<p align="center">
  <a href="#testing-and-evaluation"><img src="https://img.shields.io/badge/tests-444%20passing-4a7c59" alt="Tests: 444 passing" /></a>
  <a href="#getting-started"><img src="https://img.shields.io/badge/TypeScript-strict-2b2a26" alt="TypeScript strict" /></a>
  <a href="#security-and-privacy"><img src="https://img.shields.io/badge/RLS-ownership--scoped-c4643b" alt="RLS: ownership-scoped" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-none--yet-6b6558" alt="License: none yet" /></a>
</p>

---

AI companions are confident about you by default. They state what you think, value, and did — and none of it can be checked. If a model invents a memory of yours, there is no citation to catch it, no record to compare against, and no correction you can save that will matter tomorrow.

**EchoSelf is the opposite arrangement.** It is a self-reflection workspace in which the AI twin answers questions about you using *only* the records you wrote — and shows its work. Every claim links to the memory that supports it. Interpretations are labeled as interpretations. Conflicts and unknowns are stated, not smoothed over. When the twin misreads you, you save a correction that provably shapes later answers. Decisions are scored against your own recorded values with arithmetic you can reproduce by hand.

The honest sentence first: **this is a demo build.** It ships with a clearly labeled fictional sample persona (a banner appears on every page), and it runs in a local, labeled sample-conversation mode until an AI provider key is configured. Nothing here pretends to be real user data, real traction, or a capability the app does not have.

---

## At a glance

| | |
|---|---|
| **Application** | React 18 + TypeScript single-page app, custom History-API router (no router or state library) |
| **Styling** | Tailwind CSS, editorial design system (Fraunces serif / Inter sans, paper-and-terracotta palette) |
| **Data layer** | Supabase Postgres, 7 tables, all with ownership-aware row-level security |
| **Auth** | Supabase email/password; per-account private workspaces; public read-only sample persona |
| **AI integration** | `twin-chat` Edge Function → Google Gemini (JWT-gated; key server-side only) |
| **Decision engine** | Deterministic rules engine (`dm-4`) with persisted, hash-stamped analysis snapshots |
| **Testing** | 12 suite runners, 444 automated checks (deterministic + live-service), zero failures |
| **Status** | Demo build; live mode dormant until a `GEMINI_API_KEY` secret is configured |

## Product capabilities

All ten capabilities below are implemented and exercised by the test suites.

| Capability | What it does |
|---|---|
| **Memory Library** | Create, edit, search, filter (category / tag / date range), and delete evidence records — each with category, source, mood, a 0–100 confidence you assign, tags, and an AI interpretation kept visually separate from your own text. |
| **Evidence-grounded Twin Chat** | Ask a question; the twin answers from retrieved records only, with expandable source panels, stated inferences, declared gaps, and follow-up suggestions. |
| **Claim-level Evidence Inspector** | Every reply decomposes into claims typed as *directly supported*, *interpretation*, *conflicting evidence*, or *unknown* — each linked to its source records, with invented quotes and dates stripped client-side and the removal declared. |
| **Decision Mirror** | A structured decision workspace: options, constraints, values with adjustable weights, a deterministic score with a full arithmetic trace, sensitivity analysis, recorded choices, reopen, and outcome reflection. |
| **Beliefs & Values** | Statements with strength scores, status (`active / evolving / revisited`), AI-suggested patterns that stay explicitly labeled until you confirm or dismiss them, and contradiction detection against recorded memories. |
| **Belief Evolution History** | Strength snapshots with notes over time, powering before/after views of how a belief has moved. |
| **Evidence Graph** | A deterministic SVG graph of memories, beliefs, decisions, and reflections — every edge either recorded, user-confirmed, or keyword-suggested and labeled. Keyboard-navigable, with a linked-list view on small screens. |
| **Reflection Loop** | Record what happened after a decision, compare it against the original success definition, capture surprises — and optionally approve a proposed belief-strength revisit (nothing applies automatically). |
| **Personal Timeline** | A unified chronology of memories, decisions, belief changes, and reflections, with deep links into each source record. |
| **Private workspace & data controls** | Email/password accounts, per-user isolation enforced by RLS, full JSON/CSV export of all seven tables, and owner-scoped delete-everything (sample data excluded). |

## What makes EchoSelf different

- **Evidence before confident claims.** A claim without a resolvable citation cannot reach the UI as fact.
- **Interpretations never masquerade as facts.** The twin's readings are tagged, styled, and audited separately from your written words.
- **Contradictions are surfaced, not hidden.** When two records pull in opposite directions, both are shown with dates — no winner is picked.
- **Unknowns are acknowledged explicitly.** Sparse, stale, or irrelevant retrieval produces a declared gap, never a confident guess.
- **Decisions are explained, not handed down.** Scores come with the arithmetic, the sensitivity, and the evidence ids — reproducible by hand.
- **Corrections preserve provenance.** The original record is never rewritten; the correction lives beside it with its own lifecycle.
- **You remain responsible.** Scores are preference alignment, not predictions; belief proposals apply only on explicit approval.
- **Authorization boundaries are real.** Per-account workspaces enforced by row-level security and verified by a two-account test suite.

## Signature workflow

1. **Record an experience.** A memory with category, mood, confidence, tags — your words stay authoritative; any AI interpretation is stored apart from them.
2. **Retrieve.** Ask a question and the retrieval engine selects the relevant records — by intent, exact phrase, tags, recency, and your confidence ratings.
3. **Ask the Twin.** The answer cites memory ids inline and lists the sources it relied on.
4. **Inspect.** Open the evidence panel: each claim links to its records; uncertainty and gaps are declared.
5. **Correct.** Flag a wrong interpretation, write a correction, confirm it — later answers treat it as authoritative user text for that record and topic.
6. **Compare a decision.** The Decision Mirror scores each option against your recorded values, with per-value evidence counts and a score trace.
7. **Record what happened.** Reflect on the outcome against the original success definition; the reflection appears in the graph and timeline.
8. **Review the arc.** Belief history and the Evidence Graph show how your thinking has moved — edges traced to the records that justify them.

## Architecture

```mermaid
flowchart LR
  subgraph browser["Browser (React SPA)"]
    UI["Pages & AppShell<br/>(custom History router)"]
    RET["Retrieval engine<br/>(retrieval.ts)"]
    AUDIT["Claim audit &<br/>invented-content rejection"]
    DEC["Decision engine dm-4<br/>(deterministic, in-browser)"]
    GRAPH["Evidence graph builder<br/>(from stored rows)"]
    SVC["Typed Supabase CRUD<br/>(services.ts)"]
  end

  subgraph supabase["Supabase (trusted platform)"]
    AUTH["Email/password Auth"]
    RLS["Postgres + Row-Level Security<br/>(7 tables, ownership-scoped)"]
    EF["Edge Function: twin-chat<br/>(verify_jwt = true)"]
  end

  PROVIDER["Google Gemini API<br/>(key in server-side secrets)"]

  UI --> RET
  UI --> DEC
  UI --> GRAPH
  UI --> SVC
  SVC -->|anon key + user JWT| RLS
  UI -->|user JWT| EF
  EF -->|rank + prompt + validate| PROVIDER
  EF -->|caller JWT, RLS-scoped reads| RLS
  RET -. context mirror, audited against .-> AUDIT
```

**Where things run and why.** Retrieval, decision analysis, the claim audit, and graph construction all run in the browser — the diagram does not pretend otherwise. The database enforces authorization (row-level security checks every read and write against `auth.uid()`), and the one privileged operation — talking to the AI provider — lives in an Edge Function gated by JWT verification, which reads the caller's data *as the caller* so its context inherits the same RLS scoping. The service-role key is never used for data reads and never reaches the browser.

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript | Component model for a page-per-route app; strict mode catches malformed data shapes at compile time. |
| Build | Vite | Fast dev loop; the production build also emits a `404.html` SPA fallback for static hosts. |
| Styling | Tailwind CSS | Consistent design tokens (paper/terracotta palette, 8px rhythm) without a UI kit. |
| Routing | Custom History-API router (`src/lib/router.ts`) | Deep links, per-route titles/descriptions, true links — without pulling in a router dependency. |
| Data | Supabase Postgres | Relational schema, migrations, and row-level security for ownership boundaries. |
| Auth | Supabase email/password | Persistent sessions; `user_id` defaults to `auth.uid()` so clients never supply ownership. |
| AI | Google Gemini via `twin-chat` Edge Function | Server-side key custody; JSON-mode responses coerced and audited before display. |
| Icons | lucide-react | Inline SVG icons, `aria-hidden` by default. |
| Tests | `tsx` suite runners | Deterministic suites plus live-service suites against the real database; one aggregate runner writes `EVALUATION_REPORT.md`. |

## Repository structure

```
├── index.html                     # SPA entry (meta, OG tags)
├── public/                        # robots.txt, sitemap.xml, OG image
├── assets/wordmark.svg            # README brand mark
├── scripts/                       # 12 test runners + aggregate runner + OG generator
├── src/
│   ├── App.tsx                    # route table: pages + memory/decision detail views
│   ├── components/                # AppShell, forms, dialogs, shared UI primitives
│   ├── hooks/                     # useAsyncData, dialog a11y
│   ├── lib/
│   │   ├── router.ts              # route parsing, hrefs, per-route metadata
│   │   ├── retrieval.ts           # layered retrieval engine (intent, signals, counterevidence)
│   │   ├── twinService.ts         # live (edge function) vs demo (local composition)
│   │   ├── claimAudit.ts          # claim audit, invented-quote/date rejection
│   │   ├── decisionAnalysis.ts    # deterministic decision engine (dm-4)
│   │   ├── evidenceGraph.ts       # graph derivation from stored rows
│   │   ├── beliefContradictions.ts# belief-vs-memory contradiction detection
│   │   ├── services.ts            # typed Supabase CRUD + export/wipe
│   │   └── supabaseClient.ts      # browser client
│   └── pages/                     # one file per route + two detail pages
└── supabase/
    ├── functions/twin-chat/       # AI edge function (Gemini call, server-side key)
    ├── migrations/                # 14 idempotent migrations
    └── config.toml
```

## Getting started

Node.js 20+ and npm. No other tooling is required; the Supabase project is pre-provisioned and credentials are read from `.env` by the suites (`--env-file=.env`).

```bash
npm install
npm run dev        # local dev server
npm run build      # production build (emits 404.html SPA fallback)
npm run preview    # serve the production build locally
npm run typecheck  # strict TypeScript check
npm run lint       # eslint
```

Test suites (each can also be run through the npm scripts of the same name):

```bash
npm run eval:all              # every suite in sequence → EVALUATION_REPORT.md (444 checks)

# individually
npm run retrieval-tests       # retrieval engine (65)
npm run correction-tests      # correction lifecycle (46)
npm run decision-tests        # decision engine (57)
npm run graph-tests           # evidence graph (26)
npm run workspace-tests       # two-account security (37)
npm run twin-eval             # evidence inspector eval (26)
npm run robustness-tests      # malformed-input behavior
npm run claim-integrity-tests # citation integrity
npm run journey-tests         # live end-to-end visitor journey (23)
npx tsx scripts/run-static-checks.mts   # routes, links, SEO, a11y invariants (78)
```

**Enabling live AI.** The only deployment prerequisite: add a `GEMINI_API_KEY` secret (a Google AI Studio key) to the `twin-chat` Edge Function and set `VITE_TWIN_DEMO_MODE=false` (or remove the variable). Until then the app runs in labeled sample mode, and Twin Chat says plainly that no model is connected — it never fabricates a reply.

**Database.** Migrations live in `supabase/migrations/` and are all rerun-safe (`IF NOT EXISTS` guards; the seed only inserts when tables are empty). Apply them with your Supabase tooling of choice.

## Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser (`.env`) | Yes | Project URL used by the browser client. |
| `VITE_SUPABASE_ANON_KEY` | Browser (`.env`) | Yes | Publishable anon key — designed to be public; RLS is the real boundary. |
| `VITE_TWIN_DEMO_MODE` | Browser (`.env`) | Optional | `true` (default) runs the labeled sample mode; `false` routes Twin Chat to the live edge function. |
| `GEMINI_API_KEY` | Server (Edge Function secrets) | For live mode | Google Gemini key. Set via Supabase secrets, never in `.env` or client code. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Server (Edge Function runtime) | Auto-set | Injected by the Supabase platform into the function runtime. |
| `TWIN_USER_PER_MINUTE` | Server (Edge Function env) | Optional | Per-user twin questions per 60s window. Default 5. |
| `TWIN_USER_DAILY` | Server (Edge Function env) | Optional | Per-user twin questions per UTC day. Default 100. |
| `TWIN_MAX_BODY_BYTES` | Server (Edge Function env) | Optional | Request body cap before parsing. Default 65536 (64 KB); oversized requests get `413`. |
| `TWIN_MAX_QUESTION_CHARS` | Server (Edge Function env) | Optional | Question length cap. Default 2000. |
| `TWIN_MAX_CONTEXT_CHARS` | Server (Edge Function env) | Optional | Evidence-context cap in the provider prompt. Default 60000. |
| `TWIN_MAX_OUTPUT_TOKENS` | Server (Edge Function env) | Optional | Provider output token cap. Default 2048. |
| `TWIN_PROVIDER_TIMEOUT_MS` | Server (Edge Function env) | Optional | Provider call timeout. Default 30000, with 1 bounded retry on timeout/5xx/429. |

Anything prefixed `VITE_` is compiled into the client bundle — treat every `VITE_` variable as public and never put a secret there. When the provider is unavailable, the edge function returns a distinct `503 AI_NOT_CONFIGURED`, and the UI renders a setup notice rather than a fabricated answer.

### AI quotas and rate limiting (server-enforced)

Every live twin request is charged to an atomic, Postgres-backed quota bucket **before** any provider call, keyed by the user id from the verified JWT — never a client-supplied id. Defaults: **5 requests per 60-second window and 100 per UTC day per user**, overridable with the `TWIN_*` variables above. When a limit is hit, the function returns `429` with a `Retry-After` header and a plain-language message (`RATE_LIMITED`, or `DAILY_LIMIT_REACHED` for the daily budget), which the UI displays as a notice. The enforcement runs in a single `INSERT … ON CONFLICT … UPDATE` statement, so parallel requests cannot race past the limit; if the quota store is unavailable the function **fails closed** (503, no provider spend). Request bodies are capped at 64 KB and rejected (`413`) before parsing; the provider prompt is capped at 60k characters; output is capped at 2048 tokens; provider calls time out at 30s with one bounded retry. Usage outcomes (success, rate-limited, provider error, timeout) are logged per bucket with token counts — never question text or record content.

The enforcement RPC (`enforce_ai_quota`) is a security-definer function executable by `service_role` only — anon and authenticated roles cannot call it or read the quota tables (`ai_quota_config`, `ai_usage_log` have RLS enabled with zero policies). Verified by the executed quota suite (below). These are **app-enforced** controls, distinct from Supabase's platform-level auth-endpoint rate limits, which the app does not configure. No monetary cap is promised: the token and request caps bound cost, but provider pricing is not modeled.

## Understanding the intelligence

**Memory retrieval.** A layered, explainable pipeline (`src/lib/retrieval.ts`), shared identically by demo mode, live mode's client-side context mirror, and the test suite. Query intent is detected from weighted keyword rules (current state, historical period, repeated pattern, decision rationale, belief/value, contradiction/change, general) with a safe fallback to *general*. Hand-curated synonyms bridge paraphrase, tracked as `synonymHits` so the explanation can name the bridge. Layered scoring weights fields (title 4 > tags 3 > body 2 > category 1), adds an exact-phrase bonus, a boost for matching saved corrections, query-dependent recency, and applies your 0–100 confidence strictly as a *reliability* multiplier (0.7–1.0) — never as importance. An explicit period in the question ("last year", "in 2023") boosts records inside the window; belief/value questions apply no recency so an old explicit value statement outranks a recent incidental mention. Near-duplicates (same normalized title or ≥ 0.75 token overlap) are marked, never deleted. For pattern and change questions, a separate counterevidence scan surfaces records whose language materially opposes the question's frame — including negatively framed questions ("did I fail…"), which flip polarity. Every candidate carries its matched signals, rank, and a plain-language reason.

**Evidence verification.** After retrieval, replies pass through two layers of deterministic checks. Server-side (edge function): citations are filtered against the ids actually supplied to the model, inline `[id]` citations are honored, claims without defensible evidence are downgraded to *interpretation*. Client-side (claim audit): excerpts and dates are re-derived from stored records — invented quotes and dates are stripped and the removal declared in the gaps list; a valid citation id alone is never treated as proof. Uncertainty is declared when records are sparse (one match), stale (newest > 6 months), or only incidentally relevant. What these checks cannot do: read semantics. A citation proves the record exists and the text appears in it, not that the record's meaning supports the claim — the deterministic layer bounds the damage, it does not verify meaning.

**Decision Mirror.** A deterministic rules engine (version `dm-4`), no model involved. Relevant memories are classified per option as for/against/unknown; each value's contribution is (for − against) × your weight; options are scored by the weighted net over classified evidence. Explicit user-written pros/cons and keyword-inferred evidence are counted separately, with corrections honored. Missing inputs produce explicit incompleteness statements — such options are never named the leader. ±0.1 weight perturbations test for flips, a full weight-range sweep reports each value's stability span, and every analysis stores a snapshot (engine version, FNV-1a hash over all canonical inputs, evidence ids) so a stale analysis is detectably stale in the UI. The output is preference alignment — never a probability or outcome prediction.

**Correction loop.** A misread interpretation is flagged with a correction note stored as a separate row (`interpretation_flags`) beside the memory — the original is never rewritten. Corrections follow a lifecycle: *proposed* → *confirmed* / *amended* / *superseded* / *dismissed*, with `reviewed_at` stamped on every change. Only confirmed, non-empty corrections influence future answers — and only for their record and topic: they boost retrieval, appear beside the original text (both sides, no winner), and downgrade touched claims to *partial*. When a correction conflicts with a newer record, both are shown and the tension is named. Correction text is treated as user data, never instructions. The twin does not "learn" between answers: each answer is recomposed from stored rows.

## Data model

Seven tables in the `public` schema; all have row-level security enabled with ownership-aware policies.

| Table | Purpose | Relationships | Access |
|---|---|---|---|
| `memories` | Evidence records: title, content, category, source, mood, confidence 0–100, tags, `ai_interpretation` (kept apart from user text) | Flagged by `interpretation_flags`; owned via `user_id` → `auth.users` | Public sample rows (`user_id IS NULL`) readable by all; writes owner-only |
| `beliefs` | Beliefs and values: statement, kind, strength, status, `origin` (`user / suggestion / confirmed_suggestion`) | History in `beliefs_history` | Same boundary; suggestions stay labeled until confirmed |
| `beliefs_history` | Strength snapshots with notes for evolution views | Parent-gated through the owning belief | Access validated via the parent belief's owner |
| `decisions` | Decision Mirror records: options, constraints, values, weights, analysis, `analysis_snapshot`, reflection, proposals | Referenced by graph edges and timeline | Owner-only writes; public sample readable |
| `timeline_events` | Typed chronological entries | Links to source records | Same boundary |
| `interpretation_flags` | User corrections: note, `answer_excerpt` (provenance), topic, lifecycle status | `memory_id` → `memories` | Private to creator; attach requires a visible parent memory |
| `graph_edge_confirmations` | Per-user confirm/dismiss of suggested graph edges | Keyed by edge signature; endpoints must be visible to the creator | Private to creator |

`user_id` columns default to `auth.uid()` at insert time, so the browser never supplies ownership — a forged owner id fails the insert check. UPDATE policies carry `auth.uid() = user_id` on both sides, so a row cannot be reassigned.

## Security and privacy

EchoSelf processes personal reflections, so the security posture is stated precisely, with verification status attached.

- **Authentication.** Supabase email/password; per-account private workspaces; email confirmation off by default (the sign-up flow states this when confirmation is required).
- **Ownership-aware RLS.** All seven tables. Sample rows (`user_id IS NULL`) are readable by everyone — including signed-out visitors — and **writable by no one**; personal rows are visible and writable only by their owner. `interpretation_flags` and `graph_edge_confirmations` have no anon policies at all.
- **Privilege hardening.** `TRUNCATE` and `REFERENCES` revoked from client roles on all seven tables; UPDATE narrowed from table-wide to user-content columns (identity, ownership, and timestamp columns are not updatable through the data API; a correction stays attached to its record and excerpt).
- **Server-side secrets.** The client bundle contains only the publishable anon key and project URL. The Gemini key lives in Edge Function secrets only. Errors returned to clients are generic; details go to server logs.
- **JWT-gated AI path.** The `twin-chat` function runs with `verify_jwt = true`, and reads the caller's data with the caller's own JWT — its context is RLS-scoped exactly like the browser's. The service-role key is used only for the quota RPC and usage-log writes, never for personal-data reads.
- **App-enforced AI quotas.** Per-user per-minute and daily budgets enforced atomically server-side before any provider call, with 429 + Retry-After responses, body/context/output caps, provider timeouts, and a fail-closed policy if the quota store is unavailable (see "AI quotas" above for details and verified behavior).
- **Demo isolation.** The public demo uses fictional sample data, labeled on every page. Export and delete-everything act only on the signed-in account's rows; sample data is excluded by both query filter and RLS.
- **AI input/output validation.** Questions are length-validated server-side; correction text is framed as data, not instructions, in the model prompt (prompt-injection content in a record is quoted as data — tested). Replies are coerced and audited before display.

**Verified vs. not.** The two-account suite (37 checks) demonstrates cross-account read/write/delete denial, forged-owner rejection, and owner-scoped export/wipe. The Supabase security advisor reports zero findings — one signal, not proof. **Not verified:** no live end-to-end request against a real model in this environment; no attempted attack on the platform gateway itself (rate limits, JWT forgery at the edge) — those are Supabase platform responsibilities. No storage buckets or realtime channels are used. RLS was verified against these seven tables only; new tables would need the same treatment.

## Testing and evaluation

Thirteen runners, aggregated by `npm run eval:all` into `EVALUATION_REPORT.md`. **Most recent full run: 358 deterministic + 86 live-service checks, 0 failures (2026-10-17, against the real database); quota suite 12/12 including a live 429 against the deployed function.**

| Suite | Checks | Covers |
|---|---|---|
| `retrieval-tests` | 65 | Intent routing, paraphrase, tags, recency windows, values over recency, counterevidence, near-duplicates, cross-user isolation |
| `decision-tests` | 57 | Score arithmetic, ties, zero weights, contradictions, sensitivity, snapshot hash stability and staleness, proposals |
| `correction-tests` | 46 | Full lifecycle, topic-scoping, side-by-side display, claim downgrading, instruction boundary |
| `static-checks` | 78 | Routes, links, SEO metadata, robots/sitemap consistency, a11y invariants |
| `claim-integrity-tests` | — | Citation validity, invented quote/date rejection |
| `graph-tests` | 26 | Edge derivation, confirmations, deletion cleanup, contradiction exclusivity, determinism |
| `workspace-tests` | 37 | Two-account isolation: cross-account denial, forged owners, private confirmations, owner-scoped export/wipe |
| `robustness-tests` | — | Malformed input behavior, safe degradation |
| `twin-eval` | 26 | Evidence inspector cases: supported, paraphrase, unsupported, conflicting, stale, invented content |
| `journey-tests` | 23 | Live end-to-end visitor journey: explore → sign-up → save → ask → cite → correct → decide → export → delete → sign-out/in |
| `quota-tests` | 12 | AI quotas: 429 + Retry-After after the per-minute limit (live), unauthenticated denial, spoofed user ids, oversized bodies, quota-RPC and quota-table privilege denial |

These are executed checks, not coverage percentages: the deterministic suites run in-process; the live-service suites run against the real database (and, for the journey, the deployed edge function). The evidence inspector eval additionally reports citation validity and abstention accuracy on its 26 cases (100% and 100% on the last run — a property of the case set, not a general benchmark).

**Adding cases.** Suites live in `src/lib/*Suite.ts` with runners in `scripts/run-*.mts`; add cases to the suite module and rerun the matching script. The aggregate runner reports per-suite pass/fail counts and writes the report file.

## Known limitations

Findings are labeled by how they were established — code inspection (a known property of the implementation) versus observed in tests.

- **Lexical retrieval cannot see conceptual connections.** *Inspection + suite sampling.* Retrieval is keyword- and synonym-based — no embeddings. Exact wording, paraphrase, and tag-only matches all pass in the suite, but a conceptually related memory sharing no recognizable lexical signal with the question will not be found. Inherent to the current approach; not fixed by it.
- **Hand-curated synonyms.** *Inspection.* The synonym table is small and manually maintained; a miss degrades to plain keyword matching rather than failing.
- **Counterevidence detection is pattern-based.** *Inspection.* Opposition signals are regexes tuned to common habit and obligation language; subtler contradictions of wording, tone, or value trade-offs may be missed — and none is claimed where the patterns find none.
- **No model-based semantic evidence review.** *Inspection.* There is no second AI call that reads the retrieved records and the claims together; the deterministic audit bounds fabrication but cannot verify that a cited record's *meaning* supports a claim.
- **Decision scoring assumes classified evidence.** *Inspection.* Scores rest on the for/against classification of retrieved records; unclassified or sparse evidence produces explicit incompleteness statements, and the score is preference alignment — never a prediction.
- **No importance field, no embeddings.** *Deliberately deferred.* Both stay deferred unless testing demonstrates memories the current fields cannot rank correctly.
- **Demo-mode honesty boundary.** *By design.* Sample mode composes answers locally from the sample records with keyword retrieval — it is labeled as sample output and is not a language model. Live mode was not exercised against a real model in this environment.
- **Demo-mode anonymity.** *Inspection + deployed config.* The demo runs locally in the browser and makes no AI calls, so no per-IP demo enforcement exists; live-mode quotas key on the verified JWT, and anonymous callers reach no AI path at all. If an unauthenticated AI endpoint is ever added, it would need platform-supplied network signals plus global quotas — not yet built.
- **Platform-dependent protections.** Auth rate limiting and abuse prevention are Supabase platform defaults, not app-enforced. The app-enforced AI quotas (above) cover only the twin-chat endpoint.

## Roadmap

**Implemented** (all verified by the suites above): memory library, evidence-grounded Twin Chat with claim inspector, correction lifecycle, Decision Mirror with persisted snapshots, beliefs with suggestion gating and history, Evidence Graph with confirmations, reflection loop, timeline, per-account workspaces with RLS, export and owner-scoped wipe, 444-check evaluation infrastructure.

**Candidate next steps** — not commitments:

- [ ] Add embeddings-based retrieval alongside the lexical layer, evaluated by the existing retrieval suite before any switch.
- [ ] A second, model-based evidence-review pass in live mode (claims re-checked against retrieved records), behind the same audit contract.
- [ ] Live-mode end-to-end verification against a real model as part of the standard suite.
- [ ] Additional synonym coverage driven by observed retrieval misses from real usage.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Twin Chat shows "no model connected" | Demo mode active or provider key missing | Set the `GEMINI_API_KEY` secret on the `twin-chat` function and `VITE_TWIN_DEMO_MODE=false`. |
| Twin Chat returns "took too long to respond" | Provider latency or network | Retry; the client aborts at 45 s by design rather than hang. |
| Twin Chat says you're asking too fast (`429`) | Per-minute quota (5/60s) hit | Wait for the seconds in the message; the window resets automatically. |
| Twin Chat reports the daily limit reached | 100 questions/UTC day used | The budget resets at midnight UTC. |
| `503 AI_NOT_CONFIGURED` in live mode | Secret not set on the deployed function | Add the secret and redeploy the function. |
| Suites fail with connection errors | `.env` missing or wrong | Check `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; live suites need `--env-file=.env`. |
| Sample data missing after deleting everything | Wipe removed your rows; sample rows are excluded from wipe by design | Re-run the seed migration (idempotent) or restore from Version History. |
| Deep links 404 on a static host | Host lacks SPA fallback | The build emits `404.html`; most hosts (Netlify, Vercel, Bolt) also fall back to `index.html` automatically. |
| Type or lint failures in CI | Stale check | Run `npm run typecheck && npm run lint` locally; both are clean at time of writing. |

## Contributing and development principles

Changes are welcome under these ground rules — they are enforced by review and, where possible, by the suites:

1. **Evidence integrity first.** A reply may never present an uncited claim as fact; if you touch retrieval, the audit, or the inspector, the corresponding suite must stay green.
2. **Corrections are sacred.** Original records are never rewritten; corrections live beside them with provenance.
3. **Honest uncertainty.** Sparse and stale retrieval must surface declared gaps, not confident guesses.
4. **Privacy boundaries.** New tables require RLS with ownership-aware policies before merging; never expose a secret client-side.
5. **Reproducible decisions.** The decision engine's output must remain deterministic and snapshot-verifiable.
6. **No fabricated tests or metrics.** Every reported check must be executable and actually executed.
7. **Small, reviewable changes**, with `npm run typecheck`, `npm run lint`, and the affected suites run before proposing.

## License

No license file exists in this repository yet; all rights are reserved by default until one is added.

## Acknowledgments

Built with [React](https://react.dev), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com), [Supabase](https://supabase.com), and [lucide-react](https://lucide.dev). AI responses in live mode are powered by the [Google Gemini API](https://ai.google.dev).

---

*EchoSelf exists for a simple reason: an AI that talks about you should be able to show you why.*
