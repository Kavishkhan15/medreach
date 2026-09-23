"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, SORT_OPTIONS, HOSPITAL_TYPES, FACILITY_TYPES, SPECIALTIES, MUMBAI_LOCALITIES } from "@medreach/core";
import HospitalList from "../../components/HospitalList";

export default function HospitalsPage() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [hospitalType, setHospitalType] = useState("");
  const [facility, setFacility] = useState("");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const { origin, label, status, useGps, useLocality, error } = useLocation();

  const filters = useMemo(() => ({
    q: q || undefined, specialty: specialty || undefined,
    hospitalType: hospitalType || undefined,
    facilities: facility ? [facility] : [],
    emergencyOnly: emergencyOnly || undefined,
  }), [q, specialty, hospitalType, facility, emergencyOnly]);

  const { data, loading, total } = useHospitals(filters, { origin, sort });

  return (
    <>
      <header className="mb-3">
        <h1 className="h3 mb-1">Hospital directory</h1>
        <p className="disclaimer mb-0">Search {total} facilities by name, specialty, facility, or type.</p>
      </header>

      <form className="surface mb-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-search">
          <div>
            <label htmlFor="q" className="form-label fw-semibold">Search</label>
            <input id="q" className="form-control" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. cardiac Andheri, ICU Bandra" />
          </div>
          <div>
            <label htmlFor="spec" className="form-label fw-semibold">Specialty</label>
            <select id="spec" className="form-select" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">All</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="fac" className="form-label fw-semibold">Facility</label>
            <select id="fac" className="form-select" value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option value="">Any</option>
              {FACILITY_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="form-label fw-semibold">Type</label>
            <select id="type" className="form-select" value={hospitalType} onChange={(e) => setHospitalType(e.target.value)}>
              <option value="">All</option>
              {HOSPITAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="form-label fw-semibold">Sort</label>
            <select id="sort" className="form-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" id="er" checked={emergencyOnly} onChange={(e) => setEmergencyOnly(e.target.checked)} />
            <label className="form-check-label" htmlFor="er">Emergency department open</label>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => useGps().catch(() => {})}>
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Use my location
          </button>
          <select aria-label="Select locality" className="form-select form-select-sm w-auto"
            onChange={(e) => e.target.value && useLocality(e.target.value)} defaultValue="">
            <option value="">Or pick a locality…</option>
            {MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {status === "ready" && <span className="status-pill tone-success"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{label}</span>}
          {status === "error" && <span className="status-pill tone-warning">{error}</span>}
        </div>
      </form>

      <HospitalList hospitals={data} loading={loading} />
    </>
  );
}
