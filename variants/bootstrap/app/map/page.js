"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";
import GoogleMapView from "../../components/GoogleMapView";

const categories = {
  hospitals: "Hospitals",
  "blood-banks": "Blood banks",
  diagnostics: "Diagnostics",
  ambulances: "Ambulances",
};

export default function MapPage() {
  const [category, setCategory] = useState("hospitals");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let live = true;
    setStatus("loading");
    productApi(`/api/${category}${category === "hospitals" ? "?limit=50" : ""}`)
      .then((r) => {
        if (live) {
          setItems(r.data || []);
          setStatus("ready");
        }
      })
      .catch((e) => {
        if (live) setStatus(e.message);
      });
    return () => {
      live = false;
    };
  }, [category]);

  const visible = useMemo(
    () =>
      items.filter((item) =>
        `${item.name} ${item.locality || ""} ${(item.services || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [items, query]
  );

  const selectedItem = visible.find((item) => String(item._id) === selected);

  return (
    <>
      <div className="page-head mb-4">
        <span className="eyebrow">Mumbai care network</span>
        <h1>Explore nearby care</h1>
        <p>
          Filter hospitals and listed emergency resources on the map. Select any marker or list entry to inspect contact details and get Google Maps directions.
        </p>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Resource category">
        {Object.entries(categories).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={`btn ${category === kind ? "btn-primary" : "btn-outline-secondary"}`}
            aria-pressed={category === kind}
            onClick={() => {
              setCategory(kind);
              setSelected("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="form-label fw-semibold" htmlFor="map-search">
        Search {categories[category].toLowerCase()}
      </label>
      <input
        id="map-search"
        className="form-control mb-3"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, locality, or service"
      />

      {status === "loading" && <p role="status">Loading map data…</p>}
      {status !== "ready" && status !== "loading" && (
        <div className="alert alert-danger">{status}</div>
      )}

      <div className="row g-3">
        <div className="col-lg-7">
          <GoogleMapView
            items={visible}
            selected={selected}
            onSelect={setSelected}
            category={category}
            categoryLabel={categories[category]}
          />
          <p className="disclaimer mt-2">
            Markers use stored coordinates. Providers without coordinates remain in the list. Directions open directly in Google Maps navigation.
          </p>
          {selectedItem && (
            <div className="surface mt-3">
              <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                <div>
                  <h2 className="h5 mb-1">{selectedItem.name}</h2>
                  <p className="small text-muted mb-2">
                    {selectedItem.locality || selectedItem.address || "Location details unavailable"}
                  </p>
                  {selectedItem.phone && (
                    <p className="small mb-0">
                      <span className="text-muted">Tel:</span>{" "}
                      <a href={`tel:${selectedItem.phone}`} className="text-decoration-none">
                        {selectedItem.phone}
                      </a>
                    </p>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <Link
                    className="btn btn-outline-primary btn-sm"
                    href={category === "hospitals" ? `/hospitals/${selectedItem.slug}` : `/${category}`}
                  >
                    View details
                  </Link>
                  {Array.isArray(selectedItem.location?.coordinates) &&
                    selectedItem.location.coordinates.length === 2 &&
                    Number.isFinite(selectedItem.location.coordinates[0]) &&
                    Number.isFinite(selectedItem.location.coordinates[1]) && (
                    <a
                      className="btn btn-primary btn-sm text-white"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedItem.location.coordinates[1]},${selectedItem.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Directions ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-5">
          <div className="surface map-results">
            <h2 className="h5">
              {categories[category]} <span className="small text-secondary">({visible.length})</span>
            </h2>
            {status === "ready" && !visible.length && <p>No matching resources.</p>}
            {visible.map((item) => (
              <button
                key={item._id}
                type="button"
                className={`map-result ${selected === String(item._id) ? "selected" : ""}`}
                onClick={() => setSelected(String(item._id))}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.locality || "Mumbai"}
                  {item.demo ? " · DEMO" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
