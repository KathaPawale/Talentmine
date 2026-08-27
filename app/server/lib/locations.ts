/**
 * Location normalization: sources disagree wildly (JSearch: country "GB",
 * city null; Adzuna: city "London, UK", country "United Kingdom"). Dedupe
 * keys and exports need one canonical form.
 */

const COUNTRY_BY_CODE: Record<string, string> = {
  ae: "United Arab Emirates",
  at: "Austria",
  au: "Australia",
  be: "Belgium",
  br: "Brazil",
  ca: "Canada",
  ch: "Switzerland",
  cn: "China",
  de: "Germany",
  dk: "Denmark",
  es: "Spain",
  fi: "Finland",
  fr: "France",
  gb: "United Kingdom",
  hk: "Hong Kong",
  id: "Indonesia",
  ie: "Ireland",
  il: "Israel",
  in: "India",
  it: "Italy",
  jp: "Japan",
  ke: "Kenya",
  kr: "South Korea",
  mx: "Mexico",
  my: "Malaysia",
  ng: "Nigeria",
  nl: "Netherlands",
  no: "Norway",
  nz: "New Zealand",
  ph: "Philippines",
  pl: "Poland",
  pt: "Portugal",
  qa: "Qatar",
  sa: "Saudi Arabia",
  se: "Sweden",
  sg: "Singapore",
  th: "Thailand",
  tr: "Turkey",
  us: "United States",
  za: "South Africa",
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  usa: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  america: "United States",
  "united states of america": "United States",
  uae: "United Arab Emirates",
  holland: "Netherlands",
};

/** Canonical country name from a code, alias, or already-canonical name. */
export function canonicalCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.length <= 3 && COUNTRY_BY_CODE[lower]) return COUNTRY_BY_CODE[lower];
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  // already a name — title-case pass-through of what the source sent
  return s;
}

/** Every string that means the posting's own country — used to trim city noise. */
function countryTokens(country: string | null): Set<string> {
  const out = new Set<string>();
  if (!country) return out;
  const lower = country.toLowerCase();
  out.add(lower);
  for (const [code, name] of Object.entries(COUNTRY_BY_CODE)) {
    if (name.toLowerCase() === lower) out.add(code);
  }
  for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
    if (name.toLowerCase() === lower) out.add(alias);
  }
  return out;
}

/** City values that mean "no city" (remote/unlocated markers). */
const NON_CITY_VALUES = new Set(["anywhere", "remote", "work from home", "various", "flexible"]);

/**
 * Clean a city value: drop trailing country/alias fragments ("London, UK" →
 * "London"), fold "Greater X" into "X", drop remote markers, collapse
 * whitespace. Keeps genuine multi-part cities intact.
 */
export function cleanCity(raw: string | null | undefined, country: string | null): string | null {
  if (!raw) return null;
  const tokens = countryTokens(country);
  const parts = raw
    .split(",")
    .map((p) => p.trim().replace(/^greater\s+/i, ""))
    .filter((p) => p && !tokens.has(p.toLowerCase()) && !NON_CITY_VALUES.has(p.toLowerCase()));
  const city = parts.join(", ").replace(/\s+/g, " ").trim();
  return city || null;
}

/** Loose country equality on canonical names. */
export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalCountry(a);
  const cb = canonicalCountry(b);
  if (!ca || !cb) return false;
  return ca.toLowerCase() === cb.toLowerCase();
}
