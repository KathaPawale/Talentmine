import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, Radar, ShieldCheck, ShieldOff, Plus } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils";
import { ROLE_CATEGORY_LABELS, POSTING_SOURCE_LABELS, type PostingSource, type RoleCategory } from "@shared/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState } from "@/components/shared/EmptyState";
import { DonutChart } from "@/components/charts/DonutChart";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";

const HeroGlobe = lazy(() => import("@/components/three/HeroGlobe"));

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90";

export function DashboardPage() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.dashboard.overview.queryOptions(undefined, { staleTime: 15_000 }));

  const stats = data?.stats;
  const roleData = Object.entries(data?.byRole ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, value], i) => ({
      name: ROLE_CATEGORY_LABELS[cat as RoleCategory] ?? cat,
      value,
      color: CHART_COLORS[i % CHART_COLORS.length]!,
    }));
  const sourceData = Object.entries(data?.bySource ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([source, value]) => ({ label: POSTING_SOURCE_LABELS[source as PostingSource] ?? source, value }));
  const seriesData = (data?.series ?? []).map((s) => ({ date: s.week, series1: s.count }));

  const empty = !isLoading && (stats?.totalPostings ?? 0) === 0 && (stats?.runsActive ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Talent demand across every mining run"
        actions={
          <Link href="/runs/new" className={primaryBtn}>
            <Plus className="h-4 w-4" /> New Run
          </Link>
        }
      />

      <div className="glow-hero mb-6 grid grid-cols-2 gap-4 rounded-2xl border border-border p-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Job postings" value={stats ? formatNumber(stats.totalPostings) : undefined} icon={Briefcase} accent="text-primary" href="/postings" />
        <StatCard label="Hiring companies" value={stats ? formatNumber(stats.companies) : undefined} icon={Building2} href="/companies" />
        <StatCard label="Direct employers" value={stats ? formatNumber(stats.directEmployers) : undefined} icon={ShieldCheck} accent="text-success" />
        <StatCard label="Agency postings filtered" value={stats ? formatNumber(stats.agencyPostingsExcluded) : undefined} icon={ShieldOff} accent="text-warning" />
        <StatCard label="Runs completed" value={stats ? formatNumber(stats.runsCompleted) : undefined} icon={Radar} href="/runs" />
      </div>

      {empty ? (
        <EmptyState
          icon={Radar}
          title="Nothing mined yet"
          description="Start your first mining run to see talent demand light up here."
          action={
            <Link href="/runs/new" className={primaryBtn}>
              <Plus className="h-4 w-4" /> New Run
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Postings per week</h2>
              <TimeSeriesChart data={seriesData} labels={{ series1: "Postings" }} height={240} />
            </div>
            <div className="glass-panel hidden h-[300px] overflow-hidden rounded-xl lg:block">
              <Suspense fallback={<div className="glow-hero h-full" />}>
                <HeroGlobe markers={data?.markers ?? []} />
              </Suspense>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Demand by role category</h2>
              <DonutChart data={roleData} centerLabel="Postings" centerValue={formatNumber(stats?.totalPostings ?? 0)} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {roleData.map((d) => (
                  <span key={d.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name} <span className="tabular-nums">{d.value}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Postings by source</h2>
              <FunnelChart stages={sourceData} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Top hiring companies</h2>
              <div className="space-y-2">
                {data?.topCompanies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.city, c.country].filter(Boolean).join(", ") || c.domain || "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {c.atsType && c.atsType !== "none" && c.atsType !== "careers_page" && (
                        <StatusPill tone="info" label={c.atsType} size="sm" />
                      )}
                      <span className="text-sm font-bold tabular-nums text-primary">{c.postingsCount}</span>
                    </div>
                  </div>
                ))}
                {(data?.topCompanies.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No companies yet.</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Top locations</h2>
              <div className="space-y-1.5">
                {data?.topLocations.map((l) => (
                  <div key={l.location} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-300">{l.location}</span>
                    <span className="tabular-nums text-muted-foreground">{l.count}</span>
                  </div>
                ))}
                {(data?.topLocations.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No location data yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
