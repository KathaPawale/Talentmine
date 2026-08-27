import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "../../db/client";
import type { StageFn } from "../types";
import type { RunTotals } from "@shared/types";

export const doneStage: StageFn = async (ctx) => {
  // Recompute per-company posting counts (non-duplicate postings only).
  const companies = ctx.db.select().from(schema.companies).where(eq(schema.companies.jobId, ctx.jobId)).all();
  for (const c of companies) {
    const row = ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.jobPostings)
      .where(and(eq(schema.jobPostings.companyId, c.id), isNull(schema.jobPostings.duplicateOfId)))
      .get();
    ctx.db
      .update(schema.companies)
      .set({ postingsCount: row?.n ?? 0, updatedAt: new Date() })
      .where(eq(schema.companies.id, c.id))
      .run();
  }

  const allPostings = ctx.db
    .select({ duplicateOfId: schema.jobPostings.duplicateOfId, companyId: schema.jobPostings.companyId })
    .from(schema.jobPostings)
    .where(eq(schema.jobPostings.jobId, ctx.jobId))
    .all();
  const agencies = companies.filter((c) => c.classification === "staffing_agency");
  const agencyIds = new Set(agencies.map((c) => c.id));

  const totals: RunTotals = {
    rawPostings: allPostings.length,
    uniquePostings: allPostings.filter((p) => p.duplicateOfId === null).length,
    companiesDiscovered: companies.length,
    atsFound: companies.filter((c) => c.atsType && c.atsType !== "none" && c.atsType !== "careers_page").length,
    directEmployers: companies.filter((c) => c.classification === "direct_employer").length,
    agenciesExcluded: allPostings.filter((p) => p.duplicateOfId === null && agencyIds.has(p.companyId)).length,
    enriched: companies.filter((c) => c.placeId !== null).length,
  };

  ctx.db.update(schema.jobs).set({ totals }).where(eq(schema.jobs.id, ctx.jobId)).run();
  ctx.emit(
    "success",
    `Run complete: ${totals.uniquePostings} unique postings from ${totals.companiesDiscovered} companies — ${totals.directEmployers} direct employers, ${totals.agenciesExcluded} agency postings flagged.`,
  );
  return {};
};
