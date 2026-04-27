import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AnalysisResult, SignLocation } from "../lib/signPlacement";

type SignMapProps = {
  analysis: AnalysisResult | null;
  selectedSign: SignLocation | null;
  onSelectSign: (sign: SignLocation) => void;
};

const CONFIDENCE_COLORS: Record<SignLocation["confidence"], string> = {
  high: "#c9780d",
  medium: "#2b7aca",
  low: "#2e9e66",
};

export function SignMap({ analysis, selectedSign, onSelectSign }: SignMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const signMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapNodeRef.current) return;

    const map =
      mapRef.current ??
      L.map(mapNodeRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([32.7767, -96.797], 12);

    if (!mapRef.current) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    }

    markerLayerRef.current?.clearLayers();
    markerLayerRef.current = L.layerGroup().addTo(map);
    signMarkersRef.current.clear();

    if (!analysis) return;

    const bounds = L.latLngBounds([
      [analysis.propertyLocation.lat, analysis.propertyLocation.lng],
    ]);

    L.marker([analysis.propertyLocation.lat, analysis.propertyLocation.lng], {
      icon: L.divIcon({
        className: "leaflet-property-marker",
        html: "<span></span>",
        iconSize: [28, 28],
        iconAnchor: [14, 24],
      }),
      title: "Property",
    })
      .bindPopup(`<strong>Property</strong><br />${escapeHtml(analysis.address)}`)
      .addTo(markerLayerRef.current);

    for (const sign of analysis.signLocations) {
      const marker = L.marker([sign.lat, sign.lng], {
        icon: L.divIcon({
          className: `leaflet-sign-marker ${sign.isRuleRequired ? "is-rule" : ""}`,
          html: `<span style="background:${sign.isRuleRequired ? "#111827" : CONFIDENCE_COLORS[sign.confidence]}">${sign.rank}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
        title: sign.name,
      })
        .bindPopup(buildSignPopup(sign))
        .on("click", () => onSelectSign(sign))
        .addTo(markerLayerRef.current);

      signMarkersRef.current.set(sign.id, marker);
      bounds.extend([sign.lat, sign.lng]);
    }

    map.fitBounds(bounds.pad(0.18), {
      maxZoom: 15,
      padding: [36, 36],
    });
  }, [analysis, onSelectSign]);

  useEffect(() => {
    if (!selectedSign || !mapRef.current) return;

    const marker = signMarkersRef.current.get(selectedSign.id);
    if (!marker) return;

    mapRef.current.panTo(marker.getLatLng());
    marker.openPopup();
  }, [selectedSign]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="map-panel">
      <div ref={mapNodeRef} className="map-canvas" />
      {!analysis && (
        <div className="map-empty">
          <strong>Enter an address to analyze sign placement.</strong>
          <span>Major intersection coverage will appear here after analysis.</span>
        </div>
      )}
    </div>
  );
}

function buildSignPopup(sign: SignLocation): string {
  const impressions =
    sign.estimatedDailyImpressions >= 1_000
      ? `${(sign.estimatedDailyImpressions / 1_000).toFixed(1)}k`
      : sign.estimatedDailyImpressions.toLocaleString();
  const ruleTag = sign.ruleTags.length
    ? `<span class="map-info__rule">${escapeHtml(sign.ruleTags.join(", "))}</span>`
    : "";

  return `
    <div class="map-info">
      <strong>#${sign.rank} ${escapeHtml(sign.name)}</strong>
      <span>${impressions} estimated daily impressions</span>
      <span>${escapeHtml(sign.driveDirections)}</span>
      ${ruleTag}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
