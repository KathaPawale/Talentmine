import { z } from "zod";
import type { LlmProvider, RawPosting } from "../providers/types";

const MAX_INPUT_CHARS = 12_000;
const MAX_POSTINGS = 25;

const llmPostingSchema = z.object({
  title: z.string().min(2).max(150),
  location: z.string().max(120).nullish(),
  isRemote: z.boolean().nullish(),
});

const llmResponseSchema = z.object({
  postings: z.array(llmPostingSchema).max(MAX_POSTINGS),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    postings: {
      type: "array",
      maxItems: MAX_POSTINGS,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          location: { type: ["string", "null"] },
          isRemote: { type: ["boolean", "null"] },
        },
        required: ["title"],
      },
    },
  },
  required: ["postings"],
};

/** Job titles must look like titles, not nav labels or paragraphs. */
function isPlausibleJobTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 3 || t.length > 120) return false;
  if (/^(home|about|contact|login|apply now|careers?|jobs?|search|menu|privacy|terms)$/i.test(t)) return false;
  if ((t.match(/\s/g)?.length ?? 0) > 12) return false;
  return /[a-z]/i.test(t);
}

/**
 * LLM fallback for career pages without JobPosting JSON-LD: pull open-position
 * titles out of the visible page text. Output is Zod re-validated and capped;
 * returns [] on any failure.
 */
export async function extractPostingsWithLlm(
  llm: LlmProvider,
  opts: {
    companyName: string;
    pageText: string;
    sourceUrl: string;
    signal?: AbortSignal;
  },
): Promise<RawPosting[]> {
  if (!llm.available) return [];

  const raw = await llm.completeJson<unknown>({
    system:
      "You extract open job positions from a company careers-page text. " +
      "List only actual open roles posted by this company (ignore navigation, benefits copy, and generic text). " +
      "If the page lists no specific open roles, return an empty postings array.",
    user: `Company: ${opts.companyName}\nCareers page text:\n${opts.pageText.slice(0, MAX_INPUT_CHARS)}`,
    schemaName: "careers_postings",
    schema: JSON_SCHEMA,
    signal: opts.signal,
    maxTokens: 1500,
  });
  if (raw === null) return [];

  const parsed = llmResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  return parsed.data.postings
    .filter((p) => isPlausibleJobTitle(p.title))
    .map((p) => {
      const location = p.location?.trim() || null;
      const parts = location ? location.split(",").map((s) => s.trim()) : [];
      return {
        title: p.title.trim(),
        companyName: opts.companyName,
        city: parts[0] ?? null,
        country: parts.length > 1 ? (parts.at(-1) ?? null) : null,
        isRemote: p.isRemote ?? /remote/i.test(location ?? ""),
        applyUrl: opts.sourceUrl,
        sourceUrl: opts.sourceUrl,
        source: "careers_page" as const,
      };
    });
}
