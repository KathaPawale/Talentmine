import type { RawPosting } from "../providers/types";
import type { EmploymentType } from "@shared/types";

/**
 * Extract schema.org JobPosting objects from parsed JSON-LD blocks
 * (https://schema.org/JobPosting — the markup Google for Jobs indexes).
 */

function isJobPostingType(type: unknown): boolean {
  if (typeof type === "string") return type === "JobPosting" || type.endsWith("/JobPosting");
  if (Array.isArray(type)) return type.some((t) => isJobPostingType(t));
  return false;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function mapEmploymentType(v: unknown): EmploymentType | null {
  const s = (Array.isArray(v) ? v[0] : v) as unknown;
  if (typeof s !== "string") return null;
  const u = s.toUpperCase();
  if (u.includes("FULL")) return "full_time";
  if (u.includes("PART")) return "part_time";
  if (u.includes("CONTRACT")) return "contract";
  if (u.includes("INTERN")) return "intern";
  if (u.includes("TEMP")) return "temporary";
  return null;
}

function parseDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface JsonLdLocation {
  city: string | null;
  region: string | null;
  country: string | null;
}

function parseLocation(node: unknown): JsonLdLocation {
  const empty: JsonLdLocation = { city: null, region: null, country: null };
  const loc = Array.isArray(node) ? node[0] : node;
  if (loc === null || typeof loc !== "object") return empty;
  const address = (loc as Record<string, unknown>).address;
  if (address === null || typeof address !== "object") return empty;
  const a = address as Record<string, unknown>;
  return {
    city: str(a.addressLocality),
    region: str(a.addressRegion),
    country: str(a.addressCountry),
  };
}

function parseSalary(node: unknown): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "year" | "month" | "hour" | null;
} {
  const none = { min: null, max: null, currency: null, period: null } as const;
  if (node === null || typeof node !== "object") return { ...none };
  const s = node as Record<string, unknown>;
  const currency = str(s.currency);
  const value = s.value;
  if (value === null || typeof value !== "object") return { ...none, currency };
  const v = value as Record<string, unknown>;
  const unit = str(v.unitText)?.toUpperCase() ?? null;
  const period = unit === "YEAR" ? "year" : unit === "MONTH" ? "month" : unit === "HOUR" ? "hour" : null;
  return {
    min: num(v.minValue) ?? num(v.value),
    max: num(v.maxValue) ?? num(v.value),
    currency,
    period,
  };
}

const MAX_DEPTH = 6;

function walk(node: unknown, out: Record<string, unknown>[], seen: Set<object>, depth: number): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, seen, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (isJobPostingType(obj["@type"])) out.push(obj);
  for (const value of Object.values(obj)) walk(value, out, seen, depth + 1);
}

export function postingsFromJsonLd(
  blocks: unknown[],
  fallback: { companyName: string; sourceUrl: string },
): RawPosting[] {
  const nodes: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  for (const block of blocks) walk(block, nodes, seen, 0);

  const out: RawPosting[] = [];
  for (const node of nodes) {
    const title = str(node.title);
    if (!title) continue;
    const org = node.hiringOrganization;
    const orgName =
      org !== null && typeof org === "object" ? str((org as Record<string, unknown>).name) : null;
    const location = parseLocation(node.jobLocation);
    const salary = parseSalary(node.baseSalary);
    const jobLocationType = str(node.jobLocationType);
    out.push({
      title,
      companyName: orgName ?? fallback.companyName,
      description: str(node.description),
      city: location.city,
      region: location.region,
      country: location.country,
      isRemote: jobLocationType?.toUpperCase() === "TELECOMMUTE",
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      employmentType: mapEmploymentType(node.employmentType),
      postedAt: parseDate(node.datePosted),
      applyUrl: str(node.url) ?? fallback.sourceUrl,
      sourceUrl: fallback.sourceUrl,
      source: "careers_page",
      externalId: str(node.identifier) ?? null,
    });
  }
  return out;
}
