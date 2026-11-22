import { serverEnv } from "@/lib/env";
import { TtlCache } from "@/lib/integrations/rate-limit";

// SerpApi Google Maps engine — server side only (key never reaches the client).
// Docs: https://serpapi.com/google-maps-api , https://serpapi.com/maps-local-results

export type PlaceKind = "clinic" | "pharmacy";
export type IntegrationSource = "live" | "mock";

export interface Place {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  openState: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
  directionsUrl: string;
}

export interface PlacesResult {
  source: IntegrationSource;
  notice: string | null;
  places: Place[];
}

interface SerpLocalResult {
  place_id?: string;
  data_id?: string;
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  type?: string;
  open_state?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
}

const cache = new TtlCache<PlacesResult>(10 * 60 * 1000);

function mapsLinks(name: string, lat: number | null, lng: number | null, placeId?: string) {
  const q = lat != null && lng != null ? `${lat},${lng}` : name;
  const mapsUrl =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}` +
    (placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : "");
  const directionsUrl =
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` +
    (placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : "");
  return { mapsUrl, directionsUrl };
}

export async function searchPlaces(kind: PlaceKind, query: string, lat: number, lng: number): Promise<PlacesResult> {
  const q = (query.trim() || (kind === "pharmacy" ? "pharmacy" : "clinic")).slice(0, 120);
  const key = `${kind}|${q.toLowerCase()}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = serverEnv().serpApiKey;
  if (!apiKey) {
    return mockPlaces(kind, lat, lng, "SerpApi key not configured — showing labeled sample data.");
  }

  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q,
    ll: `@${lat},${lng},14z`,
    hl: "en",
    api_key: apiKey,
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { local_results?: SerpLocalResult[]; error?: string };
    if (res.status === 429) {
      return mockPlaces(kind, lat, lng, "SerpApi rate limit reached — showing labeled sample data.");
    }
    if (!res.ok) {
      return mockPlaces(kind, lat, lng, `SerpApi error (${res.status}${json.error ? `: ${json.error}` : ""}) — showing labeled sample data.`);
    }
    const local = json.local_results ?? [];
    const places: Place[] = local.slice(0, 10).map((r, i) => {
      const plat = r.gps_coordinates?.latitude ?? null;
      const plng = r.gps_coordinates?.longitude ?? null;
      const name = r.title ?? "Unnamed place";
      return {
        id: r.place_id ?? r.data_id ?? `${i}`,
        name,
        address: r.address ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        rating: typeof r.rating === "number" ? r.rating : null,
        reviews: typeof r.reviews === "number" ? r.reviews : null,
        type: r.type ?? null,
        openState: r.open_state ?? null,
        lat: plat,
        lng: plng,
        ...mapsLinks(name, plat, plng, r.place_id),
      };
    });
    const result: PlacesResult = {
      source: "live",
      notice: places.length === 0 ? (json.error ?? "No results found nearby.") : null,
      places,
    };
    cache.set(key, result);
    return result;
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable";
    return mockPlaces(kind, lat, lng, `SerpApi ${reason} — showing labeled sample data.`);
  }
}

// ── Labeled mock fallback (synthetic names, positioned around the origin) ──
const MOCK_NAMES: Record<PlaceKind, { name: string; type: string; open: string }[]> = {
  pharmacy: [
    { name: "Sample: GreenCross Pharmacy", type: "Pharmacy", open: "Open · Closes 10 PM" },
    { name: "Sample: MedPlus Corner Chemist", type: "Pharmacy", open: "Open 24 hours" },
    { name: "Sample: Wellness Drug House", type: "Pharmacy", open: "Open · Closes 9 PM" },
    { name: "Sample: CityLife Medicals", type: "Pharmacy", open: "Closed · Opens 8 AM" },
  ],
  clinic: [
    { name: "Sample: Lakeside Family Clinic", type: "Medical clinic", open: "Open · Closes 8 PM" },
    { name: "Sample: Northgate Polyclinic", type: "Medical clinic", open: "Open · Closes 9 PM" },
    { name: "Sample: Hope Children's Clinic", type: "Pediatrician", open: "Open · Closes 6 PM" },
  ],
};

function mockPlaces(kind: PlaceKind, lat: number, lng: number, notice: string): PlacesResult {
  const places = MOCK_NAMES[kind].map((m, i) => {
    const plat = +(lat + (i + 1) * 0.004 * (i % 2 ? -1 : 1)).toFixed(6);
    const plng = +(lng + (i + 1) * 0.003).toFixed(6);
    return {
      id: `mock-${kind}-${i}`,
      name: m.name,
      address: "Sample address (mock data)",
      phone: null,
      website: null,
      rating: null,
      reviews: null,
      type: m.type,
      openState: m.open,
      lat: plat,
      lng: plng,
      ...mapsLinks(`${plat},${plng}`, plat, plng),
    } satisfies Place;
  });
  return { source: "mock", notice, places };
}
