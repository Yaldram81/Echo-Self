import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Embedding service for hybrid semantic retrieval (Upgrade 1).
//
// Deployed with verify_jwt = true: only verified signed-in callers may embed
// their records or obtain a query embedding. The embedding provider key lives
// only in edge-function env vars and never reaches the browser.
//
// Routes (POST):
//   { op: "query", question }        → { embedding, model, dim }
//   { op: "index", memories: [{ id, title, content, tags, category, occurred_at }] }
//                                    → { indexed, failed, skipped }
//   { op: "backfill", memories }     → same as index (alias, explicit intent)
//   { op: "status" }                 → { configured, model, dim }
//
// Privacy boundary: the ONLY text sent to the embedding provider is the
// memory's own user-authored text (title + content + tags + category). It is
// never combined with other users' data, and no demo (sample) memory is ever
// embedded — demo retrieval stays keyword-only by design.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MODEL = 'text-embedding-004';
const DIM = 768; // text-embedding-004 produces 768-dim vectors
const MAX_BATCH = 100;
const MAX_MEMO_CHARS = 8000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The exact text that is embedded for a memory. Documented privacy boundary. */
export function embeddedText(m: { title: string; content: string; tags: string[]; category: string }): string {
  return [
    `Title: ${m.title}`,
    `Category: ${m.category}`,
    `Tags: ${m.tags.join(', ')}`,
    `Content: ${m.content}`,
  ].join('\n');
}

async function callEmbeddingApi(texts: string[], apiKey: string): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text: t }] },
          })),
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`embedding provider error ${res.status}`);
    }
    const data = (await res.json()) as { embeddings?: { values: number[] }[] };
    const out = data.embeddings?.map((e) => e.values);
    if (!Array.isArray(out) || out.length !== texts.length) {
      throw new Error('embedding provider returned unexpected shape');
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return json({ error: 'EMBEDDINGS_NOT_CONFIGURED' }, 503);
    }

    // Identity: verified JWT subject only.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let userId: string | null = null;
    try {
      const [, payloadB64] = token.split('.');
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
        if (typeof payload.sub === 'string' && UUID_RE.test(payload.sub)) userId = payload.sub;
      }
    } catch {
      userId = null;
    }
    if (!userId) {
      return json({ error: 'A verified session is required.' }, 401);
    }

    const body = await req.json().catch(() => null) as {
      op?: string;
      question?: string;
      memories?: { id: string; title: string; content: string; tags?: string[]; category?: string; _text?: string; _hash?: string }[];
    } | null;
    if (!body || typeof body.op !== 'string') {
      return json({ error: 'Invalid request body.' }, 400);
    }

    if (body.op === 'status') {
      return json({ configured: true, model: MODEL, dim: DIM });
    }

    if (body.op === 'query') {
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      if (!question || question.length > 2000) {
        return json({ error: 'A question of 1-2000 characters is required.' }, 400);
      }
      const [vec] = await callEmbeddingApi([question], apiKey);
      if (!Array.isArray(vec) || vec.length !== DIM) {
        return json({ error: 'EMBEDDING_DIMENSION_MISMATCH' }, 502);
      }
      return json({ embedding: vec, model: MODEL, dim: DIM });
    }

    if (body.op === 'index' || body.op === 'backfill') {
      const memories = Array.isArray(body.memories) ? body.memories : [];
      if (memories.length === 0) return json({ indexed: 0, failed: [], skipped: 0 });
      if (memories.length > MAX_BATCH) {
        return json({ error: `Batch size capped at ${MAX_BATCH}.` }, 400);
      }
      for (const m of memories) {
        if (!m || typeof m.id !== 'string' || !UUID_RE.test(m.id) ||
            typeof m.title !== 'string' || typeof m.content !== 'string') {
          return json({ error: 'Each memory needs id (uuid), title, and content.' }, 400);
        }
      }

      // Idempotency: fetch existing rows for these ids; re-embed only rows
      // whose content hash differs from what is stored.
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const ids = memories.map((m) => m.id);
      const { data: existing, error: exErr } = await supabase
        .from('memory_embeddings')
        .select('memory_id, content_hash, model')
        .in('memory_id', ids);
      if (exErr) throw exErr;
      const existingByMemo = new Map<string, { content_hash: string; model: string }>();
      for (const row of (existing ?? []) as { memory_id: string; content_hash: string; model: string }[]) {
        existingByMemo.set(row.memory_id, { content_hash: row.content_hash, model: row.model });
      }

      const toEmbed: { id: string; title: string; content: string; tags?: string[]; category?: string; _text?: string; _hash?: string }[] = [];
      let skipped = 0;
      for (const m of memories) {
        const text = embeddedText({
          title: m.title,
          content: m.content,
          tags: m.tags ?? [],
          category: m.category ?? 'other',
        });
        const hash = await hashText(text.slice(0, MAX_MEMO_CHARS));
        const cur = existingByMemo.get(m.id);
        if (cur && cur.model === MODEL && cur.content_hash === hash) {
          skipped += 1;
          continue;
        }
        (m as { _text?: string; _hash?: string })._text = text.slice(0, MAX_MEMO_CHARS);
        (m as { _hash?: string })._hash = hash;
        toEmbed.push(m as { id: string; title: string; content: string; tags?: string[]; category?: string; _text?: string; _hash?: string });
      }
      if (toEmbed.length === 0) {
        return json({ indexed: 0, failed: [], skipped });
      }

      // Embed then upsert. RLS on memory_embeddings scopes writes to the
      // caller's own rows; the memory_id primary key makes upserts idempotent.
      const texts = toEmbed.map((m) => m._text!);
      const vectors = await callEmbeddingApi(texts, apiKey);
      const rows = toEmbed.map((m, i) => ({
        memory_id: m.id,
        user_id: userId,
        embedding: vectors[i],
        model: MODEL,
        content_hash: m._hash!,
      }));
      const { error: upErr } = await supabase
        .from('memory_embeddings')
        .upsert(rows, { onConflict: 'memory_id' });
      if (upErr) throw upErr;
      return json({ indexed: rows.length, failed: [], skipped });
    }

    return json({ error: 'Unknown op.' }, 400);
  } catch (err) {
    console.error('memory-embed failure', err);
    return json({ error: 'Embedding service temporarily unavailable.' }, 500);
  }
});
