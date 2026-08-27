const CORP_SUFFIXES =
  /\b(llp|llc|inc|incorporated|corp|corporation|ltd|limited|co|company|pllc|pc|pa|plc|cpa|cpas|pvt|private)\b\.?/gi;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    // Drop dots first so dotted abbreviations ("P.C.", "L.L.C.") reduce to the
    // bare token the suffix list matches.
    .replace(/\./g, "")
    .replace(CORP_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Registrable-ish domain from a URL or bare host (drops www + protocol). */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Stable dedupe key for a discovered company. Domain is the strongest signal;
 * fall back to normalized name + city (or phone) for site-less companies.
 */
export function dedupeKey(opts: {
  name: string;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
}): string {
  const domain = normalizeDomain(opts.website);
  if (domain) return `d:${domain}`;
  const name = normalizeCompanyName(opts.name);
  const phone = normalizePhone(opts.phone);
  if (phone) return `np:${name}|${phone}`;
  return `nc:${name}|${(opts.city ?? "").toLowerCase().trim()}`;
}

const GOV_NAME_PATTERNS =
  /(internal revenue|taxpayer advocate|\birs\b|department of|government|city of|state of|county of|federal)/i;

export function isGovernmentCompany(opts: { name: string; website?: string | null }): boolean {
  const domain = normalizeDomain(opts.website);
  if (domain && (domain.endsWith(".gov") || domain.endsWith(".mil"))) return true;
  return GOV_NAME_PATTERNS.test(opts.name);
}

/**
 * Employee-strength estimate from public signals. Review count is the primary
 * signal (generous thresholds — a busy 5-person firm can have many reviews,
 * so bands skew small rather than dropping firms into "500+").
 */
export function estimateCompanySize(reviewCount: number | null | undefined): string | null {
  if (reviewCount == null) return null;
  if (reviewCount < 10) return "1-10";
  if (reviewCount <= 50) return "11-50";
  if (reviewCount <= 200) return "51-200";
  if (reviewCount <= 500) return "201-500";
  return "500+";
}

const SIZE_ORDER = ["1-10", "11-50", "51-200", "201-500", "500+"];

/** Bump an estimate upward when team-page headcount proves it too small. */
export function refineSizeByHeadcount(current: string | null, namedContacts: number): string | null {
  const floor = namedContacts > 40 ? "51-200" : namedContacts > 10 ? "11-50" : null;
  if (!floor) return current;
  if (!current) return floor;
  return SIZE_ORDER.indexOf(current) >= SIZE_ORDER.indexOf(floor) ? current : floor;
}

/** Quality rank for truncation: website > rating > reviews > phone. Higher is better. */
export function companyQualityScore(c: {
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  phone?: string | null;
}): number {
  let score = 0;
  if (c.website) score += 1000;
  if (c.rating != null) score += 100 + c.rating * 10;
  if (c.reviewCount != null) score += Math.min(99, c.reviewCount);
  if (c.phone) score += 50;
  return score;
}
