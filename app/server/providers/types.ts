import type { PostingSource, EmploymentType, SourceRunKey } from "@shared/types";
import type { EmailVerificationStatus } from "@shared/executive-contact";

/** A job posting as returned by any source, before normalization/dedupe. */
export interface RawPosting {
  title: string;
  companyName: string;
  companyWebsite?: string | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isRemote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: "year" | "month" | "hour" | null;
  employmentType?: EmploymentType | null;
  postedAt?: Date | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  source: PostingSource;
  externalId?: string | null;
}

/** Aggregator job-board search (JSearch, Adzuna). */
export interface JobSourceProvider {
  readonly key: "jsearch" | "adzuna";
  readonly available: boolean;
  search(opts: {
    roleKeyword: string;
    city: string;
    region: string;
    country: string;
    remoteOnly: boolean;
    postedWithinDays: number;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<RawPosting[]>;
}

export interface DiscoveredCompany {
  name: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  placeId?: string | null;
  source: SourceRunKey;
}

/** Company discovery for ATS mining (Google Places). */
export interface DiscoveryProvider {
  readonly key: "places";
  readonly available: boolean;
  discover(opts: {
    industry: string;
    location: string;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<DiscoveredCompany[]>;
}

/** A detected ATS board plus its postings. */
export interface AtsBoardResult {
  atsType: "greenhouse" | "lever" | "workable" | "smartrecruiters" | "recruitee" | "ashby";
  token: string;
  postings: RawPosting[];
}

export interface AtsProvider {
  /**
   * Fetch postings from all supported ATS platforms for a company.
   * knownBoards: (atsType, slug) pairs already discovered by page regex; when
   * present only those are fetched, otherwise candidate slugs are probed.
   */
  fetchBoards(opts: {
    companyName: string;
    domain: string;
    knownBoards: { atsType: AtsBoardResult["atsType"]; token: string }[];
    signal: AbortSignal;
  }): Promise<AtsBoardResult | null>;
}

export interface LlmProvider {
  readonly available: boolean;
  /** JSON-schema-constrained completion; returns parsed object or null on failure. */
  completeJson<T>(opts: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    signal?: AbortSignal;
    maxTokens?: number;
  }): Promise<T | null>;
}

/**
 * Why a page could not be fetched. "blocked_by_site" and "robots_disallowed"
 * are the site's decision, not our error.
 */
export type FetchFailureReason =
  | "blocked_by_site"
  | "robots_disallowed"
  | "timeout"
  | "not_html"
  | "dns_error"
  | "http_error"
  | "bad_url";

export type FetchOutcome =
  | { ok: true; url: string; html: string }
  | { ok: false; reason: FetchFailureReason; status?: number };

export interface Fetcher {
  /** Politeness-aware HTML fetch. Never throws for a per-URL error. */
  fetchPage(url: string, signal: AbortSignal): Promise<FetchOutcome>;
}

export interface ContactLookupHit {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  confidence: number | null;
  linkedinUrl: string | null;
  phone: string | null;
  sourceUrl: string | null;
  emailStatus: EmailVerificationStatus;
  verifiedAt: Date | null;
}

export interface ContactLookupProvider {
  readonly available: boolean;
  /** Exact-person lookup, preferring a known LinkedIn handle as identity evidence. */
  findPerson(opts: {
    domain: string;
    name: string;
    title: string;
    linkedinUrl: string | null;
    signal?: AbortSignal;
  }): Promise<ContactLookupHit | null>;
  domainSearch(domain: string, signal?: AbortSignal): Promise<ContactLookupHit[]>;
}

export interface ProviderRegistry {
  jobSources: JobSourceProvider[];
  discovery: DiscoveryProvider[];
  ats: AtsProvider;
  llm: LlmProvider;
  fetcher: Fetcher;
  contactLookup: ContactLookupProvider;
}
