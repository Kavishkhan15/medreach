"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GoogleMapView from "../../components/GoogleMapView";

const BASE_API =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [bookingPickup, setBookingPickup] = useState("");
  const [ambulanceRequired, setAmbulanceRequired] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const url = `${BASE_API}/api/${category}${category === "hospitals" ? "?limit=50" : ""}`;

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (active) {
          setItems(data.data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [category]);

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
      <header className="mb-3">
        <span className="small text-uppercase fw-bold" style={{ color: "var(--color-emergency)" }}>
          Mumbai care network
        </span>
        <h1 className="h3 mb-1">Explore nearby care</h1>
        <p className="disclaimer mb-0">
          Filter hospitals, blood banks, diagnostic centres, and ambulance fleets on the map. Select any marker or list entry to inspect contact details, clinical services, and get Google Maps directions.
        </p>
      </header>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Resource category">
        {Object.entries(categories).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={`btn ${category === kind ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
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

      {/* Search Input */}
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

      {loading && <p role="status">Loading {categories[category].toLowerCase()} data…</p>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="grid-map">
        {/* Left Column: Interactive Map & Detailed Card */}
        <div>
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
            <article className="surface mt-3" aria-labelledby="selected-provider-title" id="selected-provider">
              <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="badge"
                    style={{ backgroundColor: categoryBadges[category].color, color: "#fff", fontSize: "1.1rem" }}
                  >
                    {categoryBadges[category].label}
                  </span>
                  <span className="small text-secondary fw-semibold">
                    {selectedItem.hospitalType ||
                      selectedItem.providerType ||
                      (category === "blood-banks" ? "Transfusion & Storage" : "Healthcare Facility")}
                  </span>
                </div>

                <div className="flex items-center gap-1">
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

              <h2 id="selected-provider-title" className="h4 mb-1">
                {selectedItem.name}
              </h2>

              <p className="disclaimer mb-2">
                📍 {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                {selectedItem.pincode ? ` - ${selectedItem.pincode}` : ""}
              </p>

              {/* Action Buttons */}
              <div className="action-bar flex flex-wrap gap-2 mb-3" style={{ borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)", padding: "0.8rem 0" }}>
                {phone && (
                  <a className="btn btn-primary btn-sm" href={`tel:${phone}`}>
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Call {phone}
                  </a>
                )}
                {hasCoords && (
                  <a
                    className="btn btn-outline-secondary btn-sm"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                    Directions ↗
                  </a>
                )}
                <Link className="btn btn-outline-secondary btn-sm" href={detailsHref}>
                  View details →
                </Link>

                {category === "hospitals" && (
                  <Link
                    className="btn btn-danger btn-sm fw-bold"
                    style={{ marginLeft: "auto" }}
                    href={`/requests/new?hospital=${selectedItem._id || selectedItem.slug}&isEmergency=true&flow=emergency`}
                  >
                    Request Emergency Bed
                  </Link>
                )}
                {category === "blood-banks" && (
                  <Link className="btn btn-danger btn-sm fw-bold" style={{ marginLeft: "auto" }} href="/blood-banks">
                    Request / Donate Blood
                  </Link>
                )}
              <button className="btn btn-success btn-sm ms-auto" onClick={() => setShowBooking(true)}>Book Ambulance</button>
</div>
{showBooking && selectedItem && category === "ambulances" && (
  <div className="modal-overlay" onClick={() => setShowBooking(false)} style={{position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000}}>
    <div className="modal-content bg-white p-4 rounded shadow" style={{width:"90%", maxWidth:"400px"}} onClick={e=>e.stopPropagation()}>
      <h3 className="text-lg font-bold mb-2">Book Ambulance – {selectedItem.name}</h3>
      <label className="block mb-2">
        Ambulance Required?
        <select className="mt-1 block w-full" value={ambulanceRequired ? "yes" : "no"} onChange={e=>setAmbulanceRequired(e.target.value==="yes")}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </label>
      {ambulanceRequired && (
        <label className="block mb-2">
          Pickup Address
          <input className="mt-1 block w-full border rounded p-1" type="text" value={bookingPickup} onChange={e=>setBookingPickup(e.target.value)} placeholder="Enter address" />
        </label>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowBooking(false)}>Cancel</button>
        <button className="btn btn-sm btn-primary" onClick={()=>{ console.log({providerId: selectedItem._id || selectedItem.slug, ambulanceRequired, bookingPickup}); setShowBooking(false); }}>Submit</button>
      </div>
    </div>
  </div>
)}

              {/* Category-Specific Rich Information */}
              {category === "blood-banks" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Available Blood Groups:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.listedBloodGroups.map((g) => (
                          <span
                            key={g}
                            className="badge"
                            style={{ backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger)" }}
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Blood Components & Services:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="chip">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="disclaimer mt-2 mb-0">
                    Blood availability is synchronized with registered transfusion services. In urgent cases, call the blood bank directly to reserve units.
                  </p>
                </div>
              )}

              {category === "diagnostics" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Diagnostic Tests & Imaging:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span
                            key={s}
                            className="badge"
                            style={{ backgroundColor: "var(--color-info-bg)", color: "var(--color-info)", border: "1px solid var(--color-info)" }}
                          >
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
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Fleet Equipment & Life Support:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span
                            key={s}
                            className="badge"
                            style={{ backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning)", border: "1px solid var(--color-warning)" }}
                          >
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
                    Emergency ambulance fleet dispatch. For immediate life-threatening resuscitation or disaster coordination, dial 108 or 112.
                  </p>
                </div>
              )}

              {category === "hospitals" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.specialties) && selectedItem.specialties.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Specialties & Departments:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.specialties.map((s) => (
                          <span key={s} className="chip">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="small text-secondary fw-bold" style={{ display: "block", marginBottom: "0.25rem" }}>
                        Key Facilities:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="chip">
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
              <div
                className="pt-2 flex justify-between items-center flex-wrap gap-2 text-secondary disclaimer"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <span>
                  {selectedItem.sourceName ? `Source: ${selectedItem.sourceName}` : "Official Directory Listing"}
                  {selectedItem.confidence ? ` · Confidence: ${selectedItem.confidence}` : ""}
                  {selectedItem.demo ? " · DEMO" : ""}
                </span>
                {selectedItem.website && (
                  <a href={selectedItem.website} target="_blank" rel="noopener noreferrer">
                    Official Website ↗
                  </a>
                )}
              </div>
            </article>
          )}
        </div>

        {/* Right Column: Synchronized Results List */}
        <div>
          <div className="surface map-results">
            <div className="flex justify-between items-center mb-2 px-1">
              <h2 className="h5 mb-0">
                {categories[category]} <span className="small text-secondary">({visible.length})</span>
              </h2>
              <span className="small text-secondary">
                {visible.filter((i) => i.location?.coordinates?.length === 2 && Number.isFinite(i.location.coordinates[0])).length} on map
              </span>
            </div>

            {!loading && !visible.length && (
              <p className="disclaimer p-2">No matching resources in this category.</p>
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
                  <div className="flex justify-between items-start gap-1">
                    <strong style={{ color: "var(--color-text)" }}>{item.name}</strong>
                    {item.emergencyStatus ? (
                      <span
                        className={`status-pill ${
                          item.emergencyStatus === "available" ? "tone-success" : "tone-warning"
                        }`}
                        style={{ fontSize: "1.1rem" }}
                      >
                        {item.emergencyStatus}
                      </span>
                    ) : item.verificationStatus === "verified" ? (
                      <span className="status-pill tone-success" style={{ fontSize: "1.1rem" }}>
                        Verified
                      </span>
                    ) : item.operatingHours === "24/7" ? (
                      <span className="status-pill tone-neutral" style={{ fontSize: "1.1rem" }}>
                        24/7
                      </span>
                    ) : null}
                  </div>

                  <div className="flex justify-between items-center mt-1">
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
                        <span className="ms-1" style={{ color: "var(--color-emergency)" }} title="Has GPS coordinates">📍</span>
                      ) : (
                        <span className="ms-1 text-secondary" title="Contact listing only">📞</span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
