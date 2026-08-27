import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";
import { POSTING_SOURCES, ROLE_CATEGORIES } from "@shared/types";

export const postingFiltersSchema = z.object({
  runId: z.string().optional(),
  roleCategories: z.array(z.enum(ROLE_CATEGORIES)).default([]),
  sources: z.array(z.enum(POSTING_SOURCES)).default([]),
  country: z.string().optional(),
  search: z.string().max(120).optional(),
  remoteOnly: z.boolean().default(false),
  postedAfterDays: z.number().int().min(1).max(365).optional(),
  /** Off by default: staffing-agency postings stay hidden. */
  includeAgencies: z.boolean().default(false),
});
export type PostingFilters = z.infer<typeof postingFiltersSchema>;

export function postingConditions(f: PostingFilters): SQL[] {
  const conds: SQL[] = [isNull(schema.jobPostings.duplicateOfId) as unknown as SQL];
  if (f.runId) conds.push(eq(schema.jobPostings.jobId, f.runId) as unknown as SQL);
  if (f.roleCategories.length > 0) conds.push(inArray(schema.jobPostings.roleCategory, f.roleCategories) as unknown as SQL);
  if (f.sources.length > 0) conds.push(inArray(schema.jobPostings.source, f.sources) as unknown as SQL);
  if (f.remoteOnly) conds.push(eq(schema.jobPostings.isRemote, true) as unknown as SQL);
  if (f.country) conds.push(like(schema.jobPostings.country, `%${f.country}%`) as unknown as SQL);
  if (f.postedAfterDays) {
    conds.push(gte(schema.jobPostings.postedAt, new Date(Date.now() - f.postedAfterDays * 86_400_000)) as unknown as SQL);
  }
  if (f.search) {
    const term = `%${f.search}%`;
    conds.push(
      or(like(schema.jobPostings.title, term), like(schema.companies.name, term)) as unknown as SQL,
    );
  }
  if (!f.includeAgencies) {
    conds.push(ne(schema.companies.classification, "staffing_agency") as unknown as SQL);
  }
  return conds;
}

export const postingsRouter = router({
  list: protectedProcedure
    .input(
      postingFiltersSchema.extend({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) => {
      const conds = postingConditions(input);
      const base = and(...conds);

      const total =
        ctx.db
          .select({ n: sql<number>`count(*)` })
          .from(schema.jobPostings)
          .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
          .where(base)
          .get()?.n ?? 0;

      const rows = ctx.db
        .select({
          posting: schema.jobPostings,
          companyName: schema.companies.name,
          companyDomain: schema.companies.domain,
          companyWebsite: schema.companies.website,
          companyLinkedinUrl: schema.companies.linkedinUrl,
          companyIndustry: schema.companies.industry,
          companyPhone: schema.companies.phone,
          companyCity: schema.companies.city,
          companyRegion: schema.companies.region,
          companyCountry: schema.companies.country,
          companyClassification: schema.companies.classification,
          companyAts: schema.companies.atsType,
        })
        .from(schema.jobPostings)
        .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
        .where(base)
        .orderBy(desc(schema.jobPostings.postedAt), desc(schema.jobPostings.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
      return {
        total,
        rows: rows.map((row) => ({
          ...row,
          executiveContacts: ctx.db
            .select()
            .from(schema.executiveContacts)
            .where(eq(schema.executiveContacts.companyId, row.posting.companyId))
            .orderBy(schema.executiveContacts.rank)
            .limit(3)
            .all(),
        })),
      };
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db
      .select({
        posting: schema.jobPostings,
        company: schema.companies,
      })
      .from(schema.jobPostings)
      .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
      .where(eq(schema.jobPostings.id, input.id))
      .get();
    if (!row) return null;
    const executiveContacts = ctx.db
      .select()
      .from(schema.executiveContacts)
      .where(eq(schema.executiveContacts.companyId, row.company.id))
      .orderBy(schema.executiveContacts.rank)
      .limit(3)
      .all();
    return { ...row, executiveContacts };
  }),

  /** Counts by role/source for the filter bar (respects all filters except its own facet). */
  stats: protectedProcedure.input(postingFiltersSchema).query(({ ctx, input }) => {
    const conds = postingConditions({ ...input, roleCategories: [], sources: [] });
    const base = and(...conds);
    const rows = ctx.db
      .select({
        roleCategory: schema.jobPostings.roleCategory,
        source: schema.jobPostings.source,
        n: sql<number>`count(*)`,
      })
      .from(schema.jobPostings)
      .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
      .where(base)
      .groupBy(schema.jobPostings.roleCategory, schema.jobPostings.source)
      .all();

    const byRole: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const r of rows) {
      byRole[r.roleCategory] = (byRole[r.roleCategory] ?? 0) + r.n;
      bySource[r.source] = (bySource[r.source] ?? 0) + r.n;
    }
    return { byRole, bySource };
  }),
});
