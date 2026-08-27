import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Radar } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { isTerminalJobStatus } from "@/lib/stages";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { RunCard } from "./RunCard";

const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90";

export function RunsPage() {
  const trpc = useTRPC();
  const { data: runs, isLoading } = useQuery(
    trpc.runs.list.queryOptions(undefined, {
      staleTime: 0,
      refetchInterval: (q) =>
        q.state.data?.some((j) => !isTerminalJobStatus(j.status)) ? 2000 : false,
      refetchIntervalInBackground: true,
    }),
  );

  return (
    <div>
      <PageHeader
        title="Mining Runs"
        description="Create and monitor talent-demand mining pipelines"
        actions={
          <Link href="/runs/new" className={primaryBtn}>
            <Plus className="h-4 w-4" /> New Run
          </Link>
        }
      />
      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No mining runs yet"
          description="Create your first run to start mining job postings from boards and company career sites."
          action={
            <Link href="/runs/new" className={primaryBtn}>
              <Plus className="h-4 w-4" /> New Run
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
