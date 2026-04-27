const MAJOR_INTERSECTION_RADIUS_METERS = 2400;
const MAX_MAJOR_INTERSECTIONS = 8;

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "Missing GOOGLE_MAPS_API_KEY server environment variable.",
    });
  }

  const body = parseBody(event.body);
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!address) {
    return jsonResponse(400, { error: "Address is required." });
  }

  try {
    const propertyLocation = await geocodeAddress(address, apiKey);
    const majorIntersections = await findMajorIntersections(address, propertyLocation, apiKey);

    return jsonResponse(200, {
      propertyLocation,
      majorIntersections,
    });
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : "Google place lookup failed.",
    });
  }
}

async function geocodeAddress(address, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const payload = await getGoogleJson(url);
  const result = payload.results?.[0];
  if (!result?.geometry?.location) {
    throw new Error("Google Maps could not find that address.");
  }

  return result.geometry.location;
}

async function findMajorIntersections(address, propertyLocation, apiKey) {
  const [textResults, nearbyResults] = await Promise.all([
    textSearchIntersections(address, propertyLocation, apiKey),
    nearbySearchIntersections(propertyLocation, apiKey),
  ]);
  const unique = new Map();

  for (const place of [...textResults, ...nearbyResults]) {
    const location = place.geometry?.location;
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

async function textSearchIntersections(address, propertyLocation, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", `major intersections near ${address}`);
  url.searchParams.set("location", `${propertyLocation.lat},${propertyLocation.lng}`);
  url.searchParams.set("radius", `${MAJOR_INTERSECTION_RADIUS_METERS}`);
  url.searchParams.set("key", apiKey);

  const payload = await getGoogleJson(url);
  return payload.results ?? [];
}

async function nearbySearchIntersections(propertyLocation, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("keyword", "major intersection");
  url.searchParams.set("location", `${propertyLocation.lat},${propertyLocation.lng}`);
  url.searchParams.set("radius", `${MAJOR_INTERSECTION_RADIUS_METERS}`);
  url.searchParams.set("key", apiKey);

  const payload = await getGoogleJson(url);
  return payload.results ?? [];
}

async function getGoogleJson(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(payload.status)) {
    throw new Error(payload.error_message ?? `Google API request failed: ${payload.status}`);
  }

  return payload;
}

function normalizeIntersectionName(name, vicinity, address) {
  const candidate = [name, vicinity].find((value) => value && looksLikeIntersection(value));
  if (candidate) return candidate;

  const street = address.split(",")[0]?.trim();
  return street ? `${street} major intersection` : null;
}

function looksLikeIntersection(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes(" & ") ||
    normalized.includes(" and ") ||
    normalized.includes(" at ") ||
    normalized.includes("intersection") ||
    normalized.includes("/")
  );
}

function distanceInMeters(left, right) {
  const earthRadiusMeters = 6371000;
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function parseBody(body) {
  try {
    return body ? JSON.parse(body) : null;
  } catch (_error) {
    return null;
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
