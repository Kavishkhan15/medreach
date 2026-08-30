"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, emergencyCategory, MUMBAI_LOCALITIES } from "@medreach/core";
import EmergencyCategorySelector from "../../components/EmergencyCategorySelector";
import HospitalList from "../../components/HospitalList";
import { toneClass, statusPill } from "../../lib/tone";

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
        <h1 className="text-2xl mb-1">Emergency mode</h1>
        <p className="text-[.78rem] text-[var(--color-muted)] mb-0">
          This assists with hospital discovery only. It is not medical advice and does not
          assess severity. In a life-threatening emergency, call 112.
        </p>
      </header>

      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mb-3">
        <h2 className="text-base mb-2">1 · What kind of emergency?</h2>
        <EmergencyCategorySelector value={categoryId} onChange={setCategoryId} />
      </section>

      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mb-3">
        <h2 className="text-base mb-2">2 · Where are you?</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-1 hover:bg-[#f1f3f5]" onClick={() => useGps().catch(() => {})}>
            📍 Use my location
          </button>
          <select aria-label="Select locality" className="rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-sm px-2 py-1" style={{ width: "auto" }}
            onChange={(e) => e.target.value && useLocality(e.target.value)} defaultValue="">
            <option value="">Or pick a locality…</option>
            {MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {status === "ready" && <span className={`${statusPill} ${toneClass.success}`}>📍 {label}</span>}
          {status === "error" && <span className={`${statusPill} ${toneClass.warning}`}>{error}</span>}
          {!origin && <span className="text-[.78rem] text-[var(--color-muted)]">Location optional — results still rank by suitability.</span>}
        </div>
      </section>

      {started && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-lg mb-0">
              {cat ? `${cat.icon} ${cat.label}` : "Results"} — highest available match
            </h2>
            <span className="text-[.78rem] text-[var(--color-muted)]">Best match based on your selection</span>
          </div>
          {cat && (
            <p className="text-[.78rem] text-[var(--color-muted)] mb-3">
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
