import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Shared Gemini provider client for EchoSelf edge functions.
 *
 * One typed, bounded provider call path so twin-chat and any future
 * model-assisted pipeline (relate-check, claim verification) reuse the same
 * client instead of duplicating one. Callers supply their own prompt, limits,
 * and quota key; this module owns transport, timeout, retries, JSON parsing,
 * and usage shape.
 *
 * Not a shared code import between functions (not supported): each function
 * directory carries its own copy of this file, kept byte-identical.
 */

export const GENERIC_PROVIDER_ERROR =
  'The AI service is temporarily unavailable. Please try again shortly.';

export interface ProviderUsage {
  input?: number;
  output?: number;
}

export interface ProviderLimits {
  maxOutputTokens: number;
  providerTimeoutMs: number;
  providerRetries: number;
}

export type ProviderResult =
  | { ok: true; text: string; usage: ProviderUsage }
  | { ok: false; kind: 'timeout' | 'error' };

interface CallOptions {
  /** System prompt: instructions that user data can never override. */
  system: string;
  /** User turn: the record data + question. Treated as untrusted data. */
  user: string;
  limits: ProviderLimits;
  apiKey: string;
}

const MODEL = 'gemini-2.5-flash';
export const PROVIDER_NAME = `google/${MODEL}`;

export async function callProvider(opts: CallOptions): Promise<ProviderResult> {
  let lastKind: 'timeout' | 'error' = 'error';
  for (let attempt = 0; attempt <= opts.limits.providerRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.limits.providerTimeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: 'user', parts: [{ text: opts.user }] }],
            generationConfig: {
              maxOutputTokens: opts.limits.maxOutputTokens,
              temperature: 0.2,
              // The prompts require a bare JSON object; JSON mode keeps the
              // model from wrapping it in prose or markdown fences.
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (!res.ok) {
        lastKind = 'error';
        if (res.status === 429 || res.status >= 500) continue;
        return { ok: false, kind: 'error' };
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const parts = data.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.filter((p) => typeof p.text === 'string').map((p) => p.text as string).join('')
        : '';
      return {
        ok: true,
        text,
        usage: {
          input: typeof data.usageMetadata?.promptTokenCount === 'number' ? data.usageMetadata.promptTokenCount : undefined,
          output: typeof data.usageMetadata?.candidatesTokenCount === 'number' ? data.usageMetadata.candidatesTokenCount : undefined,
        },
      };
    } catch (err) {
      lastKind = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'error';
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, kind: lastKind };
}

/** Extracts the first balanced JSON object from provider text. */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * JWT subject extraction shared by every function: identity comes from the
 * verified gateway JWT (verify_jwt = true), never from the request body.
 */
export function userIdFromAuth(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return typeof payload.sub === 'string' && UUID_RE.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

export function providerJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

export function providerCorsPreflight(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    },
  });
}

/** Privileged client for quota enforcement and usage-log writes only. */
let quotaClient: ReturnType<typeof createClient> | null = null;
export function getQuotaClient() {
  if (!quotaClient) {
    quotaClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  }
  return quotaClient;
}

/** Caller-JWT client for all personal-data reads — RLS-scoped like the browser. */
export function callerClient(authHeader: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
}

export interface QuotaCheck {
  allowed: boolean;
  retryAfter?: number;
  daily?: boolean;
  storeUnavailable?: boolean;
}

export async function checkQuota(
  quotaKey: string,
  limits: { perMinute: number; daily: number }
): Promise<QuotaCheck> {
  try {
    const { data, error } = await getQuotaClient().rpc('enforce_ai_quota', {
      p_quota_key: quotaKey,
      p_per_minute_limit: limits.perMinute,
      p_daily_limit: limits.daily,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('malformed quota response');
    if (row.allowed) return { allowed: true };
    return {
      allowed: false,
      retryAfter: Math.max(1, Number(row.retry_after) || 60),
      daily: Number(row.retry_after) >= 3600,
    };
  } catch (err) {
    console.error('quota store unavailable', err);
    return { allowed: false, storeUnavailable: true };
  }
}

export async function logUsage(
  quotaKey: string,
  outcome: string,
  usage?: ProviderUsage
): Promise<void> {
  try {
    await getQuotaClient().from('ai_usage_log').insert({
      quota_key: quotaKey,
      outcome,
      provider: PROVIDER_NAME,
      input_tokens: usage?.input ?? null,
      output_tokens: usage?.output ?? null,
    });
  } catch (err) {
    console.error('usage log write failed', err);
  }
}
