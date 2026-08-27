import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config, ensureDataDir } from "../config";
import * as schema from "./schema";

const SEED_PATH = "seed/talentmine-seed.db";

/**
 * First boot on an empty persistent volume: copy the bundled seed database so
 * a fresh deploy starts with existing mined data instead of an empty app.
 * Runs before the connection is opened; never overwrites an existing file.
 */
function seedIfEmpty(target: string): void {
  if (fs.existsSync(target)) return;
  const seed = path.resolve(process.cwd(), SEED_PATH);
  if (!fs.existsSync(seed)) return;
  fs.copyFileSync(seed, target);
  console.log(`[db] seeded ${target} from ${SEED_PATH}`);
}

// The whole codebase uses better-sqlite3's synchronous query API (190 call
// sites), so a Postgres swap would mean rewriting every query as async. On
// Railway this file is unchanged — SQLite lives on a persistent volume.
function createDb() {
  ensureDataDir();
  const file =
    config.isTest ? ":memory:" : path.resolve(process.cwd(), config.DATABASE_PATH);
  if (!config.isTest) seedIfEmpty(file);
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = createDb();
export type DB = typeof db;
export { schema };
