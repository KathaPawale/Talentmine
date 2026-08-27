import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ExternalLink, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CLASSIFICATIONS, ROLE_CATEGORY_LABELS, type Classification } from "@shared/types";
import {
  companyLinkedInUrl,
  natureOfBusinessLabel,
} from "@shared/company-profile";
import { NO_VERIFIED_EXECUTIVE_CONTACT } from "@shared/executive-contact";
import type { CompanyRow, ExecutiveContactRow } from "@server/db/schema";
import { useTRPC } from "@/lib/trpc";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { ExecutiveContacts } from "@/components/shared/ExecutiveContacts";

const inputCls =
  "rounded-lg border border-input bg-black/20 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50";

const CLS_LABEL: Record<Classification, string> = {
  direct_employer: "Direct employer",
  staffing_agency: "Excluded company",
  unknown: "Unknown",
};

function ClassificationPill({ c, confidence }: { c: Classification; confidence: number }) {
  const tone = c === "direct_employer" ? "success" : c === "staffing_agency" ? "warning" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusPill tone={tone} label={CLS_LABEL[c]} size="sm" />
      {confidence > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{confidence}%</span>}
    </span>
  );
}

const PAGE_SIZE = 50;
type CompanyListRow = CompanyRow & { executiveContacts: ExecutiveContactRow[] };

export function CompaniesPage() {
  const trpc = useTRPC();
  const [clsFilter, setClsFilter] = useState<Classification | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery(
    trpc.companies.list.queryOptions({
      classification: clsFilter,
      search: debouncedSearch || undefined,
      hasPostings: true,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  );

  const columns: DataTableColumn<CompanyListRow>[] = [
    {
      id: "name",
      header: "Company",
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{c.name}</div>
          <div className="truncate text-xs text-muted-foreground">{c.domain ?? "—"}</div>
        </div>
      ),
    },
    {
      id: "nature",
      header: "Nature of Business",
      cell: (c) => <span className="whitespace-nowrap text-sm">{natureOfBusinessLabel(c)}</span>,
    },
    {
      id: "contact",
      header: "Senior decision-maker",
      cell: (c) => {
        const top = c.executiveContacts[0];
        return (
          <span className="whitespace-nowrap text-sm">
            {top ? `${top.name} — ${top.title}` : NO_VERIFIED_EXECUTIVE_CONTACT}
          </span>
        );
      },
    },
    { id: "location", header: "Location", cell: (c) => [c.city, c.country].filter(Boolean).join(", ") || "—" },
    {
      id: "ats",
      header: "ATS",
      cell: (c) =>
        c.atsType && c.atsType !== "none" ? (
          <span className="rounded bg-violet/15 px-2 py-0.5 text-xs capitalize text-violet">{c.atsType.replace("_", " ")}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "cls",
      header: "Classification",
      cell: (c) => <ClassificationPill c={c.classification} confidence={c.classificationConfidence} />,
    },
    {
      id: "postings",
      header: "Open postings",
      cell: (c) => <span className="font-semibold tabular-nums text-primary">{c.postingsCount}</span>,
    },
    { id: "executives", header: "Executives", cell: (c) => <span className="tabular-nums">{c.executiveContacts.length}/3</span> },
  ];

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Companies"
        description={`${formatNumber(total)} hiring companies with deduplicated senior decision-makers`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search companies…"
          className={cn(inputCls, "w-64")}
        />
        {CLASSIFICATIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setClsFilter(clsFilter === c ? undefined : c);
              setPage(0);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              clsFilter === c
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "bg-muted text-slate-400 ring-1 ring-border hover:text-foreground",
            )}
          >
            {CLS_LABEL[c]}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={data?.rows}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={(c) => setSelectedId(c.id)}
        empty={{
          icon: Building2,
          title: "No companies found",
          description: "Run a mining job to populate this list.",
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
        {selectedId && <CompanyDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
      </AnimatePresence>
    </div>
  );
}

function CompanyDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data } = useQuery(trpc.companies.get.queryOptions({ id }));

  const reclassifyMut = useMutation(
    trpc.companies.reclassify.mutationOptions({
      onSuccess: () => {
        toast.success("Classification updated");
        void qc.invalidateQueries({ queryKey: trpc.companies.pathKey() });
        void qc.invalidateQueries({ queryKey: trpc.postings.pathKey() });
      },
    }),
  );

  const c = data?.company;
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
            <h2 className="text-lg font-bold leading-tight">{c?.name ?? "…"}</h2>
            {c?.website && (
              <a
                href={c.website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {c.domain ?? c.website}
              </a>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {c && (
          <>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Location", [c.address, c.city, c.region, c.country].filter(Boolean).join(", ") || "—"],
                ["Company main phone", c.phone ?? "Unavailable"],
                ["Nature of Business", natureOfBusinessLabel(c)],
                ["ATS", c.atsType && c.atsType !== "none" ? c.atsType.replace("_", " ") : "—"],
                ["Classified by", c.classificationMethod ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium capitalize">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Company LinkedIn</dt>
                <dd>
                  {c.name ? (
                    <a href={companyLinkedInUrl(c)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> {c.linkedinUrl ? "View company" : "Find company"}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Unavailable</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Senior decision-makers ({data?.executiveContacts.length ?? 0}/3)
              </h3>
              <ExecutiveContacts contacts={data?.executiveContacts ?? []} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <ClassificationPill c={c.classification} confidence={c.classificationConfidence} />
              </div>
              {c.classificationReason && (
                <p className="text-xs leading-relaxed text-muted-foreground">{c.classificationReason}</p>
              )}
              <div className="mt-3 flex gap-2">
                {CLASSIFICATIONS.filter((cls) => cls !== c.classification).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    disabled={reclassifyMut.isPending}
                    onClick={() => reclassifyMut.mutate({ id: c.id, classification: cls })}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Mark {CLS_LABEL[cls].toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Open postings ({data?.postings.length ?? 0})
              </h3>
              <div className="space-y-2">
                {data?.postings.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.title}</span>
                      {p.applyUrl && (
                        <a href={p.applyUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {ROLE_CATEGORY_LABELS[p.roleCategory]} · {[p.city, p.country].filter(Boolean).join(", ") || (p.isRemote ? "Remote" : "—")} · {relativeTime(p.postedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.aside>
    </>
  );
}
