import { config } from "../config";
import { withTimeout } from "../lib/with-timeout";
import { guardedCall } from "./guard";
import type { DiscoveredCompany, DiscoveryProvider } from "./types";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,nextPageToken";
const PAGE_TIMEOUT_MS = 30_000;
const MAX_PAGES = 3;
const PAGE_SIZE = 20;

interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
}

interface SearchTextResponse {
  places?: PlacesResult[];
  nextPageToken?: string;
}

function componentByType(components: PlacesAddressComponent[] | undefined, type: string): string | null {
  return components?.find((c) => c.types?.includes(type))?.longText ?? null;
}

function mapPlace(p: PlacesResult): DiscoveredCompany | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  return {
    name,
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    address: p.formattedAddress ?? null,
    city: componentByType(p.addressComponents, "locality"),
    region: componentByType(p.addressComponents, "administrative_area_level_1"),
    country: componentByType(p.addressComponents, "country"),
    postalCode: componentByType(p.addressComponents, "postal_code"),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    placeId: p.id ?? null,
    source: "places",
  };
}

async function fetchSearchPage(
  textQuery: string,
  pageToken: string | undefined,
  signal: AbortSignal,
): Promise<SearchTextResponse> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, pageSize: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places searchText HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as SearchTextResponse;
}

export class GooglePlacesProvider implements DiscoveryProvider {
  readonly key = "places" as const;
  readonly available = config.features.places;

  async discover(opts: {
    industry: string;
    location: string;
    maxResults: number;
    signal: AbortSignal;
    onApiCall?: () => void;
  }): Promise<DiscoveredCompany[]> {
    const textQuery = `${opts.industry} in ${opts.location}`;
    const out: DiscoveredCompany[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await guardedCall("google_places", 1, () => {
        opts.onApiCall?.();
        return withTimeout(
          fetchSearchPage(textQuery, pageToken, opts.signal),
          PAGE_TIMEOUT_MS,
          "places searchText page",
        );
      });
      for (const place of data.places ?? []) {
        if (out.length >= opts.maxResults) break;
        const mapped = mapPlace(place);
        if (mapped) out.push(mapped);
      }
      pageToken = data.nextPageToken;
      if (!pageToken || out.length >= opts.maxResults) break;
    }
    return out;
  }
}
