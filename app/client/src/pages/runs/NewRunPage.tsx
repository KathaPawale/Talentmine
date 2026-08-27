import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Briefcase, Compass, MapPin, Play, SlidersHorizontal } from "lucide-react";
import {
  runCreateSchema,
  SOURCE_KEYS,
  ROLE_CATEGORIES,
  ROLE_CATEGORY_LABELS,
  adzunaCountryCode,
  type RunCreateInput,
  type SourceKey,
} from "@shared/types";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChipSelect } from "@/components/shared/ChipSelect";
import { TagInput } from "@/components/shared/TagInput";
import { ToggleCard } from "@/components/shared/ToggleCard";
import { SOURCE_LABEL } from "./shared";

const ROLE_PRESETS = [
  "Accountant",
  "Senior Accountant",
  "Management Accountant",
  "Finance Controller",
  "Fractional CFO",
  "Virtual CFO",
  "FP&A Analyst",
  "Head of Finance",
  "Paraplanner",
  "Managing Director",
  "CFO Services",
  "HR Manager",
  "Sales Executive",
  "Marketing Manager",
  "Operations Manager",
  "Software Engineer",
  "Customer Support",
  "Office Administrator",
];
const INDUSTRY_PRESETS = [
  "IT Services",
  "Manufacturing",
  "Healthcare",
  "Finance",
  "Retail",
  "Logistics",
  "Real Estate",
  "Education",
  "Hospitality",
];
const COUNTRY_PRESETS = ["United Kingdom", "United States", "Canada", "UAE", "India", "Australia", "Singapore", "Germany"];
const TARGET_OPTIONS = [50, 100, 200, 500, 1000];
const POSTED_OPTIONS = [7, 14, 30, 60, 90];

const SOURCE_META: Record<SourceKey, { badge: string; description: string }> = {
  jsearch: {
    badge: "API",
    description: "Google for Jobs aggregation — includes LinkedIn, Indeed, and Glassdoor postings. Free tier: 200 requests/month.",
  },
  adzuna: {
    badge: "API",
    description: "Job-board API with salary data across ~20 countries. Free tier: ~250 calls/day.",
  },
  ats: {
    badge: "FREE",
    description: "Discover companies via Google Places and mine their Greenhouse/Lever/Workable boards and careers pages directly.",
  },
};

const inputCls =
  "w-full rounded-lg border border-input bg-black/20 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50";

type RunFormValues = z.input<typeof runCreateSchema>;

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function NewRunPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: health } = useQuery(trpc.system.health.queryOptions(undefined, { staleTime: 60_000 }));
  const [customCountry, setCustomCountry] = useState(false);

  const form = useForm<RunFormValues, unknown, RunCreateInput>({
    resolver: zodResolver(runCreateSchema),
    defaultValues: {
      name: "",
      country: "",
      region: "",
      city: "",
      roleKeywords: [],
      roleCategories: [],
      industries: [],
      sources: [...SOURCE_KEYS],
      remoteOnly: false,
      postedWithinDays: 30,
      targetCount: 200,
      excludeAgencies: true,
      enrichCompanies: false,
    },
  });

  const createMut = useMutation(
    trpc.runs.create.mutationOptions({
      onSuccess: ({ id }) => {
        void qc.invalidateQueries({ queryKey: trpc.runs.pathKey() });
        toast.success("Mining run started");
        navigate(`/runs/${id}`);
      },
    }),
  );

  const values = form.watch();
  const roleKeywords = values.roleKeywords ?? [];
  const roleCategories = values.roleCategories ?? [];
  const industries = values.industries ?? [];
  const sources = values.sources ?? [];
  const targetCount = values.targetCount ?? 200;
  const postedWithinDays = values.postedWithinDays ?? 30;
  const country = values.country ?? "";
  const errors = form.formState.errors;

  const features = health?.features;
  const simulate = health?.simulate ?? false;
  const sourceAvailable: Record<SourceKey, boolean> = {
    jsearch: simulate || (features?.jsearch ?? false),
    adzuna: simulate || (features?.adzuna ?? false),
    ats: true, // works keyless (better with a Places key)
  };
  const adzunaCovers = country ? adzunaCountryCode(country) !== null : true;

  const onSubmit = form.handleSubmit(
    (vals) => createMut.mutate(vals),
    () => toast.error("Fix the highlighted fields before starting"),
  );

  const summaryRows: [string, string][] = [
    ["Name", values.name?.trim() || "—"],
    ["Location", [values.city, values.region, country].filter(Boolean).join(", ") || "—"],
    ["Roles", roleKeywords.length > 0 ? roleKeywords.join(", ") : "—"],
    ["Sources", sources.length > 0 ? sources.map((s) => SOURCE_LABEL[s]).join(", ") : "—"],
    ["Posted within", `${postedWithinDays} days`],
    ["Target", String(targetCount)],
    ["Recruiter filter", values.excludeAgencies !== false ? "On" : "Off"],
  ];

  const countrySelectValue = customCountry || (country !== "" && !COUNTRY_PRESETS.includes(country)) ? "__custom" : country;

  return (
    <div>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Runs
      </Link>
      <PageHeader
        title="New Mining Run"
        description="Pick a location, the roles you want demand signals for, and the sources to mine"
      />
      <form onSubmit={onSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section icon={Briefcase} title="Basics">
            <Field label="Run name" error={errors.name?.message}>
              <input {...form.register("name")} placeholder="e.g. Accountants — Mumbai, August" className={inputCls} />
            </Field>
            <Field label="Role keywords (what to search for)" error={errors.roleKeywords?.message}>
              <ChipSelect
                options={ROLE_PRESETS.map((v) => ({ value: v, label: v }))}
                value={roleKeywords}
                onChange={(v) => form.setValue("roleKeywords", v, { shouldValidate: true })}
                allowCustom
              />
            </Field>
            <Field label="Role categories (optional result filter)">
              <ChipSelect
                options={ROLE_CATEGORIES.filter((c) => c !== "other").map((v) => ({
                  value: v,
                  label: ROLE_CATEGORY_LABELS[v],
                }))}
                value={roleCategories}
                onChange={(v) => form.setValue("roleCategories", v as typeof roleCategories, { shouldValidate: true })}
              />
            </Field>
          </Section>

          <Section icon={MapPin} title="Location">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Country" error={errors.country?.message}>
                <select
                  value={countrySelectValue}
                  onChange={(e) => {
                    if (e.target.value === "__custom") {
                      setCustomCountry(true);
                      form.setValue("country", "");
                    } else {
                      setCustomCountry(false);
                      form.setValue("country", e.target.value, { shouldValidate: true });
                    }
                  }}
                  className={inputCls}
                >
                  <option value="" disabled>
                    Select country…
                  </option>
                  {COUNTRY_PRESETS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__custom">Other…</option>
                </select>
                {countrySelectValue === "__custom" && (
                  <input
                    value={country}
                    onChange={(e) => form.setValue("country", e.target.value, { shouldValidate: true })}
                    placeholder="Country name"
                    className={cn(inputCls, "mt-2")}
                  />
                )}
              </Field>
              <Field label="Region / State">
                <input {...form.register("region")} placeholder="e.g. Maharashtra" className={inputCls} />
              </Field>
              <Field label="City (optional)">
                <input {...form.register("city")} placeholder="e.g. Mumbai" className={inputCls} />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={values.remoteOnly ?? false}
                onChange={(e) => form.setValue("remoteOnly", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">Remote positions only</span>
            </label>
          </Section>

          <Section icon={Compass} title="Sources">
            <div className="grid gap-3 sm:grid-cols-3">
              {SOURCE_KEYS.map((key) => {
                const meta = SOURCE_META[key];
                const available = sourceAvailable[key];
                return (
                  <ToggleCard
                    key={key}
                    title={SOURCE_LABEL[key]}
                    description={meta.description}
                    badge={available ? meta.badge : "ADD KEY"}
                    disabled={!available}
                    disabledReason="Add the API key in .env to enable this source"
                    checked={sources.includes(key) && available}
                    onCheckedChange={(on) => {
                      const next = SOURCE_KEYS.filter((k) => (k === key ? on : sources.includes(k)));
                      form.setValue("sources", next, { shouldValidate: true });
                    }}
                  />
                );
              })}
            </div>
            {errors.sources?.message && <p className="text-xs text-danger">{errors.sources.message}</p>}
            {!adzunaCovers && sources.includes("adzuna") && (
              <p className="text-xs text-warning">
                Adzuna does not cover {country || "this country"} — it will be skipped for this run. JSearch and career-site
                mining are global.
              </p>
            )}
            {sources.includes("ats") && (
              <Field label="Industries (seed company discovery for career-site mining)">
                <ChipSelect
                  options={INDUSTRY_PRESETS.map((v) => ({ value: v, label: v }))}
                  value={industries}
                  onChange={(v) => form.setValue("industries", v, { shouldValidate: true })}
                  allowCustom
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Career-site yield depends on this: pick industries whose companies actually employ your target
                  roles (e.g. large employers for accountants), or leave empty to derive searches from the role
                  keywords instead.
                </p>
              </Field>
            )}
          </Section>

          <Section icon={SlidersHorizontal} title="Filters & Limits">
            <Field label="Posted within">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                {POSTED_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => form.setValue("postedWithinDays", n, { shouldValidate: true })}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                      postedWithinDays === n ? "bg-primary/15 text-primary" : "text-slate-400 hover:text-foreground",
                    )}
                  >
                    {n}d
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Target posting count">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                {TARGET_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => form.setValue("targetCount", n, { shouldValidate: true })}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                      targetCount === n ? "bg-primary/15 text-primary" : "text-slate-400 hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={values.excludeAgencies ?? true}
                onChange={(e) => form.setValue("excludeAgencies", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-sm">
                Exclude third-party recruiters
                <span className="block text-xs text-muted-foreground">
                  Staffing agencies are detected (rules + AI) and hidden from results. They stay recoverable and can be
                  reclassified manually.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={values.enrichCompanies ?? false}
                onChange={(e) => form.setValue("enrichCompanies", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-sm">
                Enrich employers with address & phone
                <span className="block text-xs text-muted-foreground">
                  Uses extra Google Places calls for direct employers found on job boards.
                </span>
              </span>
            </label>
          </Section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2.5">
              {summaryRows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Start Mining
                </>
              )}
            </button>
            {simulate && (
              <p className="mt-3 text-xs text-info">
                Simulate mode: no job-board API keys detected, so this run uses clearly-marked sample data. Add keys in
                .env to mine real postings.
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
