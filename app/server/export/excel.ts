import ExcelJS from "exceljs";
import { POSTING_SOURCE_LABELS, ROLE_CATEGORY_LABELS, type RunCreateInput } from "@shared/types";
import type { CompanyRow, ExecutiveContactRow, JobPostingRow } from "../db/schema";
import { companyLinkedInUrl, executiveLinkedInUrl, natureOfBusinessLabel } from "@shared/company-profile";
import {
  emailVerificationLabel,
  isUsableExecutiveEmailStatus,
  NO_VERIFIED_EXECUTIVE_CONTACT,
} from "@shared/executive-contact";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0E7490" },
};
const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0F9FF" },
};

export function exportFilename(extension: "xlsx" | "csv", generatedAt: Date): string {
  const timestamp = generatedAt
    .toISOString()
    .replace("T", "-")
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  return `talentmine-postings-${timestamp}.${extension}`;
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = HEADER_FILL;
  header.height = 28;
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function zebra(sheet: ExcelJS.Worksheet): void {
  sheet.eachRow((row, n) => {
    if (n > 1 && n % 2 === 0) row.fill = ZEBRA_FILL;
  });
}

export interface ExportPosting extends JobPostingRow {
  companyName: string;
  companyDomain: string | null;
  companyClassification: string;
  companyWebsite: string | null;
  companyLinkedinUrl: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyContactName: string | null;
  companyContactTitle: string | null;
  companyIndustry: string | null;
  companyCity: string | null;
  companyRegion: string | null;
  companyCountry: string | null;
  companyNatureOfBusiness: string | null;
  companyExecutiveName: string | null;
  companyExecutiveTitle: string | null;
  companyExecutiveLinkedinUrl: string | null;
  executiveContacts: ExecutiveContactRow[];
}

function exportNatureOfBusiness(company: Parameters<typeof natureOfBusinessLabel>[0]): string {
  return natureOfBusinessLabel(company);
}

function exportEmail(email: string | null, status: ExecutiveContactRow["primaryEmailStatus"]): string {
  return email && isUsableExecutiveEmailStatus(status) ? email : "";
}

function exportEmailStatus(email: string | null, status: ExecutiveContactRow["primaryEmailStatus"]): string {
  return email && isUsableExecutiveEmailStatus(status) ? emailVerificationLabel(status) : "Unavailable";
}

function addHyperlink(row: ExcelJS.Row, key: string, url: string | null | undefined): void {
  if (!url) return;
  row.getCell(key).value = { text: url, hyperlink: url };
  row.getCell(key).font = { color: { argb: "FF0E7490" }, underline: true };
}

export function buildWorkbook(opts: {
  postings: ExportPosting[];
  companies: CompanyRow[];
  executiveContacts?: ExecutiveContactRow[];
  runName: string;
  runConfig: RunCreateInput | null;
  generatedAt: Date;
}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TalentMine";
  wb.created = opts.generatedAt;

  const ps = wb.addWorksheet("Job Postings");
  ps.columns = [
    { header: "Job Title", key: "title", width: 36 },
    { header: "Job URL", key: "jobUrl", width: 42 },
    { header: "Posting Date", key: "posted", width: 14 },
    { header: "Job Source URL", key: "jobSourceUrl", width: 42 },
    { header: "Source", key: "source", width: 20 },
    { header: "Role Category", key: "role", width: 18 },
    { header: "Company Name", key: "company", width: 30 },
    { header: "Company Website", key: "website", width: 32 },
    { header: "Company LinkedIn", key: "companyLinkedin", width: 42 },
    { header: "Industry", key: "industry", width: 24 },
    { header: "Nature of Business", key: "nature", width: 30 },
    { header: "Company Main Phone", key: "companyPhone", width: 20 },
    { header: "Company City", key: "companyCity", width: 18 },
    { header: "Company Region", key: "companyRegion", width: 18 },
    { header: "Company Country", key: "companyCountry", width: 18 },
    { header: "Employer Classification", key: "classification", width: 20 },
    { header: "Job City", key: "city", width: 16 },
    { header: "Job Region", key: "region", width: 16 },
    { header: "Job Country", key: "country", width: 16 },
    { header: "Remote", key: "remote", width: 9 },
    { header: "Employment Type", key: "type", width: 16 },
    { header: "Salary Min", key: "salaryMin", width: 12 },
    { header: "Salary Max", key: "salaryMax", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Also Seen On", key: "alsoSeen", width: 22 },
    { header: "Description", key: "snippet", width: 60 },
  ];
  for (const posting of opts.postings) {
    const row = ps.addRow({
      title: posting.title,
      jobUrl: posting.applyUrl ?? posting.sourceUrl ?? "",
      posted: posting.postedAt?.toISOString().slice(0, 10) ?? "",
      jobSourceUrl: posting.sourceUrl ?? "",
      source: POSTING_SOURCE_LABELS[posting.source],
      role: ROLE_CATEGORY_LABELS[posting.roleCategory],
      company: posting.companyName,
      website: posting.companyWebsite ?? (posting.companyDomain ? `https://${posting.companyDomain}` : ""),
      companyLinkedin: companyLinkedInUrl({ name: posting.companyName, linkedinUrl: posting.companyLinkedinUrl }),
      industry: posting.companyIndustry ?? "",
      nature: exportNatureOfBusiness({
        name: posting.companyName,
        domain: posting.companyDomain,
        industry: posting.companyIndustry,
        natureOfBusiness: posting.companyNatureOfBusiness,
        descriptionSnippets: [posting.descriptionSnippet],
      }),
      companyPhone: posting.companyPhone ?? "",
      companyCity: posting.companyCity ?? "",
      companyRegion: posting.companyRegion ?? "",
      companyCountry: posting.companyCountry ?? "",
      classification: posting.companyClassification.replace("_", " "),
      city: posting.city ?? "",
      region: posting.region ?? "",
      country: posting.country ?? "",
      remote: posting.isRemote ? "Yes" : "No",
      type: posting.employmentType?.replace("_", " ") ?? "",
      salaryMin: posting.salaryMin ?? "",
      salaryMax: posting.salaryMax ?? "",
      currency: posting.salaryCurrency ?? "",
      alsoSeen: posting.alsoSeenOn.map((source) => POSTING_SOURCE_LABELS[source]).join(", "),
      snippet: posting.descriptionSnippet,
    });
    addHyperlink(row, "jobUrl", posting.applyUrl ?? posting.sourceUrl);
    addHyperlink(row, "jobSourceUrl", posting.sourceUrl);
    addHyperlink(row, "website", posting.companyWebsite ?? (posting.companyDomain ? `https://${posting.companyDomain}` : null));
    addHyperlink(row, "companyLinkedin", companyLinkedInUrl({ name: posting.companyName, linkedinUrl: posting.companyLinkedinUrl }));
  }
  styleHeader(ps);
  zebra(ps);
  ps.autoFilter = { from: "A1", to: { row: 1, column: ps.columnCount } };

  const cs = wb.addWorksheet("Companies");
  cs.columns = [
    { header: "Company Name", key: "name", width: 30 },
    { header: "Website", key: "website", width: 32 },
    { header: "Company LinkedIn", key: "companyLinkedin", width: 42 },
    { header: "Industry", key: "industry", width: 24 },
    { header: "Nature of Business", key: "nature", width: 30 },
    { header: "Company Main Phone", key: "companyPhone", width: 20 },
    { header: "City", key: "city", width: 18 },
    { header: "Region", key: "region", width: 18 },
    { header: "Country", key: "country", width: 18 },
    { header: "Employer Classification", key: "classification", width: 20 },
    { header: "Employer Confidence", key: "employerConfidence", width: 18 },
    { header: "Open Postings", key: "count", width: 14 },
  ];
  for (const company of opts.companies) {
    const row = cs.addRow({
      name: company.name,
      website: company.website ?? (company.domain ? `https://${company.domain}` : ""),
      companyLinkedin: company.linkedinUrl ?? "",
      industry: company.industry ?? "",
      nature: exportNatureOfBusiness(company),
      companyPhone: company.phone ?? "",
      city: company.city ?? "",
      region: company.region ?? "",
      country: company.country ?? "",
      classification: company.classification.replace("_", " "),
      employerConfidence: company.classificationConfidence || "",
      count: company.postingsCount,
    });
    addHyperlink(row, "website", company.website ?? (company.domain ? `https://${company.domain}` : null));
    addHyperlink(row, "companyLinkedin", company.linkedinUrl);
  }
  styleHeader(cs);
  zebra(cs);
  cs.autoFilter = { from: "A1", to: { row: 1, column: cs.columnCount } };

  const executiveSheet = wb.addWorksheet("Executive Contacts");
  executiveSheet.columns = [
    { header: "Company Name", key: "companyName", width: 30 },
    { header: "Region", key: "region", width: 18 },
    { header: "Country", key: "country", width: 18 },
    { header: "Company LinkedIn", key: "companyLinkedin", width: 42 },
    { header: "Executive Name", key: "name", width: 24 },
    { header: "Title", key: "title", width: 24 },
    { header: "LinkedIn", key: "linkedin", width: 42 },
    { header: "Primary Email", key: "primaryEmail", width: 30 },
    { header: "Primary Email Status", key: "primaryEmailStatus", width: 22 },
    { header: "Alternate Email", key: "alternateEmail", width: 30 },
    { header: "Alternate Email Status", key: "alternateEmailStatus", width: 22 },
    { header: "Primary Phone", key: "primaryPhone", width: 20 },
    { header: "Alternate Phone", key: "alternatePhone", width: 20 },
    { header: "Source URL", key: "sourceUrl", width: 42 },
    { header: "Verification Status", key: "verificationStatus", width: 22 },
    { header: "Confidence Score", key: "confidence", width: 18 },
    { header: "Verification Date", key: "verificationDate", width: 18 },
    { header: "Lookup Status", key: "lookupStatus", width: 34 },
  ];
  const contactsByCompany = new Map<string, ExecutiveContactRow[]>();
  for (const contact of opts.executiveContacts ?? []) {
    const contacts = contactsByCompany.get(contact.companyId) ?? [];
    contacts.push(contact);
    contactsByCompany.set(contact.companyId, contacts);
  }
  for (const company of opts.companies) {
    const contacts = (contactsByCompany.get(company.id) ?? []).sort((a, b) => a.rank - b.rank).slice(0, 3);
    const rows = contacts.length > 0 ? contacts : [null];
    for (const contact of rows) {
      const lookupUrl = executiveLinkedInUrl({
        name: company.name,
        executiveName: contact?.name ?? company.executiveName,
        executiveTitle: contact?.title ?? company.executiveTitle,
        executiveLinkedinUrl: contact?.linkedinUrl ?? company.executiveLinkedinUrl,
      });
      const row = executiveSheet.addRow({
        companyName: company.name,
        region: company.region ?? "",
        country: company.country ?? "",
        companyLinkedin: company.linkedinUrl ?? "",
        name: contact?.name ?? "",
        title: contact?.title ?? "",
        linkedin: contact?.linkedinUrl ?? lookupUrl,
        primaryEmail: contact ? exportEmail(contact.primaryEmail, contact.primaryEmailStatus) : "",
        primaryEmailStatus: contact ? exportEmailStatus(contact.primaryEmail, contact.primaryEmailStatus) : "Unavailable",
        alternateEmail: contact ? exportEmail(contact.alternateEmail, contact.alternateEmailStatus) : "",
        alternateEmailStatus: contact ? exportEmailStatus(contact.alternateEmail, contact.alternateEmailStatus) : "Unavailable",
        primaryPhone: contact?.primaryPhone ?? "",
        alternatePhone: contact?.alternatePhone ?? "",
        sourceUrl: contact?.sourceUrl ?? "",
        verificationStatus: contact ? emailVerificationLabel(contact.verificationStatus) : "Unavailable",
        confidence: contact?.confidenceScore ?? "",
        verificationDate: contact?.verifiedAt?.toISOString().slice(0, 10) ?? "",
        lookupStatus: contact ? "Executive contact found" : "No verified executive contact found",
      });
      addHyperlink(row, "companyLinkedin", company.linkedinUrl);
      addHyperlink(row, "linkedin", contact?.linkedinUrl ?? lookupUrl);
      addHyperlink(row, "sourceUrl", contact?.sourceUrl);
    }
  }
  styleHeader(executiveSheet);
  zebra(executiveSheet);
  executiveSheet.autoFilter = { from: "A1", to: { row: 1, column: executiveSheet.columnCount } };

  const ss = wb.addWorksheet("Summary");
  ss.columns = [{ width: 28 }, { width: 40 }];
  const addKv = (key: string, value: string | number) => {
    const row = ss.addRow([key, value]);
    row.getCell(1).font = { bold: true };
  };
  addKv("Run", opts.runName);
  addKv("Generated", opts.generatedAt.toISOString().replace("T", " ").slice(0, 19));
  if (opts.runConfig) {
    addKv("Location", [opts.runConfig.city, opts.runConfig.region, opts.runConfig.country].filter(Boolean).join(", "));
    addKv("Role keywords", opts.runConfig.roleKeywords.join(", "));
    addKv("Sources", opts.runConfig.sources.join(", "));
    addKv("Posted within", `${opts.runConfig.postedWithinDays} days`);
    addKv("Exclude agencies", opts.runConfig.excludeAgencies ? "Yes" : "No");
  }
  addKv("Total postings", opts.postings.length);
  addKv("Total companies", opts.companies.length);
  addKv("Executive contacts", opts.executiveContacts?.length ?? 0);
  return wb;
}

function csvField(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function executiveCsvHeaders(): string[] {
  const headers: string[] = [];
  for (let index = 1; index <= 3; index++) {
    headers.push(
      `Executive ${index} Name`, `Executive ${index} Title`, `Executive ${index} LinkedIn`,
      `Executive ${index} Primary Email`, `Executive ${index} Primary Email Status`,
      `Executive ${index} Alternate Email`, `Executive ${index} Alternate Email Status`,
      `Executive ${index} Primary Phone`, `Executive ${index} Alternate Phone`,
      `Executive ${index} Source URL`, `Executive ${index} Verification Status`,
      `Executive ${index} Confidence Score`, `Executive ${index} Verification Date`,
    );
  }
  return headers;
}

function executiveCsvValues(contacts: ExecutiveContactRow[]): Array<string | number> {
  const values: Array<string | number> = [];
  for (let index = 0; index < 3; index++) {
    const contact = contacts[index];
    values.push(
      contact?.name ?? (index === 0 ? NO_VERIFIED_EXECUTIVE_CONTACT : ""),
      contact?.title ?? "",
      contact?.linkedinUrl ?? "",
      contact ? exportEmail(contact.primaryEmail, contact.primaryEmailStatus) : "",
      contact ? exportEmailStatus(contact.primaryEmail, contact.primaryEmailStatus) : "Unavailable",
      contact ? exportEmail(contact.alternateEmail, contact.alternateEmailStatus) : "",
      contact ? exportEmailStatus(contact.alternateEmail, contact.alternateEmailStatus) : "Unavailable",
      contact?.primaryPhone ?? "",
      contact?.alternatePhone ?? "",
      contact?.sourceUrl ?? "",
      contact ? emailVerificationLabel(contact.verificationStatus) : "Unavailable",
      contact?.confidenceScore ?? "",
      contact?.verifiedAt?.toISOString().slice(0, 10) ?? "",
    );
  }
  return values;
}

export function buildCsv(postings: ExportPosting[]): string {
  const header = [
    "Job Title", "Job URL", "Posting Date", "Job Source URL", "Source", "Role Category",
    "Company Name", "Company Website", "Company LinkedIn", "Industry", "Nature of Business",
    "Company Main Phone", "Company City", "Company Region", "Company Country", "Employer Classification", "Executive Contact Result",
    ...executiveCsvHeaders(),
    "Job City", "Job Region", "Job Country", "Remote", "Employment Type", "Salary Min", "Salary Max",
    "Currency", "Description",
  ];
  const lines = [header.map(csvField).join(",")];
  for (const posting of postings) {
    const contacts = posting.executiveContacts.slice(0, 3);
    lines.push([
      posting.title,
      posting.applyUrl ?? posting.sourceUrl ?? "",
      posting.postedAt?.toISOString().slice(0, 10) ?? "",
      posting.sourceUrl ?? "",
      POSTING_SOURCE_LABELS[posting.source],
      ROLE_CATEGORY_LABELS[posting.roleCategory],
      posting.companyName,
      posting.companyWebsite ?? (posting.companyDomain ? `https://${posting.companyDomain}` : ""),
      companyLinkedInUrl({ name: posting.companyName, linkedinUrl: posting.companyLinkedinUrl }),
      posting.companyIndustry ?? "",
      exportNatureOfBusiness({
        name: posting.companyName,
        domain: posting.companyDomain,
        industry: posting.companyIndustry,
        natureOfBusiness: posting.companyNatureOfBusiness,
        descriptionSnippets: [posting.descriptionSnippet],
      }),
      posting.companyPhone ?? "",
      posting.companyCity ?? "",
      posting.companyRegion ?? "",
      posting.companyCountry ?? "",
      posting.companyClassification.replace("_", " "),
      contacts.length > 0 ? `${contacts.length} senior decision-maker${contacts.length === 1 ? "" : "s"}` : NO_VERIFIED_EXECUTIVE_CONTACT,
      ...executiveCsvValues(contacts),
      posting.city ?? "",
      posting.region ?? "",
      posting.country ?? "",
      posting.isRemote ? "Yes" : "No",
      posting.employmentType?.replace("_", " ") ?? "",
      posting.salaryMin ?? "",
      posting.salaryMax ?? "",
      posting.salaryCurrency ?? "",
      posting.descriptionSnippet,
    ].map(csvField).join(","));
  }
  return lines.join("\r\n");
}
