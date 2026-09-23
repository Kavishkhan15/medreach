"use client";
import { useMemo, useEffect } from "react";
import Link from "next/link";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";

const MUMBAI_CENTER = { lat: 19.076, lng: 72.8777 };

function toLatLng(item) {
  const [lng, lat] = item?.location?.coordinates || [];
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lat, lng } : null;
}

function MapRecenter({ selectedPos }) {
  const map = useMap();
  useEffect(() => {
    if (map && selectedPos) {
      map.panTo(selectedPos);
      if (typeof map.getZoom === "function" && map.getZoom() < 13) {
        map.setZoom(13);
      }
    }
  }, [map, selectedPos]);
  return null;
}

export function MapFallback({ count = 0 }) {
  return (
    <div
      className="min-h-[420px] flex flex-col items-center justify-center text-center p-10
        bg-[var(--color-surface)] border border-dashed border-[var(--color-border)]
        rounded-[var(--radius-lg,1rem)]"
      role="region"
      aria-label="Map configuration notice"
    >
      <span
        className="inline-flex items-center justify-center w-[60px] h-[60px] rounded-full
          bg-[#f1f3f5] text-[var(--color-emergency)] border border-[var(--color-border)]
          shadow-sm text-[1.6rem] mb-3"
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </span>
      <h2 className="text-lg font-bold mb-2">Google Maps API key required</h2>
      <p className="text-[var(--color-muted)] text-sm mb-3 max-w-[460px]">
        Set <code className="bg-[#f1f3f5] px-1 rounded text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in
        your environment to display the interactive map.
      </p>
      <div className="bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--radius)]
        text-left text-sm p-3 w-full max-w-[460px] mb-3">
        <div className="font-semibold mb-1">Quick Setup:</div>
        <ol className="list-decimal pl-5 text-[var(--color-muted)] space-y-0.5">
          <li>Enable <strong>Maps JavaScript API</strong> in Google Cloud Console.</li>
          <li>Add <code className="bg-[#eef0f2] px-0.5 rounded text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key</code> to your environment.</li>
          <li>Restart the dev server.</li>
        </ol>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        You can continue exploring all <strong>{count} hospitals</strong> using the list.
      </p>
    </div>
  );
}

const CATEGORY_COLORS = {
  hospitals: "#d32029",
  "blood-banks": "#b31b25",
  diagnostics: "#1f5f8b",
  ambulances: "#b26a00",
};

export default function GoogleMapView({
  items = [],
  selected,
  onSelect,
  category = "hospitals",
  categoryLabel = "Hospitals",
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  const selectedItem = useMemo(
    () => items.find((h) => String(h._id || h.slug) === String(selected)),
    [items, selected]
  );
  const selectedPos = useMemo(() => toLatLng(selectedItem), [selectedItem]);
  const primaryColor = CATEGORY_COLORS[category] || "#d32029";

  if (!apiKey) return <MapFallback count={items.length} />;

  return (
    <div className="w-full h-[min(65vh,570px)] min-h-[420px] rounded-[var(--radius-lg,1rem)]
      overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={MUMBAI_CENTER}
          defaultZoom={11}
          mapId={mapId}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
          zoomControl={true}
          style={{ width: "100%", height: "100%" }}
        >
          <MapRecenter selectedPos={selectedPos} />

          {items.map((h) => {
            const pos = toLatLng(h);
            if (!pos) return null;
            const id = String(h._id || h.slug);
            const isSelected = id === String(selected);
            return (
              <AdvancedMarker
                key={id}
                position={pos}
                title={h.name}
                zIndex={isSelected ? 100 : 1}
                onClick={() => onSelect(id)}
              >
                <Pin
                  background={isSelected ? "#10151a" : primaryColor}
                  borderColor="#ffffff"
                  glyphColor="#ffffff"
                  scale={isSelected ? 1.25 : 1.0}
                />
              </AdvancedMarker>
            );
          })}

          {selectedItem && selectedPos && (
            <InfoWindow
              position={selectedPos}
              onCloseClick={() => onSelect(null)}
              pixelOffset={[0, -36]}
            >
              <div className="p-1" style={{ maxWidth: 290, color: "#1c2024" }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-white text-[0.7rem] font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {category === "blood-banks"
                      ? "Blood Bank"
                      : category === "diagnostics"
                      ? "Diagnostic Centre"
                      : category === "ambulances"
                      ? "Ambulance Provider"
                      : "Hospital"}
                  </span>
                  {selectedItem.emergencyStatus ? (
                    <span
                      className={`text-xs font-bold ${
                        selectedItem.emergencyStatus === "available"
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />
                      {selectedItem.emergencyStatus}
                    </span>
                  ) : selectedItem.verificationStatus === "verified" ? (
                    <span className="text-xs font-semibold text-green-700">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />
                      Verified
                    </span>
                  ) : selectedItem.operatingHours ? (
                    <span className="text-xs text-[var(--color-muted)] font-medium">
                      {selectedItem.operatingHours}
                    </span>
                  ) : null}
                </div>

                <h6 className="font-bold text-[.95rem] mb-1">{selectedItem.name}</h6>
                <p className="text-[var(--color-muted)] text-xs mb-1">
                  {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                </p>

                {/* Category-adapted details summary */}
                {category === "blood-banks" && Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                  <div className="text-xs mb-1">
                    <span className="text-[var(--color-muted)]">Groups: </span>
                    <span className="font-semibold text-red-600">
                      {selectedItem.listedBloodGroups.slice(0, 5).join(" · ")}
                      {selectedItem.listedBloodGroups.length > 5 ? "…" : ""}
                    </span>
                  </div>
                )}
                {category === "diagnostics" && Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                  <div className="text-xs mb-1 truncate" title={selectedItem.services.join(", ")}>
                    <span className="text-[var(--color-muted)]">Tests: </span>
                    <span className="font-semibold text-blue-700">
                      {selectedItem.services.slice(0, 3).join(" · ")}
                    </span>
                  </div>
                )}
                {category === "ambulances" && (selectedItem.providerType || selectedItem.coverageArea) && (
                  <div className="text-xs mb-1">
                    <span className="text-[var(--color-muted)]">Fleet: </span>
                    <span className="font-semibold text-amber-700">
                      {selectedItem.providerType || selectedItem.coverageArea}
                    </span>
                  </div>
                )}
                {category === "hospitals" && selectedItem.specialties?.length > 0 && (
                  <div className="text-xs mb-1 truncate" title={selectedItem.specialties.join(", ")}>
                    <span className="text-[var(--color-muted)]">Specialties: </span>
                    <span className="font-semibold text-gray-700">
                      {selectedItem.specialties.slice(0, 2).join(" · ")}
                    </span>
                  </div>
                )}

                {(selectedItem.emergencyPhone || selectedItem.phone) && (
                  <p className="text-xs mb-2">
                    <span className="text-[var(--color-muted)]">Tel:</span>{" "}
                    <a
                      href={`tel:${selectedItem.emergencyPhone || selectedItem.phone}`}
                      className="font-semibold no-underline text-blue-700"
                    >
                      {selectedItem.emergencyPhone || selectedItem.phone}
                    </a>
                  </p>
                )}

                <div className="flex gap-2 pt-1 border-t border-[var(--color-border)]">
                  <a
                    className="flex-1 inline-flex items-center justify-center text-xs font-bold
                      rounded-[var(--radius)] border border-gray-300 text-gray-800
                      px-2 py-1 no-underline hover:bg-gray-100"
                    href={
                      category === "hospitals"
                        ? `/hospitals/${selectedItem.slug || selectedItem._id}`
                        : `#selected-provider`
                    }
                  >
                    View details
                  </a>
                  <a
                    className="flex-1 inline-flex items-center justify-center text-xs font-bold
                      rounded-[var(--radius)] text-white px-2 py-1 no-underline hover:opacity-90"
                    style={{ backgroundColor: primaryColor }}
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPos.lat},${selectedPos.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions ↗
                  </a>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
