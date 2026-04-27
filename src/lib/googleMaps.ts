import type { LatLngLiteral, MajorIntersection } from "./signPlacement";

export type GooglePlaceLookup = {
  propertyLocation: LatLngLiteral;
  majorIntersections: MajorIntersection[];
};

export async function lookupAddressWithGoogle(address: string): Promise<GooglePlaceLookup> {
  const response = await fetch("/.netlify/functions/google-place-lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Google place lookup failed.");
  }

  return payload as GooglePlaceLookup;
}
