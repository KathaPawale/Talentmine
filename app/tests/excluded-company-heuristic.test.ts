import { describe, expect, it } from "vitest";
import { classifyByHeuristic } from "@server/extract/recruiter-heuristic";

describe("excluded company heuristic", () => {
  it("excludes known recruitment and staffing firms", () => {
    expect(classifyByHeuristic({ name: "Mantras2Success.com" })?.isAgency).toBe(true);
    expect(classifyByHeuristic({ name: "I8IS INC.", domain: "i8is.com" })?.isAgency).toBe(true);
    expect(classifyByHeuristic({ name: "Ernest Gordon Recruitment" })?.isAgency).toBe(true);
    expect(classifyByHeuristic({ name: "Head 4 Talent" })?.isAgency).toBe(true);
    expect(classifyByHeuristic({ name: "Nordoff Associates Ltd" })?.isAgency).toBe(true);
  });

  it("excludes CA/CPA and outsourced-accounting firms", () => {
    expect(
      classifyByHeuristic({
        name: "K C Mehta & Co LLP",
        sampleTitles: ["Corporate Tax", "Chartered Accountant"],
      })?.reason,
    ).toMatch(/CA firm|accounting/i);
    expect(classifyByHeuristic({ name: "Brock, Schechter & Polakoff LLP", domain: "bspcpa.com" })?.isAgency).toBe(true);
    expect(classifyByHeuristic({ name: "LedgerGurus" })?.isAgency).toBe(true);
    expect(
      classifyByHeuristic({
        name: "Example Finance",
        sampleDescriptions: ["We are a Finance as a Service provider supporting client accounting services."],
      })?.isAgency,
    ).toBe(true);
    expect(
      classifyByHeuristic({
        name: "Example Partners",
        natureOfBusiness: "Specialist accountancy and finance recruitment consultancy.",
      })?.isAgency,
    ).toBe(true);
  });

  it("excludes explicit government employers", () => {
    expect(classifyByHeuristic({ name: "Department of Public Works" })?.reason).toMatch(/Government/i);
    expect(classifyByHeuristic({ name: "City Office", domain: "jobs.example.gov" })?.isAgency).toBe(true);
  });

  it("does not mistake ordinary clients or non-accounting partnerships for exclusions", () => {
    expect(
      classifyByHeuristic({
        name: "Trek Panda",
        sampleDescriptions: ["We provide sustainable travel experiences for our clients around the world."],
      }),
    ).toBeNull();
    expect(
      classifyByHeuristic({
        name: "Nicholson & Co. Ltd",
        sampleTitles: ["Accounts & Finance Manager"],
        sampleDescriptions: ["We build and restore pipe organs for our customers."],
      }),
    ).toBeNull();
  });
});
