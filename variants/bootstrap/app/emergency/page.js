"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, emergencyCategory, MUMBAI_LOCALITIES } from "@medreach/core";
import EmergencyCategorySelector from "../../components/EmergencyCategorySelector";
import HospitalList from "../../components/HospitalList";

export default function EmergencyPage() {
  const [categoryId, setCategoryId] = useState(null);
  const { origin, label, status, useGps, useLocality, error } = useLocation();
  const cat = categoryId ? emergencyCategory(categoryId) : null;

  const filters = useMemo(() => ({ categoryId: categoryId || undefined, emergencyOnly: true }), [categoryId]);
  const { data, loading } = useHospitals(filters, { origin, sort: "recommended" });

  const started = Boolean(categoryId);

  return (
    <>
      <header className="mb-3">
        <h1 className="h3 mb-1">Emergency mode</h1>
        <p className="disclaimer mb-0">
          This assists with hospital discovery only. It is not medical advice and does not
          assess severity. In a life-threatening emergency, call 112.
        </p>
      </header>

      <section className="surface mb-3">
        <h2 className="h6 mb-2">1 · What kind of emergency?</h2>
        <EmergencyCategorySelector value={categoryId} onChange={setCategoryId} />
      </section>

      <section className="surface mb-3">
        <h2 className="h6 mb-2">2 · Where are you?</h2>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => useGps().catch(() => {})}>
            📍 Use my location
          </button>
          <select aria-label="Select locality" className="form-select form-select-sm" style={{ width: "auto" }}
            onChange={(e) => e.target.value && useLocality(e.target.value)} defaultValue="">
            <option value="">Or pick a locality…</option>
            {MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {status === "ready" && <span className="status-pill tone-success">📍 {label}</span>}
          {status === "error" && <span className="status-pill tone-warning">{error}</span>}
          {!origin && <span className="disclaimer">Location optional — results still rank by suitability.</span>}
        </div>
      </section>

      {started && (
        <section>
          <div className="d-flex align-items-baseline justify-content-between mb-2">
            <h2 className="h5 mb-0">
              {cat ? `${cat.icon} ${cat.label}` : "Results"} — highest available match
            </h2>
            <span className="disclaimer">Best match based on your selection</span>
          </div>
          {cat && (
            <p className="disclaimer mb-3">
              Looking for: {cat.specialties.join(", ")} · facilities: {cat.facilities.join(", ")}
            </p>
          )}
          <HospitalList hospitals={data} loading={loading}
            emptyMessage="No hospitals currently match — try a different locality or category." />
        </section>
      )}
    </>
  );
}
