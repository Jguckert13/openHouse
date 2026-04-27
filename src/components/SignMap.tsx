import { useEffect, useRef } from "react";
import type { AnalysisResult, SignLocation } from "../lib/signPlacement";

type SignMapProps = {
  maps: typeof google | null;
  analysis: AnalysisResult | null;
  selectedSign: SignLocation | null;
  onSelectSign: (sign: SignLocation) => void;
};

const CONFIDENCE_COLORS: Record<SignLocation["confidence"], string> = {
  high: "#c9780d",
  medium: "#2b7aca",
  low: "#2e9e66",
};

export function SignMap({ maps, analysis, selectedSign, onSelectSign }: SignMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!maps || !analysis || !mapNodeRef.current) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const map =
      mapRef.current ??
      new maps.maps.Map(mapNodeRef.current, {
        center: analysis.propertyLocation,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

    mapRef.current = map;
    infoWindowRef.current = infoWindowRef.current ?? new maps.maps.InfoWindow();

    const bounds = new maps.maps.LatLngBounds();
    bounds.extend(analysis.propertyLocation);

    const propertyMarker = new maps.maps.Marker({
      position: analysis.propertyLocation,
      map,
      title: "Property",
      icon: {
        path: maps.maps.SymbolPath.CIRCLE,
        fillColor: "#dc2828",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 3,
        scale: 10,
      },
      zIndex: 200,
    });

    propertyMarker.addListener("click", () => {
      infoWindowRef.current?.setContent(
        `<div class="map-info"><strong>Property</strong><span>${analysis.address}</span></div>`,
      );
      infoWindowRef.current?.open(map, propertyMarker);
    });
    markersRef.current.push(propertyMarker);

    for (const sign of analysis.signLocations) {
      const marker = new maps.maps.Marker({
        position: { lat: sign.lat, lng: sign.lng },
        map,
        title: sign.name,
        label: {
          text: `${sign.rank}`,
          color: "white",
          fontFamily: "'Cabinet Grotesk', sans-serif",
          fontSize: sign.rank <= 3 ? "11px" : "10px",
          fontWeight: "800",
        },
        icon: {
          path: maps.maps.SymbolPath.CIRCLE,
          fillColor: sign.isRuleRequired ? "#111827" : CONFIDENCE_COLORS[sign.confidence],
          fillOpacity: 1,
          strokeColor: sign.isRuleRequired ? "#fbbf24" : "white",
          strokeWeight: sign.isRuleRequired ? 4 : sign.rank <= 3 ? 3 : 2,
          scale: sign.rank <= 3 || sign.isRuleRequired ? 14 : 11,
        },
        zIndex: sign.isRuleRequired ? 150 : sign.rank <= 3 ? 100 : 50,
      });

      marker.addListener("click", () => {
        onSelectSign(sign);
        const impressions =
          sign.estimatedDailyImpressions >= 1_000
            ? `${(sign.estimatedDailyImpressions / 1_000).toFixed(1)}k`
            : sign.estimatedDailyImpressions.toLocaleString();
        const ruleText = sign.ruleTags.length
          ? `<div class="map-info__rule">${sign.ruleTags.join(", ")}</div>`
          : "";

        infoWindowRef.current?.setContent(`
          <div class="map-info">
            <strong>#${sign.rank} ${sign.name}</strong>
            <span>${impressions} estimated daily impressions</span>
            <span>${sign.driveDirections}</span>
            ${ruleText}
          </div>
        `);
        infoWindowRef.current?.open(map, marker);
      });

      bounds.extend({ lat: sign.lat, lng: sign.lng });
      markersRef.current.push(marker);
    }

    map.fitBounds(bounds, 72);
  }, [analysis, maps, onSelectSign]);

  useEffect(() => {
    if (!maps || !selectedSign || !mapRef.current) return;

    const marker = markersRef.current[selectedSign.rank];
    mapRef.current.panTo({ lat: selectedSign.lat, lng: selectedSign.lng });
    if (marker) {
      maps.maps.event.trigger(marker, "click");
    }
  }, [maps, selectedSign]);

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
