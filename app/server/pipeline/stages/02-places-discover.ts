import { and, eq } from "drizzle-orm";
import { schema } from "../../db/client";
import type { StageFn } from "../types";
import type { DiscoveredCompany } from "../../providers/types";
import { dedupeKey, normalizeCompanyName, normalizeDomain } from "../../lib/normalize";
import { newId } from "../../lib/crypto";
import { withTimeout } from "../../lib/with-timeout";
import { QuotaExceededError } from "../../providers/guard";

const PER_QUERY_TIMEOUT_MS = 5 * 60_000;
/** Places textSearch tops out at 60 results (3 pages) per query. */
const PROVIDER_RESULT_CEILING = 60;

/**
 * Stage 2: only when the "ats" source is on — discover companies (with
 * websites) in the target location via Google Places so stage 3 can mine their
 * career sites. Industries seed the queries; without industries we search for
 * generic employers of the requested roles.
 */
export const placesDiscoverStage: StageFn = async (ctx) => {
  const cfg = ctx.job.config;
  if (!cfg.sources.includes("ats")) {
    ctx.emit("info", "Career-site mining not selected — skipping company discovery.");
    return { skipped: 1 };
  }
  const provider = ctx.providers.discovery.find((p) => p.available);
  if (!provider) {
    ctx.emit("warn", "Google Places key missing — career-site mining will only use companies already found on job boards.");
    return { itemsIn: 0, itemsOut: 0 };
  }

  const location = [cfg.city, cfg.region, cfg.country].filter(Boolean).join(", ");
  const queries = cfg.industries.length > 0 ? cfg.industries : cfg.roleKeywords.map((r) => `${r} companies`);
  const maxPerQuery = Math.min(PROVIDER_RESULT_CEILING, Math.ceil(cfg.targetCount / queries.length));

  let seen = 0;
  let inserted = 0;
  let unitsDone = 0;

  for (const industry of queries) {
    ctx.checkCancelled();
    const runId = newId();
    ctx.db
      .insert(schema.sourceRuns)
      .values({ id: runId, jobId: ctx.jobId, source: "places", query: `${industry} in ${location}`, startedAt: new Date() })
      .run();

    let results: DiscoveredCompany[] = [];
    let error: string | null = null;
    let apiCalls = 0;
    try {
      ctx.emit("info", `Discovering companies: "${industry}" in ${location}…`);
      results = await withTimeout(
        provider.discover({
          industry,
          location,
          maxResults: maxPerQuery,
          signal: ctx.signal,
          onApiCall: () => {
            apiCalls++;
          },
        }),
        PER_QUERY_TIMEOUT_MS,
        "places discover",
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (err instanceof QuotaExceededError) {
        ctx.emit("warn", `Google Places quota exhausted — stopping company discovery.`);
      } else {
        ctx.emit("warn", `Places discovery failed for "${industry}": ${error}`);
      }
    } finally {
      ctx.db
        .update(schema.sourceRuns)
        .set({ status: error ? "failed" : "completed", itemsFound: results.length, apiCalls, finishedAt: new Date(), error })
        .where(eq(schema.sourceRuns.id, runId))
        .run();
    }

    seen += results.length;
    const now = new Date();
    for (const c of results) {
      const key = dedupeKey({ name: c.name, website: c.website, phone: c.phone, city: c.city });
      const res = ctx.db
        .insert(schema.companies)
        .values({
          id: newId(),
          jobId: ctx.jobId,
          userId: ctx.job.userId,
          name: c.name,
          normalizedName: normalizeCompanyName(c.name),
          dedupeKey: key,
          website: c.website ?? null,
          domain: normalizeDomain(c.website),
          industry: cfg.industries.length > 0 ? industry : null,
          address: c.address ?? null,
          city: c.city ?? null,
          region: c.region ?? null,
          country: c.country ?? null,
          postalCode: c.postalCode ?? null,
          lat: c.lat ?? null,
          lng: c.lng ?? null,
          phone: c.phone ?? null,
          placeId: c.placeId ?? null,
          rating: c.rating ?? null,
          reviewCount: c.reviewCount ?? null,
          source: "places",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
      if (res.changes > 0) inserted++;
      else if (c.placeId) {
        // Company already known from a job board — enrich it with Places data.
        ctx.db
          .update(schema.companies)
          .set({
            address: c.address ?? null,
            city: c.city ?? null,
            region: c.region ?? null,
            country: c.country ?? null,
            phone: c.phone ?? null,
            placeId: c.placeId,
            rating: c.rating ?? null,
            reviewCount: c.reviewCount ?? null,
            updatedAt: now,
          })
          .where(and(eq(schema.companies.jobId, ctx.jobId), eq(schema.companies.dedupeKey, key)))
          .run();
      }
    }
    unitsDone++;
    ctx.reportItems(unitsDone, queries.length);
    ctx.heartbeat();
    if (error && /quota/i.test(error)) break;
  }

  ctx.emit("success", `Company discovery complete: ${seen} results, ${inserted} new companies.`);
  return { itemsIn: seen, itemsOut: inserted };
};
