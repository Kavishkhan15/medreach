"use client";
import { useState } from "react";
import { useHospitals, availabilityMeta } from "@medreach/core";
import { toneClass, statusPill } from "../../lib/tone";
import Link from "next/link";
import GoogleMapView from "../../components/GoogleMapView";

// Map experience. A real tile provider (Leaflet/Mapbox) can be dropped in behind
// this abstraction later; for now we render an accessible marker list + panel so
// the experience is never blank and works without a heavy map dependency.
function edStatus(h) {
  return (h.facilities || []).find((f) => f.facility === "Emergency Department")?.status ?? "unknown";
}


export default function MapPage() {
  const { data, loading } = useHospitals({}, { sort: "recommended" });
  const [selected, setSelected] = useState(null);
  const sel = selected ? data.find((h) => (h._id || h.slug) === selected) : null;

  return (
    <>
      <header className="mb-3">
        <h1 className="text-2xl mb-1">Hospital map</h1>
        <p className="text-[.78rem] text-[var(--color-muted)] mb-0">Map + list stay in sync. Select a hospital to see details.</p>
      </header>

      <div className="flex flex-wrap -mx-1.5">
        <div className="w-full lg:w-7/12 px-1.5 mb-3">
          <GoogleMapView items={data} selected={selected} onSelect={setSelected} />
          {sel && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mt-3">
              <div className="flex justify-between items-start">
                <h2 className="text-lg mb-1">{sel.name}</h2>
                <span className={`${statusPill} ${toneClass[availabilityMeta(edStatus(sel)).tone]}`}>
                  ER {availabilityMeta(edStatus(sel)).label}
                </span>
              </div>
              <p className="text-[.78rem] text-[var(--color-muted)]">{sel.locality || sel.city} · {sel.hospitalType}</p>
              <div className="flex gap-2">
                <a className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-3 py-1.5 hover:bg-[var(--color-emergency-dark)] no-underline" href={`tel:${sel.emergencyPhone || "112"}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</a>
                <a className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline" target="_blank" rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${sel.location?.coordinates?.[1]},${sel.location?.coordinates?.[0]}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>Navigate</a>
                <Link className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline" href={`/hospitals/${sel.slug}`}>Details</Link>
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:w-5/12 px-1.5 mb-3">
          <ul className="rounded-[var(--radius)] border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)]" aria-label="Hospital markers">
            {loading ? <li className="bg-white px-3 py-2">Loading…</li> : data.map((h) => {
              const m = availabilityMeta(edStatus(h));
              const id = h._id || h.slug;
              return (
                <li key={id} className="bg-white px-3 py-2 flex justify-between items-center">
                  <button className="text-left p-0 bg-transparent text-[var(--color-emergency-dark)] no-underline" onClick={() => setSelected(id)}
                    aria-pressed={selected === id}>
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {h.name}
                  </button>
                  <span className={`${statusPill} ${toneClass[m.tone]}`} title="ER status">
                    <span aria-hidden="true">{m.symbol}</span> {m.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
