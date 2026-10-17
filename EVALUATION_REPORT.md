# EchoSelf Evaluation Report

Generated: 2026-10-17T17:56:36.588Z

## How to read this report

- **Deterministic suites** run pure functions with fixed inputs and expected outputs. Their pass/fail counts are exact and repeatable.
- **Live-service suites** run against the real Supabase project (real auth, real rows, real RLS). They are listed separately and NEVER merged into a single accuracy percentage with deterministic results.
- **Skipped** suites were not run (missing credentials); they contribute nothing to any rate.
- No live AI-provider call is part of any automated suite; live model behavior is explicitly out of scope for automated regression (see Limitations).

## Summary

- Deterministic: **280 passed, 0 failed** across 6 suites.
- Live-service: **83 passed, 0 failed** across 3 executed suites.
- Skipped: 0 suite(s).
- Crashed: 0 suite(s).

## Suites executed

| Suite | Kind | Command | Result | Passed | Failed |
|---|---|---|---|---|---|
| Retrieval engine | deterministic | `npx tsx scripts/run-retrieval-tests.mts` | passed | 65 | 0 |
| Claim integrity (evidence audit) | deterministic | `npx tsx scripts/run-claim-integrity-tests.mts` | passed | 68 | 0 |
| Correction lifecycle | deterministic | `npx tsx scripts/run-correction-tests.mts` | passed | 46 | 0 |
| Decision engine (fixed-input math) | deterministic | `npx tsx scripts/run-decision-tests.mts` | passed | 57 | 0 |
| Twin Chat eval cases (audit pipeline) | deterministic | `npx tsx scripts/run-eval.mjs` | passed | 26 | 0 |
| Robustness (malformed AI, garbage inputs, credentials) | deterministic | `npx tsx scripts/run-robustness-tests.mts` | passed | 18 | 0 |
| Evidence graph | live-service | `npx tsx --env-file=.env scripts/run-graph-tests.mts` | passed | 26 | 0 |
| Workspace isolation (two-account RLS) | live-service | `npx tsx --env-file=.env scripts/run-workspace-tests.mts` | passed | 37 | 0 |
| E2E journey | live-service | `npx tsx --env-file=.env scripts/run-e2e-journey.mts` | passed | 20 | 0 |

## What each suite measures

- **Retrieval engine**: ranking behavior on fixed corpora — intent detection, recency, synonyms, near-duplicate marking, counterevidence, correction boosts.
- **Claim integrity**: every claim in a reply must be backed by verbatim record text; fabricated excerpts/quotes/dates rejected; overreach downgraded.
- **Correction lifecycle**: corrections persist, are topical (do not leak into unrelated topics), respect confirmed/dismissed/superseded status rules, and never overwrite original records.
- **Decision engine**: exact expected outputs for weight normalization, missing ratings, zero weights, ties, contradictions, constraints, sensitivity, snapshots.
- **Twin Chat eval cases**: 26 end-to-end cases through the full audit pipeline (retrieval → composition → citation validation → claim audit → uncertainty → corrections), with abstention accuracy and citation validity measured per case.
- **Robustness**: malformed AI replies (non-array sources, junk claims, null fields, missing gaps) through the full pipeline must degrade safely, never throw or fabricate; cross-user source injection must be rejected; retrieval must survive null fields and invalid dates; demo mode must not require credentials.
- **Evidence graph**: graph construction and edge suggestions against the live database, including confirmations and inaccessible-record handling.
- **Workspace isolation**: two real throwaway accounts prove cross-account read/write/delete/insert denial, forged-owner rejection, and demo read-onlyness through real RLS.
- **E2E journey**: full user path through the live app (records, decisions, corrections, export) preserving the public demo.

## Mocks and real components

- Deterministic suites use NO mocks: they execute the actual shipped modules (retrieval, claimAudit, decisionAnalysis, evidenceGraph, twinService demo path) with in-memory fixtures. The only external boundary absent is the network.
- The "model" in deterministic suites is simulated by fixture replies fed through the real audit pipeline — this tests the app's verification behavior, not the model.
- Live-service suites use the real database and real auth; no component is mocked.
- The external AI provider is never called in any automated suite.

## Known blind spots and limitations

- No automated test exercises the live AI provider end-to-end. The edge function's grounding, key handling, and verify_jwt configuration are verified by code inspection and deployment config only. An integration test requiring a real model call is deliberately NOT included: it would be nondeterministic and cost money on every run.
- Retrieval quality here is measured by keyword/ranking behavior on synthetic corpora. These numbers are NOT a claim of semantic retrieval accuracy.
- RLS behavior is tested only through the Supabase client API; platform-level gateway behavior (rate limits, JWT forgery at the edge) is out of scope.
- Abstention and conflict detection in demo mode are keyword-heuristic; the eval cases encode the current expected behavior as regression anchors, not as ground truth about ideal behavior.
- Storage and realtime are unused by the app, so no suites exist for them.