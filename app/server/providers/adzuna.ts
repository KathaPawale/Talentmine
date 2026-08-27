import { config } from "../config";
import { withTimeout } from "../lib/with-timeout";
import { guardedCall } from "./guard";
import { adzunaCountryCode } from "@shared/types";
import type { JobSourceProvider, RawPosting } from "./types";
import type { EmploymentType } from "@shared/types";

const PAGE_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 50;
const MAX_PAGES_PER_QUERY = 4;

interface AdzunaJob {
  id?: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  contract_time?: string | null; // full_time | part_time
  contract_type?: string | null; // permanent | contract
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

/** Currency by Adzuna country code — the API reports salaries in local currency. */
const CURRENCY: Record<string, string> = {
  ae: "AED", au: "AUD", at: "EUR", be: "EUR", br: "BRL", ca: "CAD", ch: "CHF", de: "EUR",
  es: "EUR", fr: "EUR", gb: "GBP", in: "INR", it: "EUR", mx: "MXN", nl: "EUR",
  nz: "NZD", pl: "PLN", sg: "SGD", us: "USD", za: "ZAR",
};

function mapEmployment(j: AdzunaJob): EmploymentType | null {
  if (j.contract_time === "part_time") return "part_time";
  if (j.contract_type === "contract") return "contract";
  if (j.contract_time === "full_time") return "full_time";
  return null;
}

function mapJob(j: AdzunaJob, countryCode: string, countryName: string): RawPosting | null {
  const title = j.title?.replace(/<\/?[^>]+>/g, "").trim();
  const companyName = j.company?.display_name?.trim();
  if (!title || !companyName) return null;
  // area is [country, region, city, ...] from broadest to narrowest
  const area = j.location?.area ?? [];
  return {
    title,
    companyName,
    description: j.description?.replace(/<\/?[^>]+>/g, "") ?? null,
    city: area.at(-1) && area.length > 2 ? area.at(-1) : (j.location?.display_name ?? null),
    region: area[1] ?? null,
    country: countryName,
    isRemote: /remote|work from home/i.test(`${title} ${j.description ?? ""}`),
    salaryMin: j.salary_min ?? null,
    salaryMax: j.salary_max ?? null,
    salaryCurrency: j.salary_min || j.salary_max ? (CURRENCY[countryCode] ?? null) : null,
    salaryPeriod: j.salary_min || j.salary_max ? "year" : null,
    employmentType: mapEmployment(j),
    postedAt: j.created ? new Date(j.created) : null,
    applyUrl: j.redirect_url ?? null,
    sourceUrl: j.redirect_url ?? null,
    source: "adzuna",
    externalId: j.id ?? null,
  };
}

export class AdzunaProvider implements JobSourceProvider {
  readonly key = "adzuna" as const;
  readonly available = config.features.adzuna;

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
    const cc = adzunaCountryCode(opts.country);
    if (!cc) {
      throw new Error(`Adzuna does not cover "${opts.country}" — supported countries only`);
    }

    const out: RawPosting[] = [];
    const pages = Math.min(MAX_PAGES_PER_QUERY, Math.max(1, Math.ceil(opts.maxResults / PAGE_SIZE)));
    const where = [opts.city, opts.region].filter(Boolean).join(", ");

    for (let page = 1; page <= pages; page++) {
      const data = await guardedCall("adzuna", 1, () => {
        opts.onApiCall?.();
        const params = new URLSearchParams({
          app_id: config.ADZUNA_APP_ID,
          app_key: config.ADZUNA_APP_KEY,
          results_per_page: String(PAGE_SIZE),
          what: opts.remoteOnly ? `${opts.roleKeyword} remote` : opts.roleKeyword,
          max_days_old: String(opts.postedWithinDays),
          "content-type": "application/json",
        });
        if (where) params.set("where", where);
        const url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/${page}?${params}`;
        return withTimeout(
          (async () => {
            const res = await fetch(url, { signal: opts.signal });
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              throw new Error(`Adzuna HTTP ${res.status}: ${body.slice(0, 300)}`);
            }
            return (await res.json()) as { results?: AdzunaJob[] };
          })(),
          PAGE_TIMEOUT_MS,
          "adzuna page",
        );
      });

      const jobs = data.results ?? [];
      for (const j of jobs) {
        if (out.length >= opts.maxResults) break;
        const mapped = mapJob(j, cc, opts.country);
        if (mapped) out.push(mapped);
      }
      if (jobs.length < PAGE_SIZE || out.length >= opts.maxResults) break;
    }
    return out;
  }
}
