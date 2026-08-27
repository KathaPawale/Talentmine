/**
 * Deterministic pre-filter for excluded employers: staffing/recruitment firms,
 * CA/CPA/accounting-service firms, and government-run organizations. The
 * existing staffing_agency value is the app's backwards-compatible internal
 * bucket for all excluded companies.
 */

const AGENCY_NAME_RE =
  /\b(staffing|recruit(ing|ment|ers?)|headhunt(ing|ers?)|manpower|workforce|talent (solutions|partners|group|agency|acquisition services)|placement(s)? (agency|services)|employment (agency|services)|temp(orary)? (agency|services)|outsourc(ing|e))\b/i;

/** Well-known staffing brands that don't carry agency words in the name. */
const KNOWN_AGENCIES = [
  // global
  "robert half",
  "randstad",
  "adecco",
  "manpowergroup",
  "kelly services",
  "hays",
  "michael page",
  "pagegroup",
  "page personnel",
  "kforce",
  "insight global",
  "aerotek",
  "teksystems",
  "allegis",
  "korn ferry",
  "spencer stuart",
  "heidrick & struggles",
  // UK
  "reed",
  "morgan mckinley",
  "robert walters",
  "marks sattin",
  "investigo",
  "morgan hunt",
  "morgan law",
  "pertemps",
  "brook street",
  "office angels",
  "sthree",
  "tiger recruitment",
  // UK accountancy-recruitment boutiques observed leaking through the LLM
  "hyered",
  "crowley cox",
  "one ten associates",
  "sheridan maine",
  "harper may",
  "accountancy action",
  "ernest gordon recruitment",
  "head 4 talent",
  "nordoff associates",
  // India
  "naukri",
  "teamlease",
  "quess corp",
  "mantras2success.com",
  "kaapro management solutions",
  "greentree advisory services",
  "mtk healthcare",
  "i8is inc",
  "vacancy global pro",
  "ledgergurus",
  "3 bridge networks",
  "3d personnel",
  "ingham frankland fide",
  "ivy rock partners",
  "retaind",
  "testhiring",
  "hirextra",
  "crossing hurdles",
  "time contract",
  "apidel technologies",
  "focuspoint",
  "minnesota jobs",
  "mercor",
];

/** Legal practices are not excluded merely for having a professional-firm name. */
const PROFESSIONAL_FIRM_RE = /solicitors|attorneys|law firm/i;

const GOVERNMENT_EMPLOYER_RE =
  /(^|\W)(government|govt|civil service|ministry of|department of|municipal(ity)?|public service commission|national health service|nhs trust)(\W|$)|\.gov(\.|$)/i;

const EXCLUDED_ACCOUNTING_NAME_RE =
  /offshore accounting firm|chartered accountants?|accounting (firm|services?|outsourc(ing|e))|bookkeeping services?|\bcpa firm\b|\bcpas?\b/i;

const EXCLUDED_ACCOUNTING_DESCRIPTION_RE =
  /chartered accountancy firm|accounting (and|&) advisory firm|accounting outsourcing firm|outsourced accounting (agency|firm|services?)|finance as a service|fractional (finance|cfo)|finance support to smes|support multiple .{0,40} clients|client accounting services|\bcpas? (and|&) consultants\b/i;

const ACCOUNTING_PARTNERSHIP_RE = /(&|and)\s+(co\.?|associates|partners)\b.*\bllp\b/i;
const ACCOUNTING_ROLE_RE = /chartered accountant|associate ca\b|internal auditor|corporate tax|tax associate/i;

/** Audited firms whose short names do not carry an unambiguous service term. */
const KNOWN_ACCOUNTING_SERVICES = [
  "meru accounting",
  "rose financial solutions",
  "b2 management & consulting",
  "brock, schechter & polakoff",
  "wertz & associates",
  "nimblefincorp",
];

const AGENCY_DESCRIPTION_RE =
  /\b(our client\b|on behalf of (a|our|the) client\b|for (a|our) client\b|client of ours|hiring for (a|an|our) (client|leading)|placement fee|staffing (firm|agency|partner)|recruitment (firm|agency|consultancy))\b/i;

/**
 * Phrases so unambiguous that a single posting suffices — recruiters open with
 * these; direct employers essentially never do.
 */
const STRONG_AGENCY_PHRASE_RE =
  /\b(on behalf of (a|our|the|its) client\b|our client\b (is|are) (seeking|looking|hiring|recruiting)|(delighted|excited|proud) to (be )?partner(ing)? with|i'?m recruiting on behalf|we (are|'re) (currently )?recruiting (for|on behalf)|has partnered with (a|an|our)|working (exclusively )?with a (leading|growing|global|successful))\b/i;

export interface HeuristicVerdict {
  isAgency: boolean;
  confidence: number;
  reason: string;
}

export function classifyByHeuristic(opts: {
  name: string;
  domain?: string | null;
  industry?: string | null;
  natureOfBusiness?: string | null;
  sampleTitles?: string[];
  sampleDescriptions?: string[];
}): HeuristicVerdict | null {
  const name = opts.name.toLowerCase();
  const isProfessionalFirm = PROFESSIONAL_FIRM_RE.test(opts.name);
  const companyText = [opts.name, opts.domain, opts.industry, opts.natureOfBusiness].filter(Boolean).join(" ");

  for (const brand of KNOWN_AGENCIES) {
    // Word-boundary match so "Reed" doesn't hit "Reedsmith Manufacturing".
    if (new RegExp(`(^|\\W)${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(name)) {
      return { isAgency: true, confidence: 95, reason: `Known staffing brand ("${brand}")` };
    }
  }

  if (GOVERNMENT_EMPLOYER_RE.test(companyText)) {
    return { isAgency: true, confidence: 95, reason: "Government-run employer excluded by policy" };
  }

  if (
    EXCLUDED_ACCOUNTING_NAME_RE.test(companyText) ||
    KNOWN_ACCOUNTING_SERVICES.some((firm) => name.includes(firm)) ||
    (/cpa/i.test(opts.domain ?? "") && !/cpanel/i.test(opts.domain ?? ""))
  ) {
    return { isAgency: true, confidence: 95, reason: "CA/CPA or outsourced-accounting firm excluded by policy" };
  }

  const titles = opts.sampleTitles ?? [];
  if (ACCOUNTING_PARTNERSHIP_RE.test(opts.name) && titles.some((title) => ACCOUNTING_ROLE_RE.test(title))) {
    return { isAgency: true, confidence: 90, reason: "Accounting partnership and CA/audit roles indicate a CA firm" };
  }
  // Name-based signals never apply to professional-services firms.
  if (!isProfessionalFirm) {
    if (AGENCY_NAME_RE.test(opts.name)) {
      return { isAgency: true, confidence: 90, reason: "Company name contains staffing/recruiting terms" };
    }
    if (opts.natureOfBusiness && AGENCY_NAME_RE.test(opts.natureOfBusiness)) {
      return { isAgency: true, confidence: 95, reason: "Company business description identifies recruitment/staffing services" };
    }
    if (opts.industry && /staffing|recruit|employment agency/i.test(opts.industry)) {
      return { isAgency: true, confidence: 85, reason: `Industry listed as "${opts.industry}"` };
    }
  }

  const descriptions = opts.sampleDescriptions ?? [];

  const accountingHit = descriptions.find((d) => EXCLUDED_ACCOUNTING_DESCRIPTION_RE.test(d));
  if (accountingHit) {
    const phrase = accountingHit.match(EXCLUDED_ACCOUNTING_DESCRIPTION_RE)?.[0] ?? "accounting services";
    return { isAgency: true, confidence: 90, reason: `Accounting-service evidence ("${phrase.slice(0, 70)}")` };
  }

  // One unambiguous third-party phrase is enough, even from a single posting.
  const strongHit = descriptions.find((d) => STRONG_AGENCY_PHRASE_RE.test(d));
  if (strongHit) {
    const phrase = strongHit.match(STRONG_AGENCY_PHRASE_RE)?.[0] ?? "";
    return { isAgency: true, confidence: 85, reason: `Posting uses third-party recruiting language ("${phrase.slice(0, 60)}")` };
  }

  // Weaker phrases need corroboration across postings.
  const clientHits = descriptions.filter((d) => AGENCY_DESCRIPTION_RE.test(d)).length;
  if (descriptions.length > 0 && clientHits >= Math.max(2, Math.ceil(descriptions.length / 2))) {
    return {
      isAgency: true,
      confidence: 80,
      reason: `${clientHits} of ${descriptions.length} postings use third-party phrasing ("our client", …)`,
    };
  }

  // No agency signal — not proof of a direct employer; leave to the LLM.
  return null;
}

export { PROFESSIONAL_FIRM_RE };
