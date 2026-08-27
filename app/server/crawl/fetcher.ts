import type { Fetcher, FetchOutcome } from "../providers/types";
import { sleep } from "../lib/with-timeout";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 TalentMineBot";
const FETCH_TIMEOUT_MS = 15_000;
const ROBOTS_TIMEOUT_MS = 8_000;
const ROBOTS_TTL_MS = 60 * 60_000;
const MIN_DOMAIN_SPACING_MS = 500;
const MAX_BODY_CHARS = 2_000_000;

interface DomainState {
  tail: Promise<void>;
  lastAt: number;
}

/** Best-effort "User-agent: *" Disallow prefixes. Empty Disallow = allow-all marker. */
function parseRobots(text: string): string[] {
  const rules: string[] = [];
  let currentAgents: string[] = [];
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!lastWasAgent) currentAgents = [];
      currentAgents.push(value);
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (field === "disallow" && value !== "" && currentAgents.includes("*")) {
        rules.push(value);
      }
    }
  }
  return rules;
}

export class HttpFetcher implements Fetcher {
  private robotsCache = new Map<string, { rules: string[]; fetchedAt: number }>();
  private domainState = new Map<string, DomainState>();

  async fetchPage(url: string, signal: AbortSignal): Promise<FetchOutcome> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "bad_url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "bad_url" };
    }

    if (!(await this.isAllowed(parsed, signal))) {
      return { ok: false, reason: "robots_disallowed" };
    }

    const first = await this.politeFetch(parsed, signal);
    if (first.ok) return first;

    // DNS for bare apex domains sometimes only resolves with www. Only worth a
    // second attempt when the first failed to connect at all — a 403 or a
    // non-HTML response will repeat.
    const worthWwwRetry = first.reason === "dns_error" || first.reason === "http_error";
    const isBareHomepage =
      !parsed.hostname.startsWith("www.") &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      !parsed.search;
    if (!worthWwwRetry || !isBareHomepage) return first;

    const withWww = new URL(parsed.toString());
    withWww.hostname = `www.${parsed.hostname}`;
    withWww.protocol = "https:";
    const second = await this.politeFetch(withWww, signal);
    return second.ok ? second : first;
  }

  private async politeFetch(url: URL, signal: AbortSignal): Promise<FetchOutcome> {
    await this.acquireSlot(url.host);
    if (signal.aborted) return { ok: false, reason: "timeout" };
    return this.doFetch(url.toString(), AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]));
  }

  private async doFetch(url: string, signal: AbortSignal): Promise<FetchOutcome> {
    try {
      const res = await fetch(url, {
        signal,
        redirect: "follow",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      });
      if (!res.ok) {
        // 401/403/429 are deliberate refusals; other statuses are site errors.
        const blocked = res.status === 401 || res.status === 403 || res.status === 429;
        return {
          ok: false,
          reason: blocked ? "blocked_by_site" : "http_error",
          status: res.status,
        };
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return { ok: false, reason: "not_html" };
      const html = (await res.text()).slice(0, MAX_BODY_CHARS);
      return { ok: true, url: res.url || url, html };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/abort|timeout|timed out/i.test(message)) return { ok: false, reason: "timeout" };
      if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(message)) return { ok: false, reason: "dns_error" };
      return { ok: false, reason: "http_error" };
    }
  }

  /** Serialize same-domain requests with >= MIN_DOMAIN_SPACING_MS between starts. */
  private acquireSlot(host: string): Promise<void> {
    let state = this.domainState.get(host);
    if (!state) {
      state = { tail: Promise.resolve(), lastAt: 0 };
      this.domainState.set(host, state);
    }
    const slot = state.tail.then(async () => {
      const waitMs = state.lastAt + MIN_DOMAIN_SPACING_MS - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      state.lastAt = Date.now();
    });
    state.tail = slot.catch(() => {});
    return slot;
  }

  private async isAllowed(url: URL, signal: AbortSignal): Promise<boolean> {
    try {
      const cached = this.robotsCache.get(url.host);
      let rules: string[];
      if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
        rules = cached.rules;
      } else {
        rules = await this.fetchRobots(url.origin, url.host, signal);
        this.robotsCache.set(url.host, { rules, fetchedAt: Date.now() });
      }
      const path = url.pathname || "/";
      return !rules.some((prefix) => path.startsWith(prefix));
    } catch {
      return true;
    }
  }

  private async fetchRobots(origin: string, host: string, signal: AbortSignal): Promise<string[]> {
    try {
      await this.acquireSlot(host);
      if (signal.aborted) return [];
      const res = await fetch(`${origin}/robots.txt`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(ROBOTS_TIMEOUT_MS)]),
        redirect: "follow",
        headers: { "user-agent": USER_AGENT },
      });
      if (!res.ok) return [];
      const text = (await res.text()).slice(0, 200_000);
      return parseRobots(text);
    } catch {
      return [];
    }
  }
}
