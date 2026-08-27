import { and, eq, isNull, isNotNull } from "drizzle-orm";
import pLimit from "p-limit";
import { schema } from "../../db/client";
import type { StageContext, StageFn } from "../types";
import type { RawPosting } from "../../providers/types";
import { getSetting } from "../../lib/settings";
import { detectAtsBoards } from "../../providers/ats";
import { findCareersLinks, FALLBACK_PATHS } from "../../crawl/careers-page-finder";
import { extractJsonLdBlocks, stripToVisibleText } from "../../crawl/html-utils";
import { postingsFromJsonLd } from "../../extract/jobposting-jsonld";
import { extractPostingsWithLlm } from "../../extract/llm-extract";
import { classifyByHeuristic } from "../../extract/recruiter-heuristic";
import { sameCountry } from "../../lib/locations";
import { categoriesFromKeywords, insertPosting, matchesRole } from "./upsert";
import type { AtsType, RoleCategory } from "@shared/types";

const CONCURRENCY = 5;

/** Country match on canonical names; postings without a country are kept. */
function locationOk(p: RawPosting, country: string, remoteOnly: boolean): boolean {
  if (remoteOnly && !p.isRemote) return false;
  if (p.isRemote) return true;
  if (!p.country) return true; // ATS boards often omit country — keep, don't guess
  return sameCountry(p.country, country);
}

interface MineResult {
  atsType: AtsType;
  postings: number;
}

async function mineCompany(
  ctx: StageContext,
  company: { id: string; name: string; domain: string; website: string | null },
  keywordCategories: Set<RoleCategory>,
): Promise<MineResult> {
  const cfg = ctx.job.config;
  const baseUrl = company.website ?? `https://${company.domain}`;

  // 1. Fetch homepage; scan for ATS board links + careers links.
  const home = await ctx.providers.fetcher.fetchPage(baseUrl, ctx.signal);
  let knownBoards = home.ok ? detectAtsBoards(home.html) : [];
  let careersLinks = home.ok ? findCareersLinks(home.html, home.url) : [];
  if (careersLinks.length === 0) {
    careersLinks = FALLBACK_PATHS.slice(0, 2).map((p) => new URL(p, baseUrl).toString());
  }

  // 2. Fetch the top careers page — often the ATS link lives only there.
  let careersHtml: string | null = null;
  let careersUrl: string | null = null;
  for (const link of careersLinks.slice(0, 2)) {
    const page = await ctx.providers.fetcher.fetchPage(link, ctx.signal);
    if (page.ok) {
      careersHtml = page.html;
      careersUrl = page.url;
      knownBoards = [...knownBoards, ...detectAtsBoards(page.html)];
      break;
    }
  }

  // 3. ATS board (regex-detected first, slug probe fallback).
  const board = await ctx.providers.ats.fetchBoards({
    companyName: company.name,
    domain: company.domain,
    knownBoards,
    signal: ctx.signal,
  });

  if (board) {
    const relevant = board.postings.filter(
      (p) => matchesRole(p.title, cfg.roleKeywords, keywordCategories) && locationOk(p, cfg.country, cfg.remoteOnly),
    );
    let inserted = 0;
    for (const p of relevant) {
      if (insertPosting(ctx, company.id, p)) inserted++;
    }
    ctx.db
      .update(schema.companies)
      .set({ atsType: board.atsType, atsToken: board.token, careersUrl, updatedAt: new Date() })
      .where(eq(schema.companies.id, company.id))
      .run();
    return { atsType: board.atsType, postings: inserted };
  }

  // 4. No ATS — mine the careers page itself: JSON-LD first, LLM fallback.
  if (careersHtml && careersUrl) {
    let postings = postingsFromJsonLd(extractJsonLdBlocks(careersHtml), {
      companyName: company.name,
      sourceUrl: careersUrl,
    });
    if (postings.length === 0) {
      const text = stripToVisibleText(careersHtml);
      if (/hiring|open (position|role)|vacanc|apply/i.test(text)) {
        postings = await extractPostingsWithLlm(ctx.providers.llm, {
          companyName: company.name,
          pageText: text,
          sourceUrl: careersUrl,
          signal: ctx.signal,
        });
      }
    }
    const relevant = postings.filter(
      (p) => matchesRole(p.title, cfg.roleKeywords, keywordCategories) && locationOk(p, cfg.country, cfg.remoteOnly),
    );
    let inserted = 0;
    for (const p of relevant) {
      if (insertPosting(ctx, company.id, p)) inserted++;
    }
    ctx.db
      .update(schema.companies)
      .set({ atsType: inserted > 0 ? "careers_page" : "none", careersUrl, updatedAt: new Date() })
      .where(eq(schema.companies.id, company.id))
      .run();
    return { atsType: inserted > 0 ? "careers_page" : "none", postings: inserted };
  }

  ctx.db
    .update(schema.companies)
    .set({ atsType: "none", updatedAt: new Date() })
    .where(eq(schema.companies.id, company.id))
    .run();
  return { atsType: "none", postings: 0 };
}

/**
 * Stage 3: for each company with a website, detect its ATS (Greenhouse, Lever,
 * Workable, SmartRecruiters, Recruitee, Ashby) or crawl its careers page, and
 * pull matching first-party postings. Checkpointed on companies.atsType, so a
 * resumed run skips companies already mined.
 */
export const atsMineStage: StageFn = async (ctx) => {
  const cfg = ctx.job.config;
  if (!cfg.sources.includes("ats")) {
    ctx.emit("info", "Career-site mining not selected — skipping.");
    return { skipped: 1 };
  }

  const cap = getSetting("ats.max_companies_per_run") as number;
  const candidates = ctx.db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      domain: schema.companies.domain,
      website: schema.companies.website,
      industry: schema.companies.industry,
    })
    .from(schema.companies)
    .where(
      and(
        eq(schema.companies.jobId, ctx.jobId),
        isNull(schema.companies.atsType),
        isNotNull(schema.companies.domain),
      ),
    )
    .limit(cap)
    .all() as { id: string; name: string; domain: string; website: string | null; industry: string | null }[];

  // Obvious staffing agencies get flagged up front and skipped — no crawl
  // budget spent, and their careers pages can't pollute the posting pool.
  const targets: typeof candidates = [];
  let agenciesSkipped = 0;
  for (const c of candidates) {
    const verdict = classifyByHeuristic({ name: c.name, domain: c.domain, industry: c.industry });
    if (verdict) {
      ctx.db
        .update(schema.companies)
        .set({
          atsType: "none",
          classification: "staffing_agency",
          classificationConfidence: verdict.confidence,
          classificationMethod: "heuristic",
          classificationReason: verdict.reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, c.id))
        .run();
      agenciesSkipped++;
    } else {
      targets.push(c);
    }
  }
  if (agenciesSkipped > 0) {
    ctx.emit("info", `${agenciesSkipped} obvious staffing agencies flagged and skipped before crawling.`);
  }

  if (targets.length === 0) {
    ctx.emit("info", "No companies with websites to mine for career pages.");
    return { itemsIn: 0, itemsOut: 0 };
  }

  const keywordCategories = categoriesFromKeywords(cfg.roleKeywords);
  ctx.emit("info", `Mining career sites of ${targets.length} companies (ATS detection + careers pages)…`);

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  let atsFound = 0;
  let totalPostings = 0;
  let failed = 0;

  await Promise.all(
    targets.map((company) =>
      limit(async () => {
        ctx.checkCancelled();
        try {
          const result = await mineCompany(ctx, company, keywordCategories);
          if (result.atsType !== "none" && result.atsType !== "careers_page") {
            atsFound++;
            ctx.emit("info", `${company.name}: ${result.atsType} board found, ${result.postings} matching postings`);
          } else if (result.postings > 0) {
            ctx.emit("info", `${company.name}: careers page yielded ${result.postings} matching postings`);
          }
          totalPostings += result.postings;
        } catch (err) {
          failed++;
          ctx.emit("warn", `${company.name}: career-site mining failed (${err instanceof Error ? err.message : err})`);
          ctx.db
            .update(schema.companies)
            .set({ atsType: "none", updatedAt: new Date() })
            .where(eq(schema.companies.id, company.id))
            .run();
        } finally {
          done++;
          ctx.reportItems(done, targets.length);
          ctx.heartbeat();
        }
      }),
    ),
  );

  ctx.emit(
    "success",
    `Career-site mining complete: ${atsFound} ATS boards found, ${totalPostings} postings pulled${failed > 0 ? `, ${failed} companies failed` : ""}.`,
  );
  return { itemsIn: targets.length, itemsOut: totalPostings, failed };
};
