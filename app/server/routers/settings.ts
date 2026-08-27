import { z } from "zod";
import { protectedProcedure, router } from "./trpc";
import { getAllSettings, setSetting } from "../lib/settings";
import { getQuotaSummary } from "../providers/guard";
import { SETTING_DEFAULTS, type SettingKey } from "@shared/types";

const settingKeys = Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]];

export const settingsRouter = router({
  all: protectedProcedure.query(() => getAllSettings()),

  quotaUsage: protectedProcedure.query(() => getQuotaSummary()),

  set: protectedProcedure
    .input(z.object({ key: z.enum(settingKeys), value: z.union([z.number(), z.boolean(), z.string()]) }))
    .mutation(({ ctx, input }) => {
      setSetting(input.key, input.value as never, ctx.user.email);
      return { ok: true };
    }),
});
