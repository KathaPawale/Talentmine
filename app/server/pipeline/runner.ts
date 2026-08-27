import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { STAGE_NAMES, type StageName } from "@shared/types";
import { emitJobEvent } from "./events";
import { computeProgress, EtaTracker } from "./progress";
import { JobCancelledError, STAGE_HARD_TIMEOUT_MS, type StageContext } from "./types";
import { getStages } from "./stages";
import { buildProviders } from "../providers/registry";
import { withTimeout, TimeoutError } from "../lib/with-timeout";
import type { JobRow } from "../db/schema";

const HEARTBEAT_THROTTLE_MS = 5_000;

/** In-process registry of live runs so cancel/watchdog can abort I/O. */
const liveRuns = new Map<string, { controller: AbortController }>();

export function abortLiveRun(jobId: string): void {
  liveRuns.get(jobId)?.controller.abort();
}

export function isRunLive(jobId: string): boolean {
  return liveRuns.has(jobId);
}

function loadJob(jobId: string): JobRow | undefined {
  return db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).get();
}

/**
 * Run (or resume) a job. Stages already in completedStages are skipped;
 * incomplete stages are idempotent over per-row DB state, so re-running a
 * partially finished stage picks up where it left off.
 */
export async function runJob(jobId: string): Promise<void> {
  const controller = new AbortController();
  liveRuns.set(jobId, { controller });

  let currentStage: StageName = "source_search";
  try {
    const providers = buildProviders();
    let lastHeartbeat = 0;

    for (const [stageName, stageFn] of getStages()) {
      const job = loadJob(jobId);
      if (!job) return;
      if (job.completedStages.includes(stageName)) continue;
      if (job.cancelRequested) throw new JobCancelledError();
      currentStage = stageName;

      const stageStart = Date.now();
      const eta = new EtaTracker();
      db.update(schema.jobs)
        .set({
          currentStage: stageName,
          heartbeatAt: new Date(),
          progress: computeProgress(job.completedStages, stageName, 0),
        })
        .where(eq(schema.jobs.id, jobId))
        .run();

      const ctx: StageContext = {
        jobId,
        job,
        db,
        providers,
        signal: controller.signal,
        emit: (level, message, data) => emitJobEvent(jobId, stageName, level, message, data),
        heartbeat: () => {
          const now = Date.now();
          if (now - lastHeartbeat < HEARTBEAT_THROTTLE_MS) return;
          lastHeartbeat = now;
          db.update(schema.jobs).set({ heartbeatAt: new Date() }).where(eq(schema.jobs.id, jobId)).run();
        },
        checkCancelled: () => {
          const fresh = loadJob(jobId);
          if (fresh?.cancelRequested || controller.signal.aborted) throw new JobCancelledError();
        },
        reportItems: (done, total) => {
          eta.itemDone();
          const fraction = total > 0 ? done / total : 1;
          const fresh = loadJob(jobId);
          if (!fresh) return;
          db.update(schema.jobs)
            .set({
              progress: computeProgress(fresh.completedStages, stageName, fraction),
              etaSeconds: eta.etaSeconds(total - done),
              heartbeatAt: new Date(),
            })
            .where(eq(schema.jobs.id, jobId))
            .run();
        },
      };

      // Periodic heartbeat so slow single items don't look like a hang.
      const heartbeatTimer = setInterval(() => {
        db.update(schema.jobs).set({ heartbeatAt: new Date() }).where(eq(schema.jobs.id, jobId)).run();
      }, 15_000);
      heartbeatTimer.unref?.();

      try {
        await withTimeout(
          Promise.resolve(stageFn(ctx)),
          STAGE_HARD_TIMEOUT_MS[stageName],
          `stage ${stageName}`,
        );
      } finally {
        clearInterval(heartbeatTimer);
      }

      // Checkpoint: stage completed.
      const elapsed = Date.now() - stageStart;
      const fresh = loadJob(jobId);
      if (!fresh) return;
      const completed = [...fresh.completedStages, stageName];
      db.update(schema.jobs)
        .set({
          completedStages: completed,
          currentStage: null,
          etaSeconds: null,
          progress: computeProgress(completed, null, 0),
          stageTimings: { ...fresh.stageTimings, [stageName]: elapsed },
        })
        .where(eq(schema.jobs.id, jobId))
        .run();

      if (fresh.cancelRequested) throw new JobCancelledError();
    }

    // All stages done — finalize.
    db.update(schema.jobs)
      .set({ status: "completed", progress: 100, finishedAt: new Date(), currentStage: null, resumable: false })
      .where(eq(schema.jobs.id, jobId))
      .run();
  } catch (err) {
    const fresh = loadJob(jobId);
    if (!fresh) return;
    if (err instanceof JobCancelledError || fresh.cancelRequested) {
      db.update(schema.jobs)
        .set({ status: "cancelled", finishedAt: new Date(), currentStage })
        .where(eq(schema.jobs.id, jobId))
        .run();
      emitJobEvent(jobId, currentStage, "warn", "Job cancelled by user.");
    } else {
      const message = err instanceof Error ? err.message : String(err);
      db.update(schema.jobs)
        .set({ status: "failed", finishedAt: new Date(), currentStage, error: message, resumable: true })
        .where(eq(schema.jobs.id, jobId))
        .run();
      emitJobEvent(
        jobId,
        currentStage,
        "error",
        `Pipeline failed at stage ${currentStage}: ${message}${err instanceof TimeoutError ? " (hard timeout)" : ""}`,
      );
      console.error(`[pipeline] job ${jobId} failed at ${currentStage}:`, err);
    }
  } finally {
    liveRuns.delete(jobId);
  }
}

export { STAGE_NAMES };
