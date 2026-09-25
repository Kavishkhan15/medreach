"use client";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";
import AmbulanceBookingModal from "./AmbulanceBookingModal";

export default function ResourceDirectory({ kind, title, intro, label, onSelectResource }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    productApi(`/api/${kind}?q=${encodeURIComponent(query)}`)
      .then(r => {
        if (live) {
          setItems(r.data || []);
          setError("");
        }
      })
      .catch(e => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [kind, query]);

  const handleBook = (item) => {
    setSelectedProvider(item);
    setShowBooking(true);
  };

  return (
    <div>
      <div className="page-head mb-4">
        <span className="eyebrow">Mumbai care network</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <label className="form-label fw-semibold" htmlFor="resource-search">Search {label}</label>
      <input
        id="resource-search"
        className="form-control mb-4"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search name, service or locality"
      />
      {loading && <p role="status">Loading providers…</p>}
      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="surface">No listed providers match this search. Try another locality or service.</div>
      )}
      <div className="grid-cards">
        {items.map(item => (
          <div className="card-col" key={item._id}>
            <article className="surface h-100 d-flex flex-column">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <h2 className="h5">{item.name}</h2>
                <span className={`status-pill ${item.verificationStatus === "verified" ? "tone-success" : "tone-neutral"}`}>{item.verificationStatus}</span>
              </div>
              <p className="small text-secondary mb-2">
                {item.address || item.locality || "Address not supplied"}
              </p>
              <p className="small mb-2">
                {item.services?.length ? item.services.join(" · ") : item.providerType || "Services not specified"}
              </p>
              <p className="disclaimer mb-2">
                Hours: {item.operatingHours || "Unknown"} · Source: {item.sourceName}{item.demo ? " · DEMO" : ""}
              </p>
              {item.serviceEvidence?.length > 0 && (
                <details className="small mb-2">
                  <summary>Why this provider is listed</summary>
                  {item.serviceEvidence.map((entry, i) => (
                    <p className="disclaimer mb-1" key={i}>
                      {entry.service}: {entry.sourceName} · {entry.verificationStatus} · {entry.confidence}
                      {entry.evidenceText && <> · “{entry.evidenceText}”</>}
                      {entry.sourcePageUrl?.startsWith("http") && (
                        <> · <a href={entry.sourcePageUrl} target="_blank" rel="noopener noreferrer">Source</a></>
                      )}
                    </p>
                  ))}
                </details>
              )}
              {kind === "blood-banks" && (
                <p className="disclaimer">Current blood inventory: unknown</p>
              )}
              {kind === "ambulances" && (
                <p className="disclaimer">Availability and dispatch: unknown. Contact provider directly.</p>
              )}
              <div className="card-actions pt-3 border-top" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "auto" }}>
                {onSelectResource && kind === "blood-banks" && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm fw-semibold"
                    onClick={() => onSelectResource(item)}
                  >
                    Request / Donate Blood
                  </button>
                )}
                {item.phone ? (
                  <a className="btn btn-primary btn-sm" href={`tel:${item.phone}`}>Call provider</a>
                ) : (
                  <span className="small text-secondary align-self-center">Phone unavailable</span>
                )}
                {item.location?.coordinates?.length === 2 && (
                  <a
                    className="btn btn-outline-secondary btn-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${item.location.coordinates[1]},${item.location.coordinates[0]}`}
                  >
                    Navigate
                  </a>
                )}
                {kind === "ambulances" && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm fw-semibold"
                    onClick={() => handleBook(item)}
                  >
                    Book Ambulance
                  </button>
                )}
              </div>
            </article>
          </div>
        ))}
      </div>
      {showBooking && selectedProvider && (
        <AmbulanceBookingModal
          provider={selectedProvider}
          onClose={() => { setShowBooking(false); setSelectedProvider(null); }}
        />
      )}
    </div>
  );
}
