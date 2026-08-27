import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/stages";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/25",
  info: "bg-info/10 text-info ring-info/25",
  neutral: "bg-neutral/10 text-zinc-400 ring-neutral/25",
};

export function StatusPill({
  tone,
  label,
  pulse = false,
  size = "md",
  className,
}: {
  tone: Tone;
  label: string;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        size === "sm" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-xs",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {label}
    </span>
  );
}
