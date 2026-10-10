"use client";
import { useState, useMemo } from "react";
import { useHospitals, useLocation, MUMBAI_LOCALITIES } from "@medreach/core";
import HospitalList from "../../components/HospitalList";
import { EmergencyIcon } from "../../components/EmergencyIcons";

export default function HospitalsPage() {
  const [q, setQ] = useState("");
  const { origin, label, status, useGps: requestGps, useLocality: selectLocality, error } = useLocation();

  const filters = useMemo(() => ({
    limit: 50,
    q: q || undefined,
  }), [q]);

  const { data, loading, total, error: dataError, retry } = useHospitals(filters, { origin });

  return (
    <>
      <header className="page-head mb-4">
        <span className="eyebrow">Mumbai care network</span>
        <h1>Hospital directory</h1>
        <p>
          Information and discovery directory for {total || "verified"} hospitals in Mumbai.
        </p>
      </header>

      <div className="surface mb-4 p-3 shadow-sm border rounded">
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-7">
              <label htmlFor="q" className="form-label fw-semibold">Search hospitals</label>
              <input
                id="q"
                className="form-control"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search hospital name, area, or road..."
              />
            </div>

            <div className="col-12 col-md-5">
              <label htmlFor="locality" className="form-label fw-semibold">Filter by area</label>
              <select
                id="locality"
                aria-label="Select locality"
                className="form-select"
                onChange={(e) => {
                  if (e.target.value) {
                    selectLocality(e.target.value);
                  }
                }}
                defaultValue=""
              >
                <option value="">All areas in Mumbai</option>
                {MUMBAI_LOCALITIES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => requestGps().catch(() => {})}
            >
              <EmergencyIcon name="pin" size={16} className="me-1" /> Use my location
            </button>
            {status === "ready" && (
              <span className="badge bg-success-subtle text-success border border-success-subtle">
                <EmergencyIcon name="pin" size={14} className="me-1" /> {label}
              </span>
            )}
            {status === "error" && (
              <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
                {error}
              </span>
            )}
          </div>
        </form>
      </div>

      {dataError && !loading && (
        <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span>{dataError}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={retry}>Retry</button>
        </div>
      )}
      {!dataError && <HospitalList hospitals={data} loading={loading} />}
    </>
  );
}
