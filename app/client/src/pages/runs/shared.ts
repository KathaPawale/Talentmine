import { useEffect, useState } from "react";
import type { RunCreateInput, SourceKey } from "@shared/types";

export const SOURCE_LABEL: Record<SourceKey, string> = {
  jsearch: "Google Jobs (JSearch)",
  adzuna: "Adzuna",
  ats: "Company Career Sites",
};

export function runLocation(config: RunCreateInput): string {
  return [config.city, config.region, config.country].filter(Boolean).join(", ");
}

/** Current time, ticking once per second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
