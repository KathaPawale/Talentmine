import { AlertTriangle, OctagonX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STYLES = {
  warning: { container: "border-warning/30 bg-warning/5", icon: "text-warning" },
  danger: { container: "border-danger/30 bg-danger/5", icon: "text-danger" },
} as const;

export function DegradedAlert({
  severity,
  title,
  children,
  action,
}: {
  severity: "warning" | "danger";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const s = STYLES[severity];
  const Icon = severity === "danger" ? OctagonX : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", s.container)}>
      <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", s.icon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        {children && (
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
