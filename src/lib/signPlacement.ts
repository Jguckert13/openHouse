export type Confidence = "high" | "medium" | "low";

export type LatLngLiteral = {
  lat: number;
  lng: number;
};

export type MajorIntersection = {
  id: string;
  name: string;
  location: LatLngLiteral;
  distanceFromPropertyMeters: number;
  source: "google-places";
};

export type SignLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rank: number;
  confidence: Confidence;
  estimatedDailyImpressions: number;
  driveDirections: string;
  ruleTags: string[];
  isRuleRequired: boolean;
  coversIntersectionId?: string;
};

export type IntersectionCoverageRule = {
  requiredSignsPerIntersection: number;
  coverageRadiusMeters: number;
  label: string;
};

export type IntersectionCoverageSummary = {
  totalMajorIntersections: number;
  coveredMajorIntersections: number;
  requiredSignsAdded: number;
};

export type AnalysisResult = {
  address: string;
  propertyLocation: LatLngLiteral;
  signLocations: SignLocation[];
  majorIntersections: MajorIntersection[];
  intersectionCoverage: IntersectionCoverageSummary;
};

export const INTERSECTION_COVERAGE_RULE: IntersectionCoverageRule = {
  requiredSignsPerIntersection: 1,
  coverageRadiusMeters: 125,
  label: "Major intersection coverage",
};

const BASE_SIGN_BEARINGS = [35, 95, 155, 220, 285, 330];
const BASE_SIGN_DISTANCES_METERS = [360, 520, 700, 860, 1040, 1220];

export function buildSignPlacementAnalysis(
  address: string,
  propertyLocation: LatLngLiteral,
  majorIntersections: MajorIntersection[],
): AnalysisResult {
  const baseCandidates = buildBaseSignCandidates(propertyLocation);
  const coveredIntersectionIds = new Set<string>();
  const ruleCandidates: SignLocation[] = [];

  for (const intersection of majorIntersections) {
    const existingCoverage = [...baseCandidates, ...ruleCandidates].filter(
      (candidate) =>
        distanceInMeters(candidate, intersection.location) <=
        INTERSECTION_COVERAGE_RULE.coverageRadiusMeters,
    );

    if (existingCoverage.length >= INTERSECTION_COVERAGE_RULE.requiredSignsPerIntersection) {
      coveredIntersectionIds.add(intersection.id);
      existingCoverage[0].coversIntersectionId = intersection.id;
      if (!existingCoverage[0].ruleTags.includes(INTERSECTION_COVERAGE_RULE.label)) {
        existingCoverage[0].ruleTags.push(INTERSECTION_COVERAGE_RULE.label);
      }
      continue;
    }

    coveredIntersectionIds.add(intersection.id);
    ruleCandidates.push(buildIntersectionSign(intersection));
  }

  const rankedSigns = [...ruleCandidates, ...baseCandidates]
    .sort((left, right) => {
      if (left.isRuleRequired !== right.isRuleRequired) {
        return left.isRuleRequired ? -1 : 1;
      }

      return right.estimatedDailyImpressions - left.estimatedDailyImpressions;
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));

  return {
    address,
    propertyLocation,
    signLocations: rankedSigns,
    majorIntersections,
    intersectionCoverage: {
      totalMajorIntersections: majorIntersections.length,
      coveredMajorIntersections: coveredIntersectionIds.size,
      requiredSignsAdded: ruleCandidates.length,
    },
  };
}

export function distanceInMeters(left: LatLngLiteral, right: LatLngLiteral): number {
  const earthRadiusMeters = 6_371_000;
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function buildBaseSignCandidates(propertyLocation: LatLngLiteral): SignLocation[] {
  return BASE_SIGN_BEARINGS.map((bearing, index) => {
    const location = destinationPoint(
      propertyLocation,
      BASE_SIGN_DISTANCES_METERS[index],
      bearing,
    );
    const confidence: Confidence = index < 2 ? "high" : index < 4 ? "medium" : "low";

    return {
      id: `base-${index + 1}`,
      name: `High-visibility approach ${index + 1}`,
      lat: location.lat,
      lng: location.lng,
      rank: index + 1,
      confidence,
      estimatedDailyImpressions: 4_900 - index * 520,
      driveDirections: `${Math.round(BASE_SIGN_DISTANCES_METERS[index])}m from the property on a likely approach route.`,
      ruleTags: [],
      isRuleRequired: false,
    };
  });
}

function buildIntersectionSign(intersection: MajorIntersection): SignLocation {
  return {
    id: `intersection-${intersection.id}`,
    name: intersection.name,
    lat: intersection.location.lat,
    lng: intersection.location.lng,
    rank: 0,
    confidence: "high",
    estimatedDailyImpressions: estimateIntersectionImpressions(intersection),
    driveDirections: `${Math.round(
      intersection.distanceFromPropertyMeters,
    )}m from the property near ${intersection.name}.`,
    ruleTags: [INTERSECTION_COVERAGE_RULE.label],
    isRuleRequired: true,
    coversIntersectionId: intersection.id,
  };
}

function estimateIntersectionImpressions(intersection: MajorIntersection): number {
  const proximityBoost = Math.max(0, 1_600 - intersection.distanceFromPropertyMeters);
  return Math.round(5_800 + proximityBoost * 1.1);
}

function destinationPoint(
  origin: LatLngLiteral,
  distanceMeters: number,
  bearingDegrees: number,
): LatLngLiteral {
  const angularDistance = distanceMeters / 6_371_000;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
