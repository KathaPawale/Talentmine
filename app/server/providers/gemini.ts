import { config } from "../config";
import type { LlmProvider } from "./types";

const MODEL = "gemini-2.0-flash-lite";
const REQUEST_TIMEOUT_MS = 45_000;

export class GeminiLlm implements LlmProvider {
  readonly available = config.features.gemini;

  async completeJson<T>(opts: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    signal?: AbortSignal;
    maxTokens?: number;
  }): Promise<T | null> {
    if (!this.available) return null;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
      const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
      if (opts.signal) signals.push(opts.signal);
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.any(signals),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `${opts.system}\nRespond with a single JSON object matching the "${opts.schemaName}" schema: ${JSON.stringify(opts.schema)}`,
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: opts.maxTokens ?? 1024,
          },
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: unknown }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") return null;
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}

/** Tries primary first; on null or throw falls through to secondary. */
export class FailoverLlm implements LlmProvider {
  constructor(
    private readonly primary: LlmProvider,
    private readonly secondary: LlmProvider,
  ) {}

  get available(): boolean {
    return this.primary.available || this.secondary.available;
  }

  async completeJson<T>(opts: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    signal?: AbortSignal;
    maxTokens?: number;
  }): Promise<T | null> {
    if (this.primary.available) {
      try {
        const result = await this.primary.completeJson<T>(opts);
        if (result !== null) return result;
      } catch {
        // fall through to secondary
      }
    }
    if (!this.secondary.available) return null;
    try {
      return await this.secondary.completeJson<T>(opts);
    } catch {
      return null;
    }
  }
}
