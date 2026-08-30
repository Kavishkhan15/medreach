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
      <div className="card-body d-flex flex-column p-3 p-sm-4">
        <div className="d-flex justify-content-between align-items-start gap-2">
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

        <div className="d-flex flex-wrap gap-1 mb-2">
          {verified && <span className="status-pill tone-success">✓ Verified</span>}
          {hospital.hospitalType && <span className="chip">{hospital.hospitalType}</span>}
          <span className="chip">{hospital.locality || hospital.city}</span>
        </div>

        {r && (r.distanceKm != null) && (
          <p className="mb-2 small">
            <strong>{r.distanceKm.toFixed(1)} km</strong>
            {r.etaMinutes != null ? <> · ~{r.etaMinutes} min away</> : <> · Travel time unavailable</>}
          </p>
        )}

        <div className="d-flex flex-wrap gap-1 mb-2">
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
            <a className="btn btn-sm btn-primary" href={`tel:${hospital.emergencyPhone || "112"}`}>📞 Call</a>
            <a
              className="btn btn-sm btn-outline-secondary"
              href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.location?.coordinates?.[1]},${hospital.location?.coordinates?.[0]}`}
              target="_blank" rel="noopener noreferrer"
            >
              🧭 Navigate
            </a>
            <Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${hospital.slug}`}>Details</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
