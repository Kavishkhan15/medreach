"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GoogleMapView from "../../components/GoogleMapView";
import AmbulanceBookingModal from "../../components/AmbulanceBookingModal";
import { toneClass, statusPill } from "../../lib/tone";

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
  hospitals: { label: "Hospital", color: "#d32029" },
  "blood-banks": { label: "Blood Bank", color: "#b31b25" },
  diagnostics: { label: "Diagnostic Centre", color: "#1f5f8b" },
  ambulances: { label: "Ambulance Provider", color: "#b26a00" },
};

export default function MapPage() {
  const [category, setCategory] = useState("hospitals");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [showBooking, setShowBooking] = useState(false);

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
          setItems([]);
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
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
      : `#selected-provider`;

  return (
    <>
      <div className="page-head mb-4">
        <span className="eyebrow">Mumbai care network</span>
        <h1>Explore nearby care</h1>
        <p>
          Filter hospitals, blood banks, diagnostic centres, and ambulance fleets on the map.
          Select any marker or list entry to inspect contact details, services, and get Google Maps directions.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Resource category">
        {Object.entries(categories).map(([kind, label]) => {
          const isActive = category === kind;
          return (
            <button
              key={kind}
              type="button"
              className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--color-emergency)] text-white"
                  : "bg-white border border-[var(--color-border)] text-[var(--color-text)] hover:bg-gray-50"
              }`}
              aria-pressed={isActive}
              onClick={() => {
                setCategory(kind);
                setSelected("");
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1" htmlFor="map-search">
          Search {categories[category].toLowerCase()}
        </label>
        <input
          id="map-search"
          className="w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-emergency)]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${categories[category].toLowerCase()} by name, locality, service, or test`}
        />
      </div>

      {loading && <p className="text-sm text-[var(--color-muted)] mb-3" role="status">Loading {categories[category].toLowerCase()}…</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-[var(--radius)] text-sm mb-3 flex flex-wrap items-center gap-2" role="alert">
          <span className="mr-auto">{error}</span>
          <button type="button" className="border border-red-300 rounded px-3 py-1 font-semibold" onClick={() => setRevision((value) => value + 1)}>Retry</button>
          <Link className="border border-gray-300 rounded px-3 py-1 font-semibold" href={`/${category}`}>Open directory</Link>
        </div>
      )}

      <div className="flex flex-wrap -mx-1.5">
        <div className="w-full lg:w-7/12 px-1.5 mb-3">
          <GoogleMapView
            items={visible}
            selected={selected}
            onSelect={setSelected}
            category={category}
            categoryLabel={categories[category]}
          />
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Markers use recorded geographic coordinates. Providers without coordinates remain in the list. Directions open directly in Google Maps navigation.
          </p>

          {/* Full Provider Detail Card Below Map */}
          {selectedItem && (
            <article
              id="selected-provider"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mt-3"
            >
              <div className="flex justify-between items-start gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-white text-xs font-bold"
                    style={{ backgroundColor: categoryBadges[category].color }}
                  >
                    {categoryBadges[category].label}
                  </span>
                  <span className="text-xs text-[var(--color-muted)] font-medium">
                    {selectedItem.hospitalType ||
                      selectedItem.providerType ||
                      (category === "blood-banks" ? "Transfusion & Storage" : "Healthcare Facility")}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {selectedItem.emergencyStatus ? (
                    <span
                      className={`${statusPill} ${
                        selectedItem.emergencyStatus === "available"
                          ? toneClass.success
                          : toneClass.warning
                      }`}
                    >
                      ER {selectedItem.emergencyStatus}
                    </span>
                  ) : selectedItem.operatingHours ? (
                    <span className={`${statusPill} ${toneClass.neutral}`}>
                      {selectedItem.operatingHours}
                    </span>
                  ) : null}
                </div>
              </div>

              <h2 className="text-xl font-bold mb-1">{selectedItem.name}</h2>
              <p className="text-xs text-[var(--color-muted)] mb-3">
                {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                {selectedItem.pincode ? ` - ${selectedItem.pincode}` : ""}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 mb-3 pt-2 border-t border-b border-[var(--color-border)] py-2">
                {phone && (
                  <a
                    className="inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-3 py-1.5 hover:bg-[var(--color-emergency-dark)] no-underline"
                    href={`tel:${phone}`}
                  >
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Call {phone}
                  </a>
                )}
                {hasCoords && (
                  <a
                    className="inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                  >
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                    Directions ↗
                  </a>
                )}
                {category === "hospitals" ? (
                  <Link
                    className="inline-flex items-center justify-center gap-1 font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline"
                    href={detailsHref}
                  >
                    Details
                  </Link>
                ) : null}

                {category === "hospitals" && (
                  <Link
                    className="inline-flex items-center justify-center font-bold text-sm rounded-[var(--radius)] bg-red-700 text-white px-3 py-1.5 hover:bg-red-800 no-underline ml-auto"
                    href={`/requests/new?hospital=${selectedItem._id || selectedItem.slug}&flow=standard`}
                  >
                    Request Bed
                  </Link>
                )}
                {category === "blood-banks" && (
                  <Link
                    className="inline-flex items-center justify-center font-bold text-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-white text-[var(--color-text)] px-3 py-1.5 hover:bg-[#f1f3f5] no-underline"
                    href="/blood-banks"
                  >
                    Request / Donate Blood
                  </Link>
                )}
              {category === "ambulances" && (
  <button
    className="inline-flex items-center justify-center font-bold text-sm rounded-[var(--radius)] bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 no-underline"
    onClick={() => setShowBooking(true)}
  >
    Book Ambulance
  </button>
)}
</div>

              {/* Category-Specific Rich Information */}
              {category === "blood-banks" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Available Blood Groups:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.listedBloodGroups.map((g) => (
                          <span key={g} className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-semibold">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Blood Components & Services:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-200 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-[var(--color-muted)] mt-2 mb-0">
                    MedReach does not display live blood inventory. Call the blood bank directly to confirm availability and fulfillment.
                  </p>
                </div>
              )}

              {category === "diagnostics" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Diagnostic Tests & Imaging:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedItem.operatingHours && (
                    <p className="text-xs text-[var(--color-muted)] mb-1">
                      <strong>Hours:</strong> {selectedItem.operatingHours}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-muted)] mt-2 mb-0">
                    Review the listed testing services and contact the provider to confirm appointment arrangements.
                  </p>
                </div>
              )}

              {category === "ambulances" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Fleet Equipment & Life Support:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedItem.coverageArea && (
                    <p className="text-xs text-[var(--color-muted)] mb-1">
                      <strong>Coverage Corridor:</strong> {selectedItem.coverageArea}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-muted)] mt-2 mb-0">
                    Ambulance provider directory. Call the provider to confirm availability; for immediate danger, dial 108 or 112.
                  </p>
                </div>
              )}

              {category === "hospitals" && (
                <div className="mb-3">
                  {Array.isArray(selectedItem.specialties) && selectedItem.specialties.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Specialties & Departments:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.specialties.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-200 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-muted)] font-bold block mb-1">Key Facilities:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.services.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 border border-gray-200 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.bedsTotal > 0 && (
                    <p className="text-xs text-[var(--color-muted)] mb-1">
                      <strong>Bed Capacity:</strong> {selectedItem.bedsAvailable || 0} available of {selectedItem.bedsTotal} total beds
                    </p>
                  )}
                </div>
              )}

              {/* Provider website */}
              <div className="pt-2 border-t border-[var(--color-border)] flex justify-between items-center flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                {selectedItem.demo && <span>DEMO</span>}
                {selectedItem.website && (
                  <a href={selectedItem.website} target="_blank" rel="noopener noreferrer" className="no-underline text-blue-600 hover:underline">
                    Official Website ↗
                  </a>
                )}
              </div>
            </article>
          )}
        </div>

        {/* Right-Side Interactive List */}
        <div className="w-full lg:w-5/12 px-1.5 mb-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)]">
            <div className="p-3 border-b border-[var(--color-border)] flex justify-between items-center">
              <h2 className="text-base font-bold">
                {categories[category]} <span className="text-xs text-[var(--color-muted)] font-normal">({visible.length})</span>
              </h2>
              <span className="text-xs text-[var(--color-muted)]">
                {visible.filter((i) => i.location?.coordinates?.length === 2 && Number.isFinite(i.location.coordinates[0])).length} mapped
              </span>
            </div>

            <ul className="divide-y divide-[var(--color-border)] max-h-[570px] overflow-y-auto" aria-label={`${categories[category]} list`}>
              {loading ? (
                <li className="p-4 text-center text-sm text-[var(--color-muted)]">Loading resources…</li>
              ) : !visible.length ? (
                <li className="p-4 text-center text-sm text-[var(--color-muted)]">No matching resources in this category.</li>
              ) : (
                visible.map((item) => {
                  const id = String(item._id || item.slug);
                  const isSelected = selected === id;
                  const itemCoords = item.location?.coordinates || [];
                  const itemHasCoords =
                    itemCoords.length === 2 && Number.isFinite(itemCoords[0]) && Number.isFinite(itemCoords[1]);

                  return (
                    <li
                      key={id}
                      className={`p-3 transition-colors ${
                        isSelected ? "bg-red-50" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left p-0 bg-transparent border-0 focus:outline-none"
                        onClick={() => setSelected(id)}
                        aria-pressed={isSelected}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <strong className="text-sm text-[var(--color-text)] leading-tight">{item.name}</strong>
                          {item.emergencyStatus ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[0.68rem] font-bold shrink-0 ${
                                item.emergencyStatus === "available"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {item.emergencyStatus}
                            </span>
                          ) : item.operatingHours === "24/7" ? (
                            <span className="px-1.5 py-0.5 rounded text-[0.68rem] font-semibold bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                              24/7
                            </span>
                          ) : null}
                        </div>

                        <div className="flex justify-between items-center mt-1 text-xs text-[var(--color-muted)]">
                          <span>{item.locality || item.city || "Mumbai"}</span>
                          <span>
                            {category === "blood-banks" && item.listedBloodGroups?.length > 0
                              ? `${item.listedBloodGroups.length} groups`
                              : category === "diagnostics" && item.services?.length > 0
                              ? item.services.slice(0, 2).join(", ")
                              : category === "ambulances" && item.providerType
                              ? item.providerType.slice(0, 22)
                              : item.hospitalType || ""}
                            {itemHasCoords ? (
                              <span className="ml-1 text-red-600" title="Has GPS coordinates">📍</span>
                            ) : (
                              <span className="ml-1 text-gray-400" title="Contact listing only">📞</span>
                            )}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </div>
      {showBooking && selectedItem && category === "ambulances" && (
        <AmbulanceBookingModal provider={selectedItem} onClose={() => setShowBooking(false)} />
      )}
    </>
  );
}
