import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ToggleCard({
  title,
  description,
  badge,
  checked,
  onCheckedChange,
  disabled,
  disabledReason,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() => onCheckedChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
        checked
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/50"
          : "border-border bg-card hover:bg-muted/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && (
            <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-border">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {disabled && disabledReason ? disabledReason : description}
        </p>
      </div>
      <span
        className={cn(
          "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full bg-zinc-100 transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
