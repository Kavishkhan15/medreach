"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, emergencyCategory, MUMBAI_LOCALITIES } from "@medreach/core";
import EmergencyCategorySelector from "../../components/EmergencyCategorySelector";
import EmergencyHospitalCard from "../../components/EmergencyHospitalCard";
import { EmergencyIcon } from "../../components/EmergencyIcons";

export default function EmergencyPage() {
  const [categoryId, setCategoryId] = useState(null);
  const { origin, label, status, useGps: requestGps, useLocality: selectLocality, error } = useLocation();
  const cat = categoryId ? emergencyCategory(categoryId) : null;

  const filters = useMemo(() => ({ categoryId: categoryId || undefined, emergencyOnly: true }), [categoryId]);
  const { data, loading, error: dataError, retry } = useHospitals(filters, { origin, sort: "recommended" });

  const started = Boolean(categoryId);

  return (
    <>
      <header className="mb-3">
        <h1 className="h3 mb-1 d-flex align-items-center gap-2">
          <EmergencyIcon name="siren" size={28} className="text-danger" /> Emergency mode
        </h1>
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
          <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={() => requestGps().catch(() => {})}>
            <EmergencyIcon name="pin" size={15} /> Use my location
          </button>
          <select aria-label="Select locality" className="form-select form-select-sm" style={{ width: "auto" }}
            onChange={(e) => e.target.value && selectLocality(e.target.value)} defaultValue="">
            <option value="">Or pick a locality…</option>
            {MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {status === "ready" && (
            <span className="status-pill tone-success d-inline-flex align-items-center gap-1">
              <EmergencyIcon name="pin" size={13} /> {label}
            </span>
          )}
          {status === "error" && <span className="status-pill tone-warning">{error}</span>}
          {!origin && <span className="disclaimer">Location optional — results still rank by suitability.</span>}
        </div>
      </section>

      {started && (
        <section>
          <div className="d-flex align-items-baseline justify-content-between mb-2">
            <h2 className="h5 mb-0 d-inline-flex align-items-center gap-2">
              {cat ? (
                <>
                  <EmergencyIcon name={cat.id} size={22} className="text-danger" />
                  <span>{cat.label}</span>
                </>
              ) : (
                "Results"
              )} — highest available match
            </h2>
            <span className="disclaimer">Best match based on your selection</span>
          </div>
          {cat && (
            <p className="disclaimer mb-3">
              Looking for: {cat.specialties.join(", ")} · facilities: {cat.facilities.join(", ")}
            </p>
          )}
          {dataError && !loading ? (
            <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
              <span>{dataError}</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={retry}>Retry</button>
            </div>
          ) : loading ? (
            <div className="row g-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div className="col-12 col-md-6 col-lg-4" key={i}>
                  <div className="card h-100 border-danger border-2 shadow-sm" aria-hidden="true">
                    <div className="card-body p-4">
                      <div className="placeholder-glow">
                        <span className="placeholder col-8 mb-2" />
                        <span className="placeholder col-5" />
                        <span className="placeholder col-12 mt-3" />
                        <span className="placeholder col-6" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="surface text-center">
              <p className="mb-0 text-secondary">No hospitals currently match — try a different locality or category.</p>
            </div>
          ) : (
            <div className="row g-3">
              {data.map((h) => (
                <div className="col-12 col-md-6 col-lg-4" key={h._id || h.slug}>
                  <EmergencyHospitalCard hospital={h} category={cat} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
