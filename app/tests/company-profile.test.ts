import { describe, expect, it } from "vitest";
import { extractContactsFromHtml, extractNatureOfBusiness, selectExecutiveContacts } from "@server/extract/contact-scrape";
import {
  executiveLinkedInLabel,
  executiveLinkedInUrl,
  natureOfBusinessLabel,
  normalizeLinkedInCompanyUrl,
  normalizeLinkedInProfileUrl,
  publicContactPerson,
  publicContactPersonLabel,
} from "@shared/company-profile";
import { extractJobPosterNames } from "@shared/executive-contact";

describe("company profile enrichment", () => {
  it("extracts nature of business and a public CEO LinkedIn profile from JSON-LD", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Organization","name":"Acme","industry":"Industrial automation"}
      </script>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Person","name":"Asha Rao","jobTitle":"Chief Executive Officer","sameAs":["https://www.linkedin.com/in/asha-rao/?trk=site"]}
      </script>
    </head><body></body></html>`;

    const result = extractContactsFromHtml(html, "acme.example");
    expect(result.natureOfBusiness).toBe("Industrial automation");
    expect(result.persons).toContainEqual(expect.objectContaining({
      name: "Asha Rao",
      title: "Chief Executive Officer",
      linkedinUrl: "https://www.linkedin.com/in/asha-rao/",
    }));
  });

  it("uses a public metadata description when organization JSON-LD is unavailable", () => {
    const html = '<html><head><meta name="description" content="Builds solar energy storage systems for commercial sites."></head></html>';
    expect(extractNatureOfBusiness(html)).toBe("Builds solar energy storage systems for commercial sites.");
  });

  it("accepts only individual LinkedIn profiles and provides an honest search fallback", () => {
    expect(normalizeLinkedInProfileUrl("https://linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedInProfileUrl("https://linkedin.com/in/asha-rao/?trk=site")).toBe(
      "https://www.linkedin.com/in/asha-rao/",
    );

    const fallback = executiveLinkedInUrl({ name: "Acme Industries" });
    expect(fallback).toContain("linkedin.com/search/results/people/");
    expect(decodeURIComponent(fallback)).toContain("Acme Industries CEO CFO");
    expect(executiveLinkedInLabel({ name: "Acme Industries" })).toBe("Find CEO/CFO");
  });

  it("keeps only prioritized executives and excludes HR/recruiting/job-poster contacts", () => {
    const candidates = [
      { name: "Harsha Mehta", title: "HR Director", linkedinUrl: "https://www.linkedin.com/in/harsha-mehta/", emails: ["harsha@acme.com"] },
      { name: "Riya Kapoor", title: "Chief Financial Officer", linkedinUrl: "https://www.linkedin.com/in/riya-kapoor/", emails: ["riya@acme.com"] },
      { name: "Aman Shah", title: "Founder and CEO", linkedinUrl: "https://www.linkedin.com/in/aman-shah/", emails: ["aman@acme.com"] },
      { name: "Neel Patel", title: "Financial Controller", emails: ["finance@acme.com"] },
      { name: "Mira Das", title: "Recruitment Partner", emails: ["mira@acme.com"] },
    ];

    const contacts = selectExecutiveContacts(candidates, "acme.com", ["Aman Shah"]);
    expect(contacts.map((contact) => contact.name)).toEqual(["Riya Kapoor", "Neel Patel"]);
    expect(contacts[0]?.primaryEmailStatus).toBe("publicly_confirmed");
    expect(contacts[1]?.primaryEmail).toBeNull();
    expect(contacts[1]?.primaryEmailStatus).toBe("unavailable");
  });

  it("extracts ordinary leadership cards even when they have no LinkedIn link or JSON-LD", () => {
    const html = `<section class="leadership-card">
      <h3>Riya Kapoor</h3><p class="position">Chief Financial Officer</p>
      <a href="mailto:riya.kapoor@acme.com">Email</a><a href="tel:+91 98765 43210">Call</a>
    </section>`;
    const result = extractContactsFromHtml(html, "acme.com", "https://acme.com/leadership");
    const contacts = selectExecutiveContacts(result.persons, "acme.com");
    expect(contacts).toContainEqual(expect.objectContaining({
      name: "Riya Kapoor",
      title: "Chief Financial Officer",
      primaryEmail: "riya.kapoor@acme.com",
      primaryPhone: "+919876543210",
    }));
  });

  it("conservatively finds a named job poster for exclusion", () => {
    const names = extractJobPosterNames("Job poster: Aman Shah. Please contact Riya Kapoor at jobs@acme.com.");
    expect(names).toEqual(["aman shah", "riya kapoor"]);
  });

  it("recognizes an HR contact described as the person who posted the job", () => {
    expect(extractJobPosterNames("HR named Aman Shah posted a job for a Senior Accountant.")).toEqual(["aman shah"]);
  });

  it("normalizes company LinkedIn URLs without accepting people or search URLs", () => {
    expect(normalizeLinkedInCompanyUrl("https://linkedin.com/company/acme/?trk=footer")).toBe(
      "https://www.linkedin.com/company/acme/",
    );
    expect(normalizeLinkedInCompanyUrl("https://linkedin.com/in/asha-rao/")).toBeNull();
  });

  it("uses a public contact name first and falls back to a known executive", () => {
    expect(publicContactPersonLabel({
      name: "Acme Industries",
      contactName: "Priya Shah",
      contactTitle: "Finance Director",
      executiveName: "Asha Rao",
      executiveTitle: "CEO",
    })).toBe("Priya Shah — Finance Director");

    expect(publicContactPerson({
      name: "Acme Industries",
      executiveName: "Asha Rao",
      executiveTitle: "CEO",
    })).toEqual({ name: "Asha Rao", title: "CEO" });

    expect(publicContactPersonLabel({ name: "Acme Industries" })).toBe("");
  });

  it("converts website paragraphs into short main-business labels", () => {
    const cases = [
      {
        company: {
          name: "ABC Advisors",
          natureOfBusiness: "ABC helps companies with specialist tax consulting and tax advisory services across India.",
        },
        expected: "Tax Consultancy",
      },
      {
        company: {
          name: "City Hospital",
          natureOfBusiness: "A multi-specialty hospital delivering patient care and clinical services.",
        },
        expected: "Healthcare Services",
      },
      {
        company: {
          name: "Prime Homes",
          natureOfBusiness: "We build homes and develop residential real estate projects.",
        },
        expected: "Construction & Real Estate",
      },
      {
        company: { name: "Mastercard" },
        expected: "Payment Technology",
      },
      {
        company: { name: "ZF Lifetec India", natureOfBusiness: "Automotive Retail & Services" },
        expected: "Automotive Safety Manufacturing",
      },
    ];

    for (const { company, expected } of cases) {
      const label = natureOfBusinessLabel(company);
      expect(label).toBe(expected);
      expect(label.length).toBeLessThanOrEqual(48);
      expect(label).not.toMatch(/[.!?]/);
    }
  });

  it("uses a short fallback instead of a paragraph or missing-data message", () => {
    expect(natureOfBusinessLabel({ name: "Example Holdings" })).toBe("Professional Services");
    expect(natureOfBusinessLabel({ name: "Example Company" })).toBe("Business Services");
    expect(natureOfBusinessLabel({ name: "Example Company", natureOfBusiness: "={${Og_description}}" })).toBe(
      "Business Services",
    );
  });
});
