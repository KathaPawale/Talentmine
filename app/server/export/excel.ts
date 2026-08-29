import ExcelJS from "exceljs";
import { POSTING_SOURCE_LABELS, ROLE_CATEGORY_LABELS, type RunCreateInput } from "@shared/types";
import type { CompanyRow, ExecutiveContactRow, JobPostingRow } from "../db/schema";
import { natureOfBusinessLabel } from "@shared/company-profile";
import {
  emailVerificationLabel,
  isUsableExecutiveEmailStatus,
  NO_VERIFIED_EXECUTIVE_CONTACT,
} from "@shared/executive-contact";

const COLORS = {
  header: "FF0E7490",
  headerBorder: "FF155E75",
  zebra: "FFF0F9FF",
  border: "FFD6E8EE",
  link: "FF0E7490",
  verified: "FFDCFCE7",
  confirmed: "FFCFFAFE",
  warning: "FFFFF7ED",
  muted: "FFF1F5F9",
} as const;

export function exportFilename(extension: "xlsx" | "csv", generatedAt: Date): string {
  const timestamp = generatedAt
    .toISOString()
    .replace("T", "-")
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  return `talentmine-postings-${timestamp}.${extension}`;
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
  return email && isUsableExecutiveEmailStatus(status) ? emailVerificationLabel(status) : "";
}

function contactResult(count: number): string {
  return count > 0
    ? `${count} senior decision-maker${count === 1 ? "" : "s"} found`
    : NO_VERIFIED_EXECUTIVE_CONTACT;
}

function companyWebsite(company: { website?: string | null; domain?: string | null }): string {
  return company.website ?? (company.domain ? `https://${company.domain}` : "");
}

function dataNotes(contact: ExecutiveContactRow | undefined): string {
  if (!contact) return NO_VERIFIED_EXECUTIVE_CONTACT;
  const primaryEmail = exportEmail(contact.primaryEmail, contact.primaryEmailStatus);
  const alternateEmail = exportEmail(contact.alternateEmail, contact.alternateEmailStatus);
  if (!primaryEmail && !alternateEmail && !contact.primaryPhone && !contact.alternatePhone) {
    return "Executive identified; no verified public email or direct phone found";
  }
  if (!primaryEmail && !alternateEmail) return "Executive identified; no verified public email found";
  if (!contact.primaryPhone && !contact.alternatePhone) return "Verified email available; no direct phone found";
  return "Verified public contact details available";
}

function columnLetter(column: number): string {
  let n = column;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function styleSheet(sheet: ExcelJS.Worksheet, frozenColumns = 1): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.header } };
  header.height = 34;
  header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  header.eachCell((cell) => {
    cell.border = {
      bottom: { style: "medium", color: { argb: COLORS.headerBorder } },
      right: { style: "thin", color: { argb: COLORS.headerBorder } },
    };
  });

  sheet.views = [{
    state: "frozen",
    xSplit: frozenColumns,
    ySplit: 1,
    topLeftCell: `${columnLetter(frozenColumns + 1)}2`,
  }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columnCount } };
  sheet.properties.defaultRowHeight = 22;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 34;
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.border } } };
    });
  });
}

function addHyperlink(row: ExcelJS.Row, key: string, url: string | null | undefined): void {
  if (!url) return;
  const cell = row.getCell(key);
  cell.value = { text: url, hyperlink: url };
  cell.font = { color: { argb: COLORS.link }, underline: true };
}

function tintStatusCells(sheet: ExcelJS.Worksheet, keys: string[]): void {
  for (const key of keys) {
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const cell = sheet.getRow(rowNumber).getCell(key);
      const value = String(cell.value ?? "").toLowerCase();
      if (!value) continue;
      const color = value.includes("verified")
        ? COLORS.verified
        : value.includes("confirmed")
          ? COLORS.confirmed
          : value.includes("not found") || value.includes("unavailable")
            ? COLORS.warning
            : COLORS.muted;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    }
  }
}

function contactValues(contact: ExecutiveContactRow | undefined): Record<string, string | number> {
  if (!contact) {
    return {
      executiveRank: "",
      executiveName: "",
      executiveTitle: "",
      executiveLinkedin: "",
      primaryEmail: "",
      primaryEmailStatus: "",
      alternateEmail: "",
      alternateEmailStatus: "",
      primaryPhone: "",
      alternatePhone: "",
      sourceUrl: "",
      verificationStatus: "",
      confidence: "",
      verificationDate: "",
      notes: dataNotes(undefined),
    };
  }
  return {
    executiveRank: contact.rank,
    executiveName: contact.name,
    executiveTitle: contact.title,
    executiveLinkedin: contact.linkedinUrl ?? "",
    primaryEmail: exportEmail(contact.primaryEmail, contact.primaryEmailStatus),
    primaryEmailStatus: exportEmailStatus(contact.primaryEmail, contact.primaryEmailStatus),
    alternateEmail: exportEmail(contact.alternateEmail, contact.alternateEmailStatus),
    alternateEmailStatus: exportEmailStatus(contact.alternateEmail, contact.alternateEmailStatus),
    primaryPhone: contact.primaryPhone ?? "",
    alternatePhone: contact.alternatePhone ?? "",
    sourceUrl: contact.sourceUrl ?? "",
    verificationStatus: emailVerificationLabel(contact.verificationStatus),
    confidence: contact.confidenceScore || "",
    verificationDate: contact.verifiedAt?.toISOString().slice(0, 10) ?? "",
    notes: dataNotes(contact),
  };
}

export function buildWorkbook(opts: {
  postings: ExportPosting[];
  companies: CompanyRow[];
  executiveContacts?: ExecutiveContactRow[];
  runName: string;
  runConfig: RunCreateInput | null;
  generatedAt: Date;
}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TalentMine";
  workbook.created = opts.generatedAt;
  workbook.modified = opts.generatedAt;
  workbook.title = `${opts.runName} — executive contacts`;

  const contactsByCompany = new Map<string, ExecutiveContactRow[]>();
  const allContacts = opts.executiveContacts ?? opts.postings.flatMap((posting) => posting.executiveContacts);
  for (const contact of allContacts) {
    const contacts = contactsByCompany.get(contact.companyId) ?? [];
    if (!contacts.some((existing) => existing.id === contact.id)) contacts.push(contact);
    contactsByCompany.set(contact.companyId, contacts);
  }

  const executives = workbook.addWorksheet("Executive Contacts");
  executives.columns = [
    { header: "Company Name", key: "company", width: 28 },
    { header: "Region", key: "region", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "Executive Name", key: "executiveName", width: 24 },
    { header: "Executive Title", key: "executiveTitle", width: 22 },
    { header: "Executive LinkedIn", key: "executiveLinkedin", width: 32 },
    { header: "Primary Email", key: "primaryEmail", width: 28 },
    { header: "Primary Email Status", key: "primaryEmailStatus", width: 20 },
    { header: "Alternate Email", key: "alternateEmail", width: 28 },
    { header: "Alternate Email Status", key: "alternateEmailStatus", width: 20 },
    { header: "Executive Primary Phone", key: "primaryPhone", width: 20 },
    { header: "Executive Alternate Phone", key: "alternatePhone", width: 20 },
    { header: "Company Main Phone", key: "companyPhone", width: 20 },
    { header: "Source URL", key: "sourceUrl", width: 32 },
    { header: "Verification Status", key: "verificationStatus", width: 20 },
    { header: "Confidence Score", key: "confidence", width: 16 },
    { header: "Verification Date", key: "verificationDate", width: 16 },
    { header: "Contact Result", key: "contactResult", width: 34 },
    { header: "Data Notes", key: "notes", width: 40 },
  ];

  for (const company of opts.companies) {
    const contacts = [...(contactsByCompany.get(company.id) ?? [])].sort((a, b) => a.rank - b.rank).slice(0, 3);
    const contactRows: Array<ExecutiveContactRow | undefined> = contacts.length > 0 ? contacts : [undefined];
    for (const contact of contactRows) {
      const row = executives.addRow({
        company: company.name,
        region: company.region ?? "",
        country: company.country ?? "",
        ...contactValues(contact),
        companyPhone: company.phone ?? "",
        contactResult: contactResult(contacts.length),
      });
      addHyperlink(row, "executiveLinkedin", contact?.linkedinUrl);
      addHyperlink(row, "sourceUrl", contact?.sourceUrl);
    }
  }
  styleSheet(executives, 2);
  tintStatusCells(executives, ["primaryEmailStatus", "alternateEmailStatus", "verificationStatus", "contactResult"]);

  const companies = workbook.addWorksheet("Companies");
  companies.columns = [
    { header: "Company Name", key: "name", width: 28 },
    { header: "Website", key: "website", width: 30 },
    { header: "Company LinkedIn", key: "companyLinkedin", width: 32 },
    { header: "Industry", key: "industry", width: 22 },
    { header: "Nature of Business", key: "nature", width: 30 },
    { header: "Company Main Phone", key: "companyPhone", width: 20 },
    { header: "City", key: "city", width: 18 },
    { header: "Region", key: "region", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "Employer Classification", key: "classification", width: 20 },
    { header: "Employer Confidence", key: "employerConfidence", width: 18 },
    { header: "Executive Contacts Found", key: "executiveCount", width: 20 },
    { header: "Executive Contact Result", key: "contactResult", width: 34 },
    { header: "Open Postings", key: "count", width: 14 },
  ];
  for (const company of opts.companies) {
    const contacts = contactsByCompany.get(company.id) ?? [];
    const row = companies.addRow({
      name: company.name,
      website: companyWebsite(company),
      companyLinkedin: company.linkedinUrl ?? "",
      industry: company.industry ?? "",
      nature: exportNatureOfBusiness(company),
      companyPhone: company.phone ?? "",
      city: company.city ?? "",
      region: company.region ?? "",
      country: company.country ?? "",
      classification: company.classification.replaceAll("_", " "),
      employerConfidence: company.classificationConfidence || "",
      executiveCount: contacts.length,
      contactResult: contactResult(contacts.length),
      count: company.postingsCount,
    });
    addHyperlink(row, "website", companyWebsite(company));
    addHyperlink(row, "companyLinkedin", company.linkedinUrl);
  }
  styleSheet(companies);
  tintStatusCells(companies, ["contactResult"]);

  const postings = workbook.addWorksheet("Job Postings");
  postings.columns = [
    { header: "Job Title", key: "title", width: 34 },
    { header: "Company Name", key: "company", width: 28 },
    { header: "Posting Date", key: "posted", width: 14 },
    { header: "Role Category", key: "role", width: 18 },
    { header: "Job City", key: "city", width: 16 },
    { header: "Job Region", key: "region", width: 16 },
    { header: "Job Country", key: "country", width: 16 },
    { header: "Remote", key: "remote", width: 9 },
    { header: "Employment Type", key: "type", width: 16 },
    { header: "Source", key: "source", width: 18 },
    { header: "Job URL", key: "jobUrl", width: 34 },
    { header: "Company Website", key: "website", width: 30 },
    { header: "Company Main Phone", key: "companyPhone", width: 20 },
    { header: "Company Region", key: "companyRegion", width: 18 },
    { header: "Company Country", key: "companyCountry", width: 16 },
    { header: "Industry", key: "industry", width: 22 },
    { header: "Nature of Business", key: "nature", width: 30 },
    { header: "Employer Classification", key: "classification", width: 20 },
    { header: "Executive Contacts Found", key: "executiveCount", width: 20 },
    { header: "Executive Contact Result", key: "contactResult", width: 34 },
    { header: "Salary Min", key: "salaryMin", width: 12 },
    { header: "Salary Max", key: "salaryMax", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Also Seen On", key: "alsoSeen", width: 22 },
    { header: "Description", key: "snippet", width: 52 },
  ];
  for (const posting of opts.postings) {
    const contacts = posting.executiveContacts.slice(0, 3);
    const website = companyWebsite({ website: posting.companyWebsite, domain: posting.companyDomain });
    const row = postings.addRow({
      title: posting.title,
      company: posting.companyName,
      posted: posting.postedAt?.toISOString().slice(0, 10) ?? "",
      role: ROLE_CATEGORY_LABELS[posting.roleCategory],
      city: posting.city ?? "",
      region: posting.region ?? "",
      country: posting.country ?? "",
      remote: posting.isRemote ? "Yes" : "No",
      type: posting.employmentType?.replaceAll("_", " ") ?? "",
      source: POSTING_SOURCE_LABELS[posting.source],
      jobUrl: posting.applyUrl ?? posting.sourceUrl ?? "",
      website,
      companyPhone: posting.companyPhone ?? "",
      companyRegion: posting.companyRegion ?? "",
      companyCountry: posting.companyCountry ?? "",
      industry: posting.companyIndustry ?? "",
      nature: exportNatureOfBusiness({
        name: posting.companyName,
        domain: posting.companyDomain,
        industry: posting.companyIndustry,
        natureOfBusiness: posting.companyNatureOfBusiness,
        descriptionSnippets: [posting.descriptionSnippet],
      }),
      classification: posting.companyClassification.replaceAll("_", " "),
      executiveCount: contacts.length,
      contactResult: contactResult(contacts.length),
      salaryMin: posting.salaryMin ?? "",
      salaryMax: posting.salaryMax ?? "",
      currency: posting.salaryCurrency ?? "",
      alsoSeen: posting.alsoSeenOn.map((source) => POSTING_SOURCE_LABELS[source]).join(", "),
      snippet: posting.descriptionSnippet,
    });
    addHyperlink(row, "jobUrl", posting.applyUrl ?? posting.sourceUrl);
    addHyperlink(row, "website", website);
  }
  styleSheet(postings, 2);
  tintStatusCells(postings, ["contactResult"]);

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 40 }, { width: 56 }];
  const addKv = (key: string, value: string | number) => {
    const row = summary.addRow([key, value]);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.headerBorder } };
    row.height = 24;
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
  addKv("Executive contacts", allContacts.length);
  addKv(
    "Companies without a verified executive",
    opts.companies.filter((company) => !(contactsByCompany.get(company.id)?.length)).length,
  );
  addKv(
    "How to read this workbook",
    "Use Executive Contacts for C-suite outreach. Blank cells mean no verified public detail was found; TalentMine never inserts guessed email addresses.",
  );
  summary.getColumn(2).alignment = { vertical: "top", wrapText: true };
  summary.getRow(summary.rowCount).height = 52;

  return workbook;
}

function csvField(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  "Job Title", "Job URL", "Posting Date", "Source", "Role Category", "Job City", "Job Region", "Job Country",
  "Company Name", "Company Website", "Industry", "Nature of Business", "Company City", "Company Region", "Company Country",
  "Company Main Phone", "Employer Classification", "Executive Contacts Found", "Contact Result", "Executive Rank",
  "Executive Name", "Executive Title", "Executive LinkedIn", "Primary Email", "Primary Email Status", "Alternate Email",
  "Alternate Email Status", "Executive Primary Phone", "Executive Alternate Phone", "Source URL", "Verification Status",
  "Confidence Score", "Verification Date", "Data Notes", "Remote", "Employment Type", "Salary Min", "Salary Max",
  "Currency", "Description",
] as const;

export function buildCsv(postings: ExportPosting[]): string {
  const lines = [CSV_HEADER.map(csvField).join(",")];
  for (const posting of postings) {
    const contacts = posting.executiveContacts.slice(0, 3);
    const rows: Array<ExecutiveContactRow | undefined> = contacts.length > 0 ? contacts : [undefined];
    for (const contact of rows) {
      const cv = contactValues(contact);
      lines.push([
        posting.title,
        posting.applyUrl ?? posting.sourceUrl ?? "",
        posting.postedAt?.toISOString().slice(0, 10) ?? "",
        POSTING_SOURCE_LABELS[posting.source],
        ROLE_CATEGORY_LABELS[posting.roleCategory],
        posting.city ?? "",
        posting.region ?? "",
        posting.country ?? "",
        posting.companyName,
        companyWebsite({ website: posting.companyWebsite, domain: posting.companyDomain }),
        posting.companyIndustry ?? "",
        exportNatureOfBusiness({
          name: posting.companyName,
          domain: posting.companyDomain,
          industry: posting.companyIndustry,
          natureOfBusiness: posting.companyNatureOfBusiness,
          descriptionSnippets: [posting.descriptionSnippet],
        }),
        posting.companyCity ?? "",
        posting.companyRegion ?? "",
        posting.companyCountry ?? "",
        posting.companyPhone ?? "",
        posting.companyClassification.replaceAll("_", " "),
        contacts.length,
        contactResult(contacts.length),
        cv.executiveRank,
        cv.executiveName,
        cv.executiveTitle,
        cv.executiveLinkedin,
        cv.primaryEmail,
        cv.primaryEmailStatus,
        cv.alternateEmail,
        cv.alternateEmailStatus,
        cv.primaryPhone,
        cv.alternatePhone,
        cv.sourceUrl,
        cv.verificationStatus,
        cv.confidence,
        cv.verificationDate,
        cv.notes,
        posting.isRemote ? "Yes" : "No",
        posting.employmentType?.replaceAll("_", " ") ?? "",
        posting.salaryMin ?? "",
        posting.salaryMax ?? "",
        posting.salaryCurrency ?? "",
        posting.descriptionSnippet,
      ].map(csvField).join(","));
    }
  }
  return lines.join("\r\n");
}
