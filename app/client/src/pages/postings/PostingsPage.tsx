import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ExternalLink, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  POSTING_SOURCE_LABELS,
  ROLE_CATEGORIES,
  ROLE_CATEGORY_LABELS,
  type PostingSource,
  type RoleCategory,
} from "@shared/types";
import { useTRPC } from "@/lib/trpc";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { ExecutiveContacts } from "@/components/shared/ExecutiveContacts";
import type { ExecutiveContactRow } from "@server/db/schema";

const inputCls =
  "rounded-lg border border-input bg-black/20 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50";

type Row = {
  posting: {
    id: string;
    title: string;
    roleCategory: RoleCategory;
    city: string | null;
    region: string | null;
    country: string | null;
    isRemote: boolean;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    salaryPeriod: "year" | "month" | "hour" | null;
    employmentType: string | null;
    postedAt: Date | null;
    applyUrl: string | null;
    sourceUrl: string | null;
    source: PostingSource;
    alsoSeenOn: PostingSource[];
    descriptionSnippet: string;
  };
  companyName: string;
  companyDomain: string | null;
  companyWebsite: string | null;
  companyLinkedinUrl: string | null;
  companyIndustry: string | null;
  companyPhone: string | null;
  companyCity: string | null;
  companyRegion: string | null;
  companyCountry: string | null;
  companyClassification: string;
  companyAts: string | null;
  executiveContacts: ExecutiveContactRow[];
};

export function salaryLabel(p: Row["posting"]): string {
  if (p.salaryMin == null && p.salaryMax == null) return "—";
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = [p.salaryMin, p.salaryMax]
    .filter((n): n is number => n != null)
    .map(fmt)
    .join("–");
  return `${p.salaryCurrency ?? ""} ${range}${p.salaryPeriod ? `/${p.salaryPeriod === "year" ? "yr" : p.salaryPeriod === "month" ? "mo" : "hr"}` : ""}`.trim();
}

export function locationLabel(p: { city: string | null; country: string | null; isRemote: boolean }): string {
  if (p.isRemote) return `Remote${p.country ? ` (${p.country})` : ""}`;
  return [p.city, p.country].filter(Boolean).join(", ") || "—";
}

function postingDateLabel(date: Date | null): string {
  if (!date) return "—";
  const exact = date.toLocaleDateString();
  const relative = relativeTime(date);
  return relative === exact ? exact : `${exact} (${relative})`;
}

const PAGE_SIZE = 50;

export function PostingsPage() {
  const trpc = useTRPC();
  const [roleFilter, setRoleFilter] = useState<RoleCategory[]>([]);
  const [search, setSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [includeAgencies, setIncludeAgencies] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = {
    roleCategories: roleFilter,
    sources: [],
    search: debouncedSearch || undefined,
    remoteOnly,
    includeAgencies,
  };
  const { data, isLoading } = useQuery(
    trpc.postings.list.queryOptions({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  );
  const { data: stats } = useQuery(trpc.postings.stats.queryOptions(filters));

  const columns: DataTableColumn<Row>[] = [
    {
      id: "title",
      header: "Job Title",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.posting.title}</div>
          <div className="truncate text-xs text-muted-foreground">{r.companyName}</div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: (r) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ROLE_CATEGORY_LABELS[r.posting.roleCategory]}</span>
      ),
    },
    { id: "location", header: "Location", cell: (r) => locationLabel(r.posting) },
    { id: "salary", header: "Salary", cell: (r) => <span className="tabular-nums">{salaryLabel(r.posting)}</span> },
    {
      id: "source",
      header: "Source",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <span className="text-xs">{POSTING_SOURCE_LABELS[r.posting.source]}</span>
          {r.posting.alsoSeenOn.length > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title={r.posting.alsoSeenOn.map((s) => POSTING_SOURCE_LABELS[s]).join(", ")}>
              +{r.posting.alsoSeenOn.length}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "cls",
      header: "Employer",
      cell: (r) =>
        r.companyClassification === "staffing_agency" ? (
          <StatusPill tone="warning" label="Agency" size="sm" />
        ) : r.companyClassification === "direct_employer" ? (
          <StatusPill tone="success" label="Direct" size="sm" />
        ) : (
          <StatusPill tone="neutral" label="Unknown" size="sm" />
        ),
    },
    {
      id: "executives",
      header: "Executives",
      cell: (r) => <span className="font-semibold tabular-nums text-primary">{r.executiveContacts.length}/3</span>,
    },
    { id: "posted", header: "Posted", cell: (r) => relativeTime(r.posting.postedAt) },
  ];

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Job Postings" description={`${formatNumber(total)} unique postings mined`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search title or company…"
          className={cn(inputCls, "w-64")}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => {
              setRemoteOnly(e.target.checked);
              setPage(0);
            }}
            className="h-3.5 w-3.5 accent-primary"
          />
          Remote only
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeAgencies}
            onChange={(e) => {
              setIncludeAgencies(e.target.checked);
              setPage(0);
            }}
            className="h-3.5 w-3.5 accent-primary"
          />
          Show agency postings
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ROLE_CATEGORIES.map((cat) => {
          const count = stats?.byRole[cat] ?? 0;
          if (count === 0 && !roleFilter.includes(cat)) return null;
          const active = roleFilter.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setRoleFilter(active ? roleFilter.filter((c) => c !== cat) : [...roleFilter, cat]);
                setPage(0);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "bg-muted text-slate-400 ring-1 ring-border hover:text-foreground",
              )}
            >
              {ROLE_CATEGORY_LABELS[cat]} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={data?.rows as Row[] | undefined}
        isLoading={isLoading}
        rowKey={(r) => r.posting.id}
        onRowClick={(r) => setSelected(r)}
        empty={{
          icon: Briefcase,
          title: "No postings match",
          description: "Run a mining job or loosen the filters.",
        }}
      />

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected && <PostingDrawer row={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function PostingDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const p = row.posting;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.2 }}
        className="glass-panel fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-tight">{p.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{row.companyName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="space-y-2.5 text-sm">
          {[
            ["Role category", ROLE_CATEGORY_LABELS[p.roleCategory]],
            ["Location", locationLabel(p)],
            ["Salary", salaryLabel(p)],
            ["Employment type", p.employmentType?.replace("_", " ") ?? "—"],
            ["Posted", postingDateLabel(p.postedAt)],
            ["Source", POSTING_SOURCE_LABELS[p.source]],
            [
              "Also seen on",
              p.alsoSeenOn.length > 0 ? p.alsoSeenOn.map((s) => POSTING_SOURCE_LABELS[s]).join(", ") : "—",
            ],
            ["Employer type", row.companyClassification.replace("_", " ")],
            ["Industry", row.companyIndustry ?? "—"],
            ["Company main phone", row.companyPhone ?? "Unavailable"],
            ["Company region", [row.companyCity, row.companyRegion, row.companyCountry].filter(Boolean).join(", ") || "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">Company LinkedIn</dt>
            <dd className="text-right font-medium">
              {row.companyLinkedinUrl ? (
                <a
                  href={row.companyLinkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View company
                </a>
              ) : (
                <span className="text-muted-foreground">Unavailable</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(row.companyWebsite || row.companyDomain) && (
            <a
              href={row.companyWebsite ?? `https://${row.companyDomain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-primary hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Company website
            </a>
          )}
          {p.sourceUrl && (
            <a
              href={p.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-primary hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Source URL
            </a>
          )}
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Senior decision-makers ({row.executiveContacts.length}/3)
          </h3>
          <ExecutiveContacts contacts={row.executiveContacts} />
        </div>

        {p.descriptionSnippet && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h3>
            <p className="text-sm leading-relaxed text-slate-300">{p.descriptionSnippet}</p>
          </div>
        )}

        {p.applyUrl && (
          <a
            href={p.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" /> Open Job Posting
          </a>
        )}
      </motion.aside>
    </>
  );
}
