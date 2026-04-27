# Sign Scout

Sign Scout is a Vite + React app for analyzing real estate sign placement near an entered property address.

## Major Intersection Rule

The recommendation pipeline enforces this rule:

> At least 1 sign should be placed at every major intersection detected near the entered address.

After Google Maps geocodes the address, the app searches Google Places for nearby major intersections. The sign-placement pipeline then checks whether each detected intersection has a recommended sign within the configured coverage radius. If not, it adds a rule-required sign at that intersection and marks it with the `Major intersection coverage` tag.

The current threshold lives in `src/lib/signPlacement.ts`:

- Required signs per major intersection: `1`
- Coverage radius: `125m`
- Nearby intersection search radius: `2400m`

## Setup

Create `.env.local`:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Enable these Google Maps Platform capabilities for the key:

- Maps JavaScript API
- Geocoding API
- Places API

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```