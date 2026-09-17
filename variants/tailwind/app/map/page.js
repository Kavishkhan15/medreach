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
                <a className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-3 py-1.5 hover:bg-[var(--color-emergency-dark)] no-underline" href={`tel:${sel.emergencyPhone || "112"}`}>📞 Call</a>
                <a className="flex-1 inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline" target="_blank" rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${sel.location?.coordinates?.[1]},${sel.location?.coordinates?.[0]}`}>🧭 Navigate</a>
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
                    <span aria-hidden="true">📍</span> {h.name}
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
