import type { JobStatus, StageName } from "@shared/types";
export { STAGE_NAMES, STAGE_LABELS, STAGE_WEIGHTS, isTerminalJobStatus } from "@shared/types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  queued: "warning",
  running: "success",
  completed: "success",
  cancelled: "neutral",
  failed: "danger",
  blocked_quota: "warning",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  blocked_quota: "Quota blocked",
};

export const EMAIL_STATUS_TONE: Record<string, Tone> = {
  VERIFIED: "success",
  RISKY: "warning",
  INVALID: "danger",
  UNKNOWN: "neutral",
  MISSING: "neutral",
};

export type StageSegmentStatus = "pending" | "active" | "done" | "failed" | "skipped";

export function stageSegments(opts: {
  completed: StageName[];
  current: StageName | null;
  status: JobStatus;
  all: readonly StageName[];
}): { key: StageName; status: StageSegmentStatus }[] {
  return opts.all.map((key) => {
    if (opts.completed.includes(key)) return { key, status: "done" as const };
    if (key === opts.current) {
      return {
        key,
        status: opts.status === "failed" ? ("failed" as const) : ("active" as const),
      };
    }
    return { key, status: "pending" as const };
  });
}
