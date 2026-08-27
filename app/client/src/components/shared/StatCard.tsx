import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  /** undefined renders a loading skeleton */
  value: string | number | undefined;
  icon?: LucideIcon;
  /** extra classes for the value, e.g. "text-success" */
  accent?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
      </div>
      {value === undefined ? (
        <div className="mt-2.5 h-7 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className={cn("mt-1.5 text-2xl font-bold tabular-nums", accent)}>{value}</div>
      )}
    </>
  );
  const base = "rounded-xl border border-border bg-card p-4";
  return href ? (
    <Link href={href} className={cn(base, "block transition-colors hover:border-primary/30")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
