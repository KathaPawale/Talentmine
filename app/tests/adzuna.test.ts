import { describe, expect, it } from "vitest";
import { adzunaCountryCode } from "@shared/types";

describe("Adzuna country support", () => {
  it("supports UAE aliases with the Adzuna AE feed code", () => {
    expect(adzunaCountryCode("UAE")).toBe("ae");
    expect(adzunaCountryCode("United Arab Emirates")).toBe("ae");
  });
});