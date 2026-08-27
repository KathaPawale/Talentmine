import { config } from "../config";
import { withTimeout } from "../lib/with-timeout";
import { guardedCall } from "./guard";
import {
  executiveRolePriority,
  isUsableExecutiveEmailStatus,
  type EmailVerificationStatus,
} from "@shared/executive-contact";
import { normalizeLinkedInProfileUrl } from "@shared/company-profile";
import type { ContactLookupHit } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

export type HunterContact = ContactLookupHit;

interface HunterEmail {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  linkedin?: string | null;
  phone_number?: string | null;
  sources?: Array<{ uri?: string; extracted_on?: string; last_seen_on?: string }>;
  verification?: { status?: string; date?: string };
}

interface HunterFinderData {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  score?: number | null;
  position?: string | null;
  linkedin_url?: string | null;
  phone_number?: string | null;
  sources?: HunterEmail["sources"];
  verification?: HunterEmail["verification"];
}

function safeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emailStatus(email: HunterEmail): EmailVerificationStatus {
  if (email.verification?.status === "valid") return "verified";
  if ((email.sources?.length ?? 0) > 0) return "publicly_confirmed";
  return "pattern_based_guess";
}

export function linkedinHandle(value: string | null | undefined): string | null {
  const url = normalizeLinkedInProfileUrl(value);
  if (!url) return null;
  try {
    const handle = new URL(url).pathname.match(/^\/in\/([^/]+)/i)?.[1];
    return handle ? decodeURIComponent(handle) : null;
  } catch {
    return null;
  }
}

export function pickHunterPerson(
  data: HunterFinderData | null | undefined,
  fallback: { name: string; title: string; linkedinUrl: string | null },
): HunterContact | null {
  if (!data?.email) return null;
  const status = emailStatus({ sources: data.sources, verification: data.verification });
  const position = data.position?.trim() || fallback.title;
  if (executiveRolePriority(position) === null || !isUsableExecutiveEmailStatus(status)) return null;
  const nameParts = fallback.name.trim().split(/\s+/);
  const firstSource = data.sources?.find((source) => source.uri)?.uri ?? null;
  const lastEvidenceDate = data.sources
    ?.map((source) => safeDate(source.last_seen_on ?? source.extracted_on))
    .find((date): date is Date => date !== null);
  return {
    email: data.email.toLowerCase(),
    firstName: data.first_name ?? nameParts[0] ?? null,
    lastName: data.last_name ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null),
    position,
    confidence: data.score ?? null,
    linkedinUrl: normalizeLinkedInProfileUrl(data.linkedin_url) ?? normalizeLinkedInProfileUrl(fallback.linkedinUrl),
    phone: data.phone_number ?? null,
    sourceUrl: firstSource,
    emailStatus: status,
    verifiedAt: safeDate(data.verification?.date) ?? lastEvidenceDate ?? null,
  };
}

/**
 * Select only named, person-specific senior decision-makers with verified or
 * publicly sourced addresses. Pattern-only guesses are not returned.
 */
export function pickHunterExecutives(emails: HunterEmail[]): HunterContact[] {
  return emails
    .filter((email) => {
      const name = [email.first_name, email.last_name].filter(Boolean).join(" ").trim();
      return Boolean(
        email.value
        && email.type !== "generic"
        && name
        && executiveRolePriority(email.position) !== null
        && isUsableExecutiveEmailStatus(emailStatus(email)),
      );
    })
    .sort((a, b) => {
      const role = (executiveRolePriority(a.position) ?? 999) - (executiveRolePriority(b.position) ?? 999);
      return role || (b.confidence ?? 0) - (a.confidence ?? 0);
    })
    .slice(0, 3)
    .map((email) => {
      const firstSource = email.sources?.find((source) => source.uri)?.uri ?? null;
      const lastEvidenceDate = email.sources
        ?.map((source) => safeDate(source.last_seen_on ?? source.extracted_on))
        .find((date): date is Date => date !== null);
      return {
        email: email.value!.toLowerCase(),
        firstName: email.first_name ?? null,
        lastName: email.last_name ?? null,
        position: email.position ?? null,
        confidence: email.confidence ?? null,
        linkedinUrl: normalizeLinkedInProfileUrl(email.linkedin),
        phone: email.phone_number ?? null,
        sourceUrl: firstSource,
        emailStatus: emailStatus(email),
        verifiedAt: safeDate(email.verification?.date) ?? lastEvidenceDate ?? null,
      };
    });
}

/** Backwards-compatible single-result helper used by older tests/callers. */
export function pickBestHunterEmail(emails: HunterEmail[]): HunterContact | null {
  return pickHunterExecutives(emails)[0] ?? null;
}

export class HunterProvider {
  readonly available = config.features.hunter;

  async findPerson(opts: {
    domain: string;
    name: string;
    title: string;
    linkedinUrl: string | null;
    signal?: AbortSignal;
  }): Promise<HunterContact | null> {
    if (!this.available) return null;
    try {
      return await guardedCall("hunter", 1, async () => {
        const params = new URLSearchParams({ api_key: config.HUNTER_API_KEY });
        const handle = linkedinHandle(opts.linkedinUrl);
        if (handle) {
          params.set("linkedin_handle", handle);
        } else {
          params.set("domain", opts.domain);
          params.set("full_name", opts.name);
        }
        const res = await withTimeout(
          fetch(`https://api.hunter.io/v2/email-finder?${params}`, { signal: opts.signal }),
          REQUEST_TIMEOUT_MS,
          "hunter email-finder",
        );
        if (!res.ok) return null;
        const payload = (await res.json()) as { data?: HunterFinderData };
        return pickHunterPerson(payload.data, opts);
      });
    } catch {
      return null;
    }
  }

  async domainSearch(domain: string, signal?: AbortSignal): Promise<HunterContact[]> {
    if (!this.available) return [];
    try {
      return await guardedCall("hunter", 1, async () => {
        const params = new URLSearchParams({
          domain,
          limit: "20",
          department: "executive,finance",
          seniority: "executive,senior",
          api_key: config.HUNTER_API_KEY,
        });
        const url = `https://api.hunter.io/v2/domain-search?${params}`;
        const res = await withTimeout(
          fetch(url, { signal }),
          REQUEST_TIMEOUT_MS,
          "hunter domain-search",
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { data?: { emails?: HunterEmail[] } };
        return pickHunterExecutives(data.data?.emails ?? []);
      });
    } catch {
      return [];
    }
  }
}
