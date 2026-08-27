import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { config } from "../config";
import { newId } from "../lib/crypto";
import { SESSION_COOKIE, verifySession } from "./jwt";
import type { UserRow } from "../db/schema";

export interface Context {
  db: typeof db;
  user: UserRow | null;
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
}

/** Ensure a named local account exists (dev bypass / public guest) and return it. */
async function ensureLocalUser(email: string, name: string): Promise<UserRow> {
  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existing) return existing;
  const row: typeof schema.users.$inferInsert = {
    id: newId(),
    email,
    name,
    role: "admin",
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };
  db.insert(schema.users).values(row).run();
  return db.select().from(schema.users).where(eq(schema.users.email, email)).get()!;
}

export async function ensureDevUser(): Promise<UserRow> {
  return ensureLocalUser("dev@talentmine.local", "Dev Admin");
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
  let user: UserRow | null = null;

  // Public-link mode: everyone shares one guest account, no sign-in.
  if (config.features.authDisabled) {
    user = await ensureLocalUser("guest@talentmine.local", "Guest");
    return { db, user, req, res };
  }

  const token = (req as unknown as { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) {
    const session = await verifySession(token);
    if (session) {
      user = db.select().from(schema.users).where(eq(schema.users.id, session.sub)).get() ?? null;
    }
  }

  if (!user && config.features.devAuthBypass) {
    user = await ensureDevUser();
  }

  return { db, user, req, res };
}
