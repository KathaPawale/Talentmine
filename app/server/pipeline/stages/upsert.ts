import { and, eq, sql } from "drizzle-orm";
import { schema } from "../../db/client";
import type { StageContext } from "../types";
import type { RawPosting } from "../../providers/types";
import { dedupeKey, normalizeCompanyName, normalizeDomain } from "../../lib/normalize";
import { postingDedupeKey } from "../../dedupe/postings";
import { canonicalCountry, cleanCity } from "../../lib/locations";
import { roleCategoryFromTitle } from "../../extract/role-normalize";
import { classifyByHeuristic } from "../../extract/recruiter-heuristic";
import { natureOfBusinessLabel } from "@shared/company-profile";
import { newId } from "../../lib/crypto";
import type { SourceRunKey, PostingSource, RoleCategory } from "@shared/types";

/** Insert-or-find a company row for a posting's employer. Returns company id. */
export function upsertCompany(
  ctx: StageContext,
  opts: { name: string; website?: string | null; source: SourceRunKey },
): string {
  const key = dedupeKey({ name: opts.name, website: opts.website });
  const existing = ctx.db
    .select({ id: schema.companies.id, website: schema.companies.website })
    .from(schema.companies)
    .where(and(eq(schema.companies.jobId, ctx.jobId), eq(schema.companies.dedupeKey, key)))
    .get();
  if (existing) {
    // A later source may bring the website a name-only row lacked.
    if (!existing.website && opts.website) {
      ctx.db
        .update(schema.companies)
        .set({ website: opts.website, domain: normalizeDomain(opts.website), updatedAt: new Date() })
        .where(eq(schema.companies.id, existing.id))
        .run();
    }
    return existing.id;
  }
  const id = newId();
  const now = new Date();
  const domain = normalizeDomain(opts.website);
  const exclusion = classifyByHeuristic({ name: opts.name, domain });
  const activity = natureOfBusinessLabel({ name: opts.name, domain });
  ctx.db
    .insert(schema.companies)
    .values({
      id,
      jobId: ctx.jobId,
      userId: ctx.job.userId,
      name: opts.name,
      normalizedName: normalizeCompanyName(opts.name),
      dedupeKey: key,
      website: opts.website ?? null,
      domain,
      natureOfBusiness: activity,
      source: opts.source,
      classification: exclusion ? "staffing_agency" : "unknown",
      classificationConfidence: exclusion?.confidence ?? 0,
      classificationMethod: exclusion ? "heuristic" : null,
      classificationReason: exclusion?.reason ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
  // onConflict race within the same job: re-select to get the winner's id.
  const row = ctx.db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(and(eq(schema.companies.jobId, ctx.jobId), eq(schema.companies.dedupeKey, key)))
    .get();
  return row?.id ?? id;
}

const SNIPPET_LEN = 500;

export function toSnippet(description: string | null | undefined): string {
  if (!description) return "";
  return description.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LEN);
}

/**
 * Insert one raw posting; exact duplicates (same employer+title+location)
 * collapse on the unique dedupe key, recording the extra source in alsoSeenOn.
 * Returns true when a new row was inserted.
 */
export function insertPosting(ctx: StageContext, companyId: string, p: RawPosting): boolean {
  // Canonical location first, so dedupe keys match across sources
  // ("London, UK"/"United Kingdom" from Adzuna == "London"/"GB" from JSearch).
  const country = canonicalCountry(p.country);
  const city = cleanCity(p.city, country);
  const key = postingDedupeKey({
    companyName: p.companyName,
    title: p.title,
    city,
    country,
    isRemote: p.isRemote,
  });
  const now = new Date();
  const res = ctx.db
    .insert(schema.jobPostings)
    .values({
      id: newId(),
      jobId: ctx.jobId,
      companyId,
      userId: ctx.job.userId,
      title: p.title,
      descriptionSnippet: toSnippet(p.description),
      city,
      region: p.region ?? null,
      country,
      isRemote: p.isRemote ?? false,
      salaryMin: p.salaryMin ?? null,
      salaryMax: p.salaryMax ?? null,
      salaryCurrency: p.salaryCurrency ?? null,
      salaryPeriod: p.salaryPeriod ?? null,
      employmentType: p.employmentType ?? null,
      postedAt: p.postedAt ?? null,
      applyUrl: p.applyUrl ?? null,
      sourceUrl: p.sourceUrl ?? null,
      source: p.source,
      externalId: p.externalId ?? null,
      dedupeKey: key,
      alsoSeenOn: [],
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  // Do not expose obvious excluded employers while a run is still in progress.
  // Classification stage remains the deeper pass, but this immediate check
  // closes the window between source ingestion and that later stage.
  const company = ctx.db
    .select({
      name: schema.companies.name,
      domain: schema.companies.domain,
      industry: schema.companies.industry,
      natureOfBusiness: schema.companies.natureOfBusiness,
      classification: schema.companies.classification,
      classificationMethod: schema.companies.classificationMethod,
    })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId))
    .get();
  if (company && company.classification !== "staffing_agency" && company.classificationMethod !== "manual") {
    const exclusion = classifyByHeuristic({
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      natureOfBusiness: company.natureOfBusiness,
      sampleTitles: [p.title],
      sampleDescriptions: p.description ? [p.description] : [],
    });
    const activity = natureOfBusinessLabel({
      ...company,
      descriptionSnippets: p.description ? [p.description] : [],
    });
    const update = {
      natureOfBusiness: activity,
      ...(exclusion
        ? {
            classification: "staffing_agency" as const,
            classificationConfidence: exclusion.confidence,
            classificationMethod: "heuristic" as const,
            classificationReason: exclusion.reason,
          }
        : {}),
      updatedAt: now,
    };
    ctx.db.update(schema.companies).set(update).where(eq(schema.companies.id, companyId)).run();
  }

  if (res.changes === 0) {
    // Same job seen again from another source — record the sighting.
    const existing = ctx.db
      .select({ id: schema.jobPostings.id, source: schema.jobPostings.source, alsoSeenOn: schema.jobPostings.alsoSeenOn })
      .from(schema.jobPostings)
      .where(and(eq(schema.jobPostings.jobId, ctx.jobId), eq(schema.jobPostings.dedupeKey, key)))
      .get();
    if (existing && existing.source !== p.source && !existing.alsoSeenOn.includes(p.source)) {
      ctx.db
        .update(schema.jobPostings)
        .set({ alsoSeenOn: [...existing.alsoSeenOn, p.source] as PostingSource[], updatedAt: now })
        .where(eq(schema.jobPostings.id, existing.id))
        .run();
    }
    return false;
  }
  return true;
}

/** Count non-duplicate postings for the run. */
export function countUniquePostings(ctx: StageContext): number {
  const row = ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(schema.jobPostings)
    .where(and(eq(schema.jobPostings.jobId, ctx.jobId), sql`${schema.jobPostings.duplicateOfId} is null`))
    .get();
  return row?.n ?? 0;
}

/** True when the posting title plausibly matches one of the run's role keywords. */
export function matchesRoleKeywords(title: string, keywords: string[]): boolean {
  const t = title.toLowerCase();
  return keywords.some((kw) => {
    const words = kw.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => t.includes(w));
  });
}

/** Categories close enough to count as the same demand signal. */
const RELATED_CATEGORIES: Partial<Record<RoleCategory, RoleCategory[]>> = {
  accountant: ["finance"],
  finance: ["accountant"],
  it: ["engineering"],
  engineering: ["it"],
};

/** Canonical role categories implied by the run's keywords (e.g. "Accountant" → accountant + finance). */
export function categoriesFromKeywords(keywords: string[]): Set<RoleCategory> {
  const out = new Set<RoleCategory>();
  for (const kw of keywords) {
    const cat = roleCategoryFromTitle(kw);
    if (cat) {
      out.add(cat);
      for (const related of RELATED_CATEGORIES[cat] ?? []) out.add(related);
    }
  }
  return out;
}

/**
 * Unified relevance test: literal keyword match OR same canonical category.
 * Keeps "Management Accountant" for keyword "Accountant" (substring) and
 * "Finance Assistant" for it too (both map to accounting-adjacent categories),
 * while dropping "Account Manager" (maps to sales).
 */
export function matchesRole(title: string, keywords: string[], keywordCategories: Set<RoleCategory>): boolean {
  if (matchesRoleKeywords(title, keywords)) return true;
  if (keywordCategories.size === 0) return false;
  const cat = roleCategoryFromTitle(title);
  return cat !== null && keywordCategories.has(cat);
}
