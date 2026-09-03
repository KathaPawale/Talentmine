import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Radar } from "lucide-react";
import type { JobRow } from "@server/db/schema";
import { useTRPC } from "@/lib/trpc";
import { isTerminalJobStatus } from "@/lib/stages";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { RunCard } from "./RunCard";

const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90";
const RUN_HISTORY_KEY = "talentmine.previous-searches.v1";

type CachedRun = Omit<JobRow, "createdAt" | "startedAt" | "finishedAt"> & {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function cacheRun(run: JobRow): CachedRun {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

function restoreRun(run: CachedRun): JobRow {
  return {
    ...run,
    createdAt: new Date(run.createdAt),
    startedAt: run.startedAt ? new Date(run.startedAt) : null,
    finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
  } as JobRow;
}

function loadCachedRuns(): JobRow[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(RUN_HISTORY_KEY);
    if (!value) return [];
    return (JSON.parse(value) as CachedRun[]).map(restoreRun);
  } catch {
    return [];
  }
}

export function RunsPage() {
  const trpc = useTRPC();
  const [cachedRuns, setCachedRuns] = useState<JobRow[]>(() => loadCachedRuns());
  const { data: runs, isLoading } = useQuery(
    trpc.runs.list.queryOptions(undefined, {
      staleTime: 0,
      refetchInterval: (q) =>
        q.state.data?.some((j) => !isTerminalJobStatus(j.status)) ? 2000 : false,
      refetchIntervalInBackground: true,
    }),
  );

  useEffect(() => {
    if (!runs) return;
    const merged = new Map<string, JobRow>();
    for (const run of cachedRuns) merged.set(run.id, run);
    for (const run of runs) merged.set(run.id, run);
    const next = [...merged.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    setCachedRuns(next);
    try {
      window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(next.map(cacheRun)));
    } catch {
      // Browser storage may be unavailable; the server list still works normally.
    }
  }, [runs]);

  const visibleRuns = useMemo(() => {
    const merged = new Map<string, JobRow>();
    for (const run of cachedRuns) merged.set(run.id, run);
    for (const run of runs ?? []) merged.set(run.id, run);
    return [...merged.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [cachedRuns, runs]);

  return (
    <div>
      <PageHeader
        title="Previous Searches"
        description="All previous and current TalentMine searches are kept here, newest first"
        actions={
          <Link href="/runs/new" className={primaryBtn}>
            <Plus className="h-4 w-4" /> New Search
          </Link>
        }
      />
      {isLoading && visibleRuns.length === 0 ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : visibleRuns.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No searches yet"
          description="Create your first search to start mining job postings from boards and company career sites."
          action={
            <Link href="/runs/new" className={primaryBtn}>
              <Plus className="h-4 w-4" /> New Search
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {visibleRuns.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
