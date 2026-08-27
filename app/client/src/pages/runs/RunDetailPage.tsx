import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Clock,
  Radar,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { formatDurationMs, formatEta, formatNumber } from "@/lib/utils";
import {
  STAGE_LABELS,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  isTerminalJobStatus,
  stageSegments,
  type Tone,
} from "@/lib/stages";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { StatCard } from "@/components/shared/StatCard";
import { StageProgressBar } from "@/components/shared/StageProgressBar";
import { EventLog } from "@/components/shared/EventLog";
import { DegradedAlert } from "@/components/shared/DegradedAlert";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useRunLive } from "@/hooks/useRunLive";
import { useEventLog } from "@/hooks/useEventLog";
import { runLocation, useNow } from "./shared";

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-muted disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20";

const SOURCE_RUN_TONE: Record<"running" | "completed" | "failed", Tone> = {
  running: "info",
  completed: "success",
  failed: "danger",
};
const SOURCE_RUN_LABEL: Record<"running" | "completed" | "failed", string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function RunDetailPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isLoading } = useRunLive(id);
  const run = data?.job;
  const running = run?.status === "running";
  const terminal = run ? isTerminalJobStatus(run.status) : false;
  const { events } = useEventLog(id, run != null && !terminal);
  const now = useNow(running === true);

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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data || !run) {
    return (
      <EmptyState
        title="Run not found"
        description="This mining run does not exist or was deleted."
        action={
          <Link href="/runs" className={ghostBtn}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Runs
          </Link>
        }
      />
    );
  }

  const elapsedMs = run.startedAt
    ? (run.finishedAt?.getTime() ?? (running ? now : Date.now())) - run.startedAt.getTime()
    : null;
  const segments = stageSegments({
    completed: run.completedStages,
    current: run.currentStage,
    status: run.status,
    all: data.stages,
  });
  const canResume = (run.status === "failed" && run.resumable) || run.status === "cancelled";

  return (
    <div>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Runs
      </Link>
      <PageHeader
        title={run.name}
        description={[runLocation(run.config), run.config.roleKeywords.join(", ")].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusPill tone={JOB_STATUS_TONE[run.status]} label={JOB_STATUS_LABEL[run.status]} pulse={running} />
            {(run.status === "running" || run.status === "queued") && (
              <ConfirmDialog
                title="Cancel this run?"
                description="The pipeline stops after the current item finishes. You can resume the run later."
                confirmLabel="Cancel run"
                onConfirm={() => cancelMut.mutate({ id })}
                trigger={
                  <button type="button" className={dangerBtn}>
                    Cancel Run
                  </button>
                }
              />
            )}
            {canResume && (
              <button
                type="button"
                disabled={resumeMut.isPending}
                onClick={() => resumeMut.mutate({ id })}
                className={ghostBtn}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Resume
              </button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {run.error && (
          <DegradedAlert
            severity="danger"
            title="Run failed"
            action={
              canResume ? (
                <button type="button" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate({ id })} className={ghostBtn}>
                  <RotateCcw className="h-3.5 w-3.5" /> Resume
                </button>
              ) : undefined
            }
          >
            {run.error}
          </DegradedAlert>
        )}

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pipeline Progress</h2>
            <span className="text-sm font-semibold tabular-nums text-primary">{Math.round(run.progress)}%</span>
          </div>
          <StageProgressBar stages={segments} labeled />
          <div className="mt-4 flex items-center gap-5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Clock className="h-3.5 w-3.5" /> {formatDurationMs(elapsedMs)}
            </span>
            {running && <span className="tabular-nums">ETA {formatEta(run.etaSeconds)}</span>}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 lg:grid-cols-7">
            {data.stages.map((s) => (
              <div key={s} className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {STAGE_LABELS[s]}
                </div>
                <div className="mt-0.5 text-xs font-medium tabular-nums">{formatDurationMs(run.stageTimings[s])}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Raw postings" value={formatNumber(data.counts.rawPostings)} icon={Radar} />
          <StatCard
            label="Unique postings"
            value={formatNumber(data.counts.uniquePostings)}
            icon={Briefcase}
            accent="text-primary"
            href={`/postings`}
          />
          <StatCard label="Companies" value={formatNumber(data.counts.companies)} icon={Building2} href="/companies" />
          <StatCard
            label="Direct employers"
            value={formatNumber(data.counts.directEmployers)}
            icon={ShieldCheck}
            accent="text-success"
          />
          <StatCard
            label="Agency postings"
            value={formatNumber(data.counts.agencyPostings)}
            icon={ShieldOff}
            accent="text-warning"
          />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Pipeline Event Log</h2>
            <EventLog events={events} isLive={!terminal} heightClass="h-96" />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Source Runs</h2>
            {data.sourceRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source runs yet.</p>
            ) : (
              <div className="space-y-2">
                {data.sourceRuns.map((sr) => (
                  <div
                    key={sr.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{sr.query}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {sr.source} · {formatNumber(sr.itemsFound)} found · {formatNumber(sr.apiCalls)} API calls
                      </div>
                    </div>
                    <StatusPill
                      tone={SOURCE_RUN_TONE[sr.status]}
                      label={SOURCE_RUN_LABEL[sr.status]}
                      pulse={sr.status === "running"}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
