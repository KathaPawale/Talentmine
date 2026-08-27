import * as cheerio from "cheerio";
import { absolutizeUrl } from "./html-utils";

const CAREERS_HREF_RE = /careers?|jobs?|join[-_ ]?us|work[-_ ]?with[-_ ]?us|vacanc|opening|we-?are-?hiring|recruitment/i;
const CAREERS_TEXT_RE = /careers?|jobs?|join (us|our team)|work with us|we're hiring|vacancies|open positions|openings/i;

/** Common careers paths probed when the homepage links to none. */
export const FALLBACK_PATHS = ["/careers", "/careers/", "/jobs", "/join-us", "/company/careers", "/about/careers"];

/**
 * Find likely careers-page URLs in a company homepage. Returns absolute URLs,
 * highest-confidence first, capped at 3.
 */
export function findCareersLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const scored = new Map<string, number>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const hrefHit = CAREERS_HREF_RE.test(href);
    const textHit = CAREERS_TEXT_RE.test(text);
    if (!hrefHit && !textHit) return;
    const abs = absolutizeUrl(href, baseUrl);
    if (!abs) return;
    // stay on (sub)domains of the company site
    try {
      const base = new URL(baseUrl).hostname.replace(/^www\./, "");
      const target = new URL(abs).hostname.replace(/^www\./, "");
      if (target !== base && !target.endsWith(`.${base}`)) return;
    } catch {
      return;
    }
    const score = (hrefHit ? 2 : 0) + (textHit ? 1 : 0);
    scored.set(abs, Math.max(scored.get(abs) ?? 0, score));
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([url]) => url);
}
