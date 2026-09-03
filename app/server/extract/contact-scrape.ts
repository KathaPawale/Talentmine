import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Fetcher } from "../providers/types";
import { extractJsonLdBlocks, extractMailtos, stripToVisibleText, absolutizeUrl } from "../crawl/html-utils";
import { personsFromJsonLd } from "./persons-jsonld";
import { normalizePhone } from "../lib/normalize";
import { normalizeLinkedInCompanyUrl, normalizeLinkedInProfileUrl } from "@shared/company-profile";
import { executiveRolePriority, normalizePersonIdentity, type EmailVerificationStatus } from "@shared/executive-contact";

export interface ScrapedExecutiveContact {
  name: string; title: string; linkedinUrl: string | null; primaryEmail: string | null;
  primaryEmailStatus: EmailVerificationStatus; alternateEmail: string | null; alternateEmailStatus: EmailVerificationStatus;
  primaryPhone: string | null; alternatePhone: string | null; sourceUrl: string | null;
  verificationStatus: EmailVerificationStatus; confidenceScore: number;
}
export interface ScrapedContact {
  email: string | null; phone: string | null; personName: string | null; personTitle: string | null;
  natureOfBusiness: string | null; companyLinkedinUrl: string | null; executiveName: string | null;
  executiveTitle: string | null; executiveLinkedinUrl: string | null; executives: ScrapedExecutiveContact[];
}
interface PersonCandidate { name: string; title?: string; linkedinUrl?: string; emails?: string[]; phones?: string[]; sourceUrl?: string | null; }

const CONTACT_HREF_RE = /contact|about|team|leadership|executive|management|board|people|reach[-_ ]?us|get[-_ ]?in[-_ ]?touch|impressum|imprint/i;
const CONTACT_FALLBACK_PATHS = ["/about", "/about-us", "/team", "/leadership", "/management", "/executives", "/our-team", "/people", "/contact", "/contact-us"];
const MAX_EXTRA_PAGES = 6;
const TEAM_CARD_SELECTOR = ["[itemtype*='Person']", "[itemprop='employee']", "[class*='team-member']", "[class*='team_member']", "[class*='teamMember']", "[class*='leadership-card']", "[class*='leader-card']", "[class*='person-card']", "[class*='profile-card']", "[class*='staff-card']", "article[class*='team']", "article[class*='leader']"].join(",");
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const EXECUTIVE_ROLE_RE = /\b(co[- ]?founder|founder|owner|proprietor|chief executive officer|ceo|chief financial officer|cfo|chief operating officer|coo|president|managing director|executive director|managing partner|partner|finance director|director of finance|vp finance|vice president.{0,12}finance|financial controller|finance controller|corporate controller|group controller)\b/i;
const MAX_NATURE_LENGTH = 240;
const JUNK_EMAIL_RE = /noreply|no-reply|donotreply|do-not-reply|sentry|wixpress|@example\.(com|org)$|\.(png|jpg|jpeg|gif|svg|webp)$|@(sentry|cloudflare|googlemail-smtp)/i;
const GENERIC_INBOX_RE = /^(info|hello|contact|office|admin|enquir(y|ies)|mail|hr|careers|jobs|recruitment|support|sales|billing|finance|accounting|accounts)@/i;
function rankEmail(email: string, companyDomain: string | null): number { let score = 0; if (companyDomain && email.endsWith(`@${companyDomain}`)) score += 100; if (GENERIC_INBOX_RE.test(email)) score += 10; return score; }
function personSpecificCompanyEmail(email: string, companyDomain: string | null): string | null {
  const normalized = email.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0] ?? "";
  if (!normalized || JUNK_EMAIL_RE.test(normalized) || GENERIC_INBOX_RE.test(normalized)) return null;
  const domain = normalized.split("@")[1]?.replace(/^www\./, ""); if (!domain || !companyDomain) return null;
  if (domain !== companyDomain && !domain.endsWith(`.${companyDomain}`)) return null; return normalized;
}
function cleanPersonName(value: string | null | undefined): string | null {
  if (!value) return null; const cleaned = value.replace(/linkedin|view profile|connect/gi, " ").replace(/\s+/g, " ").replace(/^[\s—|:,-]+|[\s—|:,-]+$/g, "").trim();
  if (cleaned.length < 2 || cleaned.length > 100 || /^(executive|leadership|management|our team|team|profile|learn more)$/i.test(cleaned) || executiveRolePriority(cleaned) !== null) return null; return cleaned;
}
function cardTextCandidates($: cheerio.CheerioAPI, $card: cheerio.Cheerio<AnyNode>): string[] { const values: string[] = []; $card.find("h1,h2,h3,h4,h5,h6,p,span,[class*='name'],[class*='title'],[class*='role'],[class*='position']").each((_, el) => { const value = $(el).text().replace(/\s+/g, " ").trim(); if (value && value.length <= 140) values.push(value); }); return [...new Set(values)]; }
function addTeamCardCandidates($: cheerio.CheerioAPI, companyDomain: string | null, sourceUrl: string | null, persons: PersonCandidate[]): void {
  $(TEAM_CARD_SELECTOR).each((_, el) => {
    const card = $(el); const nearby = card.text().replace(/\s+/g, " ").trim(); if (!nearby || nearby.length > 2000) return;
    const pieces = cardTextCandidates($, card); const title = pieces.find((value) => executiveRolePriority(value) !== null) ?? nearby.match(EXECUTIVE_ROLE_RE)?.[0] ?? null; if (!title || executiveRolePriority(title) === null) return;
    const heading = card.find("[itemprop='name'],[class*='name'],h1,h2,h3,h4,h5,h6").first().text(); const name = cleanPersonName(heading) ?? pieces.map(cleanPersonName).find((value): value is string => Boolean(value)); if (!name) return;
    const linkedinUrl = card.find('a[href*="linkedin.com/in/"]').map((__, link) => normalizeLinkedInProfileUrl($(link).attr("href"))).get().find((value): value is string => Boolean(value));
    const cardEmails = [...nearby.matchAll(EMAIL_RE)].map((match) => personSpecificCompanyEmail(match[0], companyDomain)).filter((value): value is string => value !== null);
    card.find('a[href^="mailto:"]').each((__, emailEl) => { const email = personSpecificCompanyEmail(($(emailEl).attr("href") ?? "").slice(7), companyDomain); if (email) cardEmails.push(email); });
    const cardPhones: string[] = []; card.find('a[href^="tel:"]').each((__, phoneEl) => { const phone = normalizePhone(($(phoneEl).attr("href") ?? "").slice(4)); if (phone) cardPhones.push(phone); });
    persons.push({ name, title, linkedinUrl, emails: [...new Set(cardEmails)], phones: [...new Set(cardPhones)], sourceUrl });
  });
}
function findContactLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html); const found = new Set<string>(); $("a[href]").each((_, el) => { const href = $(el).attr("href") ?? ""; const text = $(el).text().replace(/\s+/g, " ").trim(); if (!CONTACT_HREF_RE.test(href) && !CONTACT_HREF_RE.test(text)) return; const abs = absolutizeUrl(href, baseUrl); if (!abs) return; try { const base = new URL(baseUrl).hostname.replace(/^www\./, ""); const target = new URL(abs).hostname.replace(/^www\./, ""); if (target !== base && !target.endsWith(`.${base}`)) return; } catch { return; } found.add(abs); }); return [...found].slice(0, MAX_EXTRA_PAGES);
}
export function extractContactsFromHtml(html: string, companyDomain: string | null, sourceUrl: string | null = null): { emails: string[]; phones: string[]; persons: PersonCandidate[]; natureOfBusiness: string | null; companyLinkedinUrl: string | null; } {
  const emails = new Set<string>(); for (const hit of extractMailtos(html)) if (!JUNK_EMAIL_RE.test(hit.email)) emails.add(hit.email); const text = stripToVisibleText(html); for (const match of text.matchAll(EMAIL_RE)) { const email = match[0].toLowerCase(); if (!JUNK_EMAIL_RE.test(email)) emails.add(email); }
  const phones = new Set<string>(); const $ = cheerio.load(html); $('a[href^="tel:"]').each((_, el) => { const phone = normalizePhone(($(el).attr("href") ?? "").slice(4)); if (phone) phones.add(phone); });
  const persons: PersonCandidate[] = personsFromJsonLd(extractJsonLdBlocks(html)).filter((p) => p.title).map((p) => ({ name: p.name, title: p.title, linkedinUrl: p.sameAs?.map(normalizeLinkedInProfileUrl).find((u): u is string => u !== null), emails: p.email ? [p.email] : [], phones: p.phone ? [p.phone] : [], sourceUrl }));
  $('a[href*="linkedin.com/in/"]').each((_, el) => { const linkedinUrl = normalizeLinkedInProfileUrl($(el).attr("href")); if (!linkedinUrl) return; const container = $(el).closest("article, li, section, [class*='team'], [class*='person'], [class*='leader'], div").first(); const nearby = (container.text() || $(el).parent().text() || $(el).text()).replace(/\s+/g, " ").trim(); const role = nearby.match(EXECUTIVE_ROLE_RE)?.[1]; if (!role || executiveRolePriority(role) === null) return; const heading = container.find("h1,h2,h3,h4,h5,[class*='name']").first().text(); const labelled = $(el).attr("aria-label") ?? $(el).attr("title") ?? $(el).text(); const name = cleanPersonName(heading) ?? cleanPersonName(labelled); if (!name) return; const cardEmails = [...nearby.matchAll(EMAIL_RE)].map((match) => personSpecificCompanyEmail(match[0], companyDomain)).filter((value): value is string => value !== null); const cardPhones: string[] = []; container.find('a[href^="tel:"]').each((__, phoneEl) => { const phone = normalizePhone(($(phoneEl).attr("href") ?? "").slice(4)); if (phone) cardPhones.push(phone); }); persons.push({ name, title: role, linkedinUrl, emails: cardEmails, phones: cardPhones, sourceUrl }); });
  addTeamCardCandidates($, companyDomain, sourceUrl, persons); let companyLinkedinUrl: string | null = null; $('a[href*="linkedin.com/company/"]').each((_, el) => { companyLinkedinUrl ??= normalizeLinkedInCompanyUrl($(el).attr("href")); });
  const natureOfBusiness = extractNatureOfBusiness(html); const ranked = [...emails].sort((a, b) => rankEmail(b, companyDomain) - rankEmail(a, companyDomain)); return { emails: ranked, phones: [...phones], persons, natureOfBusiness, companyLinkedinUrl };
}
function cleanNature(value: unknown): string | null { if (typeof value !== "string") return null; const cleaned = value.replace(/\s+/g, " ").trim(); if (cleaned.length < 3) return null; return cleaned.slice(0, MAX_NATURE_LENGTH); }
function isOrganizationType(type: unknown): boolean { if (typeof type === "string") return /(^|\/)Organization$/i.test(type) || /(^|\/)Corporation$/i.test(type); return Array.isArray(type) && type.some(isOrganizationType); }
export function extractNatureOfBusiness(html: string): string | null {
  const blocks = extractJsonLdBlocks(html); const stack = [...blocks]; while (stack.length > 0) { const node = stack.shift(); if (!node || typeof node !== "object") continue; if (Array.isArray(node)) { stack.push(...node); continue; } const obj = node as Record<string, unknown>; if (isOrganizationType(obj["@type"])) { for (const value of [obj.industry, obj.category, obj.description]) { const cleaned = cleanNature(value); if (cleaned) return cleaned; } if (Array.isArray(obj.knowsAbout)) { const cleaned = cleanNature(obj.knowsAbout.filter((v) => typeof v === "string").join(", ")); if (cleaned) return cleaned; } } stack.push(...Object.values(obj)); }
  const $ = cheerio.load(html); return cleanNature($('meta[property="og:description"]').attr("content") ?? $('meta[name="description"]').attr("content"));
}
export function selectExecutiveContacts(candidates: PersonCandidate[], companyDomain: string | null, excludedNames: string[] = []): ScrapedExecutiveContact[] {
  const excluded = new Set(excludedNames.map(normalizePersonIdentity).filter(Boolean)); const byKey = new Map<string, PersonCandidate>();
  for (const candidate of candidates) { const name = cleanPersonName(candidate.name); const title = candidate.title?.replace(/\s+/g, " ").trim(); if (!name || !title || executiveRolePriority(title) === null || excluded.has(normalizePersonIdentity(name))) continue; const linkedinUrl = normalizeLinkedInProfileUrl(candidate.linkedinUrl); const key = linkedinUrl ?? `${name.toLowerCase()}|${title.toLowerCase()}`; const existing = byKey.get(key); if (existing) { existing.linkedinUrl ??= linkedinUrl ?? undefined; existing.sourceUrl ??= candidate.sourceUrl; existing.emails = [...new Set([...(existing.emails ?? []), ...(candidate.emails ?? [])])]; existing.phones = [...new Set([...(existing.phones ?? []), ...(candidate.phones ?? [])])]; } else byKey.set(key, { ...candidate, name, title, linkedinUrl: linkedinUrl ?? undefined }); }
  return [...byKey.values()].sort((a, b) => { const roleDiff = (executiveRolePriority(a.title) ?? 999) - (executiveRolePriority(b.title) ?? 999); return roleDiff || a.name.localeCompare(b.name); }).slice(0, 4).map((candidate) => {
    const emails = [...new Set((candidate.emails ?? []).map((email) => personSpecificCompanyEmail(email, companyDomain)).filter((email): email is string => email !== null))].slice(0, 2); const phones = [...new Set((candidate.phones ?? []).map(normalizePhone).filter((phone): phone is string => Boolean(phone)))].slice(0, 2); const linkedinUrl = normalizeLinkedInProfileUrl(candidate.linkedinUrl); const confidenceScore = Math.min(99, 78 + (linkedinUrl ? 10 : 0) + (emails[0] ? 7 : 0) + (phones[0] ? 3 : 0));
    return { name: candidate.name, title: candidate.title!, linkedinUrl, primaryEmail: emails[0] ?? null, primaryEmailStatus: emails[0] ? "publicly_confirmed" : "unavailable", alternateEmail: emails[1] ?? null, alternateEmailStatus: emails[1] ? "publicly_confirmed" : "unavailable", primaryPhone: phones[0] ?? null, alternatePhone: phones[1] ?? null, sourceUrl: candidate.sourceUrl ?? null, verificationStatus: "publicly_confirmed", confidenceScore };
  });
}
export async function scrapeCompanyContacts(opts: { fetcher: Fetcher; domain: string; website: string | null; excludedNames?: string[]; signal: AbortSignal; }): Promise<ScrapedContact> {
  const none: ScrapedContact = { email: null, phone: null, personName: null, personTitle: null, natureOfBusiness: null, companyLinkedinUrl: null, executiveName: null, executiveTitle: null, executiveLinkedinUrl: null, executives: [] };
  try {
    const baseUrl = opts.website ?? `https://${opts.domain}`; const pages: Array<{ html: string; url: string }> = []; const home = await opts.fetcher.fetchPage(baseUrl, opts.signal); let contactLinks: string[] = [];
    if (home.ok) { pages.push({ html: home.html, url: home.url }); contactLinks = findContactLinks(home.html, home.url); } if (contactLinks.length === 0) contactLinks = CONTACT_FALLBACK_PATHS.map((path) => new URL(path, baseUrl).toString());
    let extra = 0; for (const link of contactLinks) { if (extra >= MAX_EXTRA_PAGES || opts.signal.aborted) break; const page = await opts.fetcher.fetchPage(link, opts.signal); if (page.ok && !pages.some((known) => known.url === page.url)) { pages.push({ html: page.html, url: page.url }); extra++; } } if (pages.length === 0) return none;
    const emails: string[] = [], phones: string[] = [], persons: PersonCandidate[] = []; let natureOfBusiness: string | null = null, companyLinkedinUrl: string | null = null;
    for (const page of pages) { const found = extractContactsFromHtml(page.html, opts.domain, page.url); emails.push(...found.emails); phones.push(...found.phones); persons.push(...found.persons); natureOfBusiness ??= found.natureOfBusiness; companyLinkedinUrl ??= found.companyLinkedinUrl; }
    const executives = selectExecutiveContacts(persons, opts.domain, opts.excludedNames); const bestEmail = [...new Set(emails)].sort((a, b) => rankEmail(b, opts.domain) - rankEmail(a, opts.domain))[0]; const executive = executives[0];
    return { email: bestEmail ?? null, phone: phones[0] ?? null, personName: executive?.name ?? null, personTitle: executive?.title ?? null, natureOfBusiness, companyLinkedinUrl, executiveName: executive?.name ?? null, executiveTitle: executive?.title ?? null, executiveLinkedinUrl: executive?.linkedinUrl ?? null, executives };
  } catch { return none; }
}
