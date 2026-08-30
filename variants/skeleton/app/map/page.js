"use client";
import { useState } from "react";
import { useHospitals, availabilityMeta } from "@medreach/core";
import { toneClass } from "../../lib/tone";
import Link from "next/link";

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
        <h1 className="h3 mb-1">Hospital map</h1>
        <p className="disclaimer mb-0">Map + list stay in sync. Select a hospital to see details.</p>
      </header>

      <div className="grid-map">
        <div>
          <div className="map-canvas" role="img" aria-label="Map of Mumbai hospitals (interactive list provided alongside)">
            <div className="text-center p-4">
              <div style={{ fontSize: "2rem" }} aria-hidden="true">🗺️</div>
              <p className="mb-1 fw-semibold">Map view</p>
              <p className="disclaimer mb-0">
                {sel ? `Selected: ${sel.name} (${sel.location?.coordinates?.[1]?.toFixed(3)}, ${sel.location?.coordinates?.[0]?.toFixed(3)})`
                     : "A tile-map provider plugs in here. Use the list to select a hospital."}
              </p>
            </div>
          </div>
          {sel && (
            <div className="surface mt-3">
              <div className="flex justify-between items-start">
                <h2 className="h5 mb-1">{sel.name}</h2>
                <span className={`status-pill ${toneClass[availabilityMeta(edStatus(sel)).tone]}`}>
                  ER {availabilityMeta(edStatus(sel)).label}
                </span>
              </div>
              <p className="disclaimer">{sel.locality || sel.city} · {sel.hospitalType}</p>
              <div className="action-bar">
                <a className="btn btn-sm btn-primary" href={`tel:${sel.emergencyPhone || "112"}`}>📞 Call</a>
                <a className="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${sel.location?.coordinates?.[1]},${sel.location?.coordinates?.[0]}`}>🧭 Navigate</a>
                <Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${sel.slug}`}>Details</Link>
              </div>
            </div>
          )}
        </div>

        <div>
          <ul className="list-group" aria-label="Hospital markers">
            {loading ? <li className="list-group-item">Loading…</li> : data.map((h) => {
              const m = availabilityMeta(edStatus(h));
              const id = h._id || h.slug;
              return (
                <li key={id} className="list-group-item">
                  <button className="btn-link text-start p-0 text-decoration-none" onClick={() => setSelected(id)}
                    aria-pressed={selected === id}>
                    <span aria-hidden="true">📍</span> {h.name}
                  </button>
                  <span className={`status-pill ${toneClass[m.tone]}`} title="ER status">
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
