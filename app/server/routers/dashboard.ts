import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { protectedProcedure, router } from "./trpc";
import { schema } from "../db/client";

export const dashboardRouter = router({
  overview: protectedProcedure.query(({ ctx }) => {
    const runs = ctx.db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).all();

    const postingBase = and(
      isNull(schema.jobPostings.duplicateOfId),
      ne(schema.companies.classification, "staffing_agency"),
    );
    const joined = () =>
      ctx.db
        .select({
          roleCategory: schema.jobPostings.roleCategory,
          source: schema.jobPostings.source,
          country: schema.jobPostings.country,
          city: schema.jobPostings.city,
          postedAt: schema.jobPostings.postedAt,
          lat: schema.companies.lat,
          lng: schema.companies.lng,
        })
        .from(schema.jobPostings)
        .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
        .where(postingBase)
        .all();
    const postings = joined();

    const agencyPostings =
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.jobPostings)
        .innerJoin(schema.companies, eq(schema.jobPostings.companyId, schema.companies.id))
        .where(and(isNull(schema.jobPostings.duplicateOfId), eq(schema.companies.classification, "staffing_agency")))
        .get()?.n ?? 0;

    const companies =
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.companies)
        .where(gt(schema.companies.postingsCount, 0))
        .get()?.n ?? 0;
    const directEmployers =
      ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.companies)
        .where(and(eq(schema.companies.classification, "direct_employer"), gt(schema.companies.postingsCount, 0)))
        .get()?.n ?? 0;

    const byRole: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byLocation = new Map<string, number>();
    const markers: { lat: number; lng: number }[] = [];
    for (const p of postings) {
      byRole[p.roleCategory] = (byRole[p.roleCategory] ?? 0) + 1;
      bySource[p.source] = (bySource[p.source] ?? 0) + 1;
      const loc = [p.city, p.country].filter(Boolean).join(", ");
      if (loc) byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1);
      if (p.lat != null && p.lng != null && markers.length < 100) markers.push({ lat: p.lat, lng: p.lng });
    }

    // Postings-per-week series over the last 12 weeks (by postedAt).
    const now = Date.now();
    const WEEK = 7 * 86_400_000;
    const series: { week: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = now - (i + 1) * WEEK;
      const end = now - i * WEEK;
      const count = postings.filter((p) => {
        const t = p.postedAt?.getTime();
        return t != null && t >= start && t < end;
      }).length;
      series.push({ week: new Date(end).toISOString().slice(5, 10), count });
    }

    const topCompanies = ctx.db
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        domain: schema.companies.domain,
        city: schema.companies.city,
        country: schema.companies.country,
        classification: schema.companies.classification,
        postingsCount: schema.companies.postingsCount,
        atsType: schema.companies.atsType,
      })
      .from(schema.companies)
      .where(and(ne(schema.companies.classification, "staffing_agency"), gt(schema.companies.postingsCount, 0)))
      .orderBy(desc(schema.companies.postingsCount))
      .limit(10)
      .all();

    return {
      stats: {
        totalPostings: postings.length,
        companies,
        directEmployers,
        agencyPostingsExcluded: agencyPostings,
        runsCompleted: runs.filter((r) => r.status === "completed").length,
        runsActive: runs.filter((r) => r.status === "running" || r.status === "queued").length,
      },
      byRole,
      bySource,
      topLocations: [...byLocation.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([location, count]) => ({ location, count })),
      series,
      topCompanies,
      markers,
      recentRuns: runs.slice(0, 5),
    };
  }),
});
