export const EMAIL_VERIFICATION_STATUSES = [
  "verified",
  "publicly_confirmed",
  "pattern_based_guess",
  "unavailable",
] as const;

export type EmailVerificationStatus = (typeof EMAIL_VERIFICATION_STATUSES)[number];

export const EMAIL_VERIFICATION_LABELS: Record<EmailVerificationStatus, string> = {
  verified: "Verified",
  publicly_confirmed: "Publicly Confirmed",
  pattern_based_guess: "Pattern-Based Guess",
  unavailable: "Unavailable",
};

export const NO_VERIFIED_EXECUTIVE_CONTACT = "No verified executive contact found";

/** Roles requested by the product, in deterministic priority order. */
const EXECUTIVE_ROLE_RULES: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /\b(co[- ]?)?founder\b/i, priority: 10 },
  { pattern: /\b(owner|proprietor)\b/i, priority: 20 },
  { pattern: /\b(chief executive officer|ceo)\b/i, priority: 30 },
  { pattern: /\b(chief financial officer|cfo)\b/i, priority: 40 },
  { pattern: /\b(chief operating officer|coo)\b/i, priority: 50 },
  { pattern: /\bpresident\b/i, priority: 60 },
  { pattern: /\b(managing director|executive director)\b/i, priority: 70 },
  { pattern: /\b(partner|managing partner)\b/i, priority: 80 },
  { pattern: /\b(finance director|director of finance|vp finance|vice president.{0,12}finance)\b/i, priority: 90 },
  { pattern: /\b(financial controller|finance controller|corporate controller|group controller)\b/i, priority: 100 },
];

/** Never treat recruiting/HR/job-posting personnel as decision-makers. */
const EXCLUDED_CONTACT_ROLE_RE =
  /\b(recruit(er|ing|ment)|talent acquisition|human resources|people (operations|partner|manager|director)|\bhr\b|hiring manager|job poster|staffing|sourcer)\b/i;

export function executiveRolePriority(title: string | null | undefined): number | null {
  if (!title || EXCLUDED_CONTACT_ROLE_RE.test(title)) return null;
  return EXECUTIVE_ROLE_RULES.find((rule) => rule.pattern.test(title))?.priority ?? null;
}

export function isEligibleExecutiveRole(title: string | null | undefined): boolean {
  return executiveRolePriority(title) !== null;
}

export function emailVerificationLabel(status: EmailVerificationStatus): string {
  return EMAIL_VERIFICATION_LABELS[status];
}

/** Guessed address patterns are kept out of customer-facing contact results. */
export function isUsableExecutiveEmailStatus(status: EmailVerificationStatus): boolean {
  return status === "verified" || status === "publicly_confirmed";
}

export function normalizePersonIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isExcludedJobPoster(name: string | null | undefined, excludedNames: ReadonlySet<string>): boolean {
  const normalized = normalizePersonIdentity(name);
  return normalized.length > 0 && excludedNames.has(normalized);
}

/**
 * Conservatively identify a named job poster/recruiting contact in a job
 * description. The names are used only as an exclusion list: their details
 * are never stored or exported as an executive contact.
 */
export function extractJobPosterNames(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = new Set<string>();
  const patterns = [
    /\b(?:posted\s+by|job\s+poster|recruiter|hiring\s+contact|recruitment\s+contact|talent\s+acquisition\s+contact|contact\s+person)\s*[:\-–—]\s*([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){1,3})\b/gi,
    /\b(?:please\s+contact|questions?\s+(?:to|for))\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){1,3})\s+(?:at|on|via)\b/gi,
    /\b(?:hr|human\s+resources|recruiter|hiring\s+manager)\s+(?:named|called)\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){1,3})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const normalized = normalizePersonIdentity(match[1]);
      if (normalized && !/^(linkedin|indeed|glassdoor|workable|greenhouse)$/.test(normalized)) names.add(normalized);
    }
  }
  return [...names];
}
