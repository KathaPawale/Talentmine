import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { getSetting } from "../lib/settings";
import { newId } from "../lib/crypto";
import { QUOTA_PROVIDERS, type QuotaProvider } from "@shared/types";

export class QuotaExceededError extends Error {
  constructor(
    readonly provider: QuotaProvider,
    readonly used: number,
    readonly cap: number,
  ) {
    super(`${provider} quota exceeded (used ${used} of ${cap})`);
    this.name = "QuotaExceededError";
  }
}

const MONTHLY_PROVIDERS: ReadonlySet<QuotaProvider> = new Set(["google_places", "jsearch", "hunter"]);

/** 'YYYY-MM' for monthly-capped providers, 'YYYY-MM-DD' for daily (UTC). */
export function periodKeyFor(provider: QuotaProvider, now: Date = new Date()): string {
  const iso = now.toISOString();
  return MONTHLY_PROVIDERS.has(provider) ? iso.slice(0, 7) : iso.slice(0, 10);
}

export function capFor(provider: QuotaProvider): number {
  switch (provider) {
    case "google_places":
      return getSetting("quota.places_monthly_cap") as number;
    case "groq":
      return getSetting("quota.groq_daily_cap") as number;
    case "jsearch":
      return getSetting("quota.jsearch_monthly_cap") as number;
    case "adzuna":
      return getSetting("quota.adzuna_daily_cap") as number;
    case "hunter":
      return getSetting("quota.hunter_monthly_cap") as number;
  }
}

function usedFor(provider: QuotaProvider, periodKey: string): number {
  const row = db
    .select()
    .from(schema.apiQuotaUsage)
    .where(and(eq(schema.apiQuotaUsage.provider, provider), eq(schema.apiQuotaUsage.periodKey, periodKey)))
    .get();
  return row?.calls ?? 0;
}

/** Atomic upsert-increment. better-sqlite3 is synchronous, so the read-free SQL increment is race-safe in-process. */
export function consume(provider: QuotaProvider, n = 1): void {
  db.insert(schema.apiQuotaUsage)
    .values({ id: newId(), provider, periodKey: periodKeyFor(provider), calls: n, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.apiQuotaUsage.provider, schema.apiQuotaUsage.periodKey],
      set: { calls: sql`${schema.apiQuotaUsage.calls} + ${n}`, updatedAt: new Date() },
    })
    .run();
}

export interface BudgetCheck {
  allowed: boolean;
  used: number;
  cap: number;
  wouldExceed: boolean;
}

export function checkBudget(provider: QuotaProvider, n = 1): BudgetCheck {
  const used = usedFor(provider, periodKeyFor(provider));
  const cap = capFor(provider);
  const wouldExceed = used + n > cap;
  let allowed = !wouldExceed;
  if (provider === "google_places" && wouldExceed) {
    // Paid API: the hard stop is user-controlled; with it off the cap is advisory.
    allowed = !(getSetting("quota.places_hard_stop") as boolean);
  }
  return { allowed, used, cap, wouldExceed };
}

/** Consumes BEFORE invoking fn so failed attempts still count against the budget. */
export async function guardedCall<T>(provider: QuotaProvider, n: number, fn: () => Promise<T>): Promise<T> {
  const budget = checkBudget(provider, n);
  if (!budget.allowed) throw new QuotaExceededError(provider, budget.used, budget.cap);
  consume(provider, n);
  return fn();
}

export function getQuotaSummary(): { provider: QuotaProvider; used: number; cap: number; period: string }[] {
  return QUOTA_PROVIDERS.map((provider) => {
    const period = periodKeyFor(provider);
    return { provider, used: usedFor(provider, period), cap: capFor(provider), period };
  });
}
