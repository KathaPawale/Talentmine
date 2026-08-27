import crypto from "node:crypto";
import { normalizeCompanyName } from "../lib/normalize";

/**
 * Normalize a job title for dedupe: lowercase, strip req-IDs, "(m/f/d)"-style
 * noise, punctuation, and collapse whitespace.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // parentheticals are almost always noise: "(m/f/d)", "(Req 12)", "(Contract)"
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:req(?:uisition)?|job|ref|id)(?:\s+id)?[\s#:.-]*\d{2,}\b/gi, " ")
    .replace(/#\d{2,}/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normLocation(opts: { city?: string | null; country?: string | null; isRemote?: boolean }): string {
  const country = (opts.country ?? "").toLowerCase().trim();
  if (opts.isRemote) return `remote|${country}`;
  return `${(opts.city ?? "").toLowerCase().trim()}|${country}`;
}

/** Exact-match dedupe key: same employer + same title + same place = same job. */
export function postingDedupeKey(opts: {
  companyName: string;
  title: string;
  city?: string | null;
  country?: string | null;
  isRemote?: boolean;
}): string {
  const raw = `${normalizeCompanyName(opts.companyName)}|${normalizeTitle(opts.title)}|${normLocation(opts)}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

/** Character-trigram Jaccard similarity between two normalized titles (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = trigrams(normalizeTitle(a));
  const tb = trigrams(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * Which of two duplicate postings survives a merge. First-party sources
 * (ATS boards, careers pages) beat aggregators — they are richer and fresher.
 */
export function sourceRank(source: string): number {
  if (source.startsWith("ats_")) return 3;
  if (source === "careers_page") return 2;
  return 1;
}
