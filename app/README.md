# TalentMine

Talent-demand mining: find companies anywhere in the world that are hiring for the roles you care about (Accountant, HR, Manager, …) — **excluding third-party recruiters** — with every posting and employer captured in a dashboard and exportable to Excel.

## How it mines

A run walks a 7-stage checkpointed pipeline (resumable after failure/restart):

1. **Job Boards** — JSearch (RapidAPI; aggregates Google for Jobs, which carries LinkedIn, Indeed, Glassdoor and direct postings) + Adzuna, queried per role keyword.
2. **Discover** — Google Places finds companies (with websites) in the target location for career-site mining.
3. **Career Sites** — each company's site is scanned for its ATS (Greenhouse, Lever, Workable, SmartRecruiters, Recruitee, Ashby — all public JSON APIs, no keys) or its careers page is crawled for schema.org JobPosting markup, with a Groq LLM fallback.
4. **Normalize** — titles mapped to canonical role categories (rules first, LLM batches for the rest); the same job seen on multiple sources is merged (first-party record wins).
5. **Classify** — every employer is judged *direct employer* vs *staffing agency* (heuristics + LLM). Agencies are flagged and hidden by default, never deleted; you can reclassify manually.
6. **Enrich** — executive discovery (always on): each direct employer's own site is crawled for up to three prioritized senior decision-makers (Founder/Owner/C-suite/President/Managing Director/Partner/Finance Director/Financial Controller). HR, recruiting, hiring-manager, and named job-poster contacts are rejected. When an exact executive LinkedIn profile is found, its handle is used first for an exact-person Hunter Email Finder lookup, which automatically verifies the returned professional email; only then does the pipeline use a broader company-domain fallback. Only person-specific company emails that are provider-verified or publicly confirmed on a source page are shown; pattern-only guesses are suppressed. Each result can include primary/alternate email, primary/alternate business phone, company main phone, company name, city/region/country, LinkedIn, source URL, evidence status, confidence, and verification date. Missing details stay explicit instead of being invented. Optionally also enrich the company address/phone via Places (`enrichCompanies`).
7. **Done** — totals.

## Run it

```bash
npm install
npm run dev        # http://localhost:3001
```

- With no job-board keys, dev runs in **simulate mode** on clearly-marked sample data so you can exercise everything.
- `npm run check` (types), `npm test` (59 unit + integration tests), `npm run build` + `npm start` (production).

## API keys (.env)

| Key | Purpose | Where |
|---|---|---|
| `GOOGLE_CLIENT_ID/SECRET` | Google sign-in | console.cloud.google.com |
| `GOOGLE_PLACES_API_KEY` | Company discovery + enrichment | console.cloud.google.com |
| `GROQ_API_KEY` | Role normalization + recruiter classification | console.groq.com |
| `GEMINI_API_KEY` | Optional LLM failover | aistudio.google.com |
| `RAPIDAPI_KEY` | **JSearch** — LinkedIn/Indeed/Google Jobs coverage. Free ~200 req/mo | rapidapi.com → search "JSearch" → subscribe (Basic, free) |
| `ADZUNA_APP_ID/APP_KEY` | Adzuna job API. Free ~250 calls/day, ~20 countries | developer.adzuna.com |

Quota guards stop each provider before its free tier is exhausted (caps adjustable in Settings; usage bars on the Settings page).

## Deployment (Railway)

`railway.json` is included. One replica only (SQLite + in-process queue). Add a persistent volume mounted at `/data` and set `DATABASE_PATH=/data/talentmine.db` — **without the volume, the database is wiped on every deploy/restart**. `APP_URL` is derived from `RAILWAY_PUBLIC_DOMAIN` automatically. Set all `.env` values as Railway variables (never `DEV_AUTH_BYPASS=true` in production).

For a shareable test link with no sign-in, set `AUTH_DISABLED=true` — every visitor shares one guest account (they can create/delete runs and consume API quotas; the quota guards still cap total spend). Set it back to `false` to restore Google sign-in.

## Notes on sources

LinkedIn and Indeed offer no public job-search APIs and prohibit scraping. Their postings reach TalentMine legitimately through Google for Jobs aggregation (JSearch) and through the employers' own ATS boards — which is also where the richest first-party data lives.
