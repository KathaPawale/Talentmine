import { z } from "zod";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";
import { runCreateSchema, STAGE_NAMES } from "@shared/types";
import { newId } from "../lib/crypto";
import { pokeQueue } from "../pipeline/queue";
import { abortLiveRun } from "../pipeline/runner";

function getRunOrThrow(ctx: { db: typeof import("../db/client").db }, id: string) {
  const run = ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
  return run;
}

export const runsRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).all();
  }),

  detail: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const run = getRunOrThrow(ctx, input.id);
    const companiesCount =
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.companies)
        .where(eq(schema.companies.jobId, run.id))
        .get()?.n ?? 0;
    const postings = ctx.db
      .select({
        duplicateOfId: schema.jobPostings.duplicateOfId,
        companyId: schema.jobPostings.companyId,
      })
      .from(schema.jobPostings)
      .where(eq(schema.jobPostings.jobId, run.id))
      .all();
    const agencies = new Set(
      ctx.db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(and(eq(schema.companies.jobId, run.id), eq(schema.companies.classification, "staffing_agency")))
        .all()
        .map((r) => r.id),
    );
    const direct =
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.companies)
        .where(and(eq(schema.companies.jobId, run.id), eq(schema.companies.classification, "direct_employer")))
        .get()?.n ?? 0;
    const unique = postings.filter((p) => p.duplicateOfId === null);
    const sourceRuns = ctx.db
      .select()
      .from(schema.sourceRuns)
      .where(eq(schema.sourceRuns.jobId, run.id))
      .orderBy(asc(schema.sourceRuns.startedAt))
      .all();

    return {
      job: run,
      stages: STAGE_NAMES,
      counts: {
        companies: companiesCount,
        rawPostings: postings.length,
        uniquePostings: unique.length,
        directEmployers: direct,
        agencyPostings: unique.filter((p) => agencies.has(p.companyId)).length,
      },
      sourceRuns,
    };
  }),

  events: protectedProcedure
    .input(z.object({ jobId: z.string(), afterSeq: z.number().int().default(0) }))
    .query(({ ctx, input }) => {
      return ctx.db
        .select()
        .from(schema.jobEvents)
        .where(and(eq(schema.jobEvents.jobId, input.jobId), gt(schema.jobEvents.seq, input.afterSeq)))
        .orderBy(asc(schema.jobEvents.seq))
        .limit(500)
        .all();
    }),

  create: protectedProcedure.input(runCreateSchema).mutation(({ ctx, input }) => {
    const id = newId();
    ctx.db
      .insert(schema.jobs)
      .values({ id, userId: ctx.user.id, name: input.name, config: input, createdAt: new Date() })
      .run();
    ctx.db
      .insert(schema.jobEvents)
      .values({ jobId: id, ts: new Date(), stage: "source_search", level: "info", message: `Run "${input.name}" queued.` })
      .run();
    queueMicrotask(pokeQueue);
    return { id };
  }),

  cancel: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const run = getRunOrThrow(ctx, input.id);
    if (run.status !== "running" && run.status !== "queued") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot cancel a ${run.status} run` });
    }
    if (run.status === "queued") {
      ctx.db
        .update(schema.jobs)
        .set({ status: "cancelled", cancelRequested: true, finishedAt: new Date() })
        .where(eq(schema.jobs.id, input.id))
        .run();
    } else {
      ctx.db.update(schema.jobs).set({ cancelRequested: true }).where(eq(schema.jobs.id, input.id)).run();
      abortLiveRun(input.id);
    }
    return { ok: true };
  }),

  resume: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const run = getRunOrThrow(ctx, input.id);
    if (!(run.status === "failed" && run.resumable) && run.status !== "cancelled") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed (resumable) or cancelled runs can be resumed" });
    }
    ctx.db
      .update(schema.jobs)
      .set({ status: "queued", cancelRequested: false, error: null, finishedAt: null, resumable: false })
      .where(eq(schema.jobs.id, input.id))
      .run();
    ctx.db
      .insert(schema.jobEvents)
      .values({
        jobId: input.id,
        ts: new Date(),
        stage: run.currentStage ?? "source_search",
        level: "info",
        message: `Run re-queued — resuming from ${run.completedStages.length}/${STAGE_NAMES.length} completed stages.`,
      })
      .run();
    queueMicrotask(pokeQueue);
    return { ok: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const run = getRunOrThrow(ctx, input.id);
    if (run.status === "running") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cancel the run before deleting it" });
    }
    ctx.db.delete(schema.jobs).where(eq(schema.jobs.id, input.id)).run();
    return { ok: true };
  }),
});
