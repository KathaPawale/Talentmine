import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { getSetting } from "../lib/settings";
import { runJob, abortLiveRun, isRunLive } from "./runner";
import { emitJobEvent } from "./events";

const POLL_INTERVAL_MS = 3_000;
const WATCHDOG_INTERVAL_MS = 60_000;
const HEARTBEAT_DEAD_MS = 5 * 60_000;

let running = 0;
let started = false;

function tick(): void {
  const poolSize = Number(getSetting("pipeline.pool_size")) || 1;
  while (running < poolSize) {
    // Atomic claim: flip the oldest queued job to running; changes=0 means
    // another tick got it first (or none are queued).
    const oldest = db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"))
      .orderBy(asc(schema.jobs.createdAt))
      .limit(1)
      .get();
    if (!oldest) return;

    const claim = db
      .update(schema.jobs)
      .set({ status: "running", startedAt: oldest.startedAt ?? new Date(), heartbeatAt: new Date() })
      .where(eq(schema.jobs.id, oldest.id))
      .run();
    if (claim.changes === 0) continue;

    running++;
    void runJob(oldest.id)
      .catch((err) => {
        console.error(`[queue] runJob(${oldest.id}) crashed:`, err);
      })
      .finally(() => {
        running--;
      });
  }
}

/**
 * Watchdog: a running job whose heartbeat is older than 5 minutes is presumed
 * hung — abort its I/O; the runner's error path marks it failed+resumable. If
 * the run isn't even live in this process (shouldn't happen post-recovery),
 * mark it failed directly.
 */
function watchdog(): void {
  const stale = Date.now() - HEARTBEAT_DEAD_MS;
  const runningJobs = db.select().from(schema.jobs).where(eq(schema.jobs.status, "running")).all();
  for (const job of runningJobs) {
    const beat = job.heartbeatAt?.getTime() ?? job.startedAt?.getTime() ?? 0;
    if (beat > stale) continue;
    console.warn(`[watchdog] job ${job.id} heartbeat stale (${new Date(beat).toISOString()}) — aborting`);
    if (isRunLive(job.id)) {
      abortLiveRun(job.id);
      emitJobEvent(job.id, job.currentStage ?? "source_search", "error", "Watchdog: stage unresponsive for 5 minutes — aborting.");
    } else {
      db.update(schema.jobs)
        .set({ status: "failed", resumable: true, error: "watchdog: job process lost", finishedAt: new Date() })
        .where(eq(schema.jobs.id, job.id))
        .run();
    }
  }
}

export function startQueue(): void {
  if (started) return;
  started = true;
  setInterval(tick, POLL_INTERVAL_MS).unref?.();
  setInterval(watchdog, WATCHDOG_INTERVAL_MS).unref?.();
  console.log("[queue] pipeline queue started (poll 3s, watchdog 60s)");
  tick();
}

/** Nudge the poller right after job creation instead of waiting for the next tick. */
export function pokeQueue(): void {
  if (started) tick();
}
