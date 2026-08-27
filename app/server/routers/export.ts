import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";
import { buildWorkbook, buildCsv, exportFilename, type ExportPosting } from "../export/excel";
import { postingFiltersSchema, postingConditions } from "./postings";

const EXPORT_ROW_CAP = 10_000;

function queryExportRows(
  db: typeof import("../db/client").db,
  filters: Parameters<typeof postingConditions>[0],
): ExportPosting[] {
  const rows = db
    .select({
      posting: schema.jobPostings,
      companyName: schema.companies.name,
      companyDomain: schema.companies.domain,
      companyClassification: schema.companies.classification,
      companyWebsite: schema.companies.website,
      companyLinkedinUrl: schema.companies.linkedinUrl,
      companyEmail: schema.companies.contactEmail,
      companyPhone: schema.companies.phone,
      companyContactName: schema.companies.contactName,
      companyContactTitle: schema.companies.contactTitle,
      companyIndustry: schema.companies.industry,
      companyCity: schema.companies.city,
      companyRegion: schema.companies.region,
      companyCountry: schema.companies.country,
      companyNatureOfBusiness: schema.companies.natureOfBusiness,
      companyExecutiveName: schema.companies.executiveName,
      companyExecutiveTitle: schema.companies.executiveTitle,
      companyExecutiveLinkedinUrl: schema.companies.executiveLinkedinUrl,
    })
    .from(schema.jobPostings)
    .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
    .where(and(...postingConditions(filters)))
    .orderBy(desc(schema.jobPostings.postedAt), desc(schema.jobPostings.createdAt))
    .limit(EXPORT_ROW_CAP)
    .all();
  const companyIds = new Set(rows.map((row) => row.posting.companyId));
  const contactsByCompany = new Map<string, Array<typeof schema.executiveContacts.$inferSelect>>();
  for (const contact of db.select().from(schema.executiveContacts).orderBy(schema.executiveContacts.rank).all()) {
    if (!companyIds.has(contact.companyId)) continue;
    const contacts = contactsByCompany.get(contact.companyId) ?? [];
    if (contacts.length < 3) contacts.push(contact);
    contactsByCompany.set(contact.companyId, contacts);
  }
  return rows.map((r) => ({
    ...r.posting,
    companyName: r.companyName,
    companyDomain: r.companyDomain,
    companyClassification: r.companyClassification,
    companyWebsite: r.companyWebsite,
    companyLinkedinUrl: r.companyLinkedinUrl,
    companyEmail: r.companyEmail,
    companyPhone: r.companyPhone,
    companyContactName: r.companyContactName,
    companyContactTitle: r.companyContactTitle,
    companyIndustry: r.companyIndustry,
    companyCity: r.companyCity,
    companyRegion: r.companyRegion,
    companyCountry: r.companyCountry,
    companyNatureOfBusiness: r.companyNatureOfBusiness,
    companyExecutiveName: r.companyExecutiveName,
    companyExecutiveTitle: r.companyExecutiveTitle,
    companyExecutiveLinkedinUrl: r.companyExecutiveLinkedinUrl,
    executiveContacts: contactsByCompany.get(r.posting.companyId) ?? [],
  }));
}

export const exportRouter = router({
  excel: protectedProcedure.input(postingFiltersSchema).mutation(async ({ ctx, input }) => {
    const postings = queryExportRows(ctx.db, input);
    const companyIds = new Set(postings.map((p) => p.companyId));
    const companies = ctx.db
      .select()
      .from(schema.companies)
      .all()
      .filter((c) => companyIds.has(c.id));
    const executiveContacts = postings.flatMap((posting) => posting.executiveContacts);
    const uniqueExecutiveContacts = [...new Map(executiveContacts.map((contact) => [contact.id, contact])).values()];
    const run = input.runId
      ? ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, input.runId)).get()
      : undefined;

    const generatedAt = new Date();
    const wb = buildWorkbook({
      postings,
      companies,
      executiveContacts: uniqueExecutiveContacts,
      runName: run?.name ?? "All runs",
      runConfig: run?.config ?? null,
      generatedAt,
    });
    const buffer = await wb.xlsx.writeBuffer();
    return {
      filename: exportFilename("xlsx", generatedAt),
      base64: Buffer.from(buffer).toString("base64"),
      rows: postings.length,
    };
  }),

  csv: protectedProcedure.input(postingFiltersSchema).query(({ ctx, input }) => {
    const postings = queryExportRows(ctx.db, input);
    const generatedAt = new Date();
    return {
      filename: exportFilename("csv", generatedAt),
      csv: buildCsv(postings),
      rows: postings.length,
    };
  }),
});
