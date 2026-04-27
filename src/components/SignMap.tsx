import { useEffect, useRef } from "react";
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
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSign]);

  const points = analysis ? buildMapPoints(analysis) : [];

  return (
    <div className="map-panel">
      <div className="map-canvas">
        {analysis && (
          <>
            <div
              className="property-dot"
              style={{
                left: "50%",
                top: "50%",
              }}
              title={analysis.address}
            />
            {points.map((point) => (
              <button
                key={point.sign.id}
                ref={selectedSign?.id === point.sign.id ? selectedRef : undefined}
                type="button"
                className={`map-dot ${point.sign.isRuleRequired ? "is-rule" : ""} ${
                  selectedSign?.id === point.sign.id ? "is-selected" : ""
                }`}
                style={{
                  backgroundColor: point.sign.isRuleRequired
                    ? "#111827"
                    : CONFIDENCE_COLORS[point.sign.confidence],
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                }}
                onClick={() => onSelectSign(point.sign)}
                title={point.sign.name}
              >
                {point.sign.rank}
              </button>
            ))}
          </>
        )}
      </div>
      {!analysis && (
        <div className="map-empty">
          <strong>Enter an address to analyze sign placement.</strong>
          <span>Major intersection coverage will appear here after analysis.</span>
        </div>
      )}
    </div>
  );
}

function buildMapPoints(analysis: AnalysisResult) {
  const coordinates = [
    analysis.propertyLocation,
    ...analysis.signLocations.map((sign) => ({ lat: sign.lat, lng: sign.lng })),
  ];
  const minLat = Math.min(...coordinates.map((coordinate) => coordinate.lat));
  const maxLat = Math.max(...coordinates.map((coordinate) => coordinate.lat));
  const minLng = Math.min(...coordinates.map((coordinate) => coordinate.lng));
  const maxLng = Math.max(...coordinates.map((coordinate) => coordinate.lng));
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  return analysis.signLocations.map((sign) => ({
    sign,
    x: 10 + ((sign.lng - minLng) / lngRange) * 80,
    y: 90 - ((sign.lat - minLat) / latRange) * 80,
  }));
}
