import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Clock, RotateCcw, Trash2 } from "lucide-react";
import type { JobRow } from "@server/db/schema";
import { useTRPC } from "@/lib/trpc";
import { formatDurationMs, formatEta, formatNumber } from "@/lib/utils";
import {
  STAGE_NAMES,
  STAGE_LABELS,
  JOB_STATUS_TONE,
  JOB_STATUS_LABEL,
  isTerminalJobStatus,
  stageSegments,
} from "@/lib/stages";
import { StatusPill } from "@/components/shared/StatusPill";
import { StageProgressBar } from "@/components/shared/StageProgressBar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { runLocation, useNow } from "./shared";

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-muted disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20";

export function RunCard({ run }: { run: JobRow }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const terminal = isTerminalJobStatus(run.status);
  const running = run.status === "running";
  const now = useNow(running);

  const detail = useQuery(
    trpc.runs.detail.queryOptions(
      { id: run.id },
      { enabled: !terminal, staleTime: 0, refetchInterval: 2000, refetchIntervalInBackground: true },
    ),
  );
  const live = detail.data?.counts;

  const invalidateRuns = () => void qc.invalidateQueries({ queryKey: trpc.runs.pathKey() });
  const cancelMut = useMutation(
    trpc.runs.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Cancellation requested");
        invalidateRuns();
      },
    }),
  );
  const resumeMut = useMutation(
    trpc.runs.resume.mutationOptions({
      onSuccess: () => {
        toast.success("Run re-queued");
        invalidateRuns();
      },
    }),
  );
  const deleteMut = useMutation(
    trpc.runs.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Run deleted");
        invalidateRuns();
      },
    }),
  );

  const counts = [
    { label: "Companies", value: live?.companies ?? run.totals?.companiesDiscovered },
    { label: "Postings", value: live?.uniquePostings ?? run.totals?.uniquePostings },
    { label: "Direct employers", value: live?.directEmployers ?? run.totals?.directEmployers },
  ];
  const uniquePostings = live?.uniquePostings ?? run.totals?.uniquePostings;

  const elapsedMs = run.startedAt
    ? (run.finishedAt?.getTime() ?? (running ? now : Date.now())) - run.startedAt.getTime()
    : null;

  const canResume = (run.status === "failed" && run.resumable) || run.status === "cancelled";

  return (
    <div
      onClick={() => navigate(`/runs/${run.id}`)}
      className="cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="truncate text-base font-semibold">{run.name}</span>
            <StatusPill
              tone={JOB_STATUS_TONE[run.status]}
              label={JOB_STATUS_LABEL[run.status]}
              pulse={running}
              size="sm"
            />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{runLocation(run.config) || "—"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {run.config.roleKeywords.map((role) => (
              <span key={role} className="rounded-full bg-muted px-2 py-0.5 text-xs text-slate-400">
                {role}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold tabular-nums text-primary">
            {formatNumber(uniquePostings ?? null)}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Postings
          </div>
        </div>
      </div>

      <div className="mt-4">
        <StageProgressBar
          stages={stageSegments({
            completed: run.completedStages,
            current: run.currentStage,
            status: run.status,
            all: STAGE_NAMES,
          })}
        />
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {run.currentStage
              ? STAGE_LABELS[run.currentStage]
              : run.status === "queued"
                ? "Waiting in queue"
                : JOB_STATUS_LABEL[run.status]}
          </span>
          <span className="tabular-nums">{Math.round(run.progress)}%</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {elapsedMs != null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {formatDurationMs(elapsedMs)}
            </span>
          )}
          {running && run.etaSeconds != null && (
            <span className="tabular-nums">ETA {formatEta(run.etaSeconds)}</span>
          )}
          {counts.map((c) => (
            <span key={c.label}>
              <span className="font-medium tabular-nums text-foreground">
                {formatNumber(c.value ?? null)}
              </span>{" "}
              {c.label}
            </span>
          ))}
        </div>
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
          {(run.status === "running" || run.status === "queued") && (
            <ConfirmDialog
              title="Cancel this run?"
              description="The pipeline stops after the current item finishes. You can resume the run later."
              confirmLabel="Cancel run"
              onConfirm={() => cancelMut.mutate({ id: run.id })}
              trigger={
                <button type="button" className={dangerBtn}>
                  Cancel
                </button>
              }
            />
          )}
          {canResume && (
            <button
              type="button"
              disabled={resumeMut.isPending}
              onClick={() => resumeMut.mutate({ id: run.id })}
              className={ghostBtn}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          {terminal && (
            <ConfirmDialog
              title={`Delete "${run.name}"?`}
              description="This permanently removes the run along with its companies, postings, and events."
              confirmLabel="Delete"
              tone="danger"
              onConfirm={() => deleteMut.mutate({ id: run.id })}
              trigger={
                <button type="button" className={dangerBtn}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
