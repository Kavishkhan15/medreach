"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, SORT_OPTIONS, HOSPITAL_TYPES, FACILITY_TYPES, SPECIALTIES, MUMBAI_LOCALITIES } from "@medreach/core";
import HospitalList from "../../components/HospitalList";
import { toneClass, statusPill } from "../../lib/tone";

const label = "block font-semibold mb-1";
const control = "w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-2 focus:outline-none";

export default function HospitalsPage() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [hospitalType, setHospitalType] = useState("");
  const [facility, setFacility] = useState("");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const { origin, label: locLabel, status, useGps, useLocality, error } = useLocation();

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
        <h1 className="text-2xl mb-1">Hospital directory</h1>
        <p className="text-[.78rem] text-[var(--color-muted)] mb-0">Search {total} facilities by name, specialty, facility, or type.</p>
      </header>

      <form className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mb-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-wrap -mx-1 items-end">
          <div className="w-full md:w-1/3 px-1 mb-2">
            <label htmlFor="q" className={label}>Search</label>
            <input id="q" className={control} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. cardiac Andheri, ICU Bandra" />
          </div>
          <div className="w-1/2 md:w-1/6 px-1 mb-2">
            <label htmlFor="spec" className={label}>Specialty</label>
            <select id="spec" className={control} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">All</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="w-1/2 md:w-1/6 px-1 mb-2">
            <label htmlFor="fac" className={label}>Facility</label>
            <select id="fac" className={control} value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option value="">Any</option>
              {FACILITY_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="w-1/2 md:w-1/6 px-1 mb-2">
            <label htmlFor="type" className={label}>Type</label>
            <select id="type" className={control} value={hospitalType} onChange={(e) => setHospitalType(e.target.value)}>
              <option value="">All</option>
              {HOSPITAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="w-1/2 md:w-1/6 px-1 mb-2">
            <label htmlFor="sort" className={label}>Sort</label>
            <select id="sort" className={control} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" id="er" checked={emergencyOnly} onChange={(e) => setEmergencyOnly(e.target.checked)} />
            <label className="font-medium" htmlFor="er">Emergency department open</label>
          </div>
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-1 hover:bg-[#f1f3f5]" onClick={() => useGps().catch(() => {})}>
            📍 Use my location
          </button>
          <select aria-label="Select locality" className="rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-sm px-2 py-1" style={{ width: "auto" }}
            onChange={(e) => e.target.value && useLocality(e.target.value)} defaultValue="">
            <option value="">Or pick a locality…</option>
            {MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {status === "ready" && <span className={`${statusPill} ${toneClass.success}`}>📍 {locLabel}</span>}
          {status === "error" && <span className={`${statusPill} ${toneClass.warning}`}>{error}</span>}
        </div>
      </form>

      <HospitalList hospitals={data} loading={loading} />
    </>
  );
}
