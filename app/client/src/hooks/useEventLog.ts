import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import type { JobEventRow } from "@server/db/schema";

const MAX_EVENTS = 1000;

/** Cursor-based accumulation of job events: each poll asks only for events
 * after the highest seq already seen, merged and deduped client-side. */
export function useEventLog(jobId: string, isRunning: boolean) {
  const trpc = useTRPC();
  const [events, setEvents] = useState<JobEventRow[]>([]);

  const prevJobId = useRef(jobId);
  if (prevJobId.current !== jobId) {
    prevJobId.current = jobId;
    setEvents([]);
  }

  const lastSeq = events.at(-1)?.seq ?? 0;
  const query = useQuery(
    trpc.runs.events.queryOptions(
      { jobId, afterSeq: lastSeq },
      { staleTime: 0, refetchInterval: isRunning ? 2000 : false, refetchIntervalInBackground: true },
    ),
  );

  const batch = query.data;
  useEffect(() => {
    if (!batch || batch.length === 0) return;
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.seq));
      const fresh = batch.filter((e) => !seen.has(e.seq));
      if (fresh.length === 0) return prev;
      const merged = [...prev, ...fresh];
      return merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged;
    });
  }, [batch]);

  // One final fetch after the run stops so trailing events are not missed.
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    if (wasRunning.current && !isRunning) void refetchRef.current();
    wasRunning.current = isRunning;
  }, [isRunning]);

  return { events, isLoading: query.isPending && events.length === 0 };
}
