import Link from "next/link";
import { availabilityMeta } from "@medreach/core";
import { toneClass } from "../lib/tone";
import DataFreshness from "./DataFreshness";

function edStatus(h) {
  return (h.facilities || []).find((f) => f.facility === "Emergency Department")?.status ?? "unknown";
}

// Scannable-in-seconds hospital card. Information hierarchy per spec §18.
export default function HospitalCard({ hospital, rank }) {
  const ed = edStatus(hospital);
  const edMeta = availabilityMeta(ed);
  const r = rank || hospital._rank;
  const verified = hospital.verificationStatus === "verified";

  return (
    <div className="card h-100 hospital-card">
      <div className="card-body">
        <div className="flex justify-between items-start gap-2">
          <h3 className="h6 mb-1">
            <Link className="text-decoration-none stretched-link" href={`/hospitals/${hospital.slug}`}>
              {hospital.name}
            </Link>
          </h3>
          <span className={`status-pill ${toneClass[edMeta.tone]}`} title="Emergency department status">
            <span className="status-symbol" aria-hidden="true">{edMeta.symbol}</span>
            ER {edMeta.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-2">
          {verified && <span className="status-pill tone-success"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><polyline points="20 6 9 17 4 12"/></svg>Verified</span>}
          {hospital.hospitalType && <span className="chip">{hospital.hospitalType}</span>}
          <span className="chip">{hospital.locality || hospital.city}</span>
        </div>

        {r && (r.distanceKm != null) && (
          <p className="mb-2 small">
            <strong>{r.distanceKm.toFixed(1)} km</strong>
            <> · straight-line · Travel time unavailable</>
          </p>
        )}

        <div className="flex flex-wrap gap-1 mb-2">
          {(hospital.specialties || hospital.departments || []).slice(0, 3).map((s) => (
            <span key={s} className="chip">{s}</span>
          ))}
        </div>

        {r?.reasons?.length ? (
          <ul className="reasons mb-2">
            {r.reasons.slice(0, 2).map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>
        ) : null}

        <div className="mt-auto">
          <div className="mb-2"><DataFreshness timestamp={hospital.lastUpdated} showChip={false} /></div>
          <div className="action-bar">
            <a className="btn btn-sm btn-primary" href={`tel:${hospital.emergencyPhone || "112"}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</a>
            <a
              className="btn btn-sm btn-outline-secondary"
              href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.location?.coordinates?.[1]},${hospital.location?.coordinates?.[0]}`}
              target="_blank" rel="noopener noreferrer"
            >
              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>Navigate
            </a>
            <Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${hospital.slug}`}>Details</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
