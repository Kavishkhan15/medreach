import Link from "next/link";
import { availabilityMeta } from "@medreach/core";
import { toneClass, statusPill, chip } from "../lib/tone";
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
    <div className="relative h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-col p-3 sm:p-4 h-full">
        <div className="flex justify-between items-start gap-2">
          <h3 className="text-base font-bold mb-1">
            <Link className="no-underline before:absolute before:inset-0" href={`/hospitals/${hospital.slug}`}>
              {hospital.name}
            </Link>
          </h3>
          <span className={`${statusPill} ${toneClass[edMeta.tone]}`} title="Emergency department status">
            <span className="font-extrabold" aria-hidden="true">{edMeta.symbol}</span>
            ER {edMeta.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-2">
          {verified && <span className={`${statusPill} ${toneClass.success}`}>✓ Verified</span>}
          {hospital.hospitalType && <span className={chip}>{hospital.hospitalType}</span>}
          <span className={chip}>{hospital.locality || hospital.city}</span>
        </div>

        {r && (r.distanceKm != null) && (
          <p className="mb-2 text-sm">
            <strong>{r.distanceKm.toFixed(1)} km</strong>
            <> · straight-line · Travel time unavailable</>
          </p>
        )}

        <div className="flex flex-wrap gap-1 mb-2">
          {(hospital.specialties || hospital.departments || []).slice(0, 3).map((s) => (
            <span key={s} className={chip}>{s}</span>
          ))}
        </div>

        {r?.reasons?.length ? (
          <ul className="list-none pl-0 m-0 mb-2">
            {r.reasons.slice(0, 2).map((reason, i) => (
              <li key={i} className="text-[.85rem] text-[var(--color-muted)] flex gap-[.4rem] before:content-['✓'] before:text-[var(--color-success)] before:font-extrabold">{reason}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto">
          <div className="mb-2"><DataFreshness timestamp={hospital.lastUpdated} showChip={false} /></div>
          <div className="flex gap-2">
            <a className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-3 py-1.5 hover:bg-[var(--color-emergency-dark)] no-underline" href={`tel:${hospital.emergencyPhone || "112"}`}>📞 Call</a>
            <a
              className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.location?.coordinates?.[1]},${hospital.location?.coordinates?.[0]}`}
              target="_blank" rel="noopener noreferrer"
            >
              🧭 Navigate
            </a>
            <Link className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline" href={`/hospitals/${hospital.slug}`}>Details</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
