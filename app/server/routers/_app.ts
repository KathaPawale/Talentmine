import { router } from "./trpc";
import { authRouter } from "./auth";
import { systemRouter } from "./system";
import { runsRouter } from "./runs";
import { postingsRouter } from "./postings";
import { companiesRouter } from "./companies";
import { dashboardRouter } from "./dashboard";
import { exportRouter } from "./export";
import { settingsRouter } from "./settings";
import { schedulesRouter } from "./schedules";

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
  runs: runsRouter,
  postings: postingsRouter,
  companies: companiesRouter,
  dashboard: dashboardRouter,
  export: exportRouter,
  settings: settingsRouter,
  schedules: schedulesRouter,
});

export type AppRouter = typeof appRouter;
