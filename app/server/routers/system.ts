import { protectedProcedure, router } from "./trpc";
import { config } from "../config";
import { getQuotaSummary } from "../providers/guard";
import { adzunaCountryCode } from "@shared/types";
import { z } from "zod";

export const systemRouter = router({
  health: protectedProcedure.query(() => {
    // Simulate mode mirrors providers/registry.ts: dev with no job-board keys.
    const simulate = config.isDev && !config.features.jsearch && !config.features.adzuna;
    return {
      features: config.features,
      simulate,
      appUrl: config.APP_URL,
    };
  }),

  quotaUsage: protectedProcedure.query(() => getQuotaSummary()),

  /** Whether Adzuna covers a country (drives the per-country note on the run form). */
  adzunaSupport: protectedProcedure
    .input(z.object({ country: z.string() }))
    .query(({ input }) => ({ supported: adzunaCountryCode(input.country) !== null })),
});
