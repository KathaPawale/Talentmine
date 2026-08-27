import * as cheerio from "cheerio";

const MAX_TEXT_CHARS = 40_000;

const BLOCK_ELEMENTS =
  "p, div, section, article, header, footer, main, aside, ul, ol, li, table, tr, td, th, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption";

export function stripToVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, template, nav").remove();
  $("br").replaceWith("\n");
  // .text() concatenates adjacent cells/divs with no separator, which would
  // glue preceding words onto emails — force a boundary after block elements.
  $(BLOCK_ELEMENTS).append("\n");
  const body = $("body");
  const text = body.length > 0 ? body.text() : $.root().text();
  return text
    .replace(/[ \t\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const $ = cheerio.load(html);
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // malformed JSON-LD — skip the block
    }
  });
  return out;
}

export interface MailtoHit {
  email: string;
  nearbyText: string;
}

export function extractMailtos(html: string): MailtoHit[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: MailtoHit[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!/^mailto:/i.test(href)) return;
    let email = href.slice("mailto:".length).split("?")[0] ?? "";
    try {
      email = decodeURIComponent(email);
    } catch {
      // keep raw
    }
    email = email.trim().toLowerCase();
    if (!email.includes("@") || seen.has(email)) return;
    seen.add(email);
    const nearbyText = ($(el).parent().text() || $(el).text())
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    out.push({ email, nearbyText });
  });
  return out;
}

export function absolutizeUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
