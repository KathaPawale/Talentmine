import { and, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { schema } from "../../db/client";
import type { StageFn } from "../types";
import { QuotaExceededError } from "../../providers/guard";
import { getSetting } from "../../lib/settings";
import { scrapeCompanyContacts, type ScrapedExecutiveContact } from "../../extract/contact-scrape";
import { normalizeCompanyName, normalizeDomain, normalizePhone } from "../../lib/normalize";
import { classifyByHeuristic } from "../../extract/recruiter-heuristic";
import { natureOfBusinessLabel } from "@shared/company-profile";
import { newId } from "../../lib/crypto";
import type { StageContext } from "../types";
import {
  executiveRolePriority,
  extractJobPosterNames,
  isExcludedJobPoster,
  normalizePersonIdentity,
  type EmailVerificationStatus,
} from "@shared/executive-contact";

const MAX_PLACES_ENRICH = 30;
const MAX_CONTACT_SCRAPE = 100;
const SCRAPE_CONCURRENCY = 5;

/** Employers eligible for contact work: confirmed direct + unclassified. */
const SCRAPE_CLASSIFICATIONS = ["direct_employer", "unknown"] as const;

const VERIFICATION_RANK: Record<EmailVerificationStatus, number> = {
  unavailable: 0,
  pattern_based_guess: 1,
  publicly_confirmed: 2,
  verified: 3,
};

function executiveDedupeKey(name: string): string {
  return `person:${normalizePersonIdentity(name)}`;
}

function upsertExecutiveContact(
  ctx: StageContext,
  company: { id: string; jobId: string; userId: string },
  contact: ScrapedExecutiveContact & { verifiedAt?: Date | null },
  rank: number,
  excludedNames: ReadonlySet<string> = new Set(),
): boolean {
  if (isExcludedJobPoster(contact.name, excludedNames)) return false;
  const dedupeKey = executiveDedupeKey(contact.name);
  const existing = ctx.db
    .select()
    .from(schema.executiveContacts)
    .where(eq(schema.executiveContacts.companyId, company.id))
    .all()
    .find((row) => normalizePersonIdentity(row.name) === normalizePersonIdentity(contact.name));
  const now = new Date();
  if (existing) {
    const preferPrimary = VERIFICATION_RANK[contact.primaryEmailStatus] > VERIFICATION_RANK[existing.primaryEmailStatus];
    const betterTitle = (executiveRolePriority(contact.title) ?? 999) < (executiveRolePriority(existing.title) ?? 999);
    const alternateEmail = existing.alternateEmail
      ?? (preferPrimary ? existing.primaryEmail : contact.primaryEmail !== existing.primaryEmail ? contact.primaryEmail : contact.alternateEmail);
    const alternateEmailStatus = existing.alternateEmail
      ? existing.alternateEmailStatus
      : preferPrimary && existing.primaryEmail
        ? existing.primaryEmailStatus
        : contact.primaryEmail !== existing.primaryEmail && contact.primaryEmail
          ? contact.primaryEmailStatus
          : contact.alternateEmailStatus;
    const alternatePhone = existing.alternatePhone
      ?? (contact.primaryPhone && contact.primaryPhone !== existing.primaryPhone ? contact.primaryPhone : contact.alternatePhone);
    ctx.db
      .update(schema.executiveContacts)
      .set({
        rank: Math.min(existing.rank, rank),
        title: betterTitle ? contact.title : existing.title,
        linkedinUrl: existing.linkedinUrl ?? contact.linkedinUrl,
        primaryEmail: preferPrimary ? contact.primaryEmail : existing.primaryEmail,
        primaryEmailStatus: preferPrimary ? contact.primaryEmailStatus : existing.primaryEmailStatus,
        alternateEmail,
        alternateEmailStatus,
        primaryPhone: existing.primaryPhone ?? contact.primaryPhone,
        alternatePhone,
        sourceUrl: preferPrimary ? contact.sourceUrl ?? existing.sourceUrl : existing.sourceUrl ?? contact.sourceUrl,
        verificationStatus:
          VERIFICATION_RANK[contact.verificationStatus] > VERIFICATION_RANK[existing.verificationStatus]
            ? contact.verificationStatus
            : existing.verificationStatus,
        confidenceScore: Math.max(existing.confidenceScore, contact.confidenceScore),
        verifiedAt: contact.verifiedAt ?? existing.verifiedAt ?? now,
        updatedAt: now,
      })
      .where(eq(schema.executiveContacts.id, existing.id))
      .run();
    return false;
  }

  const count = ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(schema.executiveContacts)
    .where(eq(schema.executiveContacts.companyId, company.id))
    .get()?.n ?? 0;
  if (count >= 3) return false;
  ctx.db
    .insert(schema.executiveContacts)
    .values({
      id: newId(),
      companyId: company.id,
      jobId: company.jobId,
      userId: company.userId,
      rank,
      dedupeKey,
      name: contact.name,
      title: contact.title,
      linkedinUrl: contact.linkedinUrl,
      primaryEmail: contact.primaryEmail,
      primaryEmailStatus: contact.primaryEmailStatus,
      alternateEmail: contact.alternateEmail,
      alternateEmailStatus: contact.alternateEmailStatus,
      primaryPhone: normalizePhone(contact.primaryPhone),
      alternatePhone: normalizePhone(contact.alternatePhone),
      sourceUrl: contact.sourceUrl,
      verificationStatus: contact.verificationStatus,
      confidenceScore: Math.max(0, Math.min(100, Math.round(contact.confidenceScore))),
      verifiedAt: contact.verifiedAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return true;
}

/**
 * Guard against Places returning an unrelated business for a name lookup:
 * require at least one meaningful token shared between the names.
 */
export function namesRoughlyMatch(companyName: string, placeName: string): boolean {
  const tokens = (s: string) => new Set(normalizeCompanyName(s).split(" ").filter((t) => t.length > 2));
  const a = tokens(companyName);
  const b = tokens(placeName);
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * Stage 6: contact enrichment in four sub-steps.
 * (1) Resolve websites for name-only employers via Places (the big coverage lever).
 * (2) Contact-scrape every direct/unknown employer site (homepage + contact/about pages).
 * (3) Hunter.io fallback for sites that publish no email (tiny monthly quota).
 * (4) Optional Places address details (enrichCompanies toggle), as before.
 */
export const enrichStage: StageFn = async (ctx) => {
  const cfg = ctx.job.config;
  const hasPostings = sql`exists (select 1 from job_postings jp where jp.company_id = ${schema.companies.id} and jp.duplicate_of_id is null)`;
  const places = ctx.providers.discovery.find((p) => p.available);

  // ---- (1) website resolution for name-only employers ----
  let resolved = 0;
  if (places) {
    const resolveCap = getSetting("enrich.resolve_websites_per_run") as number;
    const nameOnly = ctx.db
      .select()
      .from(schema.companies)
      .where(
        and(
          eq(schema.companies.jobId, ctx.jobId),
          inArray(schema.companies.classification, [...SCRAPE_CLASSIFICATIONS]),
          isNull(schema.companies.domain),
          hasPostings,
        ),
      )
      .orderBy(desc(schema.companies.postingsCount))
      .limit(resolveCap)
      .all();

    if (nameOnly.length > 0) {
      ctx.emit("info", `Resolving websites for ${nameOnly.length} name-only employers via Google Places…`);
      for (const company of nameOnly) {
        ctx.checkCancelled();
        try {
          const location =
            [company.city, company.country].filter(Boolean).join(", ") ||
            [cfg.city, cfg.region, cfg.country].filter(Boolean).join(", ");
          const results = await places.discover({
            industry: company.name,
            location,
            maxResults: 1,
            signal: ctx.signal,
          });
          const hit = results[0];
          if (hit && namesRoughlyMatch(company.name, hit.name)) {
            ctx.db
              .update(schema.companies)
              .set({
                website: company.website ?? hit.website ?? null,
                domain: normalizeDomain(hit.website),
                address: company.address ?? hit.address ?? null,
                city: company.city ?? hit.city ?? null,
                region: company.region ?? hit.region ?? null,
                country: company.country ?? hit.country ?? null,
                postalCode: company.postalCode ?? hit.postalCode ?? null,
                phone: company.phone ?? hit.phone ?? null,
                lat: company.lat ?? hit.lat ?? null,
                lng: company.lng ?? hit.lng ?? null,
                rating: hit.rating ?? null,
                reviewCount: hit.reviewCount ?? null,
                placeId: hit.placeId ?? null,
                updatedAt: new Date(),
              })
              .where(eq(schema.companies.id, company.id))
              .run();
            if (hit.website) resolved++;
          }
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            ctx.emit("warn", "Google Places quota exhausted — stopping website resolution.");
            break;
          }
          ctx.emit("warn", `Website lookup failed for ${company.name}: ${err instanceof Error ? err.message : err}`);
        }
        ctx.heartbeat();
      }
      ctx.emit("success", `Website resolution: ${resolved} of ${nameOnly.length} employers now have a site to scrape.`);
    }
  } else if (!places) {
    ctx.emit("warn", "Google Places key missing — cannot resolve websites for name-only employers.");
  }

  // ---- (2) contact scrape (direct + unknown employers) ----
  const scrapeTargets = ctx.db
    .select()
    .from(schema.companies)
    .where(
      and(
        eq(schema.companies.jobId, ctx.jobId),
        eq(schema.companies.contactStatus, "pending"),
        inArray(schema.companies.classification, [...SCRAPE_CLASSIFICATIONS]),
        isNotNull(schema.companies.domain),
        hasPostings,
      ),
    )
    .orderBy(desc(schema.companies.postingsCount))
    .limit(MAX_CONTACT_SCRAPE)
    .all();

  ctx.db
    .update(schema.companies)
    .set({ contactStatus: "skipped", updatedAt: new Date() })
    .where(
      and(
        eq(schema.companies.jobId, ctx.jobId),
        eq(schema.companies.contactStatus, "pending"),
        isNull(schema.companies.domain),
      ),
    )
    .run();

  let scraped = 0;
  let emailsFound = 0;
  let personsFound = 0;

  if (scrapeTargets.length > 0) {
    ctx.emit("info", `Scraping contact details from ${scrapeTargets.length} employer websites…`);
    const limit = pLimit(SCRAPE_CONCURRENCY);
    let done = 0;
    await Promise.all(
      scrapeTargets.map((company) =>
        limit(async () => {
          ctx.checkCancelled();
          const contact = await scrapeCompanyContacts({
            fetcher: ctx.providers.fetcher,
            domain: company.domain!,
            website: company.website,
            excludedNames: ctx.db
              .select({ description: schema.jobPostings.descriptionSnippet })
              .from(schema.jobPostings)
              .where(eq(schema.jobPostings.companyId, company.id))
              .all()
              .flatMap((posting) => extractJobPosterNames(posting.description)),
            signal: ctx.signal,
          });
          const rawNature = contact.natureOfBusiness ?? company.natureOfBusiness ?? company.industry;
          const activity = natureOfBusinessLabel({ ...company, natureOfBusiness: rawNature });
          const exclusion = classifyByHeuristic({
            name: company.name,
            domain: company.domain,
            industry: company.industry,
            natureOfBusiness: rawNature,
          });
          const shouldExclude = Boolean(exclusion && company.classificationMethod !== "manual");
          const exclusionUpdate =
            shouldExclude && exclusion
              ? {
                  classification: "staffing_agency" as const,
                  classificationConfidence: exclusion.confidence,
                  classificationMethod: "heuristic" as const,
                  classificationReason: exclusion.reason,
                }
              : {};
          ctx.db
            .update(schema.companies)
            .set({
              contactEmail: contact.executives[0]?.primaryEmail ?? null,
              contactName: contact.personName,
              contactTitle: contact.personTitle,
              natureOfBusiness: activity,
              linkedinUrl: contact.companyLinkedinUrl ?? company.linkedinUrl,
              executiveName: contact.executiveName,
              executiveTitle: contact.executiveTitle,
              executiveLinkedinUrl: contact.executiveLinkedinUrl,
              contactSource: contact.executives[0]?.primaryEmail ? "scrape" : null,
              phone: company.phone ?? contact.phone,
              contactStatus:
                contact.executives.length > 0 || contact.email !== null || contact.phone !== null ? "done" : "failed",
              ...exclusionUpdate,
              updatedAt: new Date(),
            })
            .where(eq(schema.companies.id, company.id))
            .run();
          if (!shouldExclude) {
            contact.executives.forEach((executive, index) => {
              upsertExecutiveContact(ctx, company, executive, index + 1);
            });
          }
          scraped++;
          emailsFound += contact.executives.filter((executive) => executive.primaryEmail).length;
          personsFound += shouldExclude ? 0 : contact.executives.length;
          done++;
          ctx.reportItems(done, scrapeTargets.length);
          ctx.heartbeat();
        }),
      ),
    );
    ctx.emit(
      "success",
      `Executive discovery complete: ${personsFound} senior decision-makers and ${emailsFound} person-specific emails found across ${scraped} employer sites.`,
    );
  } else {
    ctx.emit("info", "No employer websites to scrape for contact details.");
  }

  // ---- (3) Identity-based email enrichment, then domain fallback ----
  const hunter = ctx.providers.contactLookup;
  if (hunter.available) {
    const hunterCap = getSetting("enrich.hunter_per_run") as number;
    let hunterLookupsRemaining = hunterCap;
    let linkedInEmailsFound = 0;

    // Highest-confidence path: a leadership page identified the exact person
    // and LinkedIn profile. Use that handle to find the same person's verified
    // work email instead of selecting an unrelated contact from a domain list.
    const linkedInTargets = ctx.db
      .select({
        contact: schema.executiveContacts,
        companyDomain: schema.companies.domain,
        companyId: schema.companies.id,
        companyJobId: schema.companies.jobId,
        companyUserId: schema.companies.userId,
      })
      .from(schema.executiveContacts)
      .innerJoin(schema.companies, eq(schema.executiveContacts.companyId, schema.companies.id))
      .where(
        and(
          eq(schema.executiveContacts.jobId, ctx.jobId),
          isNotNull(schema.executiveContacts.linkedinUrl),
          isNull(schema.executiveContacts.primaryEmail),
          isNotNull(schema.companies.domain),
          inArray(schema.companies.classification, [...SCRAPE_CLASSIFICATIONS]),
        ),
      )
      .orderBy(schema.executiveContacts.rank)
      .limit(hunterCap)
      .all();

    for (const target of linkedInTargets) {
      if (hunterLookupsRemaining <= 0) break;
      ctx.checkCancelled();
      const excludedNames = new Set(
        ctx.db
          .select({ description: schema.jobPostings.descriptionSnippet })
          .from(schema.jobPostings)
          .where(eq(schema.jobPostings.companyId, target.companyId))
          .all()
          .flatMap((posting) => extractJobPosterNames(posting.description)),
      );
          if (isExcludedJobPoster(target.contact.name, excludedNames)) continue;
      hunterLookupsRemaining--;
      const hit = await hunter.findPerson({
        domain: target.companyDomain!,
        name: target.contact.name,
        title: target.contact.title,
        linkedinUrl: target.contact.linkedinUrl,
        signal: ctx.signal,
      });
      if (!hit) continue;
      upsertExecutiveContact(
        ctx,
        { id: target.companyId, jobId: target.companyJobId, userId: target.companyUserId },
        {
          name: target.contact.name,
          title: hit.position ?? target.contact.title,
          linkedinUrl: hit.linkedinUrl ?? target.contact.linkedinUrl,
          primaryEmail: hit.email,
          primaryEmailStatus: hit.emailStatus,
          alternateEmail: null,
          alternateEmailStatus: "unavailable",
          primaryPhone: hit.phone,
          alternatePhone: null,
          sourceUrl: hit.sourceUrl ?? target.contact.linkedinUrl,
          verificationStatus: hit.emailStatus,
          confidenceScore: hit.confidence ?? (hit.emailStatus === "verified" ? 90 : 70),
          verifiedAt: hit.verifiedAt ?? new Date(),
        },
        target.contact.rank,
        excludedNames,
      );
      if (target.contact.rank === 1) {
        ctx.db
          .update(schema.companies)
          .set({
            contactEmail: hit.email,
            contactName: target.contact.name,
            contactTitle: hit.position ?? target.contact.title,
            executiveName: target.contact.name,
            executiveTitle: hit.position ?? target.contact.title,
            executiveLinkedinUrl: hit.linkedinUrl ?? target.contact.linkedinUrl,
            contactSource: "hunter",
            contactStatus: "done",
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, target.companyId))
          .run();
      }
      linkedInEmailsFound++;
      ctx.heartbeat();
    }
    if (linkedInTargets.length > 0) {
      ctx.emit(
        "success",
        `LinkedIn identity enrichment: ${linkedInEmailsFound} verified/publicly confirmed executive emails found from ${Math.min(linkedInTargets.length, hunterCap)} exact-person lookups.`,
      );
    }

    const incomplete = ctx.db
      .select()
      .from(schema.companies)
      .where(
        and(
          eq(schema.companies.jobId, ctx.jobId),
          inArray(schema.companies.classification, [...SCRAPE_CLASSIFICATIONS]),
          isNotNull(schema.companies.domain),
          inArray(schema.companies.contactStatus, ["done", "failed"]),
          sql`(select count(*) from executive_contacts ec where ec.company_id = ${schema.companies.id}) < 3`,
          hasPostings,
        ),
      )
      .orderBy(desc(schema.companies.postingsCount))
      .limit(hunterLookupsRemaining)
      .all();

    let hunterHits = 0;
    for (const company of incomplete) {
      ctx.checkCancelled();
      if (hunterLookupsRemaining <= 0) break;
      const excludedNames = new Set(
        ctx.db
          .select({ description: schema.jobPostings.descriptionSnippet })
          .from(schema.jobPostings)
          .where(eq(schema.jobPostings.companyId, company.id))
          .all()
          .flatMap((posting) => extractJobPosterNames(posting.description)),
      );
      hunterLookupsRemaining--;
      const hits = await hunter.domainSearch(company.domain!, ctx.signal);
      const existingCount = ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.executiveContacts)
        .where(eq(schema.executiveContacts.companyId, company.id))
        .get()?.n ?? 0;
      for (const [index, hit] of hits.entries()) {
        const name = [hit.firstName, hit.lastName].filter(Boolean).join(" ").trim();
        if (!name || !hit.position) continue;
        const inserted = upsertExecutiveContact(
          ctx,
          company,
          {
            name,
            title: hit.position,
            linkedinUrl: hit.linkedinUrl,
            primaryEmail: hit.email,
            primaryEmailStatus: hit.emailStatus,
            alternateEmail: null,
            alternateEmailStatus: "unavailable",
            primaryPhone: hit.phone,
            alternatePhone: null,
            sourceUrl: hit.sourceUrl ?? `https://hunter.io/search/${encodeURIComponent(company.domain!)}`,
            verificationStatus: hit.emailStatus,
            confidenceScore: hit.confidence ?? (hit.emailStatus === "verified" ? 90 : 60),
            verifiedAt: hit.verifiedAt ?? new Date(),
          },
          existingCount + index + 1,
          excludedNames,
        );
        if (inserted) hunterHits++;
      }
      const top = ctx.db
        .select()
        .from(schema.executiveContacts)
        .where(eq(schema.executiveContacts.companyId, company.id))
        .orderBy(schema.executiveContacts.rank)
        .limit(1)
        .get();
      if (top) {
        ctx.db
          .update(schema.companies)
          .set({
            contactEmail: top.primaryEmail,
            contactName: top.name,
            contactTitle: top.title,
            executiveName: top.name,
            executiveTitle: top.title,
            executiveLinkedinUrl: top.linkedinUrl,
            contactSource: top.primaryEmail ? "hunter" : company.contactSource,
            contactStatus: "done",
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, company.id))
          .run();
      }
      ctx.heartbeat();
    }
    if (incomplete.length > 0) {
      ctx.emit("success", `Hunter fallback: ${hunterHits} additional named executive contacts found for ${incomplete.length} employers.`);
    }
  }

  // ---- (4) optional Places address details for companies that already had domains ----
  if (!cfg.enrichCompanies) {
    ctx.emit("info", "Places address enrichment not requested — skipping.");
    return { itemsIn: scrapeTargets.length, itemsOut: scraped };
  }
  if (!places) return { itemsIn: scrapeTargets.length, itemsOut: scraped };

  const placesTargets = ctx.db
    .select()
    .from(schema.companies)
    .where(
      and(
        eq(schema.companies.jobId, ctx.jobId),
        eq(schema.companies.classification, "direct_employer"),
        isNull(schema.companies.placeId),
        hasPostings,
      ),
    )
    .limit(MAX_PLACES_ENRICH)
    .all();

  let enriched = 0;
  for (const company of placesTargets) {
    ctx.checkCancelled();
    try {
      const location = [company.city, company.country ?? cfg.country].filter(Boolean).join(", ");
      const results = await places.discover({
        industry: company.name,
        location: location || cfg.country,
        maxResults: 1,
        signal: ctx.signal,
      });
      const hit = results[0];
      if (hit && namesRoughlyMatch(company.name, hit.name)) {
        ctx.db
          .update(schema.companies)
          .set({
            address: company.address ?? hit.address ?? null,
            city: company.city ?? hit.city ?? null,
            region: company.region ?? hit.region ?? null,
            country: company.country ?? hit.country ?? null,
            postalCode: company.postalCode ?? hit.postalCode ?? null,
            phone: company.phone ?? hit.phone ?? null,
            lat: company.lat ?? hit.lat ?? null,
            lng: company.lng ?? hit.lng ?? null,
            rating: hit.rating ?? null,
            reviewCount: hit.reviewCount ?? null,
            placeId: hit.placeId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, company.id))
          .run();
        enriched++;
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        ctx.emit("warn", "Google Places quota exhausted — stopping address enrichment.");
        break;
      }
      ctx.emit("warn", `Places enrichment failed for ${company.name}: ${err instanceof Error ? err.message : err}`);
    }
    ctx.heartbeat();
  }
  ctx.emit("success", `Places address enrichment complete: ${enriched} of ${placesTargets.length} employers enriched.`);
  return { itemsIn: scrapeTargets.length + placesTargets.length, itemsOut: scraped + enriched };
};
