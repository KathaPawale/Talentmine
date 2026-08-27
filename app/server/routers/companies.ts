import { z } from "zod";
import { and, desc, eq, gt, isNull, like, ne, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";
import { CLASSIFICATIONS } from "@shared/types";

export const companiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        runId: z.string().optional(),
        classification: z.enum(CLASSIFICATIONS).optional(),
        hasPostings: z.boolean().default(true),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) => {
      const conds: SQL[] = [];
      if (input.runId) conds.push(eq(schema.companies.jobId, input.runId) as unknown as SQL);
      if (input.classification) {
        conds.push(eq(schema.companies.classification, input.classification) as unknown as SQL);
      } else {
        // Excluded employers stay out of normal results. The explicit staffing
        // filter remains available for manual review/recovery of false positives.
        conds.push(ne(schema.companies.classification, "staffing_agency") as unknown as SQL);
      }
      if (input.hasPostings) conds.push(gt(schema.companies.postingsCount, 0) as unknown as SQL);
      if (input.search) conds.push(like(schema.companies.name, `%${input.search}%`) as unknown as SQL);
      const base = conds.length > 0 ? and(...conds) : undefined;

      const total =
        ctx.db
          .select({ n: sql<number>`count(*)` })
          .from(schema.companies)
          .where(base)
          .get()?.n ?? 0;
      const rows = ctx.db
        .select()
        .from(schema.companies)
        .where(base)
        .orderBy(desc(schema.companies.postingsCount), desc(schema.companies.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
      return {
        total,
        rows: rows.map((company) => ({
          ...company,
          executiveContacts: ctx.db
            .select()
            .from(schema.executiveContacts)
            .where(eq(schema.executiveContacts.companyId, company.id))
            .orderBy(schema.executiveContacts.rank)
            .limit(3)
            .all(),
        })),
      };
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const company = ctx.db.select().from(schema.companies).where(eq(schema.companies.id, input.id)).get();
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    const postings = ctx.db
      .select()
      .from(schema.jobPostings)
      .where(and(eq(schema.jobPostings.companyId, input.id), isNull(schema.jobPostings.duplicateOfId)))
      .orderBy(desc(schema.jobPostings.postedAt))
      .all();
    const executiveContacts = ctx.db
      .select()
      .from(schema.executiveContacts)
      .where(eq(schema.executiveContacts.companyId, input.id))
      .orderBy(schema.executiveContacts.rank)
      .limit(3)
      .all();
    return { company, executiveContacts, postings };
  }),

  /** Manual override for the agency filter — a human beats both heuristic and LLM. */
  reclassify: protectedProcedure
    .input(z.object({ id: z.string(), classification: z.enum(CLASSIFICATIONS) }))
    .mutation(({ ctx, input }) => {
      const company = ctx.db.select().from(schema.companies).where(eq(schema.companies.id, input.id)).get();
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      ctx.db
        .update(schema.companies)
        .set({
          classification: input.classification,
          classificationConfidence: 100,
          classificationMethod: "manual",
          classificationReason: `Manually set by ${ctx.user.email}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, input.id))
        .run();
      return { ok: true };
    }),
});
