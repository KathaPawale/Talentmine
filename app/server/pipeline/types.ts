import type { StageName, EventLevel } from "@shared/types";
import type { DB } from "../db/client";
import type { JobRow } from "../db/schema";
import type { ProviderRegistry } from "../providers/types";

export class JobCancelledError extends Error {
  constructor() {
    super("job cancelled");
    this.name = "JobCancelledError";
  }
}

export interface StageSummary {
  itemsIn?: number;
  itemsOut?: number;
  skipped?: number;
  failed?: number;
}

export interface StageContext {
  jobId: string;
  /** Reload-fresh job row at stage start. Config lives at job.config. */
  job: JobRow;
  db: DB;
  providers: ProviderRegistry;
  /** Append an event to the run log. */
  emit(level: EventLevel, message: string, data?: Record<string, unknown>): void;
  /** Bump jobs.heartbeatAt (throttled internally). Call at least once per item. */
  heartbeat(): void;
  /** Throws JobCancelledError if the user requested cancellation. */
  checkCancelled(): void;
  /** Aborted on cancel or watchdog kill — pass to fetch/socket work. */
  signal: AbortSignal;
  /** Drive within-stage progress: itemsDone / itemsTotal. */
  reportItems(done: number, total: number): void;
}

export type StageFn = (ctx: StageContext) => Promise<StageSummary | void>;

/** Hard ceiling per stage (ms) — the backstop against a hung stage. */
export const STAGE_HARD_TIMEOUT_MS: Record<StageName, number> = {
  source_search: 15 * 60_000,
  places_discover: 10 * 60_000,
  ats_mine: 30 * 60_000,
  normalize: 15 * 60_000,
  classify: 15 * 60_000,
  enrich: 20 * 60_000,
  done: 60_000,
};
