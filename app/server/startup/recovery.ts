import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/client";

/**
 * After a crash/restart, any job left in queued stays queued (the poller will
 * pick it up); any job left in running is dead — mark it failed+resumable and
 * finalize its dangling source_runs so nothing shows "Running" forever.
 */
export function recoverOrphanedJobs(): void {
  const orphaned = db.select().from(schema.jobs).where(eq(schema.jobs.status, "running")).all();
  if (orphaned.length === 0) return;

  const now = new Date();
  const ids = orphaned.map((j) => j.id);

  db.update(schema.jobs)
    .set({
      status: "failed",
      resumable: true,
      error: "Interrupted by server restart — click Resume to continue from the last completed stage.",
      finishedAt: now,
    })
    .where(inArray(schema.jobs.id, ids))
    .run();

  db.update(schema.sourceRuns)
    .set({ status: "failed", finishedAt: now, error: "interrupted by restart" })
    .where(sql`${schema.sourceRuns.jobId} in ${ids} and ${schema.sourceRuns.status} = 'running'`)
    .run();

  for (const job of orphaned) {
    db.insert(schema.jobEvents)
      .values({
        jobId: job.id,
        ts: now,
        stage: job.currentStage ?? "source_search",
        level: "error",
        message: "Job interrupted by server restart. It can be resumed from the last completed stage.",
      })
      .run();
  }
  console.log(`[recovery] marked ${orphaned.length} orphaned running job(s) as failed (resumable)`);
}
