import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Download, ExternalLink } from "lucide-react";
import { ROLE_CATEGORIES, ROLE_CATEGORY_LABELS, type RoleCategory } from "@shared/types";
import { companyLinkedInUrl } from "@shared/company-profile";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChipSelect } from "@/components/shared/ChipSelect";
import { ExecutiveContacts } from "@/components/shared/ExecutiveContacts";

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const [roleCategories, setRoleCategories] = useState<RoleCategory[]>([]);
  const [runId, setRunId] = useState<string>("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [includeAgencies, setIncludeAgencies] = useState(false);
  const [csvPending, setCsvPending] = useState(false);

  const filters = {
    runId: runId || undefined,
    roleCategories,
    sources: [],
    remoteOnly,
    includeAgencies,
  };

  const { data: runs } = useQuery(trpc.runs.list.queryOptions());
  const { data: preview, isLoading: previewLoading } = useQuery(
    trpc.postings.list.queryOptions({ ...filters, limit: 50, offset: 0 }),
  );

  const excelMut = useMutation(
    trpc.export.excel.mutationOptions({
      onSuccess: (res) => {
        const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        download(
          new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          res.filename,
        );
        toast.success(`Excel exported (${formatNumber(res.rows)} rows, 4 sheets)`);
      },
    }),
  );

  const exportCsv = async () => {
    setCsvPending(true);
    try {
      const res = await trpcClient.export.csv.query(filters);
      download(new Blob([res.csv], { type: "text/csv;charset=utf-8" }), res.filename);
      toast.success(`CSV exported (${formatNumber(res.rows)} rows)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV export failed");
    } finally {
      setCsvPending(false);
    }
  };

  const matched = preview?.total ?? 0;
  const inputCls =
    "rounded-lg border border-input bg-black/20 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50";

  return (
    <div>
      <PageHeader
        title="Export"
        description="Download job and company results with C-suite decision-maker contact details—never HR or job-poster contacts"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mining run
            </label>
            <select value={runId} onChange={(e) => setRunId(e.target.value)} className={cn(inputCls, "w-full")}>
              <option value="">All runs</option>
              {runs?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Role categories (empty = all)
            </label>
            <ChipSelect
              options={ROLE_CATEGORIES.map((v) => ({ value: v, label: ROLE_CATEGORY_LABELS[v] }))}
              value={roleCategories}
              onChange={(v) => setRoleCategories(v as RoleCategory[])}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Remote positions only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeAgencies}
              onChange={(e) => setIncludeAgencies(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Include staffing-agency postings
          </label>
        </div>

        <div className="glass-panel space-y-4 rounded-xl p-5 lg:sticky lg:top-6">
          <div>
            <div className="text-3xl font-bold tabular-nums text-primary">{formatNumber(matched)}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              postings match the filters
            </div>
          </div>
          <button
            type="button"
            disabled={excelMut.isPending || matched === 0}
            onClick={() => excelMut.mutate(filters)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {excelMut.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Download latest Excel (.xlsx)
          </button>
          <button
            type="button"
            disabled={csvPending || matched === 0}
            onClick={() => void exportCsv()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-muted disabled:opacity-50"
          >
            {csvPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Download CSV
          </button>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Excel has 4 sheets: Executive Contacts, Companies, Job Postings, and Summary. The Job Postings and Companies sheets include the requested company, executive, location, role, salary, and application fields,
            plus up to 3 senior decision-makers (Founder, Owner, CEO, CFO, COO, President, Managing Director, Partner,
            Finance Director, or Financial Controller) with primary and alternate email, phone, LinkedIn, source, and
            verification details when available. HR, recruiter, hiring-manager, and job-poster contacts are excluded.
            Capped at 10,000 rows.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-foreground">C-suite contact sheet preview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each card shows every required contact field. Missing public data is marked Unavailable and is never
              replaced with job-poster or HR information.
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            Showing {formatNumber(preview?.rows.length ?? 0)} of {formatNumber(matched)} postings
          </span>
        </div>

        {previewLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading contact sheet…</div>
        ) : preview?.rows.length ? (
          <div className="space-y-4">
            {preview.rows.map((row) => (
              <article key={row.posting.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                <div className="mb-3 grid gap-3 border-b border-border/60 pb-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Job</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{row.posting.title}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Company</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{row.companyName}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Company region
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {[row.companyRegion, row.companyCountry].filter(Boolean).join(", ") || "Unavailable"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Company LinkedIn
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {row.companyName ? (
                        <a
                          href={companyLinkedInUrl({ name: row.companyName, linkedinUrl: row.companyLinkedinUrl })}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> {row.companyLinkedinUrl ? "View company page" : "Find company"}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Unavailable</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  CFO / CEO / COO / Founder and other senior decision-makers ({row.executiveContacts.length}/3)
                </div>
                <ExecutiveContacts contacts={row.executiveContacts} />
              </article>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No job postings match the selected filters.
          </div>
        )}
      </section>
    </div>
  );
}
