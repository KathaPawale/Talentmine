import { STAGE_LABELS, type StageName } from "@shared/types";
import type { StageSegmentStatus } from "@/lib/stages";
import { cn } from "@/lib/utils";

const SEGMENT_CLASSES: Record<StageSegmentStatus, string> = {
  done: "bg-success",
  active: "bg-success/50 animate-pulse",
  failed: "bg-danger",
  pending: "bg-muted",
  skipped: "bg-muted",
};

export function StageProgressBar({
  stages,
  labeled,
}: {
  stages: { key: StageName; status: StageSegmentStatus }[];
  labeled?: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1">
        {stages.map((s) => (
          <div key={s.key} className={cn("h-1.5 flex-1 rounded", SEGMENT_CLASSES[s.status])} />
        ))}
      </div>
      {labeled && (
        <div className="mt-1.5 flex gap-1">
          {stages.map((s) => (
            <div
              key={s.key}
              className={cn(
                "flex-1 truncate text-center text-[10px] font-medium",
                s.status === "active"
                  ? "text-success"
                  : s.status === "failed"
                    ? "text-danger"
                    : "text-muted-foreground/70",
              )}
            >
              {STAGE_LABELS[s.key]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
