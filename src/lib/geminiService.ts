/**
 * Service to call Google Gemini API for AI-assisted deliberation structuring.
 * Supports multiple API keys with automatic failover rotation on quota exhaustion (HTTP 429 / resource exhausted).
 */

export interface GeminiDecisionDraft {
  title: string;
  context: string;
  category?: string;
  timeline?: string;
  options: {
    label: string;
    pros: string[];
    cons: string[];
  }[];
  values: string[];
  constraints: string;
  uncertainties: string;
  success_definition: string;
}

const STORAGE_KEYS_LIST = 'echoself_gemini_api_keys';
const LEGACY_STORAGE_KEY = 'echoself_gemini_api_key';
const ACTIVE_INDEX_KEY = 'echoself_gemini_active_key_index';

function isQuotaOrExhaustionError(status: number, message: string): boolean {
  if (status === 429) return true;
  const lower = message.toLowerCase();
  return (
    status === 403 ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('exhausted') ||
    lower.includes('too many requests')
  );
}

export const geminiService = {
  /**
   * Retrieves all unique, non-empty Gemini API keys configured.
   */
  getApiKeys(): string[] {
    const list: string[] = [];

    // Environment variable key
    let fromEnv: string | undefined;
    try {
      fromEnv = typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_API_KEY
        ? (import.meta.env.VITE_GEMINI_API_KEY as string).trim()
        : (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY?.trim() : undefined);
    } catch {
      fromEnv = typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY?.trim() : undefined;
    }
    if (fromEnv) list.push(fromEnv);

    // Multi-key local storage list
    try {
      const raw = localStorage.getItem(STORAGE_KEYS_LIST);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const k of parsed) {
            if (typeof k === 'string' && k.trim() && !list.includes(k.trim())) {
              list.push(k.trim());
            }
          }
        }
      }
      // Single key backwards-compatibility
      const single = (localStorage.getItem(LEGACY_STORAGE_KEY) ?? '').trim();
      if (single && !list.includes(single)) {
        list.push(single);
      }
    } catch {
      // Ignore localStorage errors
    }

    return list;
  },

  /**
   * Overwrite the entire pool of keys.
   */
  setApiKeys(keys: string[]): void {
    const cleaned = Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean)));
    try {
      localStorage.setItem(STORAGE_KEYS_LIST, JSON.stringify(cleaned));
      if (cleaned.length > 0) {
        localStorage.setItem(LEGACY_STORAGE_KEY, cleaned[0]);
      } else {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }
  },

  /**
   * Add a single new key to the pool.
   * Returns true if added, false if already exists or invalid.
   */
  addApiKey(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed) return false;
    const current = this.getApiKeys();
    if (current.includes(trimmed)) return false;
    current.push(trimmed);
    this.setApiKeys(current);
    return true;
  },

  /**
   * Remove a key by index or value.
   */
  removeApiKey(target: number | string): void {
    let current = this.getApiKeys();
    if (typeof target === 'number') {
      current = current.filter((_, idx) => idx !== target);
    } else {
      current = current.filter((k) => k !== target.trim());
    }
    this.setApiKeys(current);

    // Ensure active index remains in valid range
    const activeIdx = this.getActiveKeyIndex();
    if (activeIdx >= current.length) {
      this.setActiveKeyIndex(Math.max(0, current.length - 1));
    }
  },

  /**
   * Index of the currently active primary key.
   */
  getActiveKeyIndex(): number {
    try {
      const raw = localStorage.getItem(ACTIVE_INDEX_KEY);
      const idx = raw ? parseInt(raw, 10) : 0;
      return Number.isNaN(idx) ? 0 : idx;
    } catch {
      return 0;
    }
  },

  /**
   * Set which key in the pool is primary.
   */
  setActiveKeyIndex(index: number): void {
    try {
      localStorage.setItem(ACTIVE_INDEX_KEY, String(Math.max(0, index)));
    } catch {
      // Ignore localStorage errors
    }
  },

  /**
   * Convenience getter for primary key.
   */
  getApiKey(): string {
    const keys = this.getApiKeys();
    if (keys.length === 0) return '';
    const idx = this.getActiveKeyIndex() % keys.length;
    return keys[idx] ?? keys[0] ?? '';
  },

  /**
   * Convenience setter for backward compatibility.
   */
  setApiKey(key: string): void {
    const trimmed = key.trim();
    if (trimmed) {
      this.addApiKey(trimmed);
    } else {
      this.setApiKeys([]);
    }
  },

  /** Check if user-level AI personalization is active */
  isPersonalizationEnabled(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('echoself:ai_personalization_enabled');
        if (raw !== null) return raw === 'true';
      }
    } catch {}
    return true;
  },

  /** Check if vector semantic retrieval is enabled by user preference */
  isSemanticRetrievalEnabled(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('echoself:semantic_retrieval_enabled');
        if (raw !== null) return raw === 'true';
      }
    } catch {}
    return true;
  },

  /**
   * Structure a decision dilemma using Gemini.
   * Rotates through all configured keys automatically if a key is exhausted or rate limited (HTTP 429).
   */
  async structureDecision(prompt: string, customApiKey?: string): Promise<GeminiDecisionDraft> {
    const allKeys = customApiKey?.trim() ? [customApiKey.trim()] : this.getApiKeys();

    if (allKeys.length === 0) {
      throw new Error('Gemini API key is required. Please configure your key in Settings.');
    }

    const systemInstruction = `You are EchoSelf's Deliberation Assistant.
EchoSelf is an evidence-grounded self-reflection system.
Analyze the user's raw dilemma and structure it into a comprehensive decision schema.
You MUST output valid, parseable JSON only matching this TypeScript interface:

interface DecisionDraft {
  title: string; // Concise, powerful dilemma question (under 120 chars, e.g. "Take the Director offer or stay with the core engineering team?")
  context: string; // The core tension, emotional stakes, why this choice is difficult, and who else is impacted (2-4 sentences)
  category: "career" | "relationship" | "health" | "finance" | "personal_growth" | "relocation" | "other";
  timeline: "immediate" | "1_month" | "3_months" | "6_months" | "open";
  options: Array<{
    label: string; // Option title (e.g. "Accept the Director position")
    pros: string[]; // 2-3 specific upsides or positive outcomes
    cons: string[]; // 2-3 specific risks, downsides, or trade-offs
  }>; // Minimum 2 options, maximum 4 options
  values: string[]; // 2 to 5 single-word personal values at stake (e.g. ["autonomy", "family", "craft", "security"])
  constraints: string; // Concrete hard constraints like deadlines, finances, location, commitments
  uncertainties: string; // Key unknowns, unverified assumptions, factors outside control
  success_definition: string; // Pre-mortem: what a grounded outcome looks like 12 months from now
}

Be realistic, psychologically nuanced, and objective. Never hallucinate irrelevant facts. Extract what the user actually said and infer natural trade-offs.`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    const startIndex = this.getActiveKeyIndex() % allKeys.length;

    // Create an ordered attempt list starting from the active key
    const attemptOrder: { key: string; index: number }[] = [];
    for (let i = 0; i < allKeys.length; i++) {
      const idx = (startIndex + i) % allKeys.length;
      attemptOrder.push({ key: allKeys[idx], index: idx });
    }

    let exhaustedKeyCount = 0;
    let lastError: Error | null = null;

    // Iterate through keys (automatic rotation on exhaustion)
    for (let attempt = 0; attempt < attemptOrder.length; attempt++) {
      const { key: currentKey, index: keyIdx } = attemptOrder[attempt];
      let keyExhausted = false;

      for (const model of models) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': currentKey,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  maxOutputTokens: 2048,
                  temperature: 0.2,
                  responseMimeType: 'application/json',
                },
              }),
            }
          );

          if (!res.ok) {
            const errBody = await res.text().catch(() => '');

            if (isQuotaOrExhaustionError(res.status, errBody)) {
              keyExhausted = true;
              exhaustedKeyCount++;
              lastError = new Error(`Key #${keyIdx + 1} exhausted quota or rate limit (${res.status}).`);

              // If more keys are available, rotate active index to the next key in the pool
              if (allKeys.length > 1) {
                const nextIdx = (keyIdx + 1) % allKeys.length;
                this.setActiveKeyIndex(nextIdx);
              }
              break; // Break model loop to advance to next key in attemptOrder
            }

            if (res.status === 404) {
              // Model not available on this tier, try next fallback model
              continue;
            }

            if (res.status === 400 && errBody.includes('API_KEY_INVALID')) {
              keyExhausted = true;
              lastError = new Error(`Key #${keyIdx + 1} is invalid.`);
              break;
            }

            throw new Error(`Gemini API error (${res.status}): ${errBody || res.statusText}`);
          }

          const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };

          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error('Gemini returned an empty response.');
          }

          const parsed = JSON.parse(rawText) as GeminiDecisionDraft;

          // Ensure minimum 2 options
          if (!Array.isArray(parsed.options) || parsed.options.length < 2) {
            parsed.options = [
              { label: 'Option A', pros: [], cons: [] },
              { label: 'Option B', pros: [], cons: [] },
            ];
          }

          // Successfully used this key, ensure it is the active primary key
          this.setActiveKeyIndex(keyIdx);
          return parsed;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (keyExhausted) {
            break; // Proceed to rotate to next key
          }
        }
      }
    }

    if (exhaustedKeyCount >= allKeys.length) {
      throw new Error(
        `All ${allKeys.length} configured Gemini API keys have exhausted their quota or rate limits. Please add an additional key in Settings or try again once your quota window resets.`
      );
    }

    throw (
      lastError ??
      new Error('Could not connect to Gemini API. Please check your network and API keys in Settings.')
    );
  },

  /**
   * Suggest title, category, and tags for a raw capture without altering original text.
   * If live AI provider is configured and available, returns an AI-generated suggestion.
   * Otherwise falls back to honest local rule-based heuristic suggestions.
   */
  async suggestCaptureDetails(
    content: string
  ): Promise<{
    title: string;
    category: import('./types').MemoryCategory;
    tags: string[];
    source: 'ai' | 'heuristic';
  }> {
    const trimmed = content.trim();
    if (!trimmed) {
      return {
        title: '',
        category: 'personal_growth',
        tags: [],
        source: 'heuristic',
      };
    }

    // Local heuristic fallback generator
    const generateLocalHeuristic = (): {
      title: string;
      category: import('./types').MemoryCategory;
      tags: string[];
      source: 'heuristic';
    } => {
      const firstLine = trimmed.split('\n')[0].replace(/^[#*-]\s*/, '').trim();
      const title = firstLine.length > 50 ? firstLine.slice(0, 47) + '…' : firstLine;
      const lower = trimmed.toLowerCase();

      let category: import('./types').MemoryCategory = 'personal_growth';
      if (/\b(work|team|code|project|career|client|job|engineer|meeting|salary)\b/.test(lower)) {
        category = 'work';
      } else if (/\b(health|run|sleep|gym|workout|doctor|food|diet|habit|morning)\b/.test(lower)) {
        category = 'health';
      } else if (/\b(friend|family|dad|mom|partner|maya|nadia|wife|husband|relationship|love)\b/.test(lower)) {
        category = 'relationship';
      } else if (/\b(travel|trip|flight|amsterdam|paris|hotel|explore)\b/.test(lower)) {
        category = 'travel';
      } else if (/\b(money|budget|invest|savings|expense|cost|finance)\b/.test(lower)) {
        category = 'finance';
      }

      const potentialTags = ['habits', 'work', 'leadership', 'reflection', 'family', 'learning', 'health', 'focus', 'decision'];
      const matchedTags = potentialTags.filter((t) => lower.includes(t));
      if (matchedTags.length === 0) matchedTags.push('note');

      return {
        title: title || 'Captured reflection',
        category,
        tags: matchedTags.slice(0, 4),
        source: 'heuristic',
      };
    };

    const allKeys = this.getApiKeys();
    if (allKeys.length === 0) {
      return generateLocalHeuristic();
    }

    const systemInstruction = `You are a concise editorial assistant for EchoSelf.
Given raw personal notes or thoughts, generate:
1. title: A concise, dignified 3 to 6 word title summarizing the central observation or experience.
2. category: Strictly one of: "relationship", "health", "work", "personal_growth", "travel", "finance", "other".
3. tags: Array of 2 to 4 clean, single-word lowercase tags.
Do not invent facts or alter user intent. Output valid JSON only.`;

    const prompt = `Raw capture text:\n"${trimmed.slice(0, 1000)}"\n\nJSON output format:\n{\n  "title": "string",\n  "category": "string",\n  "tags": ["string"]\n}`;

    try {
      const activeKey = allKeys[this.getActiveKeyIndex() % allKeys.length];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': activeKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 500,
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!res.ok) {
        return generateLocalHeuristic();
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return generateLocalHeuristic();

      const parsed = JSON.parse(rawText) as {
        title?: string;
        category?: import('./types').MemoryCategory;
        tags?: string[];
      };

      const validCategories = ['relationship', 'health', 'work', 'personal_growth', 'travel', 'finance', 'other'];
      const category = validCategories.includes(parsed.category as string)
        ? (parsed.category as import('./types').MemoryCategory)
        : 'personal_growth';

      return {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : generateLocalHeuristic().title,
        category,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 5) : ['note'],
        source: 'ai',
      };
    } catch {
      return generateLocalHeuristic();
    }
  },
};

