/**
 * Service to call Google Gemini API for AI-assisted deliberation structuring.
 * Supports environment variable VITE_GEMINI_API_KEY, localStorage key custody,
 * or direct user input.
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

const STORAGE_KEY = 'echoself_gemini_api_key';

export const geminiService = {
  getApiKey(): string {
    const fromEnv = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
    if (fromEnv) return fromEnv;
    try {
      return (localStorage.getItem(STORAGE_KEY) ?? '').trim();
    } catch {
      return '';
    }
  },

  setApiKey(key: string): void {
    try {
      if (key.trim()) {
        localStorage.setItem(STORAGE_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }
  },

  async structureDecision(prompt: string, customApiKey?: string): Promise<GeminiDecisionDraft> {
    const key = (customApiKey ?? this.getApiKey()).trim();
    if (!key) {
      throw new Error('Gemini API key is required. Please provide your Google AI Studio key.');
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
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
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
          if (res.status === 400 || res.status === 403) {
            throw new Error(`Invalid Gemini API key or request rejected (${res.status}): ${errBody || res.statusText}`);
          }
          if (res.status === 404) {
            // Model not available on this tier, try next fallback model
            continue;
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

        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('Invalid Gemini API key')) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Could not connect to Gemini API. Please check your network and API key.');
  },
};
