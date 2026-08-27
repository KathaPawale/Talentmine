import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db } from "./client";

export function runMigrations(): void {
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "server/db/migrations") });
}
