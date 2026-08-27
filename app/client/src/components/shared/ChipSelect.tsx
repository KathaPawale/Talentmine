import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChipSelect({
  options,
  value,
  onChange,
  allowCustom,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  allowCustom?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const addCustom = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };

  const customValues = value.filter((v) => !options.some((o) => o.value === v));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "bg-muted text-zinc-400 ring-1 ring-border hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {customValues.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => toggle(v)}
          className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/40"
        >
          {v}
        </button>
      ))}
      {allowCustom && (
        <div className="inline-flex items-center gap-1 rounded-full bg-muted/60 ring-1 ring-border transition-colors focus-within:ring-primary/40">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add custom…"
            className="w-24 bg-transparent py-1 pl-3 text-xs outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={addCustom}
            className="pr-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
