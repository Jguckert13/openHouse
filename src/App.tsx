import { FormEvent, useCallback, useMemo, useState } from "react";
import { SignMap } from "./components/SignMap";
import {
  buildSignPlacementAnalysis,
  INTERSECTION_COVERAGE_RULE,
  type AnalysisResult,
  type SignLocation,
} from "./lib/signPlacement";
import { lookupAddressWithGoogle } from "./lib/googleMaps";

const DEFAULT_ADDRESS = "123 Main St, Dallas, TX";

function App() {
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedSign, setSelectedSign] = useState<SignLocation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverageLabel = useMemo(() => {
    if (!analysis) return "No analysis yet";

    const { coveredMajorIntersections, totalMajorIntersections } = analysis.intersectionCoverage;
    return `Major intersections covered: ${coveredMajorIntersections}/${totalMajorIntersections}`;
  }, [analysis]);

  const handleAnalyze = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedAddress = address.trim();
      if (!trimmedAddress) {
        setError("Enter a property address first.");
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      setSelectedSign(null);

      try {
        const { propertyLocation, majorIntersections } =
          await lookupAddressWithGoogle(trimmedAddress);
        const nextAnalysis = buildSignPlacementAnalysis(
          trimmedAddress,
          propertyLocation,
          majorIntersections,
        );

        setAnalysis(nextAnalysis);
        setSelectedSign(nextAnalysis.signLocations[0] ?? null);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [address],
  );

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Sign Scout</p>
          <h1>Real estate sign placement analyzer</h1>
          <p className="hero-copy">
            Find high-visibility sign locations near a property and enforce one required sign at
            every major intersection detected near the entered address.
          </p>
        </div>

        <form className="address-form" onSubmit={handleAnalyze}>
          <label htmlFor="address">Property address</label>
          <div className="address-form__row">
            <input
              id="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Enter an address"
            />
            <button type="submit" disabled={isAnalyzing}>
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>
          <p className="form-note">
            Uses a server-side Netlify Function for Google geocoding and Places search. Add
            `GOOGLE_MAPS_API_KEY` in Netlify environment variables.
          </p>
          {error && <p className="error-message">{error}</p>}
        </form>
      </section>

      <section className="dashboard-grid">
        <SignMap
          analysis={analysis}
          selectedSign={selectedSign}
          onSelectSign={setSelectedSign}
        />

        <aside className="results-panel">
          <div className="coverage-card">
            <p className="eyebrow">Rule status</p>
            <h2>{coverageLabel}</h2>
            <p>
              Rule: at least {INTERSECTION_COVERAGE_RULE.requiredSignsPerIntersection} sign within{" "}
              {INTERSECTION_COVERAGE_RULE.coverageRadiusMeters}m of each major intersection.
            </p>
            {analysis && (
              <span className="coverage-card__badge">
                {analysis.intersectionCoverage.requiredSignsAdded} required signs added
              </span>
            )}
          </div>

          <div className="results-list">
            <div className="results-list__header">
              <h2>Recommended signs</h2>
              {analysis && <span>{analysis.signLocations.length} locations</span>}
            </div>

            {!analysis && (
              <p className="empty-results">
                Recommendations will include rule-required signs for major intersections once an
                address is analyzed.
              </p>
            )}

            {analysis?.signLocations.map((sign) => (
              <button
                key={sign.id}
                className={`sign-card ${selectedSign?.id === sign.id ? "is-selected" : ""}`}
                onClick={() => setSelectedSign(sign)}
                type="button"
              >
                <span className="rank-circle">{sign.rank}</span>
                <span className="sign-card__body">
                  <strong>{sign.name}</strong>
                  <span>{formatImpressions(sign.estimatedDailyImpressions)} daily impressions</span>
                  <span>{sign.driveDirections}</span>
                  {sign.ruleTags.length > 0 && (
                    <span className="rule-tag">{sign.ruleTags.join(", ")}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {analysis && (
            <div className="intersection-list">
              <h2>Major intersections</h2>
              {analysis.majorIntersections.length === 0 ? (
                <p className="empty-results">
                  Google Places did not return major intersections for this address.
                </p>
              ) : (
                analysis.majorIntersections.map((intersection) => (
                  <div key={intersection.id} className="intersection-row">
                    <strong>{intersection.name}</strong>
                    <span>{Math.round(intersection.distanceFromPropertyMeters)}m from property</span>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function formatImpressions(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return value.toLocaleString();
}

export default App;
