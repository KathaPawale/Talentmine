import { sleep } from "../../lib/with-timeout";
import type { AtsBoardResult, AtsProvider } from "../types";
import { ATS_FETCHERS, type AtsKind } from "./boards";

/**
 * Regexes that find ATS board links inside a company's homepage/careers HTML.
 * Page-based detection is the primary method — far more accurate than blind
 * slug probing.
 */
const DETECT_PATTERNS: [AtsKind, RegExp][] = [
  ["greenhouse", /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?(?:embed\/job_board\?for=)?([\w-]+)/i],
  ["greenhouse", /job-boards\.greenhouse\.io\/([\w-]+)/i],
  ["lever", /jobs\.(?:eu\.)?lever\.co\/([\w-]+)/i],
  ["workable", /apply\.workable\.com\/(?:api\/v\d\/widget\/accounts\/)?([\w-]+)/i],
  ["smartrecruiters", /(?:careers|jobs)\.smartrecruiters\.com\/([\w-]+)/i],
  ["recruitee", /([\w-]+)\.recruitee\.com/i],
  ["ashby", /jobs\.ashbyhq\.com\/([\w-]+)/i],
];

const IGNORE_SLUGS = new Set(["www", "api", "embed", "jobs", "careers", "job_board", "widget"]);

export function detectAtsBoards(html: string): { atsType: AtsKind; token: string }[] {
  const found = new Map<string, { atsType: AtsKind; token: string }>();
  for (const [atsType, re] of DETECT_PATTERNS) {
    const global = new RegExp(re.source, "gi");
    for (const match of html.matchAll(global)) {
      const token = match[1]?.toLowerCase();
      if (!token || IGNORE_SLUGS.has(token)) continue;
      found.set(`${atsType}:${token}`, { atsType, token });
    }
  }
  return [...found.values()];
}

/** Candidate board slugs derived from the company's domain and name. */
export function candidateSlugs(companyName: string, domain: string): string[] {
  const out = new Set<string>();
  const apex = domain.split(".")[0];
  if (apex && apex.length > 2) out.add(apex.toLowerCase());
  const squashed = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
  if (squashed.length > 2) out.add(squashed);
  const dashed = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  if (dashed.length > 2) out.add(dashed);
  return [...out];
}

const PROBE_SPACING_MS = 300;

export class HttpAtsProvider implements AtsProvider {
  async fetchBoards(opts: {
    companyName: string;
    domain: string;
    knownBoards: { atsType: AtsKind; token: string }[];
    signal: AbortSignal;
  }): Promise<AtsBoardResult | null> {
    // 1. Boards found by page regex — fetch directly, no guessing.
    for (const board of opts.knownBoards) {
      const postings = await ATS_FETCHERS[board.atsType](board.token, opts.companyName, opts.signal);
      if (postings !== null) {
        return { atsType: board.atsType, token: board.token, postings };
      }
    }

    // 2. Fallback: probe candidate slugs across platforms. Greenhouse and
    // Lever first (largest install bases). Stop at the first live board.
    if (opts.knownBoards.length > 0) return null; // page said which ATS; don't guess others
    const slugs = candidateSlugs(opts.companyName, opts.domain);
    const order: AtsKind[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee", "workable"];
    for (const atsType of order) {
      for (const slug of slugs) {
        if (opts.signal.aborted) return null;
        const postings = await ATS_FETCHERS[atsType](slug, opts.companyName, opts.signal);
        await sleep(PROBE_SPACING_MS);
        // Guessed slugs can hit an unrelated company's board — require a
        // non-empty board so "no jobs" guesses don't claim a false ATS.
        if (postings !== null && postings.length > 0) {
          return { atsType, token: slug, postings };
        }
      }
    }
    return null;
  }
}
