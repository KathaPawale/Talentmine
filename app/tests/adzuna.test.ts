import { describe, expect, it } from "vitest";
import { adzunaCountryCode } from "@shared/types";

describe("Adzuna country support", () => {
  it("does not claim an unsupported UAE Adzuna feed", () => {
    expect(adzunaCountryCode("UAE")).toBeNull();
    expect(adzunaCountryCode("United Arab Emirates")).toBeNull();
  });
});