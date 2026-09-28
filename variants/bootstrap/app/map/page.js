"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";
import GoogleMapView from "../../components/GoogleMapView";
import EmergencyIcon from "../../components/EmergencyIcons";
import AmbulanceBookingModal from "../../components/AmbulanceBookingModal";

const categories = {
  hospitals: "Hospitals",
  "blood-banks": "Blood banks",
  diagnostics: "Diagnostics",
  ambulances: "Ambulances",
};

const categoryBadges = {
  hospitals: { label: "Hospital", color: "#d32029", tone: "tone-danger" },
  "blood-banks": { label: "Blood Bank", color: "#b31b25", tone: "tone-critical" },
  diagnostics: { label: "Diagnostic Centre", color: "#1f5f8b", tone: "tone-info" },
  ambulances: { label: "Ambulance Provider", color: "#b26a00", tone: "tone-warning" },
};

export default function MapPage() {
  const [category, setCategory] = useState("hospitals");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [showBooking, setShowBooking] = useState(false);

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
        if (live) { setItems([]); setStatus(e.message); }
      });
    return () => {
      live = false;
    };
  }, [category, revision]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const text = [
          item.name,
          item.locality,
          item.address,
          item.city,
          item.hospitalType,
          item.providerType,
          item.coverageArea,
          ...(item.services || []),
          ...(item.specialties || []),
          ...(item.listedBloodGroups || []),
          item.operatingHours,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(query.toLowerCase());
      }),
    [items, query]
  );

  const selectedItem = visible.find(
    (item) => String(item._id) === selected || item.slug === selected
  );

  const coords = selectedItem?.location?.coordinates || [];
  const hasCoords =
    coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);

  const phone =
    selectedItem?.emergencyPhone || selectedItem?.phone || (category === "ambulances" ? "108" : null);

  const detailsHref =
    category === "hospitals"
      ? `/hospitals/${selectedItem?.slug || selectedItem?._id}`
      : `/${category}`;

  return (
    <>
      <div className="page-head mb-4">
        <span className="eyebrow">Mumbai care network</span>
        <h1>Explore nearby care</h1>
        <p>
          Filter hospitals, blood banks, diagnostic centres, and ambulance fleets on the map.
          Select any marker or list entry to inspect contact details, clinical services, and get
          Google Maps directions.
        </p>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Resource category">
        {Object.entries(categories).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={`btn ${category === kind ? "btn-primary fw-semibold" : "btn-outline-secondary"}`}
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
        placeholder={`Search ${categories[category].toLowerCase()} by name, locality, service, or test`}
      />

      {status === "loading" && <p role="status">Loading {categories[category].toLowerCase()} data…</p>}
      {status !== "ready" && status !== "loading" && (
        <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">
          <span className="me-auto">{status}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRevision((value) => value + 1)}>Retry</button>
          <Link className="btn btn-sm btn-outline-secondary" href={`/${category}`}>Open directory</Link>
        </div>
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
            Markers use verified geographic coordinates. Providers without coordinates remain available in the list. Directions open directly in Google Maps navigation.
          </p>

          {/* Full Provider Detail Card Below Map matching Hospital Experience */}
          {selectedItem && (
            <article className="surface p-4 shadow-sm border rounded mt-3" aria-labelledby="selected-provider-title">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span
                    className="badge text-white fw-bold px-2 py-1"
                    style={{ backgroundColor: categoryBadges[category].color, fontSize: "0.75rem" }}
                  >
                    {categoryBadges[category].label}
                  </span>
                  <span className="small text-secondary fw-semibold">
                    {selectedItem.hospitalType ||
                      selectedItem.providerType ||
                      (category === "blood-banks" ? "Transfusion & Storage" : "Healthcare Facility")}
                  </span>
                </div>

                <div className="d-flex align-items-center gap-1">
                  {selectedItem.emergencyStatus ? (
                    <span
                      className={`status-pill ${
                        selectedItem.emergencyStatus === "available" ? "tone-success" : "tone-warning"
                      }`}
                    >
                      ER {selectedItem.emergencyStatus}
                    </span>
                  ) : selectedItem.verificationStatus === "verified" ? (
                    <span className="status-pill tone-success">Verified Provider</span>
                  ) : selectedItem.operatingHours ? (
                    <span className="status-pill tone-neutral">{selectedItem.operatingHours}</span>
                  ) : null}
                </div>
              </div>

              <h2 id="selected-provider-title" className="h4 mb-1 fw-bold text-dark">
                {selectedItem.name}
              </h2>

              <p className="text-secondary small mb-3 d-flex align-items-center gap-1">
                <EmergencyIcon name="pin" size={14} className="text-danger flex-shrink-0" />
                <span>
                  {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                  {selectedItem.pincode ? ` - ${selectedItem.pincode}` : ""}
                </span>
              </p>

              {/* Action Buttons */}
              <div className="action-bar d-flex flex-wrap gap-2 mb-3 pt-1 border-top border-bottom py-2">
                {phone && (
                  <a className="btn btn-primary btn-sm fw-semibold d-inline-flex align-items-center gap-1" href={`tel:${phone}`}>
                    <EmergencyIcon name="phone" size={14} /> Call {phone}
                  </a>
                )}
                {hasCoords && (
                  <a
                    className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <EmergencyIcon name="navigate" size={14} /> Directions ↗
                  </a>
                )}
                <Link className="btn btn-outline-primary btn-sm fw-semibold" href={detailsHref}>
                  View details →
                </Link>

                {category === "hospitals" && (
                  <Link
                    className="btn btn-danger btn-sm fw-bold ms-auto"
                    href={`/requests/new?hospital=${selectedItem._id || selectedItem.slug}&flow=standard`}
                  >
                    Request Bed
                  </Link>
                )}
                {category === "blood-banks" && (
                  <Link className="btn btn-danger btn-sm fw-bold ms-auto" href="/blood-banks">
                    Request / Donate Blood
                  </Link>
                )}
                {category === "ambulances" && (
                  <button className="btn btn-success btn-sm ms-auto" onClick={() => setShowBooking(true)}>
                    Book Ambulance
                  </button>
                )}
              </div>

              {/* Category-Specific Rich Information */}
              {category === "blood-banks" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Available Blood Groups:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.listedBloodGroups.map((g) => (
                          <span key={g} className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Blood Components & Services:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="badge bg-light text-dark border px-2 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="disclaimer mt-2 mb-0">
                    MedReach does not display live blood inventory. Call the blood bank directly to confirm availability and fulfillment.
                  </p>
                </div>
              )}

              {category === "diagnostics" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Diagnostic Tests & Imaging:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedItem.operatingHours && (
                    <p className="small text-secondary mb-1">
                      <strong>Hours:</strong> {selectedItem.operatingHours}
                    </p>
                  )}
                  <p className="disclaimer mt-2 mb-0">
                    Testing services verified through accreditation records. Fast-track emergency pathology and imaging available on-site.
                  </p>
                </div>
              )}

              {category === "ambulances" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Fleet Equipment & Life Support:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="badge bg-warning-subtle text-dark border border-warning-subtle px-2 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedItem.coverageArea && (
                    <p className="small text-secondary mb-1">
                      <strong>Coverage Corridor:</strong> {selectedItem.coverageArea}
                    </p>
                  )}
                  <p className="disclaimer mt-2 mb-0">
                    Ambulance provider directory. Call the provider to confirm availability; for immediate danger, dial 108 or 112.
                  </p>
                </div>
              )}

              {category === "hospitals" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.specialties) && selectedItem.specialties.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Specialties & Departments:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.specialties.map((s) => (
                          <span key={s} className="badge bg-light text-dark border px-2 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold d-block mb-1">Key Facilities:</span>
                      <div className="d-flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="badge bg-light text-secondary border px-2 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.bedsTotal > 0 && (
                    <p className="small text-secondary mb-1">
                      <strong>Bed Capacity:</strong> {selectedItem.bedsAvailable || 0} available of {selectedItem.bedsTotal} total beds
                    </p>
                  )}
                </div>
              )}

              {/* Source & Verification Metadata */}
              <div className="pt-2 border-top d-flex justify-content-between align-items-center flex-wrap gap-2 text-muted small">
                <span>
                  {selectedItem.sourceName ? `Source: ${selectedItem.sourceName}` : "Official Directory Listing"}
                  {selectedItem.confidence ? ` · Confidence: ${selectedItem.confidence}` : ""}
                  {selectedItem.demo ? " · DEMO" : ""}
                </span>
                {selectedItem.website && (
                  <a href={selectedItem.website} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                    Official Website ↗
                  </a>
                )}
              </div>
            </article>
          )}
        </div>

        <div className="col-lg-5">
          <div className="surface map-results">
            <div className="d-flex justify-content-between align-items-center mb-2 px-1">
              <h2 className="h5 mb-0">
                {categories[category]} <span className="small text-secondary">({visible.length})</span>
              </h2>
              <span className="small text-muted">
                {visible.filter((i) => i.location?.coordinates?.length === 2 && Number.isFinite(i.location.coordinates[0])).length} on map
              </span>
            </div>

            {status === "ready" && !visible.length && (
              <p className="text-muted p-2">No matching resources in this category.</p>
            )}

            {visible.map((item) => {
              const itemCoords = item.location?.coordinates || [];
              const itemHasCoords =
                itemCoords.length === 2 && Number.isFinite(itemCoords[0]) && Number.isFinite(itemCoords[1]);
              const isSelected = selected === String(item._id) || selected === item.slug;

              return (
                <button
                  key={item._id}
                  type="button"
                  className={`map-result ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelected(String(item._id))}
                  aria-pressed={isSelected}
                >
                  <div className="d-flex justify-content-between align-items-start gap-1">
                    <strong className="text-dark">{item.name}</strong>
                    {item.emergencyStatus ? (
                      <span
                        className={`badge ${
                          item.emergencyStatus === "available" ? "bg-success" : "bg-warning text-dark"
                        }`}
                        style={{ fontSize: "0.68rem" }}
                      >
                        {item.emergencyStatus}
                      </span>
                    ) : item.verificationStatus === "verified" ? (
                      <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "0.68rem" }}>
                        Verified
                      </span>
                    ) : item.operatingHours === "24/7" ? (
                      <span className="badge bg-light text-secondary border" style={{ fontSize: "0.68rem" }}>
                        24/7
                      </span>
                    ) : null}
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span>
                      {item.locality || item.city || "Mumbai"}
                      {item.demo ? " · DEMO" : ""}
                    </span>

                    <span className="small text-secondary">
                      {category === "blood-banks" && item.listedBloodGroups?.length > 0
                        ? `${item.listedBloodGroups.length} groups`
                        : category === "diagnostics" && item.services?.length > 0
                        ? item.services.slice(0, 2).join(", ")
                        : category === "ambulances" && item.providerType
                        ? item.providerType.slice(0, 22)
                        : item.hospitalType || ""}
                      {itemHasCoords ? (
                        <span className="ms-1 text-danger" title="Has GPS coordinates">📍</span>
                      ) : (
                        <span className="ms-1 text-muted" title="Contact listing only">📞</span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {showBooking && selectedItem && category === "ambulances" && (
        <AmbulanceBookingModal provider={selectedItem} onClose={() => setShowBooking(false)} />
      )}
    </>
  );
}
