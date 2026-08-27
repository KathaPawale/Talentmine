import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { classifyByHeuristic } from "../extract/recruiter-heuristic";
import { natureOfBusinessLabel } from "@shared/company-profile";

/** Re-check persisted data and replace website paragraphs with short labels. */
export function repairCompanyProfiles(): { exclusionsMarked: number; activitiesUpdated: number } {
  const companies = db.select().from(schema.companies).all();
  let exclusionsMarked = 0;
  let activitiesUpdated = 0;

  for (const company of companies) {
    const samples = db
      .select({ title: schema.jobPostings.title, snippet: schema.jobPostings.descriptionSnippet })
      .from(schema.jobPostings)
      .where(eq(schema.jobPostings.companyId, company.id))
      .limit(5)
      .all();
    const activity = natureOfBusinessLabel({
      ...company,
      descriptionSnippets: samples.map((sample) => sample.snippet),
    });
    const exclusion = classifyByHeuristic({
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      natureOfBusiness: company.natureOfBusiness,
      sampleTitles: samples.map((sample) => sample.title),
      sampleDescriptions: samples.map((sample) => sample.snippet).filter(Boolean),
    });
    const exclusionUpdate =
      exclusion && company.classification !== "staffing_agency" && company.classificationMethod !== "manual"
        ? {
            classification: "staffing_agency" as const,
            classificationConfidence: exclusion.confidence,
            classificationMethod: "heuristic" as const,
            classificationReason: exclusion.reason,
          }
        : {};
    if (Object.keys(exclusionUpdate).length > 0) exclusionsMarked++;
    if (activity !== company.natureOfBusiness) activitiesUpdated++;
    if (Object.keys(exclusionUpdate).length === 0 && activity === company.natureOfBusiness) continue;

    db.update(schema.companies)
      .set({ natureOfBusiness: activity, ...exclusionUpdate, updatedAt: new Date() })
      .where(eq(schema.companies.id, company.id))
      .run();
  }

  return { exclusionsMarked, activitiesUpdated };
}
