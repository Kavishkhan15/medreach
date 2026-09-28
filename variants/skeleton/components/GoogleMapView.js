"use client";

import { useEffect } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap
} from "@vis.gl/react-google-maps";
import Link from "next/link";

export function MapFallback({ category = "hospitals", categoryLabel = "Hospitals", itemCount = 0 }) {
  return (
    <div className="map-fallback">
      <div className="text-center p-4">
        <div style={{ fontSize: "2rem" }} aria-hidden="true"><svg width="2rem" height="2rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg></div>
        <p className="mb-1 fw-semibold">Map view is unavailable</p>
        <p className="disclaimer mb-2">
          Browse the {categoryLabel.toLowerCase()} list on this page or open the full directory.
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-2 mb-2">
          <Link className="btn btn-sm btn-outline-primary" href={`/${category}`}>Open directory</Link>
          <a className="btn btn-sm btn-danger" href="tel:112">Call 112</a>
        </div>
        <p className="disclaimer mb-0">{itemCount} listings remain available below.</p>
      </div>
    </div>
  );
}

function MapRecenter({ selectedId, items }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !selectedId || !items) return;
    const selectedItem = items.find((item) => (item._id || item.slug) === selectedId);
    if (selectedItem && selectedItem.location && selectedItem.location.coordinates) {
      const [lng, lat] = selectedItem.location.coordinates;
      map.panTo({ lat, lng });
    }
  }, [map, selectedId, items]);
  return null;
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
  if (!apiKey) {
    return (
      <div className="map-canvas" role="img" aria-label={`Map of Mumbai ${categoryLabel || "care resources"}`}>
        <MapFallback category={category} categoryLabel={categoryLabel} itemCount={items.length} />
      </div>
    );
  }

  const selectedItem = selected ? items.find((h) => String(h._id || h.slug) === String(selected)) : null;
  const primaryColor = CATEGORY_COLORS[category] || "#d32029";

  return (
    <div className="gmap-container">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat: 19.076, lng: 72.8777 }}
          defaultZoom={11}
          mapId="DEMO_MAP_ID"
        >
          {items.map((h) => {
            if (!h.location || !h.location.coordinates || h.location.coordinates.length < 2) return null;
            const [lng, lat] = h.location.coordinates;
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            const id = String(h._id || h.slug);
            const isSelected = String(selected) === id;

            return (
              <AdvancedMarker
                key={id}
                position={{ lat, lng }}
                onClick={() => onSelect(id)}
                zIndex={isSelected ? 100 : 1}
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

          {selectedItem && selectedItem.location && selectedItem.location.coordinates && (
            <InfoWindow
              position={{
                lat: selectedItem.location.coordinates[1],
                lng: selectedItem.location.coordinates[0],
              }}
              onCloseClick={() => onSelect(null)}
              pixelOffset={[0, -32]}
            >
              <div className="p-2" style={{ maxWidth: "280px", color: "#1c2024" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <span
                    style={{
                      backgroundColor: primaryColor,
                      color: "#fff",
                      fontSize: "0.7rem",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "3px",
                    }}
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
                    <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: selectedItem.emergencyStatus === "available" ? "#28a745" : "#e0a800" }}>
                      ● {selectedItem.emergencyStatus}
                    </span>
                  ) : selectedItem.verificationStatus === "verified" ? (
                    <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#28a745" }}>
                      ● Verified
                    </span>
                  ) : selectedItem.operatingHours ? (
                    <span style={{ fontSize: "0.75rem", color: "#6c757d" }}>
                      {selectedItem.operatingHours}
                    </span>
                  ) : null}
                </div>

                <h3 className="h6 mb-1" style={{ fontSize: "1.05rem", fontWeight: "bold", margin: "0.25rem 0" }}>
                  {selectedItem.name}
                </h3>
                <p className="disclaimer mb-1" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem 0", color: "#6c757d" }}>
                  {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                </p>

                {/* Category-adapted details summary */}
                {category === "blood-banks" && Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                  <div style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <span style={{ color: "#6c757d" }}>Groups: </span>
                    <strong style={{ color: "#d32029" }}>
                      {selectedItem.listedBloodGroups.slice(0, 5).join(" · ")}
                    </strong>
                  </div>
                )}
                {category === "diagnostics" && Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                  <div style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <span style={{ color: "#6c757d" }}>Tests: </span>
                    <strong style={{ color: "#1f5f8b" }}>
                      {selectedItem.services.slice(0, 3).join(" · ")}
                    </strong>
                  </div>
                )}
                {category === "ambulances" && (selectedItem.providerType || selectedItem.coverageArea) && (
                  <div style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <span style={{ color: "#6c757d" }}>Fleet: </span>
                    <strong style={{ color: "#b26a00" }}>
                      {selectedItem.providerType || selectedItem.coverageArea}
                    </strong>
                  </div>
                )}
                {category === "hospitals" && selectedItem.specialties?.length > 0 && (
                  <div style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <span style={{ color: "#6c757d" }}>Specialties: </span>
                    <strong style={{ color: "#495057" }}>
                      {selectedItem.specialties.slice(0, 2).join(" · ")}
                    </strong>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {(selectedItem.emergencyPhone || selectedItem.phone) && (
                    <a
                      href={`tel:${selectedItem.emergencyPhone || selectedItem.phone}`}
                      style={{ fontSize: "0.85rem", color: "#d32029", textDecoration: "none", fontWeight: "bold" }}
                    >
                      📞 {selectedItem.emergencyPhone || selectedItem.phone}
                    </a>
                  )}
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem", borderTop: "1px solid #dee2e6", paddingTop: "0.4rem" }}>
                    <a
                      href={category === "hospitals" ? `/hospitals/${selectedItem.slug || selectedItem._id}` : `#selected-provider`}
                      style={{ fontSize: "0.85rem", color: "#1f5f8b", textDecoration: "underline", fontWeight: "600" }}
                    >
                      View details
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedItem.location.coordinates[1]},${selectedItem.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.85rem", color: "#1f5f8b", textDecoration: "underline", fontWeight: "600" }}
                    >
                      Directions ↗
                    </a>
                  </div>
                </div>
              </div>
            </InfoWindow>
          )}
          <MapRecenter selectedId={selected} items={items} />
        </Map>
      </APIProvider>
    </div>
  );
}
