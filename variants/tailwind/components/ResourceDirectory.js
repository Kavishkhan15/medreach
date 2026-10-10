"use client";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";
import AmbulanceBookingModal from "./AmbulanceBookingModal";

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
    <div>
      <div className="page-head mb-6">
        <span className="eyebrow">Mumbai care network</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <label className="block text-sm font-semibold mb-1" htmlFor="resource-search">Search {label}</label>
      <input
        id="resource-search"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search name, service or locality"
      />
      {loading && <p role="status">Loading providers…</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm mb-4 flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="border border-red-300 rounded px-3 py-1 font-semibold" onClick={() => setRevision((value) => value + 1)}>Retry</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5">No listed providers match this search. Try another locality or service.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(item => (
          <div className="h-full" key={item._id}>
            <article className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-4 h-full flex flex-col">
              <div className="flex justify-between items-start gap-2">
                <h2 className="text-base font-bold text-[var(--color-text)] mb-0">{item.name}</h2>
                {item.verificationStatus && item.verificationStatus !== "verified" && (
                  <span className="status-pill tone-neutral">{item.verificationStatus}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                {item.address || item.locality || "Address not supplied"}
              </p>
              <p className="text-xs text-gray-700 mb-2">
                {item.services?.length ? item.services.join(" · ") : item.providerType || "Services not specified"}
              </p>
              <p className="text-[11px] text-gray-400 mb-2">
                Hours: {item.operatingHours || "Unknown"} · Source: {item.sourceName}{item.demo ? " · DEMO" : ""}
              </p>
              {item.serviceEvidence?.length > 0 && (
                <details className="text-xs text-gray-700 mb-2">
                  <summary>Why this provider is listed</summary>
                  {item.serviceEvidence.map((entry, i) => (
                    <p className="text-[11px] text-gray-400 mb-1" key={i}>
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
                <p className="text-[11px] text-gray-400">Current blood inventory: unknown</p>
              )}
              {kind === "ambulances" && (
                <p className="text-[11px] text-gray-400">Availability and dispatch: unknown. Contact provider directly.</p>
              )}
              <div className="mt-auto pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                {onSelectResource && kind === "blood-banks" && (
                  <button
                    type="button"
                    className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-700"
                    onClick={() => onSelectResource(item)}
                  >
                    Request / Donate Blood
                  </button>
                )}
                {item.phone ? (
                  <a className="bg-[var(--color-emergency)] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[var(--color-emergency-dark)]" href={`tel:${item.phone}`}>Call provider</a>
                ) : (
                  <span className="small text-secondary align-self-center">Phone unavailable</span>
                )}
                {item.location?.coordinates?.length === 2 && (
                  <a
                    className="border border-gray-300 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-gray-50"
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
                    className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-green-700"
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
