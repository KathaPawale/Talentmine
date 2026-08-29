import { describe, expect, it } from "vitest";
import { buildCsv, buildWorkbook, exportFilename, type ExportPosting } from "@server/export/excel";
import type { CompanyRow, ExecutiveContactRow } from "@server/db/schema";

const company = {
  id: "company-1",
  name: "Acme Industries",
  website: "https://acme.example",
  domain: "acme.example",
  linkedinUrl: "https://www.linkedin.com/company/acme/",
  industry: "Manufacturing",
  natureOfBusiness: "Industrial automation equipment",
  contactEmail: "info@acme.example",
  contactSource: "scrape",
  contactName: "Asha Rao",
  contactTitle: "CEO",
  executiveName: "Asha Rao",
  executiveTitle: "CEO",
  executiveLinkedinUrl: "https://www.linkedin.com/in/asha-rao/",
  phone: "+91 12345",
  city: "Pune",
  region: "Maharashtra",
  country: "India",
  atsType: "greenhouse",
  classification: "direct_employer",
  classificationConfidence: 100,
  postingsCount: 1,
} as CompanyRow;

const executiveContact = {
  id: "executive-1",
  companyId: company.id,
  jobId: "job-1",
  userId: "user-1",
  rank: 1,
  dedupeKey: "asha rao|ceo",
  name: "Asha Rao",
  title: "CEO",
  linkedinUrl: "https://www.linkedin.com/in/asha-rao/",
  primaryEmail: "asha@acme.example",
  primaryEmailStatus: "verified",
  alternateEmail: "a.rao@acme.example",
  alternateEmailStatus: "pattern_based_guess",
  primaryPhone: "+9112345",
  alternatePhone: null,
  sourceUrl: "https://acme.example/leadership",
  verificationStatus: "verified",
  confidenceScore: 96,
  verifiedAt: new Date("2026-08-12T00:00:00Z"),
  createdAt: new Date("2026-08-12T00:00:00Z"),
  updatedAt: new Date("2026-08-12T00:00:00Z"),
} as ExecutiveContactRow;

const posting = {
  id: "posting-1",
  companyId: company.id,
  companyName: company.name,
  companyDomain: company.domain,
  companyClassification: company.classification,
  companyWebsite: company.website,
  companyLinkedinUrl: company.linkedinUrl,
  companyEmail: company.contactEmail,
  companyPhone: company.phone,
  companyContactName: company.contactName,
  companyContactTitle: company.contactTitle,
  companyIndustry: company.industry,
  companyCity: company.city,
  companyRegion: company.region,
  companyCountry: company.country,
  companyNatureOfBusiness: company.natureOfBusiness,
  companyExecutiveName: company.executiveName,
  companyExecutiveTitle: company.executiveTitle,
  companyExecutiveLinkedinUrl: company.executiveLinkedinUrl,
  executiveContacts: [executiveContact],
  title: "Finance Manager",
  roleCategory: "finance",
  city: "Pune",
  region: "Maharashtra",
  country: "India",
  isRemote: false,
  employmentType: "full_time",
  alsoSeenOn: [],
  source: "jsearch",
  descriptionSnippet: "Lead financial planning.",
} as unknown as ExportPosting;

describe("company profile export", () => {
  it("uses a normalized one-executive-per-row contact sheet and compact company/job sheets", () => {
    const workbook = buildWorkbook({
      postings: [posting],
      companies: [company],
      executiveContacts: [executiveContact],
      runName: "Test",
      runConfig: null,
      generatedAt: new Date("2026-08-12T00:00:00Z"),
    });

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Executive Contacts", "Companies", "Job Postings", "Summary",
    ]);
    const contacts = workbook.getWorksheet("Executive Contacts")!;
    const contactHeaders = contacts.getRow(1).values as unknown[];
    expect(contactHeaders).toContain("Primary Email");
    expect(contactHeaders).toContain("Primary Email Status");
    expect(contactHeaders).toContain("Alternate Email");
    expect(contactHeaders).toContain("Executive Primary Phone");
    expect(contactHeaders).toContain("Company Main Phone");
    expect(contactHeaders).toContain("Verification Date");
    const linkedInColumn = contacts.columns.findIndex((c) => c.key === "executiveLinkedin") + 1;
    expect(contacts.getRow(2).getCell(linkedInColumn).value).toEqual({
      text: "https://www.linkedin.com/in/asha-rao/",
      hyperlink: "https://www.linkedin.com/in/asha-rao/",
    });

    for (const sheetName of ["Job Postings", "Companies"]) {
      const headers = workbook.getWorksheet(sheetName)!.getRow(1).values as unknown[];
      expect(headers).toContain("Nature of Business");
      expect(headers).toContain("Company Main Phone");
      expect(headers).not.toContain("Executive 1 Primary Email");
    }

    const companyHeaders = workbook.getWorksheet("Companies")!.getRow(1).values as unknown[];
    expect(companyHeaders).toContain("Industry");
    expect(companyHeaders).toContain("Company LinkedIn");
  });

  it("adds both fields to CSV exports", () => {
    const csv = buildCsv([posting]);
    expect(csv.split("\r\n")[0]).toContain("Primary Email Status");
    expect(csv).toContain("Manufacturing");
    expect(csv).not.toContain("Industrial automation equipment");
    expect(csv).toContain("https://www.linkedin.com/in/asha-rao/");
    expect(csv).toContain("Verified");
    expect(csv).not.toContain("a.rao@acme.example");
    expect(csv).not.toContain("Pattern-Based Guess");
    expect(csv).toContain("+91 12345");
  });

  it("keeps the company and states when no verified executive contact is found", () => {
    const noContactPosting = { ...posting, executiveContacts: [] } as ExportPosting;
    const workbook = buildWorkbook({
      postings: [noContactPosting],
      companies: [company],
      executiveContacts: [],
      runName: "Test",
      runConfig: null,
      generatedAt: new Date("2026-08-12T00:00:00Z"),
    });
    const postingsSheet = workbook.getWorksheet("Job Postings")!;
    const resultColumn = postingsSheet.columns.findIndex((column) => column.key === "contactResult") + 1;
    expect(postingsSheet.getRow(2).getCell(resultColumn).value).toBe("No verified executive contact found");
    const contactsSheet = workbook.getWorksheet("Executive Contacts")!;
    const primaryEmailStatusColumn = contactsSheet.columns.findIndex((column) => column.key === "primaryEmailStatus") + 1;
    expect(contactsSheet.getRow(2).getCell(primaryEmailStatusColumn).value).toBe("");
    expect(buildCsv([noContactPosting])).toContain("No verified executive contact found");
    expect(buildCsv([noContactPosting])).not.toContain("Unavailable");
  });

  it("uses a timestamped filename so same-day exports cannot be confused", () => {
    const generatedAt = new Date("2026-08-12T12:34:56.789Z");
    expect(exportFilename("xlsx", generatedAt)).toBe("talentmine-postings-2026-08-12-12-34-56Z.xlsx");
    expect(exportFilename("csv", generatedAt)).toBe("talentmine-postings-2026-08-12-12-34-56Z.csv");
  });
});
