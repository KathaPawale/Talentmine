import { z } from "zod";
import { validate as cronValidate } from "node-cron";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";
import { runCreateSchema } from "@shared/types";
import { newId } from "../lib/crypto";
import { refreshScheduler } from "../scheduler/cron";

const cronExpr = z.string().min(1).max(100);

function assertValidCron(expr: string): void {
  if (!cronValidate(expr)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid cron expression: "${expr}"` });
  }
}

function getScheduleOrThrow(ctx: { db: typeof import("../db/client").db }, id: string) {
  const row = ctx.db.select().from(schema.jobSchedules).where(eq(schema.jobSchedules.id, id)).get();
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
  return row;
}

export const schedulesRouter = router({
  // No nextRun field: computing it would need a throwaway node-cron task per row.
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.select().from(schema.jobSchedules).orderBy(desc(schema.jobSchedules.createdAt)).all();
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120), cron: cronExpr, config: runCreateSchema }))
    .mutation(({ ctx, input }) => {
      assertValidCron(input.cron);
      const id = newId();
      ctx.db
        .insert(schema.jobSchedules)
        .values({
          id,
          name: input.name,
          cron: input.cron,
          config: input.config,
          enabled: true,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        })
        .run();
      refreshScheduler();
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        cron: cronExpr.optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      getScheduleOrThrow(ctx, input.id);
      if (input.cron !== undefined) assertValidCron(input.cron);
      ctx.db
        .update(schema.jobSchedules)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.cron !== undefined ? { cron: input.cron } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        })
        .where(eq(schema.jobSchedules.id, input.id))
        .run();
      refreshScheduler();
      return { ok: true };
    }),

  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    getScheduleOrThrow(ctx, input.id);
    ctx.db.delete(schema.jobSchedules).where(eq(schema.jobSchedules.id, input.id)).run();
    refreshScheduler();
    return { ok: true };
  }),
});
