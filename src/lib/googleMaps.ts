import type { LatLngLiteral, MajorIntersection } from "./signPlacement";
import { distanceInMeters } from "./signPlacement";

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-api";
const GOOGLE_MAPS_CALLBACK = "__signScoutGoogleMapsReady";
const MAJOR_INTERSECTION_RADIUS_METERS = 2_400;
const MAX_MAJOR_INTERSECTIONS = 8;

declare global {
  interface Window {
    [GOOGLE_MAPS_CALLBACK]?: () => void;
  }
}

let googleMapsPromise: Promise<typeof google> | null = null;

export function getGoogleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
}

export function loadGoogleMapsApi(apiKey: string): Promise<typeof google> {
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing VITE_GOOGLE_MAPS_API_KEY. Add it to .env.local and restart Vite."),
    );
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      window[GOOGLE_MAPS_CALLBACK] = () => resolve(window.google);
      return;
    }

    window[GOOGLE_MAPS_CALLBACK] = () => resolve(window.google);

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places,geometry&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.onerror = () => reject(new Error("Failed to load the Google Maps JavaScript API."));
    document.head.append(script);
  });

  return googleMapsPromise;
}

export async function geocodeAddress(
  maps: typeof google,
  address: string,
): Promise<LatLngLiteral> {
  const geocoder = new maps.maps.Geocoder();

  const response = await geocoder.geocode({ address });
  const result = response.results[0];
  if (!result) {
    throw new Error("Google Maps could not find that address.");
  }

  return result.geometry.location.toJSON();
}

export async function findMajorIntersections(
  maps: typeof google,
  address: string,
  propertyLocation: LatLngLiteral,
): Promise<MajorIntersection[]> {
  const textResults = await textSearchIntersections(maps, address, propertyLocation);
  const nearbyResults = await nearbySearchIntersections(maps, propertyLocation);
  const places = [...textResults, ...nearbyResults];
  const unique = new Map<string, MajorIntersection>();

  for (const place of places) {
    const location = place.geometry?.location?.toJSON();
    if (!location) continue;

    const distanceFromPropertyMeters = distanceInMeters(propertyLocation, location);
    if (distanceFromPropertyMeters > MAJOR_INTERSECTION_RADIUS_METERS) continue;

    const name = normalizeIntersectionName(place.name, place.vicinity, address);
    if (!name || !looksLikeIntersection(name)) continue;

    const key = place.place_id ?? `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}`;
    if (!unique.has(key)) {
      unique.set(key, {
        id: key.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
        name,
        location,
        distanceFromPropertyMeters,
        source: "google-places",
      });
    }
  }

  return [...unique.values()]
    .sort((left, right) => left.distanceFromPropertyMeters - right.distanceFromPropertyMeters)
    .slice(0, MAX_MAJOR_INTERSECTIONS);
}

function textSearchIntersections(
  maps: typeof google,
  address: string,
  propertyLocation: LatLngLiteral,
): Promise<google.maps.places.PlaceResult[]> {
  const service = new maps.maps.places.PlacesService(document.createElement("div"));

  return new Promise((resolve, reject) => {
    service.textSearch(
      {
        query: `major intersections near ${address}`,
        location: propertyLocation,
        radius: MAJOR_INTERSECTION_RADIUS_METERS,
      },
      (results, status) => {
        if (status === maps.maps.places.PlacesServiceStatus.OK && results) {
          resolve(results);
          return;
        }

        if (status === maps.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }

        reject(new Error(`Google Places text search failed: ${status}`));
      },
    );
  });
}

function nearbySearchIntersections(
  maps: typeof google,
  propertyLocation: LatLngLiteral,
): Promise<google.maps.places.PlaceResult[]> {
  const service = new maps.maps.places.PlacesService(document.createElement("div"));

  return new Promise((resolve, reject) => {
    service.nearbySearch(
      {
        keyword: "major intersection",
        location: propertyLocation,
        radius: MAJOR_INTERSECTION_RADIUS_METERS,
      },
      (results, status) => {
        if (status === maps.maps.places.PlacesServiceStatus.OK && results) {
          resolve(results);
          return;
        }

        if (status === maps.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }

        reject(new Error(`Google Places nearby search failed: ${status}`));
      },
    );
  });
}

function normalizeIntersectionName(
  name: string | undefined,
  vicinity: string | undefined,
  address: string,
): string | null {
  const candidate = [name, vicinity].find((value) => value && looksLikeIntersection(value));
  if (candidate) return candidate;

  const street = address.split(",")[0]?.trim();
  return street ? `${street} major intersection` : null;
}

function looksLikeIntersection(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes(" & ") ||
    normalized.includes(" and ") ||
    normalized.includes(" at ") ||
    normalized.includes("intersection") ||
    normalized.includes("/")
  );
}
