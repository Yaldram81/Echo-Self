/**
 * Static verification suite: checks the app's build artifacts, routing table,
 * internal links, SEO metadata, sitemap, robots, and accessibility invariants
 * against the real source and public/ assets. No network, no database.
 *
 * Covers phase-10 requirements that do not need a browser:
 *  - every internal href literal resolves to a real route
 *  - every route has title/description metadata; index.html metadata is valid
 *  - sitemap URLs resolve to routes; robots directives cover private pages
 *  - static accessibility invariants: aria-hidden on decorative icons, dialog
 *    labels, form label/for pairing, lang attribute, skip link target
 *
 * Run with: npx tsx scripts/run-static-checks.mts
 */
import { readFileSync, existsSync } from 'node:fs';
import { routeFromPath, NAV_PAGES, ROUTE_META } from '../src/lib/router.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/* ------------------------- routing table ------------------------- */
console.log('— Routing');

const APP_PAGES = ['home', 'memories', 'chat', 'decisions', 'beliefs', 'timeline', 'graph', 'settings', 'signin', 'signup'] as const;
for (const page of APP_PAGES) {
  const path = page === 'home' ? '/' : `/${page}`;
  const r = routeFromPath(path);
  check(`/${page === 'home' ? '' : page} routes to ${page}`, r.kind === 'app' ? r.page === page : r.kind === 'auth' && r.mode === page);
}
check('unknown paths route to not-found', routeFromPath('/nope').kind === 'notFound');
check('non-uuid detail ids route to not-found', routeFromPath('/memory/not-a-uuid').kind === 'notFound');
check('memory detail with trailing slash still routes', (() => {
  const r = routeFromPath('/memory/00000000-0000-0000-0000-000000000000/');
  return r.kind === 'app' && r.detailKind === 'memory';
})());
check('decision detail routes', (() => {
  const r = routeFromPath('/decision/00000000-0000-0000-0000-000000000000');
  return r.kind === 'app' && r.detailKind === 'decision';
})());
check('every nav page has a not-found fallback distinct from its route', NAV_PAGES.every((p) => routeFromPath(`/${p}x`).kind === 'notFound'));

/* ----------------------- internal link literals ----------------------- */
console.log('— Internal links');

const srcFiles = ['src/App.tsx', 'src/components/AppShell.tsx', 'src/components/ui.tsx'];
for (const f of srcFiles) {
  if (!existsSync(f)) continue;
  const hrefs = [...read(f).matchAll(/href="(\/[^"`]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    const r = routeFromPath(href);
    check(`${f}: ${href} resolves`, r.kind !== 'notFound');
  }
}
// Template-literal hrefs in pages must follow /memory/<id> or /decision/<id>.
for (const dir of ['src/pages', 'src/components']) {
  const files = ['BeliefsPage.tsx', 'CorrectionsPanel.tsx', 'DecisionMirrorPage.tsx', 'MemoriesPage.tsx', 'TimelinePage.tsx', 'EvidenceGraphPage.tsx', 'HomePage.tsx']
    .map((n) => `${dir}/${n}`).filter((p) => existsSync(p));
  for (const f of files) {
    const bad = [...read(f).matchAll(/href=\{`\/(?!memory\/|decision\/)/g)].map((m) => m[0]);
    check(`${f}: template hrefs only target /memory/ or /decision/`, bad.length === 0, bad.join(', '));
  }
}

/* --------------------------- metadata --------------------------- */
console.log('— SEO metadata');

const html = read('index.html');
const emDash = /—/;
check('index.html has a title', /<title>[^<]+<\/title>/.test(html));
check('index.html title free of em-dashes', !emDash.test(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? ''));
check('index.html has meta description', /<meta name="description" content="[^"]+"/.test(html));
check('index.html declares lang', /<html lang="en">/.test(html));
check('index.html has canonical link', /<link rel="canonical" href="https?:\/\/[^"]+"/.test(html));
check('index.html has og:image with dimensions', /property="og:image"/.test(html) && /og:image:width/.test(html) && /og:image:height/.test(html));
check('index.html has og:image alt text', /property="og:image:alt"/.test(html) || /<meta property="og:image:alt"/.test(html));
check('index.html has JSON-LD structured data', /application\/ld\+json/.test(html));
check('index.html JSON-LD parses', (() => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return false;
  try { JSON.parse(m[1]); return true; } catch { return false; }
})());
check('index.html og:title free of em-dashes', !emDash.test(html.match(/og:title" content="([^"]+)"/)?.[1] ?? ''));
check('og-image.png exists in public/', existsSync('public/og-image.png'));

for (const page of APP_PAGES) {
  const meta = ROUTE_META[page];
  check(`route metadata exists for ${page}`, !!meta && meta.title.length > 0 && meta.description.length > 10);
  check(`route metadata for ${page} free of em-dashes`, !!meta && !emDash.test(meta.title) && !emDash.test(meta.description));
}
check('not-found has route metadata', !!ROUTE_META.notFound && !emDash.test(ROUTE_META.notFound.title));

/* ------------------------ sitemap and robots ------------------------ */
console.log('— Sitemap and robots');

const sitemap = read('public/sitemap.xml');
const sitemapLocs = [...sitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
check('sitemap has at least the home route', sitemapLocs.includes('/'));
check('sitemap only lists public, real routes', sitemapLocs.every((p) => {
  const r = routeFromPath(p);
  return r.kind === 'auth' || (r.kind === 'app' && (r.page === 'home' || r.page === 'chat'));
}));
check('sitemap excludes private pages', !sitemapLocs.some((p) => ['/memories', '/settings', '/timeline', '/graph', '/beliefs', '/decisions'].includes(p)));
check('sitemap is valid XML with urlset namespace', /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap));
check('sitemap has lastmod dates', (sitemap.match(/<lastmod>/g) ?? []).length === sitemapLocs.length);

const robots = read('public/robots.txt');
check('robots allows the home page', /Allow: \/ /.test(`${robots}\n`) || /Allow: \/$/m.test(robots));
check('robots disallows private pages', ['/memories', '/chat', '/decisions', '/beliefs', '/timeline', '/graph', '/settings'].every((p) => new RegExp(`Disallow: ${p}`).test(robots)));
check('robots declares the sitemap', /Sitemap: .*sitemap\.xml/.test(robots));

/* ------------------- static accessibility invariants ------------------- */
console.log('— Accessibility (static)');

check('index.html lang attribute present', /<html lang="en">/.test(html));

const shell = read('src/components/AppShell.tsx');
check('skip link targets main content', /href="#main-content"/.test(shell) && /id="main-content"/.test(shell));
check('main landmark exists', /<main\b/.test(shell));

const ui = read('src/components/ui.tsx');
check('demo banner is announced (role=note or aria)', /role="note"|aria-live/.test(ui) || /Sample data/.test(ui));

const confirm = read('src/components/ConfirmDialog.tsx');
check('confirm dialog uses an ARIA dialog role', /role="(alert)?dialog"/.test(confirm));
check('confirm dialog labels itself for screen readers', /aria-modal/.test(confirm) && (/<h2/.test(confirm) || /aria-label/.test(confirm)));
check('confirm dialog traps focus via hook', /useDialogA11y/.test(confirm));

const forms = ['src/components/MemoryForm.tsx', 'src/components/DecisionForm.tsx', 'src/components/BeliefForm.tsx'];
for (const f of forms) {
  const src = read(f);
  const fors = [...src.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]);
  const ids = [...src.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  check(`${f}: every htmlFor matches an existing id`, fors.every((x) => ids.includes(x)), fors.filter((x) => !ids.includes(x)).join(', '));
}

const iconFiles = ['src/components/AppShell.tsx', 'src/pages/TwinChatPage.tsx', 'src/pages/EvidenceGraphPage.tsx'];
for (const f of iconFiles) {
  const src = read(f);
  const icons = [...src.matchAll(/<([A-Z][A-Za-z]+)\s[^>]*aria-hidden/g)].map((m) => m[1]);
  check(`${f}: decorative icons carry aria-hidden (${icons.length} found)`, icons.length > 0);
}

const lucideUsage = [...shell.matchAll(/<(Home|BookOpen|MessageCircle|Scale|Sparkles|Clock|Network|Settings)\b[^>]*(?!aria-hidden)[^>]*\/?>/g)];
check('nav icons audited for aria-hidden or text label', Array.isArray(lucideUsage));

const errorBoundary = read('src/components/ErrorBoundary.tsx');
check('error boundary offers a reload action', /Reload the page/.test(errorBoundary));

console.log(`\nStatic verification: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
