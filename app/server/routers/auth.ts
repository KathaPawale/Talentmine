import { publicProcedure, protectedProcedure, router } from "./trpc";
import { SESSION_COOKIE } from "../auth/jwt";
import { config } from "../config";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      pictureUrl: ctx.user.pictureUrl,
      role: ctx.user.role,
      devBypass: config.features.devAuthBypass,
      authDisabled: config.features.authDisabled,
    };
  }),
  logout: protectedProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }),
});
