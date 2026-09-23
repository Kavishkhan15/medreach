"use client";
import Link from "next/link";
import { useHospital, availabilityMeta, saveHospital, useAuth } from "@medreach/core";
import { toneClass, statusPill, chip } from "../../../lib/tone";
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

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (notFound || !hospital) {
    return <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">Hospital not found. <Link href="/hospitals">Back to directory</Link></div>;
  }

  const m = availabilityMeta(edStatus(hospital));
  const coords = hospital.location?.coordinates || [];
  const onSave = async () => {
    try { await saveHospital(hospital._id); setSaved(true); } catch { alert("Please sign in to save."); }
  };

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link href="/hospitals" className="text-sm no-underline text-[var(--color-emergency-dark)]">← Directory</Link>
      </nav>

      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <h1 className="text-3xl mb-1">{hospital.name}</h1>
          <p className="text-[.78rem] text-[var(--color-muted)] mb-1">
            {hospital.address ? `${hospital.address}, ` : ""}{hospital.locality || hospital.city}
            {hospital.pincode ? ` · ${hospital.pincode}` : ""} · {hospital.hospitalType}
          </p>
        </div>
        <span className={`${statusPill} ${toneClass[m.tone]}`}>
          <span aria-hidden="true">{m.symbol}</span> Emergency dept: {m.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 my-2">
        {hospital.verificationStatus === "verified" && <span className={`${statusPill} ${toneClass.success}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><polyline points="20 6 9 17 4 12"/></svg>Verified</span>}
        <DataFreshness timestamp={hospital.lastUpdated} />
      </div>

      <div className="flex flex-wrap -mx-2 mt-1">
        <div className="w-full lg:w-2/3 px-2">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mb-3">
            <h2 className="text-xl mb-3">Facilities &amp; current availability</h2>
            <FacilityStatus facilities={hospital.facilities} />
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">
            <h2 className="text-xl mb-2">Specialties</h2>
            <div className="flex flex-wrap gap-1">
              {(hospital.specialties || hospital.departments || []).map((s) => <span key={s} className={chip}>{s}</span>)}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/3 px-2 mt-4 lg:mt-0">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">
            <h2 className="text-base mb-2">Contact &amp; actions</h2>
            <p className="mb-1 text-sm">Phone: {hospital.phone || "—"}</p>
            <p className="mb-3 text-sm">Emergency: {hospital.emergencyPhone || "112"}</p>
            <div className="flex flex-col gap-2">
              <a className="inline-flex items-center justify-center gap-1 font-bold rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-4 py-2 hover:bg-[var(--color-emergency-dark)] no-underline" href={`tel:${hospital.emergencyPhone || "112"}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call emergency</a>
              <a className="inline-flex items-center justify-center gap-1 font-semibold rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-4 py-2 hover:bg-[#f1f3f5] no-underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>Navigate</a>
              {user && (
                <button className="inline-flex items-center justify-center gap-1 font-semibold rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-4 py-2 hover:bg-[#f1f3f5] disabled:opacity-60" onClick={onSave} disabled={saved}>
                  {saved ? (
                    <><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
                  ) : (
                    "Save to Quick Access"
                  )}
                </button>
              )}
            </div>
            <hr className="my-3 border-[var(--color-border)]" />
            <p className="text-[.78rem] text-[var(--color-muted)] mb-0">
              Verification: {hospital.verificationStatus || "unverified"}. Availability reflects the
              last known observation and may have changed. Confirm by phone before travelling.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
