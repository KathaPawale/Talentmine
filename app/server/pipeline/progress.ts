import { STAGE_NAMES, STAGE_WEIGHTS, type StageName } from "@shared/types";

/**
 * Overall progress 0–100 from completed stages plus the fraction of the
 * current stage. Monotonic as long as stages only ever complete forward.
 */
export function computeProgress(
  completed: StageName[],
  currentStage: StageName | null,
  currentFraction: number,
): number {
  let pct = 0;
  for (const s of STAGE_NAMES) {
    if (completed.includes(s)) pct += STAGE_WEIGHTS[s];
  }
  if (currentStage && !completed.includes(currentStage)) {
    pct += STAGE_WEIGHTS[currentStage] * Math.min(1, Math.max(0, currentFraction));
  }
  return Math.min(100, Math.round(pct * 10) / 10);
}

/** Rolling per-item ETA for the current stage; null until enough samples. */
export class EtaTracker {
  private samples: number[] = [];
  private lastItemAt = Date.now();

  itemDone(): void {
    const now = Date.now();
    this.samples.push(now - this.lastItemAt);
    this.lastItemAt = now;
    if (this.samples.length > 20) this.samples.shift();
  }

  etaSeconds(remainingItems: number): number | null {
    if (this.samples.length < 5 || remainingItems <= 0) return null;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return Math.round((mean * remainingItems) / 1000);
  }

  reset(): void {
    this.samples = [];
    this.lastItemAt = Date.now();
  }
}
