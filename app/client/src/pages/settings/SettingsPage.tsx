import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";

const PROVIDER_LABELS: Record<string, { name: string; envHint: string }> = {
  googleAuth: { name: "Google Sign-In", envHint: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET" },
  places: { name: "Google Places (company discovery)", envHint: "GOOGLE_PLACES_API_KEY" },
  groq: { name: "Groq LLM (classification & roles)", envHint: "GROQ_API_KEY" },
  gemini: { name: "Gemini (LLM failover)", envHint: "GEMINI_API_KEY" },
  jsearch: { name: "JSearch — Google Jobs / LinkedIn / Indeed", envHint: "RAPIDAPI_KEY" },
  adzuna: { name: "Adzuna job boards", envHint: "ADZUNA_APP_ID + ADZUNA_APP_KEY" },
  hunter: { name: "Hunter.io (LinkedIn-matched executive emails)", envHint: "HUNTER_API_KEY" },
};

const QUOTA_LABELS: Record<string, string> = {
  jsearch: "JSearch (monthly)",
  adzuna: "Adzuna (daily)",
  google_places: "Google Places (monthly)",
  groq: "Groq (daily)",
  hunter: "Hunter.io (monthly)",
};

export function SettingsPage() {
  const trpc = useTRPC();
  const { data: health } = useQuery(trpc.system.health.queryOptions());
  const { data: quotas } = useQuery(trpc.settings.quotaUsage.queryOptions(undefined, { staleTime: 10_000 }));

  const features = health?.features as Record<string, boolean> | undefined;

  return (
    <div>
      <PageHeader title="Settings" description="Provider keys, quota usage, and pipeline tunables" />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">API Providers</h2>
          <div className="space-y-2.5">
            {Object.entries(PROVIDER_LABELS).map(([key, meta]) => {
              const on = features?.[key] ?? false;
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{meta.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{meta.envHint}</div>
                  </div>
                  {on ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                      <XCircle className="h-4 w-4" /> Not configured
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {health?.simulate && (
            <p className="mt-4 rounded-lg bg-info/10 p-3 text-xs leading-relaxed text-info">
              Simulate mode is on: no job-board keys were found, so mining runs use clearly-marked sample data. Add
              RAPIDAPI_KEY (JSearch) and ADZUNA_APP_ID/ADZUNA_APP_KEY to the .env file and restart to mine real
              postings.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">API Quota Usage</h2>
          <div className="space-y-4">
            {quotas?.map((q) => {
              const pct = q.cap > 0 ? Math.min(100, Math.round((q.used / q.cap) * 100)) : 0;
              return (
                <div key={q.provider}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{QUOTA_LABELS[q.provider] ?? q.provider}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(q.used)} / {formatNumber(q.cap)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">period {q.period}</div>
                </div>
              );
            })}
            {!quotas && <p className="text-sm text-muted-foreground">Loading…</p>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Caps guard the free tiers: JSearch 200 requests/month, Adzuna ~250/day, Google Places pay-as-you-go, Groq
            free tier daily tokens. Calls are counted before each request, so a failed call still consumes budget.
          </p>
        </div>
      </div>
    </div>
  );
}
