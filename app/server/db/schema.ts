import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  StageName,
  JobStatus,
  RoleCategory,
  EventLevel,
  QuotaProvider,
  SourceRunKey,
  PostingSource,
  AtsType,
  Classification,
  ClassificationMethod,
  EmploymentType,
  RunCreateInput,
  RunTotals,
} from "@shared/types";
import type { EmailVerificationStatus } from "@shared/executive-contact";

// Portability rules (for a later Postgres swap): text UUID PKs generated
// app-side, epoch-ms timestamps, JSON as text, no SQLite-specific defaults.
// The only autoincrement column is job_events.seq (the event ordering cursor).

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string) => integer(name, { mode: "boolean" });

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  pictureUrl: text("picture_url"),
  role: text("role").$type<"admin" | "member">().notNull().default("member"),
  createdAt: ts("created_at").notNull(),
  lastLoginAt: ts("last_login_at"),
});

export const googleTokens = sqliteTable(
  "google_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    purpose: text("purpose").$type<"sheets" | "gmail_sender">().notNull(),
    googleEmail: text("google_email").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").notNull(),
    accessExpiresAt: ts("access_expires_at").notNull(),
    status: text("status").$type<"active" | "revoked">().notNull().default("active"),
    revokedReason: text("revoked_reason"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("google_tokens_user_purpose").on(t.userId, t.purpose)],
);

/** Mining runs. Table keeps the name "jobs" so the queue/runner/recovery
 *  machinery copied from leadmine works unchanged; the UI calls them "Runs". */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).$type<RunCreateInput>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    currentStage: text("current_stage").$type<StageName | null>(),
    completedStages: text("completed_stages", { mode: "json" }).$type<StageName[]>().notNull().default([]),
    cancelRequested: bool("cancel_requested").notNull().default(false),
    heartbeatAt: ts("heartbeat_at"),
    progress: real("progress").notNull().default(0),
    etaSeconds: integer("eta_seconds"),
    stageTimings: text("stage_timings", { mode: "json" }).$type<Partial<Record<StageName, number>>>().notNull().default({}),
    totals: text("totals", { mode: "json" }).$type<RunTotals | null>().default(null),
    error: text("error"),
    resumable: bool("resumable").notNull().default(false),
    createdAt: ts("created_at").notNull(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("jobs_user_created").on(t.userId, t.createdAt), index("jobs_status").on(t.status)],
);

export const jobEvents = sqliteTable(
  "job_events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    ts: ts("ts").notNull(),
    stage: text("stage").$type<StageName>().notNull(),
    level: text("level").$type<EventLevel>().notNull().default("info"),
    message: text("message").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown> | null>().default(null),
  },
  (t) => [index("job_events_job_seq").on(t.jobId, t.seq)],
);

export const sourceRuns = sqliteTable(
  "source_runs",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").$type<SourceRunKey>().notNull(),
    query: text("query").notNull(),
    status: text("status").$type<"running" | "completed" | "failed">().notNull().default("running"),
    itemsFound: integer("items_found").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    error: text("error"),
  },
  (t) => [index("source_runs_job").on(t.jobId)],
);

/** Employers (or agencies) that posted the mined jobs. */
export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    website: text("website"),
    domain: text("domain"),
    linkedinUrl: text("linkedin_url"),
    industry: text("industry"),
    /** Plain-language description/category of what the employer does. */
    natureOfBusiness: text("nature_of_business"),
    sizeEstimate: text("size_estimate"),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    postalCode: text("postal_code"),
    lat: real("lat"),
    lng: real("lng"),
    phone: text("phone"),
    placeId: text("place_id"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    /** Which applicant-tracking system serves this company's jobs, once probed. */
    atsType: text("ats_type").$type<AtsType | null>(),
    /** Board slug/token for the detected ATS (e.g. greenhouse board token). */
    atsToken: text("ats_token"),
    careersUrl: text("careers_url"),
    /** Best general contact email found on the company's own site. */
    contactEmail: text("contact_email"),
    /** Named contact person scraped from the site's structured data, when present. */
    contactName: text("contact_name"),
    contactTitle: text("contact_title"),
    /** Public CEO/CFO profile found on the company's own site, when available. */
    executiveName: text("executive_name"),
    executiveTitle: text("executive_title"),
    executiveLinkedinUrl: text("executive_linkedin_url"),
    /** Where the contact email came from: our own scrape or a Hunter lookup. */
    contactSource: text("contact_source").$type<"scrape" | "hunter" | null>(),
    /** Enrich-stage checkpoint for the contact scrape. */
    contactStatus: text("contact_status")
      .$type<"pending" | "done" | "failed" | "skipped">()
      .notNull()
      .default("pending"),
    classification: text("classification").$type<Classification>().notNull().default("unknown"),
    classificationConfidence: integer("classification_confidence").notNull().default(0),
    classificationMethod: text("classification_method").$type<ClassificationMethod | null>(),
    classificationReason: text("classification_reason"),
    postingsCount: integer("postings_count").notNull().default(0),
    source: text("source").$type<SourceRunKey>().notNull(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("companies_job_dedupe").on(t.jobId, t.dedupeKey),
    index("companies_job_classification").on(t.jobId, t.classification),
    index("companies_domain").on(t.domain),
  ],
);

/** Up to three senior decision-makers retained per employer. */
export const executiveContacts = sqliteTable(
  "executive_contacts",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    rank: integer("rank").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    linkedinUrl: text("linkedin_url"),
    primaryEmail: text("primary_email"),
    primaryEmailStatus: text("primary_email_status")
      .$type<EmailVerificationStatus>()
      .notNull()
      .default("unavailable"),
    alternateEmail: text("alternate_email"),
    alternateEmailStatus: text("alternate_email_status")
      .$type<EmailVerificationStatus>()
      .notNull()
      .default("unavailable"),
    primaryPhone: text("primary_phone"),
    alternatePhone: text("alternate_phone"),
    sourceUrl: text("source_url"),
    verificationStatus: text("verification_status")
      .$type<EmailVerificationStatus>()
      .notNull()
      .default("unavailable"),
    confidenceScore: integer("confidence_score").notNull().default(0),
    verifiedAt: ts("verified_at"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("executive_contacts_company_dedupe").on(t.companyId, t.dedupeKey),
    index("executive_contacts_company_rank").on(t.companyId, t.rank),
    index("executive_contacts_job").on(t.jobId),
  ],
);

export const jobPostings = sqliteTable(
  "job_postings",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    roleCategory: text("role_category").$type<RoleCategory>().notNull().default("other"),
    roleNormStatus: text("role_norm_status").$type<"pending" | "done" | "failed">().notNull().default("pending"),
    descriptionSnippet: text("description_snippet").notNull().default(""),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    isRemote: bool("is_remote").notNull().default(false),
    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period").$type<"year" | "month" | "hour" | null>(),
    employmentType: text("employment_type").$type<EmploymentType | null>(),
    postedAt: ts("posted_at"),
    applyUrl: text("apply_url"),
    sourceUrl: text("source_url"),
    source: text("source").$type<PostingSource>().notNull(),
    /** Provider-native posting id, when the source has one. */
    externalId: text("external_id"),
    dedupeKey: text("dedupe_key").notNull(),
    /** Set when a fuzzy pass merged this posting into a canonical duplicate. */
    duplicateOfId: text("duplicate_of_id"),
    alsoSeenOn: text("also_seen_on", { mode: "json" }).$type<PostingSource[]>().notNull().default([]),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("postings_job_dedupe").on(t.jobId, t.dedupeKey),
    index("postings_job_role").on(t.jobId, t.roleCategory),
    index("postings_company").on(t.companyId),
    index("postings_job_source").on(t.jobId, t.source),
    index("postings_job_posted").on(t.jobId, t.postedAt),
  ],
);

export const apiQuotaUsage = sqliteTable(
  "api_quota_usage",
  {
    id: text("id").primaryKey(),
    provider: text("provider").$type<QuotaProvider>().notNull(),
    periodKey: text("period_key").notNull(),
    calls: integer("calls").notNull().default(0),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("api_quota_provider_period").on(t.provider, t.periodKey)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: ts("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const jobSchedules = sqliteTable("job_schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cron: text("cron").notNull(),
  config: text("config", { mode: "json" }).$type<RunCreateInput>().notNull(),
  enabled: bool("enabled").notNull().default(true),
  lastRunAt: ts("last_run_at"),
  lastJobId: text("last_job_id"),
  createdBy: text("created_by").notNull(),
  createdAt: ts("created_at").notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type JobEventRow = typeof jobEvents.$inferSelect;
export type SourceRunRow = typeof sourceRuns.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
export type ExecutiveContactRow = typeof executiveContacts.$inferSelect;
export type JobPostingRow = typeof jobPostings.$inferSelect;
export type JobScheduleRow = typeof jobSchedules.$inferSelect;
