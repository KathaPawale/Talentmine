import { and, eq, isNull, inArray } from "drizzle-orm";
import { schema } from "../../db/client";
import type { StageFn } from "../types";
import { roleCategoryFromTitle, roleBatchSchema, isRoleCategory } from "../../extract/role-normalize";
import { titleSimilarity, sourceRank } from "../../dedupe/postings";
import { sameCountry } from "../../lib/locations";
import type { JobPostingRow } from "../../db/schema";
import type { PostingSource } from "@shared/types";

const LLM_BATCH_SIZE = 25;
const FUZZY_THRESHOLD = 0.85;

/**
 * Stage 4: (a) map every posting title to a canonical role category — cheap
 * keyword rules first, LLM batches for the rest; (b) fuzzy-merge near-duplicate
 * postings within each company across sources (the same job on Google Jobs and
 * on the company's Greenhouse board).
 */
export const normalizeStage: StageFn = async (ctx) => {
  // ---- (a) role normalization ----
  const pending = ctx.db
    .select()
    .from(schema.jobPostings)
    .where(and(eq(schema.jobPostings.jobId, ctx.jobId), eq(schema.jobPostings.roleNormStatus, "pending")))
    .all();

  let ruleHits = 0;
  const needLlm: JobPostingRow[] = [];
  for (const p of pending) {
    const category = roleCategoryFromTitle(p.title);
    if (category) {
      ctx.db
        .update(schema.jobPostings)
        .set({ roleCategory: category, roleNormStatus: "done", updatedAt: new Date() })
        .where(eq(schema.jobPostings.id, p.id))
        .run();
      ruleHits++;
    } else {
      needLlm.push(p);
    }
  }
  ctx.emit("info", `Role mapping: ${ruleHits} titles matched by rules, ${needLlm.length} sent to the LLM.`);

  const totalWork = Math.max(1, needLlm.length + 1);
  let workDone = 0;

  for (let i = 0; i < needLlm.length; i += LLM_BATCH_SIZE) {
    ctx.checkCancelled();
    const batch = needLlm.slice(i, i + LLM_BATCH_SIZE);
    const user = batch.map((p, idx) => `${idx + 1}. ${p.title}`).join("\n");
    const result = await ctx.providers.llm.completeJson<{ categories: unknown[] }>({
      system:
        "You classify job titles into canonical role categories. " +
        "Return one category per numbered title, in the same order.",
      user,
      schemaName: "role_batch",
      schema: roleBatchSchema(batch.length),
      signal: ctx.signal,
      maxTokens: 800,
    });
    const categories = Array.isArray(result?.categories) ? result.categories : [];
    batch.forEach((p, idx) => {
      const cat = categories[idx];
      ctx.db
        .update(schema.jobPostings)
        .set({
          roleCategory: isRoleCategory(cat) ? cat : "other",
          roleNormStatus: isRoleCategory(cat) ? "done" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(schema.jobPostings.id, p.id))
        .run();
    });
    workDone += batch.length;
    ctx.reportItems(workDone, totalWork);
    ctx.heartbeat();
  }

  // ---- (b) fuzzy cross-source dedupe within each company ----
  const alive = ctx.db
    .select()
    .from(schema.jobPostings)
    .where(and(eq(schema.jobPostings.jobId, ctx.jobId), isNull(schema.jobPostings.duplicateOfId)))
    .all();

  const byCompany = new Map<string, JobPostingRow[]>();
  for (const p of alive) {
    const list = byCompany.get(p.companyId) ?? [];
    list.push(p);
    byCompany.set(p.companyId, list);
  }

  let merged = 0;
  for (const postings of byCompany.values()) {
    if (postings.length < 2) continue;
    const dead = new Set<string>();
    for (let i = 0; i < postings.length; i++) {
      const a = postings[i]!;
      if (dead.has(a.id)) continue;
      for (let j = i + 1; j < postings.length; j++) {
        const b = postings[j]!;
        if (dead.has(b.id)) continue;
        // Same place = same city name, both remote, or one side is city-less
        // (JSearch often is) with matching countries.
        const cityA = (a.city ?? "").toLowerCase();
        const cityB = (b.city ?? "").toLowerCase();
        const bothRemote = a.isRemote && b.isRemote;
        const sameCityNames = cityA !== "" && cityA === cityB;
        const cityWildcard = (cityA === "" || cityB === "") && sameCountry(a.country, b.country);
        // A record with no location at all merges into its located twin.
        const unlocated = (!cityA && !a.country) || (!cityB && !b.country);
        if (!(bothRemote || sameCityNames || cityWildcard || unlocated)) continue;
        if (titleSimilarity(a.title, b.title) < FUZZY_THRESHOLD) continue;

        // First-party record (ATS/careers page) survives; aggregator merges in.
        const [survivor, loser] = sourceRank(a.source) >= sourceRank(b.source) ? [a, b] : [b, a];
        dead.add(loser.id);
        const alsoSeen = new Set<PostingSource>([...survivor.alsoSeenOn, loser.source, ...loser.alsoSeenOn]);
        alsoSeen.delete(survivor.source);
        ctx.db
          .update(schema.jobPostings)
          .set({
            alsoSeenOn: [...alsoSeen],
            // Backfill fields the first-party record lacked.
            city: survivor.city ?? loser.city,
            region: survivor.region ?? loser.region,
            country: survivor.country ?? loser.country,
            salaryMin: survivor.salaryMin ?? loser.salaryMin,
            salaryMax: survivor.salaryMax ?? loser.salaryMax,
            salaryCurrency: survivor.salaryCurrency ?? loser.salaryCurrency,
            salaryPeriod: survivor.salaryPeriod ?? loser.salaryPeriod,
            postedAt: survivor.postedAt ?? loser.postedAt,
            descriptionSnippet: survivor.descriptionSnippet || loser.descriptionSnippet,
            updatedAt: new Date(),
          })
          .where(eq(schema.jobPostings.id, survivor.id))
          .run();
        ctx.db
          .update(schema.jobPostings)
          .set({ duplicateOfId: survivor.id, updatedAt: new Date() })
          .where(eq(schema.jobPostings.id, loser.id))
          .run();
        merged++;
      }
    }
  }

  // Postings filtered out by requested role categories are marked duplicates?
  // No — category filters are applied at query time so nothing is lost.

  ctx.reportItems(totalWork, totalWork);
  ctx.emit("success", `Normalization complete: ${pending.length} titles categorized, ${merged} cross-source duplicates merged.`);
  return { itemsIn: pending.length, itemsOut: pending.length - merged };
};
