/**
 * Unified evaluation runner: executes every EchoSelf test suite in sequence,
 * separates deterministic checks from live-service tests, and writes an
 * honest evaluation report to EVALUATION_REPORT.md (gitignored artifact).
 *
 * Deterministic suites run unconditionally. Live-service suites run only when
 * Supabase credentials are present; if absent, they are reported as SKIPPED,
 * never folded into a pass rate.
 *
 * Run with: npx tsx scripts/run-all-eval.mts
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

interface SuiteResult {
  name: string;
  script: string;
  kind: 'deterministic' | 'live-service';
  status: 'passed' | 'failed' | 'skipped' | 'crashed';
  passed: number;
  failed: number;
  detail: string;
}

const SUITES: { name: string; script: string; kind: 'deterministic' | 'live-service' | 'live-model' }[] = [
  { name: 'Retrieval engine', script: 'scripts/run-retrieval-tests.mts', kind: 'deterministic' },
  { name: 'Claim integrity (evidence audit)', script: 'scripts/run-claim-integrity-tests.mts', kind: 'deterministic' },
  { name: 'Correction lifecycle', script: 'scripts/run-correction-tests.mts', kind: 'deterministic' },
  { name: 'Decision engine (fixed-input math)', script: 'scripts/run-decision-tests.mts', kind: 'deterministic' },
  { name: 'Twin Chat eval cases (audit pipeline)', script: 'scripts/run-eval.mjs', kind: 'deterministic' },
  { name: 'Robustness (malformed AI, garbage inputs, credentials)', script: 'scripts/run-robustness-tests.mts', kind: 'deterministic' },
  { name: 'Relationship analysis (counterevidence candidates)', script: 'scripts/run-relationship-tests.mts', kind: 'deterministic' },
  { name: 'Semantic claim review (labels, coercion, downgrades, fallbacks)', script: 'scripts/run-claim-review-tests.mts', kind: 'deterministic' },
  { name: 'Semantic claim review live eval (provider, labeled set)', script: 'scripts/run-claim-review-live-eval.mts', kind: 'live-model' },
  { name: 'Static verification (routes, links, SEO, robots, a11y invariants)', script: 'scripts/run-static-checks.mts', kind: 'deterministic' },
  { name: 'Evidence graph', script: 'scripts/run-graph-tests.mts', kind: 'live-service' },
  { name: 'Workspace isolation (two-account RLS)', script: 'scripts/run-workspace-tests.mts', kind: 'live-service' },
  { name: 'E2E journey', script: 'scripts/run-e2e-journey.mts', kind: 'live-service' },
];

const hasSupabaseCreds = !!(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);

const results: SuiteResult[] = [];

for (const s of SUITES) {
  if (s.kind === 'live-service' && !hasSupabaseCreds) {
    results.push({ ...s, status: 'skipped', passed: 0, failed: 0, detail: 'Supabase credentials not present in environment — not run, not counted.' });
    console.log(`SKIP  ${s.name}`);
    continue;
  }
  if (s.kind === 'live-model') {
    // Never runs in the automated regression pass: a real model call is
    // nondeterministic and costs money on every run. Kept out of the report
    // entirely unless explicitly enabled.
    if (process.env.RUN_LIVE_MODEL_EVAL !== 'true') {
      console.log(`SKIP  ${s.name} (set RUN_LIVE_MODEL_EVAL=true and configure a provider key to run)`);
      continue;
    }
    results.push({ ...s, status: 'skipped', passed: 0, failed: 0, detail: 'Executed separately via npm run claim-review-live-eval.' });
    console.log(`NOTE  ${s.name} is enabled; run it via npm run claim-review-live-eval and record the output.`);
    continue;
  }
  const args = s.script.endsWith('.mts') && s.kind === 'live-service' ? ['--env-file=.env', s.script] : [s.script];
  try {
    const out = execFileSync('npx', ['tsx', ...args], { encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const allOut = out;
    const m = allOut.match(/(\d+)\s*passed(?:[,\s]*(\d+)\s*failed)?/);
    const p = m ? parseInt(m[1], 10) : 0;
    const f = m && m[2] ? parseInt(m[2], 10) : 0;
    results.push({ ...s, status: f > 0 || /FAIL/.test(allOut) ? 'failed' : 'passed', passed: p, failed: f, detail: allOut.slice(-400) });
    console.log(`OK    ${s.name} — ${p} passed, ${f} failed`);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number | null };
    const allOut = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    const m = allOut.match(/(\d+)\s*passed(?:[,\s]*(\d+)\s*failed)?/);
    const p = m ? parseInt(m[1], 10) : 0;
    const f = m && m[2] ? parseInt(m[2], 10) : 0;
    results.push({ ...s, status: 'crashed', passed: p, failed: f, detail: allOut.slice(-800) });
    console.log(`CRASH ${s.name} — see report`);
  }
}

const det = results.filter((r) => r.kind === 'deterministic');
const live = results.filter((r) => r.kind === 'live-service');
const detPassed = det.reduce((a, r) => a + r.passed, 0);
const detFailed = det.reduce((a, r) => a + r.failed, 0);
const livePassed = live.reduce((a, r) => a + r.passed, 0);
const liveFailed = live.reduce((a, r) => a + r.failed, 0);
const skipped = results.filter((r) => r.status === 'skipped');
const crashed = results.filter((r) => r.status === 'crashed');

const date = new Date().toISOString();
const lines: string[] = [];
lines.push('# EchoSelf Evaluation Report');
lines.push('');
lines.push(`Generated: ${date}`);
lines.push('');
lines.push('## How to read this report');
lines.push('');
lines.push('- **Deterministic suites** run pure functions with fixed inputs and expected outputs. Their pass/fail counts are exact and repeatable.');
lines.push('- **Live-service suites** run against the real Supabase project (real auth, real rows, real RLS). They are listed separately and NEVER merged into a single accuracy percentage with deterministic results.');
lines.push('- **Skipped** suites were not run (missing credentials); they contribute nothing to any rate.');
lines.push('- No live AI-provider call is part of any automated suite; live model behavior is explicitly out of scope for automated regression (see Limitations).');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Deterministic: **${detPassed} passed, ${detFailed} failed** across ${det.length} suites.`);
lines.push(`- Live-service: **${livePassed} passed, ${liveFailed} failed** across ${live.filter((r) => r.status !== 'skipped').length} executed suites.`);
lines.push(`- Skipped: ${skipped.length} suite(s)${skipped.length ? ` (${skipped.map((s) => s.name).join(', ')})` : ''}.`);
lines.push(`- Crashed: ${crashed.length} suite(s)${crashed.length ? ` (${crashed.map((s) => s.name).join(', ')})` : ''}.`);
lines.push('');
lines.push('## Suites executed');
lines.push('');
lines.push('| Suite | Kind | Command | Result | Passed | Failed |');
lines.push('|---|---|---|---|---|---|');
for (const r of results) {
  const cmd = r.kind === 'live-service' ? `npx tsx --env-file=.env ${r.script}` : `npx tsx ${r.script}`;
  lines.push(`| ${r.name} | ${r.kind} | \`${cmd}\` | ${r.status} | ${r.passed} | ${r.failed} |`);
}
lines.push('');
lines.push('## What each suite measures');
lines.push('');
lines.push('- **Retrieval engine**: ranking behavior on fixed corpora — intent detection, recency, synonyms, near-duplicate marking, counterevidence, correction boosts.');
lines.push('- **Claim integrity**: every claim in a reply must be backed by verbatim record text; fabricated excerpts/quotes/dates rejected; overreach downgraded.');
lines.push('- **Correction lifecycle**: corrections persist, are topical (do not leak into unrelated topics), respect confirmed/dismissed/superseded status rules, and never overwrite original records.');
lines.push('- **Decision engine**: exact expected outputs for weight normalization, missing ratings, zero weights, ties, contradictions, constraints, sensitivity, snapshots.');
lines.push('- **Twin Chat eval cases**: 26 end-to-end cases through the full audit pipeline (retrieval → composition → citation validation → claim audit → uncertainty → corrections), with abstention accuracy and citation validity measured per case.');
lines.push('- **Robustness**: malformed AI replies (non-array sources, junk claims, null fields, missing gaps) through the full pipeline must degrade safely, never throw or fabricate; cross-user source injection must be rejected; retrieval must survive null fields and invalid dates; demo mode must not require credentials.');
lines.push('- **Relationship analysis**: candidate pair selection (lexical pre-filter, caps, dedup), strict coercion of model results (foreign/fabricated ids dropped), the six detection categories, pattern-baseline limits (verified gaps and near-misses), and typed provider-failure degradation. The live model leg is exercised only when the provider is configured; deterministic checks never call it.');
lines.push('- **Static verification**: the routing table, internal link literals, per-route metadata, index.html tags, JSON-LD, sitemap URLs, robots directives, and static accessibility invariants are checked against the real source files. Browser-rendered behavior (visual layout, live contrast) is outside its scope.');
lines.push('- **Evidence graph**: graph construction and edge suggestions against the live database, including confirmations and inaccessible-record handling.');
lines.push('- **Workspace isolation**: two real throwaway accounts prove cross-account read/write/delete/insert denial, forged-owner rejection, and demo read-onlyness through real RLS.');
lines.push('- **E2E journey**: full user path through the live app (records, decisions, corrections, export) preserving the public demo.');
lines.push('');
if (detFailed > 0 || liveFailed > 0 || crashed.length > 0) {
  lines.push('## Failures and reproduction');
  lines.push('');
  for (const r of results.filter((x) => x.failed > 0 || x.status === 'crashed')) {
    lines.push(`### ${r.name} (${r.status})`);
    lines.push('```');
    lines.push(r.detail.trim() || '(no captured output)');
    lines.push('```');
    lines.push('');
  }
}
lines.push('## Mocks and real components');
lines.push('');
lines.push('- Deterministic suites use NO mocks: they execute the actual shipped modules (retrieval, claimAudit, decisionAnalysis, evidenceGraph, twinService demo path) with in-memory fixtures. The only external boundary absent is the network.');
lines.push('- The "model" in deterministic suites is simulated by fixture replies fed through the real audit pipeline — this tests the app\'s verification behavior, not the model.');
lines.push('- Live-service suites use the real database and real auth; no component is mocked.');
lines.push('- The external AI provider is never called in any automated suite.');
lines.push('');
lines.push('## Known blind spots and limitations');
lines.push('');
lines.push('- No automated test exercises the live AI provider end-to-end. The edge function\'s grounding, key handling, and verify_jwt configuration are verified by code inspection and deployment config only. An integration test requiring a real model call is deliberately NOT included: it would be nondeterministic and cost money on every run.');
lines.push('- Retrieval quality here is measured by keyword/ranking behavior on synthetic corpora. These numbers are NOT a claim of semantic retrieval accuracy.');
lines.push('- RLS behavior is tested only through the Supabase client API; platform-level gateway behavior (rate limits, JWT forgery at the edge) is out of scope.');
lines.push('- Abstention and conflict detection in demo mode are keyword-heuristic; the eval cases encode the current expected behavior as regression anchors, not as ground truth about ideal behavior.');
lines.push('- Storage and realtime are unused by the app, so no suites exist for them.');

writeFileSync('EVALUATION_REPORT.md', lines.join('\n'));

console.log('\n=== Summary ===');
console.log(`Deterministic: ${detPassed} passed, ${detFailed} failed`);
console.log(`Live-service:  ${livePassed} passed, ${liveFailed} failed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
console.log(`Report written to EVALUATION_REPORT.md`);
process.exit(detFailed + liveFailed + crashed.length > 0 ? 1 : 0);
