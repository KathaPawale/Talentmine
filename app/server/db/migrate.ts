import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import { db } from "./client";

export function runMigrations(): void {
  const migrationsFolder = [
    path.resolve(process.cwd(), "server/db/migrations"),
    path.resolve(process.cwd(), "app/server/db/migrations"),
  ].find((candidate) => fs.existsSync(candidate));
  if (!migrationsFolder) throw new Error("Database migrations directory was not bundled");
  migrate(db, { migrationsFolder });
}
