import { config } from "../config";
import { withTimeout } from "../lib/with-timeout";
import { guardedCall } from "./guard";
import { executiveRolePriority, type EmailVerificationStatus } from "@shared/executive-contact";
import { normalizeLinkedInProfileUrl } from "@shared/company-profile";
import type { ContactLookupHit } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

interface ApolloPerson {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: Array<{ sanitized_number?: string | null; raw_number?: string | null }>;
}

function verifiedAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pickApolloPerson(
  person: ApolloPerson | null | undefined,
  fallback: { name: string; title: string; linkedinUrl: string | null },
): ContactLookupHit | null {
  const email = person?.email?.trim().toLowerCase();
  if (!email || person?.email_status?.toLowerCase() !== "verified") return null;
  const position = person.title?.trim() || fallback.title;
  if (executiveRolePriority(position) === null) return null;
  const nameParts = fallback.name.trim().split(/\s+/);
  const linkedinUrl = normalizeLinkedInProfileUrl(person.linkedin_url) ?? normalizeLinkedInProfileUrl(fallback.linkedinUrl);
  return {
    email,
    firstName: person.first_name ?? nameParts[0] ?? null,
    lastName: person.last_name ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null),
    position,
    confidence: 95,
    linkedinUrl,
    phone: person.phone_numbers?.find((phone) => phone.sanitized_number || phone.raw_number)?.sanitized_number
      ?? person.phone_numbers?.find((phone) => phone.raw_number)?.raw_number
      ?? null,
    sourceUrl: linkedinUrl,
    emailStatus: "verified" satisfies EmailVerificationStatus,
    verifiedAt: null,
  };
}

export class ApolloProvider {
  readonly available = config.features.apollo;

  async findPerson(opts: {
    domain: string;
    name: string;
    title: string;
    linkedinUrl: string | null;
    signal?: AbortSignal;
  }): Promise<ContactLookupHit | null> {
    if (!this.available) return null;
    try {
      return await guardedCall("apollo", 1, async () => {
        const [firstName, ...lastNameParts] = opts.name.trim().split(/\s+/);
        const body = {
          first_name: firstName,
          last_name: lastNameParts.join(" ") || undefined,
          organization_domain: opts.domain,
          linkedin_url: opts.linkedinUrl ?? undefined,
          reveal_personal_emails: false,
          reveal_phone_number: true,
        };
        const response = await withTimeout(
          fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": config.APOLLO_API_KEY },
            body: JSON.stringify(body),
            signal: opts.signal,
          }),
          REQUEST_TIMEOUT_MS,
          "apollo people/match",
        );
        if (!response.ok) return null;
        const payload = (await response.json()) as { person?: ApolloPerson | null };
        return pickApolloPerson(payload.person, opts);
      });
    } catch {
      return null;
    }
  }

  async domainSearch(): Promise<ContactLookupHit[]> {
    return [];
  }
}