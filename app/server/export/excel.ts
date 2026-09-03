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

type ExecutiveRole = "CEO" | "CFO" | "COO" | "Founder";

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

function contactPerson(
  companyContactName: string | null | undefined,
  contacts: ExecutiveContactRow[],
  legacyExecutiveName?: string | null,
): string {
  return companyContactName ?? contacts[0]?.name ?? legacyExecutiveName ?? "";
}

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[.,/()_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesRole(title: string | null | undefined, role: ExecutiveRole): boolean {
  const value = normalizeTitle(title);
  if (!value) return false;
  if (role === "CEO") return /\bceo\b/.test(value) || value.includes("chief executive officer");
  if (role === "CFO") return /\bcfo\b/.test(value) || value.includes("chief financial officer");
  if (role === "COO") return /\bcoo\b/.test(value) || value.includes("chief operating officer");
  return value.includes("founder") || value.includes("co founder") || value.includes("cofounder");
}

function executiveForRole(contacts: ExecutiveContactRow[], role: ExecutiveRole): ExecutiveContactRow | undefined {
  return contacts.find((contact) => matchesRole(contact.title, role));
}

function executiveEmail(contact: ExecutiveContactRow | undefined): string {
  if (!contact) return "";
  return exportEmail(contact.primaryEmail, contact.primaryEmailStatus)
    || exportEmail(contact.alternateEmail, contact.alternateEmailStatus);
}

function executivePhone(contact: ExecutiveContactRow | undefined): string {
  return contact?.primaryPhone ?? contact?.alternatePhone ?? "";
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
  header.height = 30;
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
    row.height = 24;
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
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

function addEmailLink(row: ExcelJS.Row, key: string, email: string | null | undefined): void {
  if (!email) return;
  const cell = row.getCell(key);
  cell.value = { text: email, hyperlink: `mailto:${email}` };
  cell.font = { color: { argb: COLORS.link }, underline: true };
}

function compactDescription(sheet: ExcelJS.Worksheet): void {
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.height = 24;
    const cell = row.getCell("description");
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false, shrinkToFit: false };
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
      notes: "Executive not found",
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
    notes: "Verified public executive record",
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
  workbook.title = `${opts.runName} — company and executive contacts`;

  const contactsByCompany = new Map<string, ExecutiveContactRow[]>();
  const allContacts = opts.executiveContacts ?? opts.postings.flatMap((posting) => posting.executiveContacts);
  for (const contact of allContacts) {
    const contacts = contactsByCompany.get(contact.companyId) ?? [];
    if (!contacts.some((existing) => existing.id === contact.id)) contacts.push(contact);
    contactsByCompany.set(contact.companyId, contacts);
  }

  const postingByCompany = new Map<string, ExportPosting>();
  for (const posting of opts.postings) {
    if (!postingByCompany.has(posting.companyId)) postingByCompany.set(posting.companyId, posting);
  }

  const contactsSheet = workbook.addWorksheet("Company & Executive Contacts");
  contactsSheet.columns = [
    { header: "Company", key: "company", width: 22 },
    { header: "Website", key: "website", width: 24 },
    { header: "Contact Person", key: "contactPerson", width: 20 },
    { header: "Company Email", key: "companyEmail", width: 26 },
    { header: "Company Phone", key: "companyPhone", width: 18 },
    { header: "CEO", key: "ceoName", width: 20 },
    { header: "CEO LinkedIn", key: "ceoLinkedin", width: 24 },
    { header: "CEO Email", key: "ceoEmail", width: 26 },
    { header: "CEO Phone", key: "ceoPhone", width: 18 },
    { header: "CFO", key: "cfoName", width: 20 },
    { header: "CFO LinkedIn", key: "cfoLinkedin", width: 24 },
    { header: "CFO Email", key: "cfoEmail", width: 26 },
    { header: "CFO Phone", key: "cfoPhone", width: 18 },
    { header: "COO", key: "cooName", width: 20 },
    { header: "COO LinkedIn", key: "cooLinkedin", width: 24 },
    { header: "COO Email", key: "cooEmail", width: 26 },
    { header: "COO Phone", key: "cooPhone", width: 18 },
    { header: "Founder", key: "founderName", width: 20 },
    { header: "Founder LinkedIn", key: "founderLinkedin", width: 24 },
    { header: "Founder Email", key: "founderEmail", width: 26 },
    { header: "Founder Phone", key: "founderPhone", width: 18 },
    { header: "Description", key: "description", width: 80 },
  ];

  for (const company of opts.companies) {
    const contacts = [...(contactsByCompany.get(company.id) ?? [])].sort((a, b) => a.rank - b.rank);
    const posting = postingByCompany.get(company.id);
    const ceo = executiveForRole(contacts, "CEO");
    const cfo = executiveForRole(contacts, "CFO");
    const coo = executiveForRole(contacts, "COO");
    const founder = executiveForRole(contacts, "Founder");
    const website = companyWebsite(company);
    const companyEmail = company.contactEmail ?? posting?.companyEmail ?? "";
    const description = posting?.descriptionSnippet ?? "";

    const row = contactsSheet.addRow({
      company: company.name,
      website,
      contactPerson: contactPerson(company.contactName, contacts, company.executiveName),
      companyEmail,
      companyPhone: company.phone ?? posting?.companyPhone ?? "",
      ceoName: ceo?.name ?? "",
      ceoLinkedin: ceo?.linkedinUrl ?? "",
      ceoEmail: executiveEmail(ceo),
      ceoPhone: executivePhone(ceo),
      cfoName: cfo?.name ?? "",
      cfoLinkedin: cfo?.linkedinUrl ?? "",
      cfoEmail: executiveEmail(cfo),
      cfoPhone: executivePhone(cfo),
      cooName: coo?.name ?? "",
      cooLinkedin: coo?.linkedinUrl ?? "",
      cooEmail: executiveEmail(coo),
      cooPhone: executivePhone(coo),
      founderName: founder?.name ?? "",
      founderLinkedin: founder?.linkedinUrl ?? "",
      founderEmail: executiveEmail(founder),
      founderPhone: executivePhone(founder),
      description,
    });

    addHyperlink(row, "website", website);
    addHyperlink(row, "ceoLinkedin", ceo?.linkedinUrl);
    addHyperlink(row, "cfoLinkedin", cfo?.linkedinUrl);
    addHyperlink(row, "cooLinkedin", coo?.linkedinUrl);
    addHyperlink(row, "founderLinkedin", founder?.linkedinUrl);
    addEmailLink(row, "companyEmail", companyEmail);
    addEmailLink(row, "ceoEmail", executiveEmail(ceo));
    addEmailLink(row, "cfoEmail", executiveEmail(cfo));
    addEmailLink(row, "cooEmail", executiveEmail(coo));
    addEmailLink(row, "founderEmail", executiveEmail(founder));
  }
  styleSheet(contactsSheet, 2);
  compactDescription(contactsSheet);

  const companies = workbook.addWorksheet("Companies");
  companies.columns = [
    { header: "Company", key: "name", width: 22 },
    { header: "Website", key: "website", width: 24 },
    { header: "Company Email", key: "email", width: 26 },
    { header: "Company Phone", key: "phone", width: 18 },
    { header: "Contact Person", key: "contactPerson", width: 20 },
    { header: "CEO", key: "ceo", width: 20 },
    { header: "CFO", key: "cfo", width: 20 },
    { header: "COO", key: "coo", width: 20 },
    { header: "Founder", key: "founder", width: 20 },
    { header: "Open Postings", key: "count", width: 14 },
  ];

  for (const company of opts.companies) {
    const contacts = [...(contactsByCompany.get(company.id) ?? [])].sort((a, b) => a.rank - b.rank);
    const posting = postingByCompany.get(company.id);
    const website = companyWebsite(company);
    const companyEmail = company.contactEmail ?? posting?.companyEmail ?? "";
    const row = companies.addRow({
      name: company.name,
      website,
      email: companyEmail,
      phone: company.phone ?? posting?.companyPhone ?? "",
      contactPerson: contactPerson(company.contactName, contacts, company.executiveName),
      ceo: executiveForRole(contacts, "CEO")?.name ?? "",
      cfo: executiveForRole(contacts, "CFO")?.name ?? "",
      coo: executiveForRole(contacts, "COO")?.name ?? "",
      founder: executiveForRole(contacts, "Founder")?.name ?? "",
      count: company.postingsCount,
    });
    addHyperlink(row, "website", website);
    addEmailLink(row, "email", companyEmail);
  }
  styleSheet(companies);

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
    "Company & Executive Contacts contains the outreach-ready company, CEO, CFO, COO and Founder details. Blank email or phone cells mean no verified public detail was found; TalentMine does not insert guessed emails.",
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
