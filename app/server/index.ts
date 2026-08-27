import { config } from "./config";
import { runMigrations } from "./db/migrate";
import { createApp } from "./app";
import { repairCompanyProfiles } from "./startup/exclusions";

async function main() {
  runMigrations();
  const { exclusionsMarked, activitiesUpdated } = repairCompanyProfiles();
  if (exclusionsMarked > 0) {
    console.log(`[recovery] marked ${exclusionsMarked} newly recognized excluded company(s)`);
  }
  if (activitiesUpdated > 0) {
    console.log(`[recovery] standardized ${activitiesUpdated} company business-activity label(s)`);
  }

  const app = await createApp();

  const server = app.listen(config.PORT, () => {
    console.log(`[talentmine] ${config.NODE_ENV} server on ${config.APP_URL}`);
    if (config.features.devAuthBypass) {
      console.log("[talentmine] DEV_AUTH_BYPASS active — signed in as Dev Admin");
    }
    if (config.isDev && !config.features.jsearch && !config.features.adzuna) {
      console.log("[talentmine] simulate mode — no job-board keys, pipeline runs on sample data");
    }
  });

  // Startup jobs that must not block listen.
  void (async () => {
    try {
      const { recoverOrphanedJobs } = await import("./startup/recovery");
      recoverOrphanedJobs();
      const { startQueue } = await import("./pipeline/queue");
      startQueue();
      const { startScheduler } = await import("./scheduler/cron");
      startScheduler();
    } catch (err) {
      console.error("[talentmine] startup task failed:", err);
    }
  })();

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[talentmine] fatal boot error:", err);
  process.exit(1);
});
