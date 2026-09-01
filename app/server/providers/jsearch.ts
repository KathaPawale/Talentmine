import { config } from "../config";
import { withTimeout } from "../lib/with-timeout";
import { guardedCall } from "./guard";
import { adzunaCountryCode } from "@shared/types";
import type { JobSourceProvider, RawPosting } from "./types";
import type { EmploymentType } from "@shared/types";

// JSearch retired /search in favor of /search-v2 (cursor-based pagination).
const API_URL = "https://jsearch.p.rapidapi.com/search-v2";
const PAGE_TIMEOUT_MS = 30_000;
// ~10 postings per JSearch page; the free tier is 200 requests/month, so the
// stage budgets pages tightly and this ceiling is a per-query backstop.
const MAX_PAGES_PER_QUERY = 3;
const ARBEITNOW_TIMEOUT_MS = 20_000;
const ARBEITNOW_MAX_PAGES = 5;

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  job_types?: string[];
  location?: string;
  created_at?: number;
}

function stripHtml(value: string | undefined): string | null {
  return value ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : null;
}

function arbeitnowEndpoint(country: string): string | null {
  const normalized = country.trim().toLowerCase();
  if (normalized === "germany" || normalized === "deutschland") {
    return "https://www.arbeitnow.com/api/job-board-api";
  }
  if (normalized === "united kingdom" || normalized === "uk") {
    return "https://www.arbeitnow.co.uk/api/job-board-api";
  }
  return null;
}

async function searchArbeitnowFallback(opts: {
  roleKeyword: string;
  country: string;
  remoteOnly: boolean;
  postedWithinDays: number;
  maxResults: number;
  signal: AbortSignal;
  onApiCall?: () => void;
}): Promise<RawPosting[]> {
  const endpoint = arbeitnowEndpoint(opts.country);
  if (!endpoint) return [];
  const out: RawPosting[] = [];
  const keyword = opts.roleKeyword.trim().toLowerCase();
  const cutoff = Date.now() - opts.postedWithinDays * 86_400_000;

  for (let page = 1; page <= ARBEITNOW_MAX_PAGES && out.length < opts.maxResults; page++) {
    opts.onApiCall?.();
    const payload = await withTimeout(
      (async () => {
        const res = await fetch(`${endpoint}?page=${page}`, { signal: opts.signal });
        if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
        return (await res.json()) as { data?: ArbeitnowJob[] };
      })(),
      ARBEITNOW_TIMEOUT_MS,
      "arbeitnow fallback page",
    );
    const jobs = payload.data ?? [];
    for (const job of jobs) {
      if (!job.title?.toLowerCase().includes(keyword) || !job.company_name?.trim()) continue;
      if (opts.remoteOnly && !job.remote) continue;
      const postedAt = job.created_at ? new Date(job.created_at * 1000) : null;
      if (postedAt && postedAt.getTime() < cutoff) continue;
      const types = (job.job_types ?? []).join(" ");
      out.push({
        title: job.title.trim(),
        companyName: job.company_name.trim(),
        description: stripHtml(job.description),
        city: job.location?.trim() || null,
        country: opts.country,
        isRemote: job.remote ?? false,
        employmentType: mapEmployment(types),
        postedAt,
        applyUrl: job.url ?? null,
        sourceUrl: job.url ?? null,
        source: "careers_page",
        externalId: job.slug ?? null,
      });
      if (out.length >= opts.maxResults) break;
    }
    if (jobs.length === 0) break;
  }
  return out;
}

/** v2 accepts a country code (defaults to US) — map common names beyond Adzuna's list. */
const EXTRA_COUNTRY_CODES: Record<string, string> = {
  uae: "ae",
  "united arab emirates": "ae",
  ireland: "ie",
  japan: "jp",
  "saudi arabia": "sa",
  qatar: "qa",
  malaysia: "my",
  philippines: "ph",
  indonesia: "id",
};

function jsearchCountryCode(country: string): string | null {
  return adzunaCountryCode(country) ?? EXTRA_COUNTRY_CODES[country.trim().toLowerCase()] ?? null;
}

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  employer_website?: string | null;
  job_description?: string;
  job_location?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_salary_string?: string | null;
  job_employment_type?: string | null;
  job_employment_types?: string[] | null;
  job_posted_at_timestamp?: number | null;
  job_posted_at_datetime_utc?: string | null;
  job_apply_link?: string | null;
  job_google_link?: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { "£": "GBP", "$": "USD", "€": "EUR", "₹": "INR" };

/** Parse "£50,000 - £55,000 per annum" style salary strings into fields. */
export function parseSalaryString(s: string | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "year" | "month" | "hour" | null;
} | null {
  if (!s) return null;
  const symbol = s.match(/[£$€₹]/)?.[0];
  const currency = symbol ? (CURRENCY_SYMBOLS[symbol] ?? null) : (s.match(/\b(GBP|USD|EUR|INR|AUD|CAD)\b/i)?.[0]?.toUpperCase() ?? null);
  const nums = [...s.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => parseFloat(m[1]!.replace(/,/g, "")) * (m[2] ? 1000 : 1))
    .filter((n) => n >= 5);
  if (nums.length === 0) return null;
  const period = /ann(um|ual)|year|p\.?a\.?\b/i.test(s) ? "year" : /month/i.test(s) ? "month" : /hour|\bp\/?h\b/i.test(s) ? "hour" : null;
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null, currency, period };
}

function mapEmployment(v: string | null | undefined): EmploymentType | null {
  const u = (v ?? "").toUpperCase();
  if (u.includes("FULL")) return "full_time";
  if (u.includes("PART")) return "part_time";
  if (u.includes("CONTRACT")) return "contract";
  if (u.includes("INTERN")) return "intern";
  if (u.includes("TEMP")) return "temporary";
  return null;
}

function mapSalaryPeriod(v: string | null | undefined): "year" | "month" | "hour" | null {
  const u = (v ?? "").toUpperCase();
  if (u === "YEAR" || u === "YEARLY" || u === "ANNUM") return "year";
  if (u === "MONTH" || u === "MONTHLY") return "month";
  if (u === "HOUR" || u === "HOURLY") return "hour";
  return null;
}

function mapJob(j: JSearchJob): RawPosting | null {
  const title = j.job_title?.trim();
  const companyName = j.employer_name?.trim();
  if (!title || !companyName) return null;
  // v2 often has job_city null but a usable job_location ("Greater London").
  const city = j.job_city ?? j.job_location?.split(",")[0]?.trim() ?? null;
  // Numeric salary fields are usually null on Google Jobs; fall back to the
  // human-readable salary string when present.
  const parsed = j.job_min_salary == null && j.job_max_salary == null ? parseSalaryString(j.job_salary_string) : null;
  const postedAt = j.job_posted_at_datetime_utc
    ? new Date(j.job_posted_at_datetime_utc)
    : j.job_posted_at_timestamp
      ? new Date(j.job_posted_at_timestamp * 1000)
      : null;
  return {
    title,
    companyName,
    companyWebsite: j.employer_website ?? null,
    description: j.job_description ?? null,
    city,
    region: j.job_state ?? null,
    country: j.job_country ?? null,
    isRemote: j.job_is_remote ?? false,
    salaryMin: j.job_min_salary ?? parsed?.min ?? null,
    salaryMax: j.job_max_salary ?? parsed?.max ?? null,
    salaryCurrency: j.job_salary_currency ?? parsed?.currency ?? null,
    salaryPeriod: mapSalaryPeriod(j.job_salary_period) ?? parsed?.period ?? null,
    employmentType: mapEmployment(j.job_employment_types?.[0] ?? j.job_employment_type),
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    applyUrl: j.job_apply_link ?? null,
    sourceUrl: j.job_google_link ?? j.job_apply_link ?? null,
    source: "jsearch",
    externalId: j.job_id ?? null,
  };
}

function datePostedParam(days: number): string {
  if (days <= 1) return "today";
  if (days <= 3) return "3days";
  if (days <= 7) return "week";
  return "month";
}

/**
 * JSearch (RapidAPI) — aggregates Google for Jobs, which indexes LinkedIn,
 * Indeed, Glassdoor, ZipRecruiter, and direct company postings.
 */
export class JSearchProvider implements JobSourceProvider {
  readonly key = "jsearch" as const;
  readonly available = config.features.jsearch;

  async search(opts: {
    roleKeyword: string;
    city: string;
    region: string;
    country: string;
    remoteOnly: boolean;
    postedWithinDays: number;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<RawPosting[]> {
    const location = [opts.city, opts.region, opts.country].filter(Boolean).join(", ");
    const query = `${opts.roleKeyword} in ${location}`;
    const countryCode = jsearchCountryCode(opts.country);
    const out: RawPosting[] = [];
    const pages = Math.min(MAX_PAGES_PER_QUERY, Math.max(1, Math.ceil(opts.maxResults / 10)));
    let cursor: string | undefined;

    try {
      for (let page = 1; page <= pages; page++) {
      const data = await guardedCall("jsearch", 1, () => {
        opts.onApiCall?.();
        const params = new URLSearchParams({
          query,
          date_posted: datePostedParam(opts.postedWithinDays),
        });
        if (countryCode) params.set("country", countryCode);
        if (opts.remoteOnly) params.set("work_from_home", "true");
        if (cursor) params.set("cursor", cursor);
        return withTimeout(
          (async () => {
            const res = await fetch(`${API_URL}?${params}`, {
              signal: opts.signal,
              headers: {
                "x-rapidapi-key": config.RAPIDAPI_KEY,
                "x-rapidapi-host": "jsearch.p.rapidapi.com",
              },
            });
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              throw new Error(`JSearch HTTP ${res.status}: ${body.slice(0, 300)}`);
            }
            return (await res.json()) as { data?: { jobs?: JSearchJob[]; cursor?: string } };
          })(),
          PAGE_TIMEOUT_MS,
          "jsearch page",
        );
      });

      const jobs = data.data?.jobs ?? [];
      for (const j of jobs) {
        if (out.length >= opts.maxResults) break;
        const mapped = mapJob(j);
        if (mapped) out.push(mapped);
      }
      cursor = data.data?.cursor;
        if (jobs.length === 0 || out.length >= opts.maxResults || !cursor) break;
      }
      return out;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/HTTP 401|HTTP 403|not subscribed|timeout/i.test(message)) throw error;
      const fallback = await searchArbeitnowFallback(opts);
      if (fallback.length > 0) return fallback;
      throw error;
    }
  }
}
