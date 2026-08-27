import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

// Load .env once, before anything reads config. Node 20.12+ has loadEnvFile.
// Never in tests: ambient real API keys would flip feature flags on and let
// test pipelines hit live providers.
if (process.env.NODE_ENV !== "test") {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"));
  } catch {
    // no .env present (e.g. production platform envs) — fine
  }
}

const hex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, "must be 64 hex chars (generate: openssl rand -hex 32)");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3001),
  APP_URL: z.string().url().default("http://localhost:3001"),
  DATABASE_PATH: z.string().default("./data/talentmine.db"),

  JWT_SECRET: z.string().min(32, "required (generate: openssl rand -hex 32)"),
  TOKEN_ENCRYPTION_KEY: hex64,

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_PLACES_API_KEY: z.string().default(""),
  GOOGLE_ALLOWED_DOMAIN: z.string().default(""),

  GROQ_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  // Hunter.io exact-person email finder (LinkedIn handle first) + domain fallback.
  HUNTER_API_KEY: z.string().default(""),

  // JSearch (Google for Jobs aggregator) via RapidAPI.
  RAPIDAPI_KEY: z.string().default(""),
  ADZUNA_APP_ID: z.string().default(""),
  ADZUNA_APP_KEY: z.string().default(""),

  DEV_AUTH_BYPASS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // Public-link mode: no sign-in at all; every visitor shares one guest
  // account. Allowed in production (unlike DEV_AUTH_BYPASS) — set it
  // deliberately when sharing a test deployment.
  AUTH_DISABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

// Railway injects RAILWAY_PUBLIC_DOMAIN at runtime; deriving APP_URL from it
// keeps the OAuth redirect correct without hardcoding the deploy URL.
if (!process.env.APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN) {
  process.env.APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Missing or invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("Copy .env.example to .env and fill in the values above.");
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === "production" && env.DEV_AUTH_BYPASS) {
  console.error("DEV_AUTH_BYPASS must not be enabled in production.");
  process.exit(1);
}

export const config = {
  ...env,
  isDev: env.NODE_ENV === "development",
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  features: {
    googleAuth: env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "",
    places: env.GOOGLE_PLACES_API_KEY !== "",
    groq: env.GROQ_API_KEY !== "",
    gemini: env.GEMINI_API_KEY !== "",
    jsearch: env.RAPIDAPI_KEY !== "",
    adzuna: env.ADZUNA_APP_ID !== "" && env.ADZUNA_APP_KEY !== "",
    hunter: env.HUNTER_API_KEY !== "",
    devAuthBypass: env.DEV_AUTH_BYPASS && env.NODE_ENV !== "production",
    authDisabled: env.AUTH_DISABLED,
  },
};
export type AppConfig = typeof config;

export function ensureDataDir(): void {
  const dir = path.dirname(path.resolve(process.cwd(), config.DATABASE_PATH));
  fs.mkdirSync(dir, { recursive: true });
}
