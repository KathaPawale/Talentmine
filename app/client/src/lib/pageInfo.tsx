import type { ReactNode } from "react";

/** Per-page explainer copy shown in the InfoCallout under each page title. */
export const PAGE_INFO: Record<string, { title: string; body: ReactNode }> = {
  "/": {
    title: "Dashboard Overview",
    body: "Your talent-demand control room. The metrics show total job postings mined, hiring companies, direct employers, and agency postings filtered out. Charts break demand down by role category, source, and week. The globe lights up where hiring is happening.",
  },
  "/runs": {
    title: "Mining Runs",
    body: "A run searches job boards (Google Jobs via JSearch, Adzuna) and company career sites (Greenhouse, Lever, Workable, and more) for open roles in your target location, then filters out third-party recruiters. Click a run to watch its live pipeline.",
  },
  "/runs/new": {
    title: "How mining runs work",
    body: "A run walks a 7-stage pipeline: job boards → company discovery → career sites → normalize → classify employers → enrich → done. Configure the location and roles, pick sources, and start. Sources without API keys appear disabled — the app runs on sample data in dev until keys are added.",
  },
  "/postings": {
    title: "Job Postings",
    body: "Every unique posting mined, deduplicated across sources. Staffing-agency postings are hidden by default — flip the toggle to see them. Click a row for the job URL, posting date, verified employer details, and up to three senior decision-makers with evidence labels.",
  },
  "/companies": {
    title: "Hiring Companies",
    body: "Hiring companies with open roles and up to three prioritized senior decision-makers. HR, recruiting, hiring-manager, and job-poster contacts are excluded. Staffing/recruitment agencies and other excluded employers stay hidden by default.",
  },
  "/export": {
    title: "Export",
    body: "Download the mined postings as a styled 3-sheet Excel workbook (Postings, Companies, Summary) or a flat CSV. Filters applied here shape exactly what lands in the file.",
  },
  "/settings": {
    title: "Settings",
    body: "Provider key status, API quota usage against free-tier caps, pipeline tunables, and scheduled recurring runs. Keys live in the .env file on the server — this page shows what is active.",
  },
};
