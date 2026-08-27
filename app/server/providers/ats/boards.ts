import type { RawPosting } from "../types";

/**
 * Public, keyless JSON endpoints of the six supported ATS platforms. Each
 * fetcher returns null when the slug doesn't exist (404/no jobs) and a parsed
 * posting list when it does. Parsers are exported for fixture tests.
 */

export type AtsKind = "greenhouse" | "lever" | "workable" | "smartrecruiters" | "recruitee" | "ashby";

const FETCH_TIMEOUT_MS = 15_000;

async function getJson(url: string, signal: AbortSignal, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function splitLocation(loc: string | null | undefined): {
  city: string | null;
  region: string | null;
  country: string | null;
  isRemote: boolean;
} {
  const raw = (loc ?? "").trim();
  const isRemote = /remote/i.test(raw);
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/remote/i.test(s));
  return {
    city: parts[0] ?? null,
    region: parts.length === 3 ? (parts[1] ?? null) : null,
    country: parts.length > 1 ? (parts.at(-1) ?? null) : null,
    isRemote,
  };
}

// ---------- Greenhouse ----------
export function parseGreenhouse(data: unknown, companyName: string): RawPosting[] | null {
  const jobs = (data as { jobs?: unknown[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  const out: RawPosting[] = [];
  for (const raw of jobs) {
    const j = raw as {
      id?: number;
      title?: string;
      absolute_url?: string;
      updated_at?: string;
      location?: { name?: string };
      content?: string;
    };
    if (!j.title) continue;
    const loc = splitLocation(j.location?.name);
    out.push({
      title: j.title,
      companyName,
      description: j.content ? decodeEntities(j.content).replace(/<\/?[^>]+>/g, "") : null,
      ...loc,
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
      applyUrl: j.absolute_url ?? null,
      sourceUrl: j.absolute_url ?? null,
      source: "ats_greenhouse",
      externalId: j.id != null ? String(j.id) : null,
    });
  }
  return out;
}

export async function fetchGreenhouse(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, signal);
  return data === null ? null : parseGreenhouse(data, companyName);
}

// ---------- Lever ----------
export function parseLever(data: unknown, companyName: string): RawPosting[] | null {
  if (!Array.isArray(data)) return null;
  const out: RawPosting[] = [];
  for (const raw of data) {
    const j = raw as {
      id?: string;
      text?: string;
      hostedUrl?: string;
      createdAt?: number;
      categories?: { location?: string; commitment?: string };
      descriptionPlain?: string;
      workplaceType?: string;
    };
    if (!j.text) continue;
    const loc = splitLocation(j.categories?.location);
    out.push({
      title: j.text,
      companyName,
      description: j.descriptionPlain ?? null,
      ...loc,
      isRemote: loc.isRemote || j.workplaceType === "remote",
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
      applyUrl: j.hostedUrl ?? null,
      sourceUrl: j.hostedUrl ?? null,
      source: "ats_lever",
      externalId: j.id ?? null,
    });
  }
  return out;
}

export async function fetchLever(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`, signal);
  return data === null ? null : parseLever(data, companyName);
}

// ---------- Workable ----------
export function parseWorkable(data: unknown, companyName: string): RawPosting[] | null {
  const jobs = (data as { jobs?: unknown[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  const out: RawPosting[] = [];
  for (const raw of jobs) {
    const j = raw as {
      shortcode?: string;
      title?: string;
      url?: string;
      published_on?: string;
      city?: string;
      state?: string;
      country?: string;
      telecommuting?: boolean;
      employment_type?: string;
    };
    if (!j.title) continue;
    out.push({
      title: j.title,
      companyName,
      city: j.city ?? null,
      region: j.state ?? null,
      country: j.country ?? null,
      isRemote: j.telecommuting ?? false,
      employmentType: /full/i.test(j.employment_type ?? "") ? "full_time" : /part/i.test(j.employment_type ?? "") ? "part_time" : null,
      postedAt: j.published_on ? new Date(j.published_on) : null,
      applyUrl: j.url ?? null,
      sourceUrl: j.url ?? null,
      source: "ats_workable",
      externalId: j.shortcode ?? null,
    });
  }
  return out;
}

export async function fetchWorkable(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, signal);
  return data === null ? null : parseWorkable(data, companyName);
}

// ---------- SmartRecruiters ----------
export function parseSmartRecruiters(data: unknown, companyName: string): RawPosting[] | null {
  const content = (data as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(content)) return null;
  const out: RawPosting[] = [];
  for (const raw of content) {
    const j = raw as {
      id?: string;
      name?: string;
      releasedDate?: string;
      location?: { city?: string; region?: string; country?: string; remote?: boolean };
      ref?: string;
      applyUrl?: string;
    };
    if (!j.name) continue;
    out.push({
      title: j.name,
      companyName,
      city: j.location?.city ?? null,
      region: j.location?.region ?? null,
      country: j.location?.country?.toUpperCase() ?? null,
      isRemote: j.location?.remote ?? false,
      postedAt: j.releasedDate ? new Date(j.releasedDate) : null,
      applyUrl: j.applyUrl ?? j.ref ?? null,
      sourceUrl: j.ref ?? null,
      source: "ats_smartrecruiters",
      externalId: j.id ?? null,
    });
  }
  return out;
}

export async function fetchSmartRecruiters(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings`, signal);
  return data === null ? null : parseSmartRecruiters(data, companyName);
}

// ---------- Recruitee ----------
export function parseRecruitee(data: unknown, companyName: string): RawPosting[] | null {
  const offers = (data as { offers?: unknown[] } | null)?.offers;
  if (!Array.isArray(offers)) return null;
  const out: RawPosting[] = [];
  for (const raw of offers) {
    const j = raw as {
      id?: number;
      title?: string;
      careers_url?: string;
      created_at?: string;
      city?: string;
      state_name?: string;
      country?: string;
      remote?: boolean;
      employment_type_code?: string;
    };
    if (!j.title) continue;
    out.push({
      title: j.title,
      companyName,
      city: j.city ?? null,
      region: j.state_name ?? null,
      country: j.country ?? null,
      isRemote: j.remote ?? false,
      employmentType: j.employment_type_code === "fulltime" ? "full_time" : j.employment_type_code === "parttime" ? "part_time" : null,
      postedAt: j.created_at ? new Date(j.created_at) : null,
      applyUrl: j.careers_url ?? null,
      sourceUrl: j.careers_url ?? null,
      source: "ats_recruitee",
      externalId: j.id != null ? String(j.id) : null,
    });
  }
  return out;
}

export async function fetchRecruitee(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://${slug}.recruitee.com/api/offers/`, signal);
  return data === null ? null : parseRecruitee(data, companyName);
}

// ---------- Ashby ----------
export function parseAshby(data: unknown, companyName: string): RawPosting[] | null {
  const jobs = (data as { jobs?: unknown[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  const out: RawPosting[] = [];
  for (const raw of jobs) {
    const j = raw as {
      id?: string;
      title?: string;
      location?: string;
      jobUrl?: string;
      publishedAt?: string;
      isRemote?: boolean;
      employmentType?: string;
    };
    if (!j.title) continue;
    const loc = splitLocation(j.location);
    out.push({
      title: j.title,
      companyName,
      ...loc,
      isRemote: loc.isRemote || (j.isRemote ?? false),
      employmentType: /full/i.test(j.employmentType ?? "") ? "full_time" : null,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      applyUrl: j.jobUrl ?? null,
      sourceUrl: j.jobUrl ?? null,
      source: "ats_ashby",
      externalId: j.id ?? null,
    });
  }
  return out;
}

export async function fetchAshby(slug: string, companyName: string, signal: AbortSignal): Promise<RawPosting[] | null> {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, signal);
  return data === null ? null : parseAshby(data, companyName);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export const ATS_FETCHERS: Record<
  AtsKind,
  (slug: string, companyName: string, signal: AbortSignal) => Promise<RawPosting[] | null>
> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  workable: fetchWorkable,
  smartrecruiters: fetchSmartRecruiters,
  recruitee: fetchRecruitee,
  ashby: fetchAshby,
};
