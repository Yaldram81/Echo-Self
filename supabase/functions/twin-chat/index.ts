import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Deployed with verify_jwt = true: Supabase's gateway rejects requests without
// a valid project JWT before this function runs, so the Anthropic key cannot be
// spent by anonymous callers. The client sends the user's session token.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type MemoryRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  mood: string;
  confidence: number;
  tags: string[];
  ai_interpretation: string | null;
  occurred_at: string;
};

type BeliefRow = {
  id: string;
  statement: string;
  kind: string;
  category: string;
  strength: number;
  status: string;
  formed_at: string;
  last_reflected_at: string;
};

type FlagRow = {
  memory_id: string;
  correction_note: string;
  created_at: string;
};

type TwinSource = { memoryId: string; title: string };

type TwinClaim = {
  claim: string;
  type: string;
  evidence: { memoryId: string; excerpt?: string; relation?: string }[];
};

type TwinResponse = {
  answer: string;
  sources: TwinSource[];
  inferences: string[];
  gaps: string[];
  followUps: string[];
  claims?: TwinClaim[];
  mode: 'live';
};

const GENERIC_ERROR = 'The twin service is temporarily unavailable. Please try again shortly.';

const SYSTEM_PROMPT = `You are EchoSelf's Twin: an evidence-grounded reflection companion. You help a person understand their own thinking using ONLY the memory records supplied in this conversation.

Rules:
- Ground every claim in the provided memories. Cite memories by their exact id in square brackets, e.g. [id], immediately after the claim they support.
- Only cite memory ids that appear in the provided context. Never invent ids, quotes, or dates.
- Prefer fewer, well-supported claims over many speculative ones. If the records cannot answer the question, say so plainly instead of stretching thin evidence.
- Clearly separate four kinds of claims, tagged in "claims":
  1. directly_supported: stated or clearly evidenced by the USER TEXT of a cited memory.
  2. interpretation: your reading of the evidence; label it "Interpretation:".
  3. conflicting_evidence: two supplied memories pull in opposite directions — state both sides with their dates, do not pick a winner.
  4. unknown: the records do not cover it — say plainly what is missing. NEVER invent a personal fact to complete the answer.
- Each claim carries "evidence": the memory ids whose USER TEXT (not the TWIN INTERPRETATION field) supports it, plus a short verbatim excerpt from that text and a one-sentence "relation" explaining how that record relates to the claim. An empty evidence list is required for interpretation and unknown claims.
- Evidence status: set "evidenceStatus" per claim — "direct" (the record text states it), "partial" (the record only partly covers it), "conflicting" (records disagree), "insufficient" (no record establishes it). Do not upgrade partial or conflicting evidence to direct.
- Never present a correlation or repeated event as a cause, and never turn a single example into a stable personality trait. Phrase those as interpretations instead.
- Do not omit relevant counterevidence: when a supplied record cuts against the claim, say so or tag the claim conflicting_evidence.
- An interpretation is never presented as a direct user statement.
- Do not cite the TWIN INTERPRETATION field as evidence for a directly_supported claim — it is AI-generated, not user-authored.
- USER CORRECTIONS are the user's own later statements about a record. Treat them as authoritative USER TEXT; when a correction conflicts with the record's original text, present BOTH side by side with their dates and do not pick a winner.
- Quotes and dates: only quote text that appears verbatim in the records, and only state dates that a record itself carries. If the records support the claim without an exact quote, paraphrase instead of quoting. Never reconstruct a date from context.
- Do not infer sensitive personal attributes (health conditions, finances, relationships status) beyond what the records explicitly say.
- Do not roleplay a therapist, fortune teller, or fictional persona.

Respond in exactly this JSON shape (no markdown fence, no extra keys):
{
  "answer": "3-6 sentences. Concise. Use [id] citations inline where claims are supported.",
  "claims": [
    { "claim": "...", "type": "directly_supported|interpretation|conflicting_evidence|unknown", "evidenceStatus": "direct|partial|conflicting|insufficient", "evidence": [{ "memoryId": "<id>", "excerpt": "verbatim user text", "relation": "how this record relates to the claim" }] }
  ],
  "sources": ["<memory id>", "<memory id>"],
  "inferences": ["Interpretation: ...", "..."],
  "gaps": ["What the records do not cover or leave ambiguous", "..."],
  "followUps": ["A question the user might ask next", "..."]
}
- "sources" must contain ONLY memory ids you actually cited or relied on, from the provided context.
- "claims" must decompose the answer into its substantive statements, one object each. Every directly_supported or conflicting_evidence claim must list the memory ids it rests on. Every claim requires "evidenceStatus".
- "inferences" must be empty if you made none.
- All six keys are required; use empty arrays when a list is empty.`;

function keywordScore(memory: MemoryRow, terms: string[]): number {
  const title = memory.title.toLowerCase();
  const body = memory.content.toLowerCase();
  const tagText = (memory.tags ?? []).join(' ').toLowerCase();
  const cat = memory.category.toLowerCase();

  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += 4;
    if (tagText.includes(t)) score += 3;
    if (body.includes(t)) score += 2;
    if (cat.includes(t)) score += 1;
  }
  return score;
}

function rankMemories(memories: MemoryRow[], question: string, limit = 8): MemoryRow[] {
  const stop = new Set([
    'what', 'have', 'with', 'this', 'that', 'your', 'from', 'about', 'into', 'over',
    'does', 'were', 'them', 'then', 'than', 'when', 'which', 'there', 'their',
    'would', 'could', 'should', 'where', 'seem', 'seems', 'think', 'thinking',
  ]);
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3 && !stop.has(t));

  const now = Date.now();
  return memories
    .map((m) => {
      const relevance = keywordScore(m, terms);
      if (relevance === 0) return { m, total: 0 };
      const ageDays = (now - new Date(m.occurred_at).getTime()) / 86_400_000;
      const recency = Math.max(0, 1 - ageDays / 365);
      const trust = m.confidence / 100;
      return { m, total: relevance * (1 + recency * 0.4) * (0.7 + trust * 0.3) };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((s) => s.m);
}

function buildContextBlock(
  memories: MemoryRow[],
  beliefs: BeliefRow[],
  corrections: FlagRow[]
): string {
  const corrByMemory = new Map<string, string[]>();
  for (const f of corrections) {
    const list = corrByMemory.get(f.memory_id) ?? [];
    list.push(f.correction_note);
    corrByMemory.set(f.memory_id, list);
  }
  const memoryLines = memories.map((m) => {
    const corr = corrByMemory.get(m.id);
    return [
      `[${m.id}] "${m.title}" — recorded ${m.occurred_at.slice(0, 10)}, category: ${m.category}, source: ${m.source}, mood: ${m.mood}, confidence: ${m.confidence}/100, tags: ${(m.tags ?? []).join(', ') || 'none'}.`,
      `TEXT (written by the user): ${m.content}`,
      corr && corr.length > 0 ? `USER CORRECTION (later statement by the user, authoritative; show alongside the original text): ${corr.join(' | ')}` : null,
      `TWIN INTERPRETATION (AI-generated, not user-authored): ${m.ai_interpretation ?? 'none'}`,
    ].filter(Boolean).join('\n');
  });
  const beliefLines = beliefs.map(
    (b) =>
      `belief/${b.id} "${b.statement}" — kind: ${b.kind}, category: ${b.category}, strength: ${b.strength}/100, status: ${b.status}, formed ${b.formed_at.slice(0, 10)}`
  );

  return [
    '=== MEMORY RECORDS (the only citable evidence; cite by exact id) ===',
    memoryLines.join('\n\n') || '(no matching memories)',
    '',
    '=== BELIEFS / VALUES (context only; do not cite these ids) ===',
    beliefLines.join('\n') || '(none recorded)',
  ].join('\n');
}

function providerRequest(prompt: string, question: string, apiKey: string): Promise<Response> {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      system: prompt,
      messages: [{ role: 'user', content: question }],
    }),
  });
}

function parseProviderContent(data: { content?: { type: string; text?: string }[] }): string {
  if (!Array.isArray(data.content)) return '';
  return data.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceResponse(raw: Record<string, unknown> | null, memories: MemoryRow[]): TwinResponse {
  const validIds = new Set(memories.map((m) => m.id));
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const answer = typeof raw?.answer === 'string' ? raw.answer : '';

  // Only keep citations that resolve to memories actually supplied in context.
  const citedIds = (typeof raw?.sources === 'string' ? [raw.sources] : asStringArray(raw?.sources))
    .map((s) => s.trim())
    .filter((s) => validIds.has(s));

  // Also honor inline [id] citations in the answer text itself.
  for (const match of answer.matchAll(/\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)) {
    const id = match[1];
    if (validIds.has(id) && !citedIds.includes(id)) citedIds.push(id);
  }

  const idToTitle = new Map(memories.map((m) => [m.id, m.title]));

  // Coerce claims: keep only valid ids and excerpt-bearing evidence. Unsupported
  // claims are downgraded to interpretation here so the client audit can re-check.
  // The model's own evidenceStatus is advisory: anything missing or invalid
  // becomes "insufficient", and a "direct" label never survives without evidence.
  const VALID_TYPES = new Set(['directly_supported', 'interpretation', 'conflicting_evidence', 'unknown']);
  const VALID_STATUSES = new Set(['direct', 'partial', 'conflicting', 'insufficient']);
  const rawClaims = Array.isArray(raw?.claims) ? raw.claims : [];
  const claims: TwinClaim[] = [];
  for (const rc of rawClaims) {
    if (!rc || typeof rc.claim !== 'string' || !rc.claim.trim()) continue;
    const type = VALID_TYPES.has(rc.type) ? rc.type : 'interpretation';
    let evidenceStatus = VALID_STATUSES.has(rc.evidenceStatus) ? rc.evidenceStatus : 'insufficient';
    const evidence: { memoryId: string; excerpt?: string; relation?: string }[] = [];
    if (Array.isArray(rc.evidence)) {
      for (const ev of rc.evidence) {
        if (!ev || typeof ev.memoryId !== 'string') continue;
        const id = ev.memoryId.trim();
        if (!validIds.has(id)) continue;
        if (type === 'directly_supported' && typeof ev.excerpt !== 'string') continue;
        evidence.push({
          memoryId: id,
          excerpt: typeof ev.excerpt === 'string' ? ev.excerpt : undefined,
          relation: typeof ev.relation === 'string' && ev.relation.trim() ? ev.relation.trim().slice(0, 200) : undefined,
        });
      }
    }
    if (type === 'directly_supported' && evidence.length === 0) {
      claims.push({ claim: rc.claim.trim(), type: 'interpretation', evidence, evidenceStatus: 'insufficient' });
      continue;
    }
    // "direct" support is claimed by the model — hold it to the strictest label
    // it can defend; the client-side audit makes the final call.
    if (type === 'directly_supported' && evidenceStatus === 'direct' && evidence.length < 2) {
      const mem = memories.find((m) => m.id === evidence[0]?.memoryId);
      const terms = rc.claim.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const overlap = terms.filter((t) => mem && `${m.title} ${m.content}`.toLowerCase().includes(t)).length;
      if (overlap < 2) evidenceStatus = 'partial';
    }
    if (type === 'unknown') evidenceStatus = 'insufficient';
    claims.push({ claim: rc.claim.trim(), type, evidence, evidenceStatus });
  }

  return {
    answer,
    sources: citedIds.map((id) => ({ memoryId: id, title: idToTitle.get(id) ?? 'Memory' })),
    inferences: asStringArray(raw?.inferences),
    gaps: asStringArray(raw?.gaps),
    followUps: asStringArray(raw?.followUps),
    claims,
    mode: 'live',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI_NOT_CONFIGURED' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: { question?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question || question.length > 2000) {
      return new Response(JSON.stringify({ error: 'A question of 1-2000 characters is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Query the database AS THE CALLER by forwarding their JWT, so RLS scopes
    // every read to the public sample rows plus that user's own records. The
    // service-role key is never used for data reads.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: memoriesData, error: memErr } = await supabase
      .from('memories')
      .select('id,title,content,category,source,mood,confidence,tags,ai_interpretation,occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(500);
    if (memErr) throw memErr;

    const { data: beliefsData, error: belErr } = await supabase
      .from('beliefs')
      .select('id,statement,kind,category,strength,status,formed_at,last_reflected_at')
      .limit(100);
    if (belErr) throw belErr;

    // The caller's saved corrections: RLS scopes these to the authenticated
    // user, so signed-out callers see none and users see only their own.
    const { data: flagsData, error: flagErr } = await supabase
      .from('interpretation_flags')
      .select('memory_id,correction_note,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (flagErr) throw flagErr;

    const memories = (memoriesData ?? []) as MemoryRow[];
    const beliefs = (beliefsData ?? []) as BeliefRow[];
    const corrections = (flagsData ?? []) as FlagRow[];

    const selected = rankMemories(memories, question);
    const contextBlock = buildContextBlock(selected, beliefs, corrections);

    const providerRes = await providerRequest(SYSTEM_PROMPT, `${contextBlock}\n\n=== QUESTION ===\n${question}`, apiKey);
    if (!providerRes.ok) {
      console.error('provider error status', providerRes.status);
      return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providerData = await providerRes.json();
    const text = parseProviderContent(providerData);
    const parsed = extractJson(text);

    const response = coerceResponse(parsed, selected);

    if (!response.answer.trim()) {
      return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('twin-chat failure', err);
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
