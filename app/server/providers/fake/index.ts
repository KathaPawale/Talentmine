import type {
  AtsBoardResult,
  AtsProvider,
  DiscoveredCompany,
  DiscoveryProvider,
  Fetcher,
  FetchOutcome,
  JobSourceProvider,
  LlmProvider,
  RawPosting,
} from "../types";

/**
 * Simulate mode: dev with no API keys runs the whole pipeline on clearly
 * marked sample data so every stage, page, and export can be exercised.
 * Deterministic: same inputs → same outputs (no Math.random).
 */

const FAKE_EMPLOYERS = [
  { name: "Northwind Traders (dev sample)", domain: "northwind.example.com", ats: "greenhouse" as const },
  { name: "Acme Manufacturing (dev sample)", domain: "acme.example.com", ats: "lever" as const },
  { name: "Globex Financial (dev sample)", domain: "globex.example.com", ats: null },
  { name: "Initech Software (dev sample)", domain: "initech.example.com", ats: null },
  { name: "Umbrella Health (dev sample)", domain: "umbrella.example.com", ats: null },
];

const FAKE_AGENCIES = [
  { name: "TalentBridge Staffing (dev sample)", domain: "talentbridge.example.com" },
  { name: "Prime Recruitment Solutions (dev sample)", domain: "primerecruit.example.com" },
];

const TITLE_VARIANTS = ["", "Senior ", "Junior ", "Lead "];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class FakeJobSource implements JobSourceProvider {
  readonly key: "jsearch" | "adzuna";
  readonly available = true;

  constructor(key: "jsearch" | "adzuna") {
    this.key = key;
  }

  async search(opts: {
    roleKeyword: string;
    city: string;
    region: string;
    country: string;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<RawPosting[]> {
    opts.onApiCall?.();
    const out: RawPosting[] = [];
    const companies = [...FAKE_EMPLOYERS, ...FAKE_AGENCIES.map((a) => ({ ...a, ats: null }))];
    for (const company of companies) {
      for (const variant of TITLE_VARIANTS) {
        if (out.length >= opts.maxResults) return out;
        const title = `${variant}${opts.roleKeyword}`;
        const seed = hash(`${company.name}|${title}|${this.key}`);
        // agencies post with third-party phrasing so the classifier has signal
        const isAgency = company.name.includes("Staffing") || company.name.includes("Recruitment");
        if (seed % 3 === 0) continue; // thin out so sources differ
        out.push({
          title,
          companyName: company.name,
          companyWebsite: `https://${company.domain}`,
          description: isAgency
            ? `Our client, a leading firm, is hiring a ${title}. Placement via ${company.name}.`
            : `${company.name} is looking for a ${title} to join our ${opts.city || opts.country} office.`,
          city: opts.city || "Sampleville",
          region: opts.region || null,
          country: opts.country,
          isRemote: seed % 5 === 0,
          salaryMin: 40_000 + (seed % 5) * 10_000,
          salaryMax: 60_000 + (seed % 5) * 12_000,
          salaryCurrency: "USD",
          salaryPeriod: "year",
          employmentType: seed % 4 === 0 ? "contract" : "full_time",
          postedAt: new Date(Date.now() - (seed % 20) * 86_400_000),
          applyUrl: `https://${company.domain}/jobs/${seed}`,
          sourceUrl: `https://${company.domain}/jobs/${seed}`,
          source: this.key,
          externalId: `${this.key}-${seed}`,
        });
      }
    }
    return out;
  }
}

export class FakeDiscovery implements DiscoveryProvider {
  readonly key = "places" as const;
  readonly available = true;

  async discover(opts: {
    industry: string;
    location: string;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<DiscoveredCompany[]> {
    opts.onApiCall?.();
    return FAKE_EMPLOYERS.slice(0, opts.maxResults).map((c, i) => ({
      name: c.name,
      website: `https://${c.domain}`,
      phone: `+1 555 010${i}`,
      address: `${100 + i} Sample St`,
      city: opts.location.split(",")[0]?.trim() || "Sampleville",
      country: opts.location.split(",").at(-1)?.trim() || "United States",
      rating: 4 + (i % 10) / 10,
      reviewCount: 20 + i * 7,
      placeId: `fake-place-${i}`,
      source: "places",
    }));
  }
}

export class FakeAts implements AtsProvider {
  async fetchBoards(opts: {
    companyName: string;
    domain: string;
    knownBoards: { atsType: AtsBoardResult["atsType"]; token: string }[];
    signal: AbortSignal;
  }): Promise<AtsBoardResult | null> {
    const fake = FAKE_EMPLOYERS.find((c) => c.domain === opts.domain);
    if (!fake?.ats) return null;
    const titles = ["Accountant", "HR Manager", "Operations Manager", "Sales Executive"];
    return {
      atsType: fake.ats,
      token: opts.domain.split(".")[0] ?? "fake",
      postings: titles.map((title) => {
        const seed = hash(`${opts.domain}|${title}`);
        return {
          title,
          companyName: opts.companyName,
          city: "Sampleville",
          country: "United States",
          isRemote: seed % 4 === 0,
          postedAt: new Date(Date.now() - (seed % 10) * 86_400_000),
          applyUrl: `https://${opts.domain}/ats/${seed}`,
          sourceUrl: `https://${opts.domain}/ats/${seed}`,
          source: `ats_${fake.ats}` as RawPosting["source"],
          externalId: `ats-${seed}`,
        };
      }),
    };
  }
}

const FAKE_CAREERS_HTML = (company: string, domain: string) => `<!doctype html>
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Finance Analyst",
"hiringOrganization":{"@type":"Organization","name":"${company}"},
"jobLocation":{"@type":"Place","address":{"addressLocality":"Sampleville","addressCountry":"US"}},
"datePosted":"2026-07-20","employmentType":"FULL_TIME",
"baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":55000,"maxValue":75000,"unitText":"YEAR"}},
"url":"https://example.com/jobs/finance-analyst"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Person","name":"Jordan Sample","jobTitle":"Chief Financial Officer","email":"jordan@${domain}","sameAs":["https://www.linkedin.com/in/jordan-sample/"]}
</script>
</head><body>
<h1>Careers at ${company}</h1>
<a href="/careers">Careers</a>
<a href="/contact">Contact us</a>
<p><a href="mailto:info@${domain}">info@${domain}</a> · <a href="tel:+15550100">+1 555 0100</a></p>
<ul><li>Finance Analyst — Sampleville</li><li>Office Administrator — Sampleville</li></ul>
</body></html>`;

export class FakeFetcher implements Fetcher {
  async fetchPage(url: string, _signal: AbortSignal): Promise<FetchOutcome> {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith(".example.com")) {
        return { ok: false, reason: "dns_error" };
      }
      const company = FAKE_EMPLOYERS.find((c) => c.domain === parsed.hostname)?.name ?? "Sample Co";
      return { ok: true, url, html: FAKE_CAREERS_HTML(company, parsed.hostname) };
    } catch {
      return { ok: false, reason: "bad_url" };
    }
  }
}

/**
 * Keyword-driven stand-in for Groq: normalizes titles with obvious buckets and
 * classifies any company whose name smells like an agency. Exercises both LLM
 * paths (role batch + classification) without a key.
 */
export class FakeLlm implements LlmProvider {
  readonly available = true;

  async completeJson<T>(opts: { schemaName: string; user: string }): Promise<T | null> {
    if (opts.schemaName === "role_batch") {
      const titles = opts.user
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
      const categories = titles.map((t) => {
        if (/account/i.test(t)) return "accountant";
        if (/financ/i.test(t)) return "finance";
        if (/hr|human/i.test(t)) return "hr";
        if (/sales/i.test(t)) return "sales";
        if (/manager|lead/i.test(t)) return "manager";
        return "other";
      });
      return { categories } as T;
    }
    if (opts.schemaName === "employer_classification") {
      const isAgency = /staffing|recruit|talent/i.test(opts.user);
      return {
        classification: isAgency ? "staffing_agency" : "direct_employer",
        confidence: isAgency ? 88 : 82,
        reason: isAgency ? "Name/postings indicate a staffing business (dev sample)" : "Postings are first-party (dev sample)",
        natureOfBusiness: isAgency ? "Recruitment & Staffing" : "Business Services",
      } as T;
    }
    if (opts.schemaName === "careers_postings") {
      return { postings: [{ title: "Office Administrator", location: "Sampleville, US", isRemote: false }] } as T;
    }
    return null;
  }
}
