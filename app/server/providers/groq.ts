import { config } from "../config";
import type { LlmProvider } from "./types";
import { sleep } from "../lib/with-timeout";
import { guardedCall } from "./guard";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_REQUESTS_PER_MIN = 28;

// Module-global token bucket: Groq free tier is ~30 req/min account-wide, so
// the limiter must span all GroqLlm instances.
const requestTimes: number[] = [];

async function waitForRateLimit(signal?: AbortSignal): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (requestTimes.length > 0 && now - requestTimes[0]! >= 60_000) requestTimes.shift();
    if (requestTimes.length < MAX_REQUESTS_PER_MIN) {
      requestTimes.push(now);
      return;
    }
    const waitMs = requestTimes[0]! + 60_000 - now + 50;
    await sleep(waitMs, signal);
  }
}

export class GroqLlm implements LlmProvider {
  readonly available = config.features.groq;

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
      return await guardedCall("groq", 1, async () => {
        await waitForRateLimit(opts.signal);
        const body = JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: opts.maxTokens ?? 1024,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${opts.system}\nRespond with a single JSON object matching the "${opts.schemaName}" schema: ${JSON.stringify(opts.schema)}`,
            },
            { role: "user", content: opts.user },
          ],
        });

        for (let attempt = 0; attempt < 2; attempt++) {
          const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
          if (opts.signal) signals.push(opts.signal);
          const res = await fetch(API_URL, {
            method: "POST",
            signal: AbortSignal.any(signals),
            headers: {
              authorization: `Bearer ${config.GROQ_API_KEY}`,
              "content-type": "application/json",
            },
            body,
          });
          if (res.status === 429 || res.status >= 500) {
            if (attempt === 0) {
              await sleep(2000, opts.signal);
              continue;
            }
            return null;
          }
          if (!res.ok) return null;
          const data = (await res.json()) as {
            choices?: { message?: { content?: unknown } }[];
          };
          const content = data.choices?.[0]?.message?.content;
          if (typeof content !== "string") return null;
          return JSON.parse(content) as T;
        }
        return null;
      });
    } catch {
      // includes QuotaExceededError — callers fail over / skip, never crash
      return null;
    }
  }
}
