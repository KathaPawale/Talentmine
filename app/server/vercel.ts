import { createApp } from "./app";
import { runMigrations } from "./db/migrate";
import { repairCompanyProfiles } from "./startup/exclusions";

/**
 * Initialize the Express app once per warm Vercel function instance.
 * Background workers and cron are intentionally omitted: Vercel functions
 * must finish with the request and cannot keep an in-process queue alive.
 */
export async function createVercelApp() {
  runMigrations();
  repairCompanyProfiles();
  return createApp();
}
