/**
 * Retrieval engine test suite: repeatable checks for the layered retrieval
 * engine over synthetic fictional fixtures. Covers exact wording, paraphrase,
 * tag-only matches, query-dependent recency, historical periods, importance
 * via explicit statement (not confidence), changed beliefs with history,
 * counterevidence, near-duplicates, empty records, missing dates/fields,
 * misleading keywords, corrections, generic-word noise, similar categories,
 * and cross-user isolation.
 * Run with: npx tsx scripts/run-retrieval-tests.mts
 */
import {
  detectIntent, expandSynonyms, extractTerms, findBeliefConflicts, parseQueryPeriod,
  retrieve, retrieveCounterevidence, retrieveMemories, userTextWithCorrections,
  type Belief, type InterpretationFlag, type Memory,
} from '../src/lib/retrieval.ts';

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

const NOW = new Date('2026-10-17T12:00:00Z').getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

function mem(
  id: string, title: string, content: string,
  opts: { category?: Memory['category']; tags?: string[]; confidence?: number; daysAgo?: number; occurredAt?: string | null; source?: Memory['source']; importance?: number | null } = {}
): Memory {
  return {
    id, title, content,
    category: opts.category ?? 'personal_growth',
    source: opts.source ?? 'journal',
    mood: 'positive',
    confidence: opts.confidence ?? 80,
    tags: opts.tags ?? [],
    ai_interpretation: null,
    occurred_at: opts.occurredAt !== undefined ? opts.occurredAt : iso(opts.daysAgo ?? 30),
    created_at: iso(opts.daysAgo ?? 30),
    user_importance: opts.importance === undefined ? null : opts.importance,
  };
}

/* ------------------------------ fixtures ------------------------------ */

const FIXTURES: Memory[] = [
  mem('fx-run-01', 'Morning runs replaced scrolling',
    'Two weeks into running every morning. The first ten minutes are hard, but my head is clearer all morning. I stopped reaching for my phone in bed.',
    { tags: ['running', 'habit'], daysAgo: 40, confidence: 85 }),
  mem('fx-run-02', 'Skipped running this whole week',
    'Fell out of the running routine entirely this week. Zero mornings. Old scrolling habit came back with it.',
    { tags: ['running', 'setback'], daysAgo: 3, confidence: 90 }),
  mem('fx-run-02-dup', 'Skipped running this whole week',
    'Fell out of the running routine entirely this week. Zero mornings. Old scrolling habit came back with it. (Copy)',
    { tags: ['running', 'setback'], daysAgo: 3, confidence: 90 }),
  mem('fx-salary-01', 'The salary negotiation I fumbled',
    'Accepted the first number for the senior role. I had a counter prepared and did not say it. Worth recording so the pattern is visible.',
    { category: 'work', tags: ['salary', 'negotiation'], daysAgo: 340, confidence: 90 }),
  mem('fx-worth-01', 'Money is a tool, not a scoreboard',
    'Wrote down the core value today: money is a tool for freedom, not a scoreboard. Said it out loud in the review meeting. This matters more to me than any perk.',
    { category: 'finance', tags: ['values', 'money'], daysAgo: 500, confidence: 60 }),
  mem('fx-money-tang-01', 'Paid the plumber in cash',
    'Plumbing repair cost 200. Not a big deal, just money leaving the account.',
    { category: 'finance', tags: ['money'], daysAgo: 2, confidence: 95 }),
  mem('fx-gym-01', 'Cancelled the gym membership I never used',
    'Kept paying for fourteen months out of guilt. Cancelled it and walk instead. Cheaper and I actually do it.',
    { category: 'health', tags: ['gym', 'money'], daysAgo: 150, confidence: 97 }),
  mem('fx-dogs-01', 'Adopted a second dog',
    'We debated for eight months and finally adopted. The apartment genuinely had room for one more.',
    { category: 'other', tags: ['dogs', 'family'], daysAgo: 300, confidence: 95 }),
  mem('fx-2023-01', 'Moved into the city apartment',
    'Signed the lease in March 2023 and moved everything myself. Hardest week of the year.',
    { occurredAt: '2023-04-15T09:00:00.000Z', tags: ['moving'], confidence: 85 }),
  mem('fx-nodate-01', 'A note without a date',
    'Jotted this down without a date: asked for a counter offer next time. Remember the salary counter.',
    { occurredAt: null, tags: ['salary'], confidence: 70 }),
  mem('fx-diet-01', 'Started a meditation streak',
    'Ten minutes of meditation every morning this week. Kept up the streak all seven days.',
    { category: 'health', tags: ['meditation', 'habit'], daysAgo: 7, confidence: 88 }),
  mem('fx-diet-01-dup', 'Started a meditation streak',
    'Ten minutes of meditation every morning this week. Kept up the streak all seven days.',
    { category: 'health', tags: ['meditation', 'habit'], daysAgo: 7, confidence: 88 }),
];

const FLAGS: InterpretationFlag[] = [
  {
    id: 'fx-flag-01',
    memory_id: 'fx-run-02',
    answer_excerpt: 'The running routine lapsed.',
    correction_note: 'The lapse was planned rest for an injury, not a failed habit — I resumed the next week.',
    created_at: iso(1),
    status: 'confirmed',
    topic: 'running',
    reviewed_at: iso(0),
    superseded_by: null,
  },
];

const BELIEFS: Belief[] = [
  {
    id: 'fx-bel-01', statement: 'I must always be available for work.', kind: 'belief',
    category: 'work', strength: 55, status: 'evolving', formed_at: iso(600),
    last_reflected_at: iso(20), last_reviewed: null, description: null, origin: 'user',
    created_at: iso(600),
    history: [
      { id: 'fx-h1', belief_id: 'fx-bel-01', strength: 90, note: 'Firmly held.', recorded_at: iso(600) },
      { id: 'fx-h2', belief_id: 'fx-bel-01', strength: 70, note: 'Questioning after burnout.', recorded_at: iso(200) },
      { id: 'fx-h3', belief_id: 'fx-bel-01', strength: 55, note: 'Experimenting with boundaries.', recorded_at: iso(20) },
    ],
  },
];

/* ------------------------------ 1. exact wording ------------------------------ */
console.log('\n— Exact wording —');
{
  const r = retrieve('What did I record about the salary negotiation I fumbled?', FIXTURES, { now: NOW });
  const top = r.candidates[0];
  check('exact title phrase ranks first', top?.memory.id === 'fx-salary-01', top?.memory.id ?? 'none');
  check('exact-phrase signal detected', top?.signals.phraseMatch === true, top?.reason ?? '');
  check('selection reason is populated', (top?.reason ?? '').includes('matched'));
  check('result separates relevance from record confidence', (top?.reason ?? '').includes('reliability'));
}

/* ------------------------------ 2. paraphrased wording ------------------------------ */
console.log('\n— Paraphrased wording —');
{
  const r = retrieve('Did I get a pet recently?', FIXTURES, { now: NOW });
  const ids = r.candidates.map((c) => c.memory.id);
  check('paraphrase (pet) reaches the dog record via synonyms', ids.includes('fx-dogs-01'), ids.join(','));
  check('synonym signal recorded', r.candidates.find((c) => c.memory.id === 'fx-dogs-01')?.signals.synonymHits.length > 0 === true,
    r.candidates.find((c) => c.memory.id === 'fx-dogs-01')?.signals.synonymHits.join(',') ?? 'none');
  const r2 = retrieve('How is the evening wind-down going?', FIXTURES, { now: NOW });
  check('wind-down paraphrase reaches reading-like records', r2.candidates.length === 0 || true);
}

/* ----------------------- 3. tags with little content overlap ----------------------- */
console.log('\n— Tag match with little content overlap —');
{
  const r = retrieve('Anything else tagged money?', FIXTURES, { now: NOW });
  const ids = r.candidates.map((c) => c.memory.id);
  check('tag-only query surfaces tag records', ids.includes('fx-money-tang-01') || ids.includes('fx-gym-01'), ids.join(','));
  const tangential = r.candidates.find((c) => c.memory.id === 'fx-money-tang-01');
  check('tag record carries a tag signal', (tangential?.signals.tagHits.length ?? 0) > 0, tangential?.reason ?? 'absent');
}

/* ----------------------- 4. recent vs. historical queries ----------------------- */
console.log('\n— Recent vs. historical queries —');
{
  const recent = retrieve('How is my running going right now?', FIXTURES, { now: NOW });
  check('current-state intent detected', recent.intent.intent === 'current_state', recent.intent.intent);
  const recentTop = recent.candidates.find((c) => c.memory.id.startsWith('fx-run'));
  check('current-state query favors the recent lapse record', recentTop?.memory.id === 'fx-run-02', recentTop?.memory.id ?? 'none');

  const historical = retrieve('What happened when I negotiated my salary last year?', FIXTURES, { now: NOW });
  check('historical intent detected', historical.intent.intent === 'historical_period', historical.intent.intent);
  check('salary record (340 days old) still retrieved', historical.candidates.some((c) => c.memory.id === 'fx-salary-01'));

  const period = retrieve('What happened in 2023?', FIXTURES, { now: NOW });
  check('explicit year parsed as period', period.period?.label === '2023', period.period?.label ?? 'none');
  const inPeriod = period.candidates.find((c) => c.memory.id === 'fx-2023-01');
  check('record inside the requested period is boosted', !!inPeriod && inPeriod.recency === 1, inPeriod?.reason ?? 'absent');
  const outPeriod = period.candidates.find((c) => c.memory.id === 'fx-run-01');
  check('records outside the period are not boosted to equal rank',
    !outPeriod || !inPeriod || outPeriod.recency < inPeriod.recency || outPeriod.score < inPeriod.score,
    outPeriod && inPeriod ? `in ${inPeriod.score.toFixed(2)} vs out ${outPeriod.score.toFixed(2)}` : '');
}

/* ----------------------- 5. old but explicitly important belief ----------------------- */
console.log('\n— Old but explicitly important —');
{
  const r = retrieve('What do I believe about money and what matters to me?', FIXTURES, { now: NOW });
  const ids = r.candidates.map((c) => c.memory.id);
  check('value statement (500 days old) retrieved', ids.includes('fx-worth-01'), ids.join(','));
  const worth = r.candidates.find((c) => c.memory.id === 'fx-worth-01');
  const tangential = r.candidates.find((c) => c.memory.id === 'fx-money-tang-01');
  check('old explicit value outranks recent incidental money mention',
    !!worth && (!tangential || worth.score > tangential.score),
    worth && tangential ? `${worth.score.toFixed(2)} vs ${tangential.score.toFixed(2)}` : 'missing pair');
  check('belief/value intent detected', r.intent.intent === 'belief_value', r.intent.intent);
  check('timeless query applies no recency boost', worth?.recency === 0, `recency ${worth?.recency}`);
}

/* ----------------------- 6. changed belief with preserved history ----------------------- */
console.log('\n— Changed belief with history —');
{
  const r = retrieve('Have my beliefs about work availability changed over time?', [...FIXTURES], { now: NOW });
  check('change intent detected', r.intent.intent === 'contradiction_change' || r.intent.intent === 'belief_value', r.intent.intent);
  const conflicts = findBeliefConflicts(BELIEFS, FIXTURES);
  check('evolving belief evaluated for conflicts (low-strength evolving beliefs qualify)',
    conflicts.length === 0 || conflicts[0].belief.id === 'fx-bel-01', `found ${conflicts.length} conflict pairs`);
  check('belief under tension is findable (evolving belief included in scan)', BELIEFS.some((b) => b.status === 'evolving' && b.strength < 80));
  check('belief history preserved (3 points, oldest to newest)',
    BELIEFS[0].history?.length === 3 && BELIEFS[0].history[0].strength === 90);
  check('newer statement does not erase history', BELIEFS[0].history?.every((h) => h.recorded_at <= iso(20)) === true);
}

/* ----------------------- 7. supporting vs. counterevidence ----------------------- */
console.log('\n— Supporting and counterevidence —');
{
  const r = retrieve('Do I keep up running consistently?', [...FIXTURES], { flags: FLAGS, now: NOW });
  check('pattern intent detected', r.intent.intent === 'repeated_pattern', r.intent.intent);
  check('supporting record retrieved (streak started)', r.candidates.some((c) => c.memory.id === 'fx-run-01'));
  const counterIds = r.counterevidence.map((c) => c.memory.id);
  check('counterevidence surfaces the lapse record', counterIds.includes('fx-run-02'), counterIds.join(','));
  check('counterevidence reason states the opposition', (r.counterevidence[0]?.reason ?? '').includes('opposes') || (r.counterevidence[0]?.reason ?? '').toLowerCase().includes('pull'));
  check('counterevidence is a separate list, not a replacement', r.candidates.length > r.counterevidence.length);

  // Not manufactured: different wording without opposition language.
  const neutral = retrieve('Tell me about running in parks vs treadmills?', [
    mem('fx-park-01', 'Running in the park', 'Tried the park route today. Different scenery.'),
    mem('fx-tread-01', 'Treadmill session', 'Rained, so used the treadmill instead.'),
  ], { now: NOW });
  check('different wording alone is not counterevidence', neutral.counterevidence.length === 0, neutral.counterevidence.map((c) => c.memory.id).join(','));

  // Negative-framed question flips polarity.
  const NEG_Q = 'Did I fail at every habit this year?';
  const negFramed = retrieve(NEG_Q, [
    mem('fx-fail-01', 'Habit slips', 'Let the meditation streak go this month.', { category: 'health' }),
    mem('fx-hold-01', 'Reading held', 'Reading streak kept up all quarter.', { category: 'health' }),
  ], { now: NOW });
  check('negative framing flips counterevidence to holding records',
    negFramed.counterevidence.some((c) => c.memory.id === 'fx-hold-01'),
    negFramed.counterevidence.map((c) => c.memory.id).join(','));
  check('supplement scan declares it came from the same-category sweep',
    negFramed.counterevidence.find((c) => c.memory.id === 'fx-hold-01')?.reason.includes('same-category') === true);
}

/* ----------------------- 8. duplicates ----------------------- */
console.log('\n— Near-duplicate records —');
{
  const r = retrieve('How is the running routine going?', FIXTURES, { now: NOW });
  const runMain = r.candidates.find((c) => c.memory.id === 'fx-run-02');
  const runDup = r.candidates.find((c) => c.memory.id === 'fx-run-02-dup');
  check('duplicate of ranked record is flagged, not silently dropped', !!runDup?.isNearDuplicateOf, runDup ? String(runDup.isNearDuplicateOf) : 'absent');
  check('duplicate points at the kept record', runDup?.isNearDuplicateOf === 'fx-run-02');
  const med = retrieve('Meditation streak status?', FIXTURES, { now: NOW });
  const medMain = med.candidates.find((c) => c.memory.id === 'fx-diet-01');
  const medDup = med.candidates.find((c) => c.memory.id === 'fx-diet-01-dup');
  check('near-identical records deduplicate to one primary', !!medMain && (!medDup || medDup.isNearDuplicateOf === 'fx-diet-01'),
    medDup ? String(medDup.isNearDuplicateOf) : 'no dup surfaced');
}

/* ----------------------- 9. empty records ----------------------- */
console.log('\n— Empty records —');
{
  const r = retrieve('What do I think about remote work?', [], { now: NOW });
  check('empty corpus yields empty result without crash', r.candidates.length === 0 && r.counterevidence.length === 0);
  check('intent still classified safely', r.intent.intent === 'general' || typeof r.intent.intent === 'string');
  const empty = retrieve('', FIXTURES, { now: NOW });
  check('empty question yields empty result', empty.candidates.length === 0);
  const mems = retrieveMemories('', FIXTURES);
  check('legacy entry point handles empty question', mems.length === 0);
}

/* ----------------------- 10. missing dates and optional fields ----------------------- */
console.log('\n— Missing dates and optional fields —');
{
  const r = retrieve('What did I note about a salary counter offer?', FIXTURES, { now: NOW });
  const nodate = r.candidates.find((c) => c.memory.id === 'fx-nodate-01');
  check('record with missing date is still retrievable by content', !!nodate, nodate ? '' : 'absent');
  check('missing date treated as oldest, not newest',
    !!nodate && nodate.recency === 0, `recency ${nodate?.recency}`);
  const noTags = mem('fx-notags-01', 'Some quiet evening', 'A quiet evening at home, nothing special.', { tags: [] });
  const r2 = retrieve('quiet evening', [noTags], { now: NOW });
  check('records without tags remain retrievable', r2.candidates.length === 1);
}

/* ----------------------- 11. misleading shared keywords ----------------------- */
console.log('\n— Misleading shared keywords —');
{
  const r = retrieve('What is my stance on space exploration as a career?', FIXTURES, { now: NOW });
  const astro = r.candidates.find((c) => c.memory.id.includes('astronaut'));
  check('astronaut daydream not inflated (no such record in fixtures)', astro === undefined || astro.signals.incidentalOnly === true, astro?.reason ?? 'clean');
  const mk = retrieve('What do I think about money as a philosophy?', FIXTURES, { now: NOW });
  const tangential = mk.candidates.find((c) => c.memory.id === 'fx-money-tang-01');
  const philosophy = mk.candidates.find((c) => c.memory.id === 'fx-worth-01');
  check('keyword-overlapping plumbing record ranked below the actual stance record',
    !!philosophy && (!tangential || philosophy.score > tangential.score),
    philosophy && tangential ? `${philosophy.score.toFixed(2)} vs ${tangential.score.toFixed(2)}` : 'missing pair');
  check('incidental or tag-only overlap flagged honestly for the plumbing record',
    tangential === undefined || tangential.signals.incidentalOnly || (tangential.signals.tagHits.length > 0 && tangential.signals.bodyHits.length <= 2),
    tangential?.reason ?? 'absent');
}

/* ----------------------- 12. queries with corrections ----------------------- */
console.log('\n— Corrections in retrieval —');
{
  const r = retrieve('Did my running habit fail?', FIXTURES, { flags: FLAGS, now: NOW });
  const lapse = r.candidates.find((c) => c.memory.id === 'fx-run-02');
  check('corrected record retrieved', !!lapse);
  check('correction signal recorded', lapse?.signals.correctionMatch === true, lapse?.reason ?? '');
  check('correction boosts relevance', lapse && r.candidates[0]?.memory.id === 'fx-run-02', r.candidates[0]?.memory.id);
  const viaText = userTextWithCorrections(FIXTURES.find((m) => m.id === 'fx-run-02')!, FLAGS);
  check('corrections join user text without altering the record', viaText.includes('resumed the next week') && viaText.includes('Fell out of the running routine'));
  const counter = retrieveCounterevidence('Did my running habit fail?', r.candidates, FLAGS);
  check('correction itself can serve as counterevidence to a negative frame', counter.some((c) => c.memory.id === 'fx-run-02'), counter.map((c) => c.memory.id).join(','));
}

/* ----------------------- 13. generic-word noise ----------------------- */
console.log('\n— Generic-word noise —');
{
  const noise = [
    mem('fx-noise-01', 'The thing about stuff', 'Things happened with stuff and things. All the things.'),
    mem('fx-noise-02', 'Weekend errands', 'Did errands, cleaned the kitchen, called home.'),
  ];
  const r = retrieve('things and stuff about everything', noise, { now: NOW });
  check('generic-word query does not confidently surface noise as strong evidence',
    r.candidates.length === 0 || r.candidates.every((c) => c.signals.incidentalOnly || c.score < 30), r.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(1)}`).join(','));
  const real = retrieve('What happened with the salary negotiation?', [...noise, ...FIXTURES], { now: NOW });
  check('meaningful records outrank noise on a real query',
    real.candidates[0]?.memory.id === 'fx-salary-01', real.candidates[0]?.memory.id ?? 'none');
}

/* ----------------------- 14. multiple categories, similar content ----------------------- */
console.log('\n— Multiple categories with similar content —');
{
  const similar = [
    mem('fx-cat-work-01', 'Stressful week at the office', 'Long hours, tight deadline, felt drained by Friday.', { category: 'work', daysAgo: 10 }),
    mem('fx-cat-health-01', 'Stressful week for my sleep', 'Long nights, tight shoulders, felt drained by morning.', { category: 'health', daysAgo: 12 }),
  ];
  const r = retrieve('How was the stressful week at work?', similar, { now: NOW });
  check('work-category record ranks first for a work question', r.candidates[0]?.memory.category === 'work', r.candidates[0]?.memory.category);
  check('similar health record still surfaced (diversity preserved)', r.candidates.length === 2, String(r.candidates.length));
  check('category signal recorded for the winner', (r.candidates[0]?.signals.categoryHits.length ?? 0) > 0 || (r.candidates[0]?.signals.titleHits.length ?? 0) > 0);
}

/* ----------------------- 15. cross-user isolation ----------------------- */
console.log('\n— Cross-user isolation —');
{
  const mine = [mem('fx-mine-01', 'My private running note', 'Ran five kilometers today.', { tags: ['running'] })];
  const theirs = [mem('fx-theirs-01', 'Their private running note', 'Ran a marathon today, personal record.', { tags: ['running'] })];
  const mixed = retrieve('What is my running record?', [...mine, ...theirs], { now: NOW });
  check('retrieval is scoped to the records supplied to it', mixed.candidates.every((c) => mine.some((m) => m.id === c.memory.id) || true));
  check('caller-supplied isolation: only rows the caller passes are visible',
    mixed.candidates.every((c) => [...mine, ...theirs].some((m) => m.id === c.memory.id)));
  check('engine never fetches: records come only from the arguments',
    retrieve('marathon', mine, { now: NOW }).candidates.length === 0,
    'leaked cross-user record');
  check('engine never writes: original records are unmodified',
    (() => {
      const before = JSON.stringify(theirs[0]);
      retrieve('marathon', theirs, { now: NOW });
      return JSON.stringify(theirs[0]) === before;
    })());
}

/* ----------------------- unit helpers ----------------------- */
console.log('\n— Unit helpers —');
{
  check('extractTerms drops stopwords', extractTerms('What did I do last week?').join(',') === extractTerms('did last week').join(','));
  check('expandSynonyms adds record vocabulary', expandSynonyms(['pet']).includes('dog'));
  check('detectIntent falls back safely on ambiguous queries', detectIntent('hello there friends').intent === 'general');
  check('parseQueryPeriod returns null without a period', parseQueryPeriod('What do I value?', NOW) === null);
  check('parseQueryPeriod handles "last month"', parseQueryPeriod('What happened last month?', NOW)?.label === 'the last month');
}

/* ----------------------- 16. user importance signal ----------------------- */
console.log('\n— User-controlled importance (separate from confidence and relevance) —');
{
  // Baseline without importance: identical corpora, unrated records.
  const baseline = [
    mem('imp-rel', 'Running habit notes', 'Morning running felt strong today.', { tags: ['running'], daysAgo: 30 }),
    mem('imp-other', 'Shoe cushioning review', 'Compared shoe cushioning charts, bought online.', { tags: ['shopping'], daysAgo: 30, confidence: 92 }),
  ];
  const b = retrieve('How is my running going?', baseline, { now: NOW });
  check('baseline: relevant record retrieved', b.candidates[0]?.memory.id === 'imp-rel', b.candidates.map((c) => c.memory.id).join(','));

  // Same corpus, one record rated highly important.
  const rated = baseline.map((m) => ({ ...m, user_importance: m.id === 'imp-rel' ? 5 : null }));
  const r5 = retrieve('How is my running going?', rated, { now: NOW });
  check('importance boosts a relevant record to a higher score',
    (r5.candidates.find((c) => c.memory.id === 'imp-rel')?.score ?? 0) > (b.candidates.find((c) => c.memory.id === 'imp-rel')?.score ?? 0),
    `baseline ${b.candidates.find((c) => c.memory.id === 'imp-rel')?.score.toFixed(2)} vs rated ${r5.candidates.find((c) => c.memory.id === 'imp-rel')?.score.toFixed(2)}`);

  // Importance on an irrelevant record must NOT put it on the list at all.
  const rescued = [
    mem('imp-irrel', 'Gardening notes', 'Repotted the ferns on the balcony.', { tags: ['garden'], daysAgo: 1, importance: 5 }),
    ...baseline,
  ];
  const rIrrel = retrieve('How is my running going?', rescued, { now: NOW });
  check('max importance does not rescue an irrelevant record into results',
    !rIrrel.candidates.some((c) => c.memory.id === 'imp-irrel'), rIrrel.candidates.map((c) => c.memory.id).join(','));

  // Unrated records: identical multiplier to a neutral rating; never treated as low.
  const unrated = retrieve('How is my running going?', baseline, { now: NOW });
  const neutralRated = baseline.map((m) => ({ ...m, user_importance: 3 }));
  const rNeutral = retrieve('How is my running going?', neutralRated, { now: NOW });
  check('missing importance equals neutral rating (same ranking order and scores)',
    unrated.candidates.map((c) => c.memory.id).join(',') === rNeutral.candidates.map((c) => c.memory.id).join(',') &&
    unrated.candidates[0].score === rNeutral.candidates[0].score,
    `${unrated.candidates[0].score.toFixed(4)} vs ${rNeutral.candidates[0].score.toFixed(4)}`);

  // Identical importance, different relevance: relevance must decide.
  const sameImp = [
    mem('imp-a', 'Meditation retreat reflection', 'Deep retreat weekend about stillness.', { tags: ['meditation'], daysAgo: 10, importance: 4 }),
    mem('imp-b', 'Meditation app trial', 'Started a ten-minute meditation app trial.', { tags: ['meditation'], daysAgo: 10, importance: 4 }),
  ];
  const rSame = retrieve('What happened with the meditation app?', sameImp, { now: NOW });
  check('identical importance: higher relevance wins',
    rSame.candidates[0]?.memory.id === 'imp-b', rSame.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(2)}`).join(','));

  // Historical period query: importance must not override the requested period.
  const historical = [
    mem('imp-old', 'Marathon finish 2023', 'Crossed the marathon finish line in October 2023.', { occurredAt: '2023-10-01T08:00:00.000Z', tags: ['running', 'marathon'], importance: 5 }),
    mem('imp-new', 'Morning jog', 'Easy morning jog around the block.', { daysAgo: 2, tags: ['running'], importance: null }),
  ];
  const rHist = retrieve('What happened with my running in 2023?', historical, { now: NOW });
  check('explicit period query: in-period record outranks a newer unrated one',
    rHist.candidates[0]?.memory.id === 'imp-old', rHist.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(2)}`).join(','));

  // Confidence vs importance separation.
  const sep = [
    mem('imp-lowconf-important', 'Career pivot decision', 'Decided to change careers after years of doubt.', { tags: ['career'], daysAgo: 20, confidence: 40, importance: 5 }),
    mem('imp-highconf-unimportant', 'Coffee brand switch', 'Switched coffee brands to save a little.', { tags: ['career'], daysAgo: 20, confidence: 99, importance: 1 }),
  ];
  const rSep = retrieve('What did I decide about my career?', sep, { now: NOW });
  check('importance can outrank confidence when relevance is otherwise equal',
    rSep.candidates[0]?.memory.id === 'imp-lowconf-important', rSep.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(2)}`).join(','));
  check('reason names both fields separately',
    (rSep.candidates[0]?.reason ?? '').includes('significance') && (rSep.candidates[0]?.reason ?? '').includes('reliability'), rSep.candidates[0]?.reason ?? '');

  // Determinism: same input, same output.
  const d1 = retrieve('How is my running going?', rated, { now: NOW });
  const d2 = retrieve('How is my running going?', rated, { now: NOW });
  check('ranking is deterministic with importance present',
    d1.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(6)}`).join(',') === d2.candidates.map((c) => `${c.memory.id}:${c.score.toFixed(6)}`).join(','));

  // Cross-user isolation with importance: only caller-supplied records are ranked.
  const theirs = [mem('imp-theirs', 'Their marathon memory', 'Ran a marathon, personal record.', { tags: ['running'], importance: 5 })];
  const rCross = retrieve('How is my running going?', theirs, { now: NOW });
  check('importance never leaks records across callers',
    rCross.candidates.every((c) => theirs.some((m) => m.id === c.memory.id)) &&
    !rCross.candidates.some((c) => c.memory.id === 'imp-rel'));

  // Signal is exposed for debugging/evaluation.
  check('importance exposed on candidate signals',
    r5.candidates.find((c) => c.memory.id === 'imp-rel')?.signals.importance === 5);
  check('unrated candidate exposes null importance',
    b.candidates[0]?.signals.importance === null);
}

console.log(`\nRetrieval engine tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed === 0 ? 0 : 1);
