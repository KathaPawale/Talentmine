import { z } from "zod";

// ---------- Pipeline stages ----------
export const STAGE_NAMES = [
  "source_search",
  "places_discover",
  "ats_mine",
  "normalize",
  "classify",
  "enrich",
  "done",
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** Relative weight of each stage in overall run progress. Sums to 100. */
export const STAGE_WEIGHTS: Record<StageName, number> = {
  source_search: 25,
  places_discover: 10,
  ats_mine: 30,
  normalize: 15,
  classify: 12,
  enrich: 6,
  done: 2,
};

export const STAGE_LABELS: Record<StageName, string> = {
  source_search: "Job Boards",
  places_discover: "Discover",
  ats_mine: "Career Sites",
  normalize: "Normalize",
  classify: "Classify",
  enrich: "Enrich",
  done: "Done",
};

// ---------- Statuses ----------
export const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled", "blocked_quota"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const isTerminalJobStatus = (s: JobStatus | undefined): boolean =>
  s === "completed" || s === "failed" || s === "cancelled";

// ---------- Role categories (canonical buckets for normalized job titles) ----------
export const ROLE_CATEGORIES = [
  "accountant",
  "finance",
  "hr",
  "manager",
  "sales",
  "marketing",
  "engineering",
  "it",
  "operations",
  "admin",
  "customer_service",
  "legal",
  "healthcare",
  "logistics",
  "other",
] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  accountant: "Accounting",
  finance: "Finance",
  hr: "Human Resources",
  manager: "Management",
  sales: "Sales",
  marketing: "Marketing",
  engineering: "Engineering",
  it: "IT & Software",
  operations: "Operations",
  admin: "Administration",
  customer_service: "Customer Service",
  legal: "Legal",
  healthcare: "Healthcare",
  logistics: "Logistics",
  other: "Other",
};

// ---------- Sources ----------
/** User-facing source toggles on the run form. */
export const SOURCE_KEYS = ["jsearch", "adzuna", "ats"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Where a stored posting actually came from (finer-grained than SOURCE_KEYS). */
export const POSTING_SOURCES = [
  "jsearch",
  "adzuna",
  "ats_greenhouse",
  "ats_lever",
  "ats_workable",
  "ats_smartrecruiters",
  "ats_recruitee",
  "ats_ashby",
  "careers_page",
] as const;
export type PostingSource = (typeof POSTING_SOURCES)[number];

export const POSTING_SOURCE_LABELS: Record<PostingSource, string> = {
  jsearch: "Google Jobs (JSearch)",
  adzuna: "Adzuna",
  ats_greenhouse: "Greenhouse",
  ats_lever: "Lever",
  ats_workable: "Workable",
  ats_smartrecruiters: "SmartRecruiters",
  ats_recruitee: "Recruitee",
  ats_ashby: "Ashby",
  careers_page: "Careers Page",
};

/** source_runs.source values: the three user toggles plus internal Places discovery. */
export const SOURCE_RUN_KEYS = ["jsearch", "adzuna", "ats", "places"] as const;
export type SourceRunKey = (typeof SOURCE_RUN_KEYS)[number];

// ---------- ATS ----------
export const ATS_TYPES = [
  "greenhouse",
  "lever",
  "workable",
  "smartrecruiters",
  "recruitee",
  "ashby",
  "careers_page",
  "none",
] as const;
export type AtsType = (typeof ATS_TYPES)[number];

// ---------- Employer classification ----------
export const CLASSIFICATIONS = ["direct_employer", "staffing_agency", "unknown"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export type ClassificationMethod = "heuristic" | "llm" | "manual";

// ---------- Employment ----------
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "temporary"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// ---------- Job events ----------
export const EVENT_LEVELS = ["info", "success", "warn", "error"] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

export interface JobEventDto {
  seq: number;
  ts: number;
  stage: StageName;
  level: EventLevel;
  message: string;
}

// ---------- Run creation input ----------
export const runCreateSchema = z.object({
  name: z.string().min(1).max(120),
  country: z.string().min(1).max(60),
  region: z.string().max(60).optional().default(""),
  city: z.string().max(60).optional().default(""),
  /** Free-text role searches, e.g. "Accountant", "HR Manager". */
  roleKeywords: z.array(z.string().min(1).max(60)).min(1).max(10),
  /** Optional canonical-category filter applied after normalization. */
  roleCategories: z.array(z.enum(ROLE_CATEGORIES)).max(15).default([]),
  /** Seeds Google Places company discovery for ATS mining. */
  industries: z.array(z.string().min(1).max(60)).max(10).default([]),
  sources: z.array(z.enum(SOURCE_KEYS)).min(1),
  remoteOnly: z.boolean().default(false),
  postedWithinDays: z.number().int().min(1).max(90).default(30),
  targetCount: z.number().int().min(10).max(2000).default(200),
  /** Flag staffing/recruiting agencies and hide their postings by default. */
  excludeAgencies: z.boolean().default(true),
  /** Look up address/phone for direct employers via Places details. */
  enrichCompanies: z.boolean().default(false),
});
export type RunCreateInput = z.infer<typeof runCreateSchema>;
/** Alias kept so scheduler/queue code copied from leadmine reads naturally. */
export type JobCreateInput = RunCreateInput;

// ---------- Run totals ----------
export interface RunTotals {
  rawPostings: number;
  uniquePostings: number;
  companiesDiscovered: number;
  atsFound: number;
  directEmployers: number;
  agenciesExcluded: number;
  enriched: number;
}

// ---------- Settings keys (DB-stored tunables) ----------
export const SETTING_DEFAULTS = {
  // JSearch free tier is 200 requests/month — keep headroom.
  "quota.jsearch_monthly_cap": 190,
  // Adzuna free tier is ~250 calls/day.
  "quota.adzuna_daily_cap": 240,
  "quota.places_monthly_cap": 950,
  "quota.places_hard_stop": true,
  "quota.groq_daily_cap": 13000,
  /** Companies classified below this confidence stay "unknown" (shown with a badge). */
  "classify.confidence_threshold": 70,
  /** Max companies probed for an ATS / crawled per run (politeness + runtime cap). */
  "ats.max_companies_per_run": 150,
  /** Places website-resolution lookups per run (name-only employers). */
  "enrich.resolve_websites_per_run": 60,
  // Hunter free tier is ~25 domain searches/month — keep headroom.
  "quota.hunter_monthly_cap": 20,
  /** Hunter fallback lookups per run (spreads the tiny monthly quota). */
  "enrich.hunter_per_run": 10,
  "pipeline.pool_size": 1,
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

// ---------- Quota ----------
export const QUOTA_PROVIDERS = ["jsearch", "adzuna", "google_places", "groq", "hunter"] as const;
export type QuotaProvider = (typeof QUOTA_PROVIDERS)[number];

// ---------- Adzuna country support ----------
/** ISO-3166 alpha-2 codes Adzuna serves, keyed by common country names. */
export const ADZUNA_COUNTRIES: Record<string, string> = {
  australia: "au",
  austria: "at",
  belgium: "be",
  brazil: "br",
  canada: "ca",
  uae: "ae",
  "united arab emirates": "ae",
  switzerland: "ch",
  germany: "de",
  spain: "es",
  france: "fr",
  "united kingdom": "gb",
  uk: "gb",
  india: "in",
  italy: "it",
  mexico: "mx",
  netherlands: "nl",
  "new zealand": "nz",
  poland: "pl",
  singapore: "sg",
  "united states": "us",
  usa: "us",
  "south africa": "za",
};

export function adzunaCountryCode(country: string): string | null {
  return ADZUNA_COUNTRIES[country.trim().toLowerCase()] ?? null;
}
