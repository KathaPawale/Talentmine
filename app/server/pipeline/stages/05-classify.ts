import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../../db/client";
import type { StageFn } from "../types";
import { classifyByHeuristic } from "../../extract/recruiter-heuristic";
import { getSetting } from "../../lib/settings";
import { CLASSIFICATIONS } from "@shared/types";
import { natureOfBusinessLabel } from "@shared/company-profile";

const llmVerdictSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number().min(0).max(100),
  reason: z.string().max(400),
  natureOfBusiness: z.string().min(3).max(60),
});

const LLM_SCHEMA = {
  type: "object",
  properties: {
    classification: { type: "string", enum: [...CLASSIFICATIONS] },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    natureOfBusiness: { type: "string", minLength: 3, maxLength: 60 },
  },
  required: ["classification", "confidence", "reason", "natureOfBusiness"],
};

/**
 * Stage 5: the "no third-party recruiters" filter. Heuristics catch obvious
 * staffing agencies free of charge; the LLM judges the rest from name, domain,
 * and sample postings. Agencies are flagged, never deleted — queries hide them
 * by default and the UI offers manual reclassification.
 */
export const classifyStage: StageFn = async (ctx) => {
  const companies = ctx.db
    .select()
    .from(schema.companies)
    .where(and(eq(schema.companies.jobId, ctx.jobId), eq(schema.companies.classification, "unknown")))
    .all();

  // Only classify companies that actually have postings — discovery-only rows
  // without jobs don't appear in results and don't deserve LLM spend.
  const withPostings = companies.filter((c) => {
    const row = ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.jobPostings)
      .where(eq(schema.jobPostings.companyId, c.id))
      .get();
    return (row?.n ?? 0) > 0;
  });

  if (withPostings.length === 0) {
    ctx.emit("info", "No employers to classify.");
    return { itemsIn: 0, itemsOut: 0 };
  }

  const threshold = getSetting("classify.confidence_threshold") as number;
  ctx.emit("info", `Classifying ${withPostings.length} employers (direct employer vs staffing agency)…`);

  let heuristicHits = 0;
  let llmHits = 0;
  let unknownLeft = 0;
  let done = 0;

  for (const company of withPostings) {
    ctx.checkCancelled();
    const samples = ctx.db
      .select({ title: schema.jobPostings.title, snippet: schema.jobPostings.descriptionSnippet })
      .from(schema.jobPostings)
      .where(eq(schema.jobPostings.companyId, company.id))
      .limit(5)
      .all();

    const verdict = classifyByHeuristic({
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      natureOfBusiness: company.natureOfBusiness,
      sampleTitles: samples.map((s) => s.title),
      sampleDescriptions: samples.map((s) => s.snippet).filter(Boolean),
    });

    if (verdict) {
      ctx.db
        .update(schema.companies)
        .set({
          classification: "staffing_agency",
          classificationConfidence: verdict.confidence,
          classificationMethod: "heuristic",
          classificationReason: verdict.reason,
          natureOfBusiness: natureOfBusinessLabel({
            ...company,
            descriptionSnippets: samples.map((sample) => sample.snippet),
          }),
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, company.id))
        .run();
      heuristicHits++;
    } else {
      const titles = samples.map((s) => s.title).slice(0, 3).join("; ");
      // Up to 3 snippets, ~700 chars total — one 300-char snippet gave the 8B
      // model too little evidence and it guessed from the name.
      const snippets = samples
        .map((s) => s.snippet)
        .filter(Boolean)
        .slice(0, 3)
        .map((s, i) => `Posting ${i + 1}: ${s.slice(0, 240)}`)
        .join("\n");
      const raw = await ctx.providers.llm.completeJson<unknown>({
        system:
          "You decide whether a company should appear in TalentMine results. The internal " +
          "staffing_agency value means EXCLUDED COMPANY and covers three categories: " +
          "(1) staffing/recruitment agencies and third-party recruiters, (2) CA/CPA/chartered-accountancy " +
          "and outsourced-accounting firms, and (3) government-run organizations.\n" +
          "Rules:\n" +
          "- Return staffing_agency on concrete evidence of any excluded category: recruiting language in the postings " +
          "('our client', 'on behalf of', 'we are partnering with', placement/candidate wording), " +
          "a known recruitment firm, explicit CA/CPA/accounting-firm evidence, or explicit government ownership.\n" +
          "- CA/CPA/chartered-accountancy and outsourced-accounting firms are excluded even when hiring for their own offices.\n" +
          "- Law firms, ordinary consultancies, software/IT services, banks, and private financial-services companies " +
          "remain DIRECT employers unless separate evidence shows they are excluded.\n" +
          "- A name pattern like '& Associates', 'LLP', or 'Consulting' alone is not enough; combine it with the website, titles, or posting text.\n" +
          "- Never invent facts about the company. If the postings read first-party and you have no " +
          "positive knowledge that it is a recruiter, answer direct_employer.\n" +
          "- Use unknown only when the evidence is genuinely contradictory.\n" +
          "- natureOfBusiness must be the company's main business activity in a short 2-5 word label, " +
          "for example Tax Consultancy, Healthcare Services, Construction & Real Estate, or Enterprise Software. " +
          "Never return a sentence or marketing description.\n" +
          "In the reason field, cite the specific evidence (quote the phrase or name the known brand).",
        user:
          `Company: ${company.name}\n` +
          (company.domain ? `Website domain: ${company.domain}\n` : "") +
          (company.industry ? `Industry: ${company.industry}\n` : "") +
          `Sample posting titles: ${titles}\n` +
          (snippets ? snippets : "No posting text available."),
        schemaName: "employer_classification",
        schema: LLM_SCHEMA,
        signal: ctx.signal,
        maxTokens: 300,
      });
      const parsed = llmVerdictSchema.safeParse(raw);
      if (parsed.success && parsed.data.classification !== "unknown" && parsed.data.confidence >= threshold) {
        ctx.db
          .update(schema.companies)
          .set({
            classification: parsed.data.classification,
            classificationConfidence: Math.round(parsed.data.confidence),
            classificationMethod: "llm",
            classificationReason: parsed.data.reason,
            natureOfBusiness: natureOfBusinessLabel({
              ...company,
              natureOfBusiness: parsed.data.natureOfBusiness,
            }),
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, company.id))
          .run();
        llmHits++;
      } else {
        // Below threshold or LLM unavailable — stays unknown, shown with a badge.
        if (parsed.success) {
          ctx.db
            .update(schema.companies)
            .set({
              classificationConfidence: Math.round(parsed.data.confidence),
              classificationReason: parsed.data.reason,
              natureOfBusiness: natureOfBusinessLabel({
                ...company,
                natureOfBusiness: parsed.data.natureOfBusiness,
              }),
              updatedAt: new Date(),
            })
            .where(eq(schema.companies.id, company.id))
            .run();
        }
        unknownLeft++;
      }
    }
    done++;
    ctx.reportItems(done, withPostings.length);
    ctx.heartbeat();
  }

  const agencies = ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(schema.companies)
    .where(and(eq(schema.companies.jobId, ctx.jobId), eq(schema.companies.classification, "staffing_agency")))
    .get();

  ctx.emit(
    "success",
    `Classification complete: ${heuristicHits} excluded companies caught by rules, ${llmHits} companies judged by LLM, ${unknownLeft} left unknown. ${agencies?.n ?? 0} excluded companies flagged${ctx.job.config.excludeAgencies ? " (hidden from results by default)" : ""}.`,
  );
  return { itemsIn: withPostings.length, itemsOut: withPostings.length - unknownLeft };
};
