import { describe, expect, it } from "vitest";
import { linkedinHandle, pickHunterExecutives, pickHunterPerson } from "@server/providers/hunter";
import { isExcludedJobPoster } from "@shared/executive-contact";

describe("executive contact verification", () => {
  it("uses an exact LinkedIn handle to identify the executive", () => {
    expect(linkedinHandle("https://www.linkedin.com/in/riya-kapoor/?trk=company")).toBe("riya-kapoor");
    expect(linkedinHandle("https://www.linkedin.com/company/acme/")).toBeNull();
  });

  it("maps an automatically verified exact-person result back to the known LinkedIn executive", () => {
    const contact = pickHunterPerson(
      {
        first_name: "Riya",
        last_name: "Kapoor",
        email: "riya.kapoor@acme.com",
        score: 97,
        position: "Chief Financial Officer",
        phone_number: "+91 98765 43210",
        verification: { status: "valid", date: "2026-08-26" },
      },
      {
        name: "Riya Kapoor",
        title: "CFO",
        linkedinUrl: "https://www.linkedin.com/in/riya-kapoor/",
      },
    );
    expect(contact).toEqual(expect.objectContaining({
      email: "riya.kapoor@acme.com",
      emailStatus: "verified",
      linkedinUrl: "https://www.linkedin.com/in/riya-kapoor/",
      phone: "+91 98765 43210",
    }));
  });

  it("returns verified/publicly sourced executives and drops pattern-only guesses and recruiters", () => {
    const contacts = pickHunterExecutives([
      {
        value: "founder@acme.com",
        type: "personal",
        confidence: 72,
        first_name: "Aman",
        last_name: "Shah",
        position: "Founder",
      },
      {
        value: "cfo@acme.com",
        type: "personal",
        confidence: 95,
        first_name: "Riya",
        last_name: "Kapoor",
        position: "CFO",
        verification: { status: "valid", date: "2026-08-20" },
      },
      {
        value: "finance.director@acme.com",
        type: "personal",
        confidence: 84,
        first_name: "Neel",
        last_name: "Patel",
        position: "Finance Director",
        sources: [{ uri: "https://acme.com/team", last_seen_on: "2026-08-19" }],
      },
      {
        value: "recruiter@acme.com",
        type: "personal",
        confidence: 99,
        first_name: "Tara",
        last_name: "Rao",
        position: "Executive Recruiter",
        verification: { status: "valid" },
      },
    ]);

    expect(contacts.map((contact) => [contact.position, contact.emailStatus])).toEqual([
      ["CFO", "verified"],
      ["Finance Director", "publicly_confirmed"],
    ]);
  });

  it("excludes a verified C-suite result when the same person posted the job", () => {
    const excludedNames = new Set(["aman shah"]);
    const contact = pickHunterExecutives([
      {
        value: "aman.shah@acme.com",
        type: "personal",
        first_name: "Aman",
        last_name: "Shah",
        position: "Founder and CEO",
        verification: { status: "valid" },
      },
    ])[0];

    expect(isExcludedJobPoster(`${contact?.firstName} ${contact?.lastName}`, excludedNames)).toBe(true);
  });
});
