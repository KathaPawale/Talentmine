import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { isTerminalJobStatus } from "@shared/types";

/** Poll run detail every 2s until the run reaches a terminal state, then
 * invalidate the query families that aggregate run results. */
export function useRunLive(runId: string) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const query = useQuery(
    trpc.runs.detail.queryOptions(
      { id: runId },
      {
        staleTime: 0,
        refetchInterval: (q) => (isTerminalJobStatus(q.state.data?.job.status) ? false : 2000),
        // Keep polling while the tab is hidden — it's a monitoring dashboard.
        refetchIntervalInBackground: true,
      },
    ),
  );

  const status = query.data?.job.status;
  const prevTerminal = useRef<boolean | null>(null);
  useEffect(() => {
    if (status === undefined) return;
    const terminal = isTerminalJobStatus(status);
    if (prevTerminal.current === false && terminal) {
      void qc.invalidateQueries({ queryKey: trpc.runs.pathKey() });
      void qc.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
      void qc.invalidateQueries({ queryKey: trpc.postings.pathKey() });
      void qc.invalidateQueries({ queryKey: trpc.companies.pathKey() });
    }
    prevTerminal.current = terminal;
  }, [status, qc, trpc]);

  return query;
}
