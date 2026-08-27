import { config } from "../config";
import type { ProviderRegistry } from "./types";
import { JSearchProvider } from "./jsearch";
import { AdzunaProvider } from "./adzuna";
import { GooglePlacesProvider } from "./google-places";
import { GroqLlm } from "./groq";
import { GeminiLlm, FailoverLlm } from "./gemini";
import { HunterProvider } from "./hunter";
import { HttpAtsProvider } from "./ats";
import { HttpFetcher } from "../crawl/fetcher";
import { FakeJobSource, FakeDiscovery, FakeAts, FakeFetcher, FakeLlm } from "./fake";

/**
 * Simulate mode: dev with no job-board keys runs the whole pipeline on
 * clearly marked sample data (fake sources + fake fetcher serving
 * .example.com careers pages). With real keys (or in prod) everything is real.
 */
export function buildProviders(): ProviderRegistry {
  const simulate = config.isDev && !config.features.jsearch && !config.features.adzuna;

  const jobSources: ProviderRegistry["jobSources"] = simulate
    ? [new FakeJobSource("jsearch"), new FakeJobSource("adzuna")]
    : [new JSearchProvider(), new AdzunaProvider()].filter((p) => p.available);

  const discovery: ProviderRegistry["discovery"] = simulate
    ? [new FakeDiscovery()]
    : [new GooglePlacesProvider()].filter((p) => p.available);

  const realLlm = new FailoverLlm(new GroqLlm(), new GeminiLlm());
  const llm = realLlm.available ? realLlm : simulate ? new FakeLlm() : realLlm;

  return {
    jobSources,
    discovery,
    ats: simulate ? new FakeAts() : new HttpAtsProvider(),
    llm,
    fetcher: simulate ? new FakeFetcher() : new HttpFetcher(),
    // available=false without a key — the enrich stage just skips the fallback
    contactLookup: new HunterProvider(),
  };
}
