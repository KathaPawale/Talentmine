import { eq } from "drizzle-orm";
import { schema } from "../../db/client";
import type { StageContext, StageFn } from "../types";
import type { JobSourceProvider, RawPosting } from "../../providers/types";
import { QuotaExceededError, checkBudget } from "../../providers/guard";
import { newId } from "../../lib/crypto";
import { withTimeout } from "../../lib/with-timeout";
import { categoriesFromKeywords, insertPosting, matchesRole, upsertCompany } from "./upsert";

const PER_SOURCE_TIMEOUT_MS = 8 * 60_000;

/**
 * Stage 1: query the aggregator job boards (JSearch = Google for Jobs which
 * carries LinkedIn/Indeed/Glassdoor postings; Adzuna) for each role keyword.
 * One source failing (or running out of quota) degrades the run, never fails it.
 */
async function runSource(
  ctx: StageContext,
  provider: JobSourceProvider,
  roleKeyword: string,
  maxResults: number,
): Promise<{ found: number; inserted: number }> {
  const cfg = ctx.job.config;
  const location = [cfg.city, cfg.region, cfg.country].filter(Boolean).join(", ");
  const query = `${roleKeyword} in ${location}`;
  const runId = newId();
  let apiCalls = 0;

  ctx.db
    .insert(schema.sourceRuns)
    .values({ id: runId, jobId: ctx.jobId, source: provider.key, query, startedAt: new Date() })
    .run();

  let results: RawPosting[] = [];
  let error: string | null = null;
  try {
    ctx.emit("info", `Searching ${provider.key} for "${query}"…`);
    results = await withTimeout(
      provider.search({
        roleKeyword,
        city: cfg.city,
        region: cfg.region,
        country: cfg.country,
        remoteOnly: cfg.remoteOnly,
        postedWithinDays: cfg.postedWithinDays,
        maxResults,
        signal: ctx.signal,
        onApiCall: () => {
          apiCalls++;
        },
      }),
      PER_SOURCE_TIMEOUT_MS,
      `source ${provider.key}`,
    );

    // Boards match keywords loosely ("Accountant" query returns "Account
    // Manager" sales roles) — keep only titles that match the requested roles.
    const keywordCategories = categoriesFromKeywords(cfg.roleKeywords);
    const relevant = results.filter((p) => matchesRole(p.title, cfg.roleKeywords, keywordCategories));
    const dropped = results.length - relevant.length;

    let inserted = 0;
    for (const p of relevant) {
      const companyId = upsertCompany(ctx, {
        name: p.companyName,
        website: p.companyWebsite,
        source: provider.key,
      });
      if (insertPosting(ctx, companyId, p)) inserted++;
    }
    ctx.emit(
      "success",
      `${provider.key}: ${results.length} postings found, ${inserted} new${dropped > 0 ? `, ${dropped} off-topic dropped` : ""}`,
      { query },
    );
    return { found: results.length, inserted };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (err instanceof QuotaExceededError) {
      ctx.emit("warn", `${provider.key} quota exhausted (${err.used}/${err.cap}) — skipping remaining ${provider.key} queries`);
    } else {
      ctx.emit("warn", `${provider.key} failed: ${error} — continuing with other sources`);
    }
    return { found: 0, inserted: 0 };
  } finally {
    ctx.db
      .update(schema.sourceRuns)
      .set({
        status: error ? "failed" : "completed",
        itemsFound: results.length,
        apiCalls,
        finishedAt: new Date(),
        error,
      })
      .where(eq(schema.sourceRuns.id, runId))
      .run();
  }
}

export const sourceSearchStage: StageFn = async (ctx) => {
  const cfg = ctx.job.config;
  const wanted = cfg.sources.filter((s) => s === "jsearch" || s === "adzuna");
  const providers = ctx.providers.jobSources.filter((p) => p.available && wanted.includes(p.key));

  if (wanted.length === 0) {
    ctx.emit("info", "No job-board sources selected — skipping to career-site mining.");
    return { itemsIn: 0, itemsOut: 0 };
  }
  if (providers.length === 0) {
    ctx.emit("warn", "Selected job-board sources have no API keys configured — add them in .env (RAPIDAPI_KEY / ADZUNA_APP_ID+KEY).");
    return { itemsIn: 0, itemsOut: 0 };
  }

  // Budget per query so one run can't burn the whole JSearch month.
  const perQuery = Math.max(10, Math.ceil(cfg.targetCount / cfg.roleKeywords.length));
  const jsearchBudget = checkBudget("jsearch", cfg.roleKeywords.length);
  if (providers.some((p) => p.key === "jsearch") && !jsearchBudget.allowed) {
    ctx.emit("warn", `JSearch monthly quota nearly exhausted (${jsearchBudget.used}/${jsearchBudget.cap}) — it will stop mid-run if the cap is hit.`);
  }

  let totalFound = 0;
  let totalInserted = 0;
  const quotaDead = new Set<string>();
  const totalUnits = providers.length * cfg.roleKeywords.length;
  let unitsDone = 0;

  ctx.emit("info", `Mining job boards (${providers.map((p) => p.key).join(", ")}) for roles: ${cfg.roleKeywords.join(", ")}`);

  for (const provider of providers) {
    for (const roleKeyword of cfg.roleKeywords) {
      ctx.checkCancelled();
      if (quotaDead.has(provider.key)) continue;
      const budget = checkBudget(provider.key === "jsearch" ? "jsearch" : "adzuna", 1);
      if (!budget.allowed) {
        quotaDead.add(provider.key);
        ctx.emit("warn", `${provider.key} quota exhausted (${budget.used}/${budget.cap}) — skipping its remaining queries.`);
        continue;
      }
      const { found, inserted } = await runSource(ctx, provider, roleKeyword, perQuery);
      totalFound += found;
      totalInserted += inserted;
      unitsDone++;
      ctx.reportItems(unitsDone, totalUnits);
      ctx.heartbeat();
    }
  }

  ctx.emit("success", `Job-board search complete: ${totalFound} postings seen, ${totalInserted} unique stored.`);
  return { itemsIn: totalFound, itemsOut: totalInserted };
};
