"use client";
import Link from "next/link";
import { useHospital, availabilityMeta, saveHospital, useAuth } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import FacilityStatus from "../../../components/FacilityStatus";
import DataFreshness from "../../../components/DataFreshness";
import { useState } from "react";

function edStatus(h) {
  return (h.facilities || []).find((f) => f.facility === "Emergency Department")?.status ?? "unknown";
}

export default function HospitalPage({ params }) {
  const { slug } = params;
  const { hospital, loading, notFound } = useHospital(slug);
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  if (loading) return <p className="text-secondary">Loading…</p>;
  if (notFound || !hospital) {
    return <div className="surface">Hospital not found. <Link href="/hospitals">Back to directory</Link></div>;
  }

  const m = availabilityMeta(edStatus(hospital));
  const coords = hospital.location?.coordinates || [];
  const onSave = async () => {
    try { await saveHospital(hospital._id); setSaved(true); } catch { alert("Login + live backend required to save."); }
  };

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link href="/hospitals" className="small text-decoration-none">← Directory</Link>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <h1 className="h2 mb-1">{hospital.name}</h1>
          <p className="disclaimer mb-1">
            {hospital.address ? `${hospital.address}, ` : ""}{hospital.locality || hospital.city}
            {hospital.pincode ? ` · ${hospital.pincode}` : ""} · {hospital.hospitalType}
          </p>
        </div>
        <span className={`status-pill ${toneClass[m.tone]}`}>
          <span aria-hidden="true">{m.symbol}</span> Emergency dept: {m.label}
        </span>
      </div>

      <div className="d-flex flex-wrap gap-2 my-2">
        {hospital.verificationStatus === "verified" && <span className="status-pill tone-success">✓ Verified</span>}
        <DataFreshness timestamp={hospital.lastUpdated} />
      </div>

      <div className="row g-4 mt-1">
        <div className="col-12 col-lg-8">
          <div className="surface mb-3">
            <h2 className="h5 mb-3">Facilities &amp; current availability</h2>
            <FacilityStatus facilities={hospital.facilities} />
          </div>
          <div className="surface">
            <h2 className="h5 mb-2">Specialties</h2>
            <div className="d-flex flex-wrap gap-1">
              {(hospital.specialties || hospital.departments || []).map((s) => <span key={s} className="chip">{s}</span>)}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="surface">
            <h2 className="h6 mb-2">Contact &amp; actions</h2>
            <p className="mb-1 small">Phone: {hospital.phone || "—"}</p>
            <p className="mb-3 small">Emergency: {hospital.emergencyPhone || "112"}</p>
            <div className="vstack gap-2">
              <a className="btn btn-primary" href={`tel:${hospital.emergencyPhone || "112"}`}>📞 Call emergency</a>
              <a className="btn btn-outline-secondary" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}>🧭 Navigate</a>
              {user && (
                <button className="btn btn-outline-secondary" onClick={onSave} disabled={saved}>
                  {saved ? "✓ Saved" : "Save to Quick Access"}
                </button>
              )}
            </div>
            <hr />
            <p className="disclaimer mb-0">
              Verification: {hospital.verificationStatus || "unverified"}. Availability reflects the
              last known observation and may have changed. Confirm by phone before travelling.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
