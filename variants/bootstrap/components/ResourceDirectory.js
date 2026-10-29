"use client";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";
import AmbulanceBookingModal from "./AmbulanceBookingModal";
import Link from "next/link";

export default function ResourceDirectory({ kind, title, intro, label, onSelectResource }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
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
      .catch(e => { if (live) { setItems([]); setError(e.message); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [kind, query, revision]);

  const handleBook = (item) => {
    setSelectedProvider(item);
    setShowBooking(true);
  };

  return (
    <div className="resource-directory">
      <div className="page-head mb-4">
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <div className="surface directory-search mb-4"><label className="form-label fw-semibold" htmlFor="resource-search">Search {label}</label>
      <input
        id="resource-search"
        className="form-control"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search name, service or locality"
      />
      </div>
      {loading && <p role="status">Loading providers…</p>}
      {error && (
        <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRevision((value) => value + 1)}>Retry</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="surface">No listed providers match this search. Try another locality or service.</div>
      )}
      <div className="row g-3">
        {items.map(item => (
          <div className="col-md-6 col-xl-4" key={item._id}>
            <article className="surface h-100 d-flex flex-column">
              <div className="d-flex justify-content-between gap-2">
                <h2 className="h5">{item.name}</h2>

              </div>
              <p className="small text-secondary mb-2">
                {item.address || item.locality || "Address not supplied"}
              </p>
              <p className="small mb-2">
                {item.services?.length ? item.services.join(" · ") : item.providerType || "Services not specified"}
              </p>
              <p className="disclaimer mb-2">
                Hours: {item.operatingHours || "Unknown"}{item.demo ? " · DEMO" : ""}
              </p>

              {kind === "blood-banks" && (
                <p className="disclaimer">Current blood inventory: unknown</p>
              )}
              {kind === "ambulances" && (
                <p className="disclaimer">Availability and dispatch: unknown. Contact provider directly.</p>
              )}
              <div className="mt-auto pt-3 border-top d-flex flex-wrap gap-2">
                {kind === "ambulances" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-success btn-sm fw-semibold"
                      onClick={() => handleBook(item)}
                    >
                      Book Ambulance
                    </button>
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
                    {item.phone ? (
                      <a className="btn btn-primary btn-sm" href={`tel:${item.phone}`}>Call provider</a>
                    ) : (
                      <span className="small text-secondary align-self-center">Phone unavailable</span>
                    )}
                  </>
                ) : (
                  <>
                    {kind === "diagnostics" && <Link className="btn btn-primary btn-sm" href={`/diagnostics/request?centre=${item._id}`}>Request tests</Link>}
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
                      <a className={`btn btn-sm ${kind === "diagnostics" ? "btn-outline-secondary" : "btn-primary"}`} href={`tel:${item.phone}`}>Call provider</a>
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
                  </>
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
