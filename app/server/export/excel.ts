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

function executiveList(
  contacts: ExecutiveContactRow[],
  value: (contact: ExecutiveContactRow) => string | null | undefined,
): string {
  return contacts
    .map((contact) => {
      const detail = value(contact)?.trim();
      return detail ? `${contact.title}: ${detail}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function executiveNames(contacts: ExecutiveContactRow[]): string {
  return executiveList(contacts, (contact) => contact.name);
}

function executiveLinkedins(contacts: ExecutiveContactRow[]): string {
  return executiveList(contacts, (contact) => contact.linkedinUrl);
}

function executivePhones(contacts: ExecutiveContactRow[]): string {
  return executiveList(
    contacts,
    (contact) => [contact.primaryPhone, contact.alternatePhone].filter(Boolean).join(" / "),
  );
}

function contactPerson(
  companyContactName: string | null | undefined,
  contacts: ExecutiveContactRow[],
  legacyExecutiveName?: string | null,
): string {
  return companyContactName ?? contacts[0]?.name ?? legacyExecutiveName ?? "";
}

function legacyExecutiveValue(title: string | null, value: string | null): string {
  return value ? `${title ?? "Executive"}: ${value}` : "";
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

function fitWrappedRows(sheet: ExcelJS.Worksheet, keys: string[], maxHeight = 96): void {
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    let lines = 1;
    for (const key of keys) {
      const column = sheet.getColumn(key);
      const text = String(row.getCell(key).value ?? "");
      const width = Math.max(12, Number(column.width ?? 20));
      const wrappedLines = text
        .split("\n")
        .reduce((count, part) => count + Math.max(1, Math.ceil(part.length / width)), 0);
      lines = Math.max(lines, wrappedLines);
    }
    row.height = Math.min(maxHeight, Math.max(34, 12 + lines * 16));
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
    { header: "Company", key: "name", width: 28 },
    { header: "Website", key: "website", width: 30 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 20 },
    { header: "Contact Person", key: "contactPerson", width: 24 },
    { header: "City", key: "city", width: 18 },
    { header: "Region", key: "region", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "ATS", key: "ats", width: 18 },
    { header: "Classification", key: "classification", width: 20 },
    { header: "Open Postings", key: "count", width: 14 },
  ];
  for (const company of opts.companies) {
    const contacts = [...(contactsByCompany.get(company.id) ?? [])].sort((a, b) => a.rank - b.rank).slice(0, 3);
    const row = companies.addRow({
      name: company.name,
      website: companyWebsite(company),
      email: company.contactEmail ?? "",
      phone: company.phone ?? "",
      contactPerson: contactPerson(company.contactName, contacts, company.executiveName),
      city: company.city ?? "",
      region: company.region ?? "",
      country: company.country ?? "",
      ats: company.atsType?.replaceAll("_", " ") ?? "",
      classification: company.classification.replaceAll("_", " "),
      count: company.postingsCount,
    });
    addHyperlink(row, "website", companyWebsite(company));
  }
  styleSheet(companies);

  const postings = workbook.addWorksheet("Job Postings");
  postings.columns = [
    { header: "Company Name", key: "company", width: 28 },
    { header: "Website", key: "website", width: 30 },
    { header: "Company Email", key: "companyEmail", width: 28 },
    { header: "Company Phone Number", key: "companyPhone", width: 20 },
    { header: "Contact Person", key: "contactPerson", width: 24 },
    { header: "CEO, COO, Founder LinkedIn Link", key: "executiveLinkedins", width: 42 },
    { header: "CEO, COO, Founder Names", key: "executiveNames", width: 32 },
    { header: "CEO, COO, Founder Contact Phones", key: "executivePhones", width: 32 },
    { header: "Job Title", key: "title", width: 34 },
    { header: "Role Category", key: "role", width: 18 },
    { header: "City", key: "city", width: 16 },
    { header: "Region", key: "region", width: 16 },
    { header: "Country", key: "country", width: 16 },
    { header: "Remote", key: "remote", width: 9 },
    { header: "Type", key: "type", width: 16 },
    { header: "Salary Min", key: "salaryMin", width: 12 },
    { header: "Salary Max", key: "salaryMax", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Posted", key: "posted", width: 14 },
    { header: "Source", key: "source", width: 18 },
    { header: "Apply URL", key: "applyUrl", width: 38 },
    { header: "Description", key: "description", width: 52 },
  ];
  for (const posting of opts.postings) {
    const contacts = [...posting.executiveContacts].sort((a, b) => a.rank - b.rank).slice(0, 3);
    const website = companyWebsite({ website: posting.companyWebsite, domain: posting.companyDomain });
    const row = postings.addRow({
      company: posting.companyName,
      website,
      companyEmail: posting.companyEmail ?? "",
      companyPhone: posting.companyPhone ?? "",
      contactPerson: contactPerson(posting.companyContactName, contacts, posting.companyExecutiveName),
      executiveLinkedins: executiveLinkedins(contacts)
        || legacyExecutiveValue(posting.companyExecutiveTitle, posting.companyExecutiveLinkedinUrl),
      executiveNames: executiveNames(contacts)
        || legacyExecutiveValue(posting.companyExecutiveTitle, posting.companyExecutiveName),
      executivePhones: executivePhones(contacts),
      title: posting.title,
      role: ROLE_CATEGORY_LABELS[posting.roleCategory],
      city: posting.city ?? posting.companyCity ?? "",
      region: posting.region ?? posting.companyRegion ?? "",
      country: posting.country ?? posting.companyCountry ?? "",
      remote: posting.isRemote ? "Yes" : "No",
      type: posting.employmentType?.replaceAll("_", " ") ?? "",
      salaryMin: posting.salaryMin ?? "",
      salaryMax: posting.salaryMax ?? "",
      currency: posting.salaryCurrency ?? "",
      posted: posting.postedAt?.toISOString().slice(0, 10) ?? "",
      source: POSTING_SOURCE_LABELS[posting.source],
      applyUrl: posting.applyUrl ?? posting.sourceUrl ?? "",
      description: posting.descriptionSnippet,
    });
    addHyperlink(row, "applyUrl", posting.applyUrl ?? posting.sourceUrl);
    addHyperlink(row, "website", website);
  }
  styleSheet(postings, 2);
  fitWrappedRows(postings, ["executiveLinkedins", "executiveNames", "executivePhones", "description"]);

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
