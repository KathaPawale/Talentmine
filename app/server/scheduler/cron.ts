import { schedule as cronSchedule, validate as cronValidate, type ScheduledTask } from "node-cron";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import type { JobScheduleRow } from "../db/schema";
import type { JobCreateInput } from "@shared/types";
import { checkBudget } from "../providers/guard";
import { newId } from "../lib/crypto";
import { pokeQueue } from "../pipeline/queue";

// Live node-cron task handles keyed by schedule id, so refreshScheduler can
// dispose and re-register after any schedule mutation.
const tasks = new Map<string, ScheduledTask>();

/**
 * Pre-flight estimate of Places searchText calls for one run. Mirrors the
 * places_discover stage: 20 results/page, max 3 pages per query, one query per
 * industry (or per role keyword when no industries are set).
 */
export function estimatePlacesCalls(config: JobCreateInput): number {
  const queries = Math.max(config.industries.length, 1);
  return Math.ceil(Math.min(config.targetCount, 60) / 20) * queries;
}

/** Fire one schedule now: budget pre-flight, then enqueue (or block) a job. Exported for tests. */
export function fireSchedule(sched: JobScheduleRow): void {
  const now = new Date();
  const jobId = newId();
  const jobName = `${sched.name} — ${now.toISOString().slice(0, 10)}`;

  // Places is only consumed by ATS-mining company discovery, so the quota
  // pre-flight only applies when the schedule includes the ats source.
  const estimatedCalls = estimatePlacesCalls(sched.config);
  const budget = sched.config.sources.includes("ats")
    ? checkBudget("google_places", estimatedCalls)
    : null;

  if (budget && !budget.allowed) {
    const reason =
      `Scheduled run skipped: Google Places monthly quota would be exceeded ` +
      `(used ${budget.used} of ${budget.cap}, run needs ~${estimatedCalls} calls). ` +
      `Raise quota.places_monthly_cap or disable the hard stop in Settings.`;
    db.insert(schema.jobs)
      .values({
        id: jobId,
        userId: sched.createdBy,
        name: jobName,
        config: sched.config,
        status: "blocked_quota",
        error: reason,
        createdAt: now,
        finishedAt: now,
      })
      .run();
    db.insert(schema.jobEvents)
      .values({ jobId, ts: now, stage: "source_search", level: "warn", message: reason })
      .run();
  } else {
    db.insert(schema.jobs)
      .values({ id: jobId, userId: sched.createdBy, name: jobName, config: sched.config, createdAt: now })
      .run();
    db.insert(schema.jobEvents)
      .values({
        jobId,
        ts: now,
        stage: "source_search",
        level: "info",
        message: `Run "${jobName}" queued by schedule "${sched.name}".`,
      })
      .run();
    pokeQueue();
  }

  db.update(schema.jobSchedules)
    .set({ lastRunAt: now, lastJobId: jobId })
    .where(eq(schema.jobSchedules.id, sched.id))
    .run();
}

function registerAll(): void {
  const rows = db
    .select()
    .from(schema.jobSchedules)
    .where(eq(schema.jobSchedules.enabled, true))
    .all();

  for (const row of rows) {
    if (!cronValidate(row.cron)) {
      console.warn(`[scheduler] schedule "${row.name}" (${row.id}) has invalid cron "${row.cron}" — skipped`);
      continue;
    }
    const task = cronSchedule(row.cron, () => {
      try {
        // Reload so edits made since registration (rename, config) are honored.
        const fresh = db.select().from(schema.jobSchedules).where(eq(schema.jobSchedules.id, row.id)).get();
        if (!fresh || !fresh.enabled) return;
        fireSchedule(fresh);
      } catch (err) {
        console.error(`[scheduler] schedule "${row.name}" (${row.id}) fire failed:`, err);
      }
    });
    tasks.set(row.id, task);
  }
}

/** Dispose every registered task and re-register from the DB. Call after any schedule mutation. */
export function refreshScheduler(): void {
  for (const task of tasks.values()) void task.destroy();
  tasks.clear();
  registerAll();
}

/**
 * Register all enabled schedules. Timer-based only: runs missed while the app
 * was closed are skipped, never back-filled (see docs/RUNBOOK.md).
 */
export function startScheduler(): void {
  refreshScheduler();
  console.log(`[scheduler] ${tasks.size} enabled schedule(s) registered`);
}
