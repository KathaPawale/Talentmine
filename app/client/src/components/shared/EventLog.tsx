import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { EventLevel, StageName } from "@shared/types";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { StatusPill } from "@/components/shared/StatusPill";
import { cn } from "@/lib/utils";

export interface EventLogEntry {
  seq: number;
  ts: Date;
  stage: StageName;
  level: EventLevel;
  message: string;
}

const LEVEL_CLASSES: Record<EventLevel, string> = {
  info: "text-zinc-300",
  success: "text-success",
  warn: "text-warning",
  error: "text-danger",
};

function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function EventLog({
  events,
  isLive,
  heightClass = "h-80",
}: {
  events: EventLogEntry[];
  isLive: boolean;
  heightClass?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isPinned, jumpToLatest } = useAutoScroll(scrollRef, [events.length]);

  const lastCount = useRef(events.length);
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (events.length > lastCount.current && !isPinned) setHasNew(true);
    lastCount.current = events.length;
  }, [events.length, isPinned]);
  useEffect(() => {
    if (isPinned) setHasNew(false);
  }, [isPinned]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs tabular-nums text-muted-foreground">{events.length} events</span>
        {isLive && <StatusPill tone="success" label="LIVE" pulse size="sm" />}
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          className={cn(
            "scrollbar-thin overflow-y-auto rounded-lg border border-border bg-black/30 p-3 font-mono text-xs",
            heightClass,
          )}
        >
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No events yet.
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.seq} className="flex items-baseline gap-2 leading-relaxed">
                  <span className="shrink-0 text-muted-foreground/60">
                    #{String(e.seq).padStart(4, "0")}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{fmtTime(e.ts)}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] uppercase text-zinc-400">
                    {e.stage}
                  </span>
                  <span className={cn("min-w-0 break-words", LEVEL_CLASSES[e.level])}>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {!isPinned && hasNew && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            <ArrowDown className="h-3 w-3" /> Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
