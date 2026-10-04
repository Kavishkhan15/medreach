"use client";
import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";

const MUMBAI_CENTER = { lat: 19.076, lng: 72.8777 };

const CATEGORY_COLORS = {
  hospitals: "#d32029",
  "blood-banks": "#176b78",
  diagnostics: "#1f5f8b",
  ambulances: "#b26a00",
};

export function toLatLng(item) {
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

export function MapFallback({ itemCount = 0, categoryLabel = "resources", category = "hospitals" }) {
  return (
    <div className="map-fallback" role="region" aria-label="Map unavailable">
      <div className="mb-3">
        <span
          className="d-inline-flex align-items-center justify-content-center bg-light text-primary rounded-circle border shadow-sm"
          style={{ width: "60px", height: "60px", fontSize: "1.6rem" }}
          aria-hidden="true"
        >
          <EmergencyIcon name="pin" size={16} className="text-danger" />
        </span>
      </div>
      <h2 className="h5 fw-bold mb-2">Map view is unavailable</h2>
      <p className="text-muted small mb-3" style={{ maxWidth: "460px" }}>
        Browse the provider list on this page, open the full directory, or call emergency services if help is needed now.
      </p>
      <div className="d-flex flex-wrap justify-content-center gap-2 mb-3">
        <Link className="btn btn-sm btn-outline-primary" href={category === "all" ? "/map" : `/${category}`}>Open {categoryLabel.toLowerCase()} directory</Link>
        <a className="btn btn-sm btn-danger" href="tel:112">Call 112</a>
      </div>
      <p className="small text-secondary mb-0">
        You can continue exploring all <strong>{itemCount} {categoryLabel.toLowerCase()}</strong> using the list view.
      </p>
    </div>
  );
}

export default function GoogleMapView({
  items = [],
  selected = "",
  onSelect = () => {},
  category = "hospitals",
  categoryLabel = "Hospitals",
  markerColors = CATEGORY_COLORS,
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    const previousHandler = window.gm_authFailure;
    const handleAuthFailure = () => {
      setMapUnavailable(true);
      if (typeof previousHandler === "function") previousHandler();
    };
    window.gm_authFailure = handleAuthFailure;
    return () => {
      if (window.gm_authFailure === handleAuthFailure) {
        if (previousHandler) window.gm_authFailure = previousHandler;
        else delete window.gm_authFailure;
      }
    };
  }, [apiKey]);

  const selectedItem = useMemo(
    () => items.find((item) => String(item._id) === String(selected)),
    [items, selected]
  );
  const selectedPos = useMemo(() => toLatLng(selectedItem), [selectedItem]);

  const selectedCategory = category === "all" ? selectedItem?.category || "hospitals" : category;
  const primaryColor = markerColors[selectedCategory] || CATEGORY_COLORS.hospitals;

  if (!apiKey || mapUnavailable) {
    return <MapFallback itemCount={items.length} categoryLabel={categoryLabel} category={category} />;
  }

  return (
    <div className="gmap-container">
      <APIProvider apiKey={apiKey} onError={() => setMapUnavailable(true)}>
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

          {items.map((item) => {
            const pos = toLatLng(item);
            if (!pos) return null;
            const isSelected = String(item._id) === String(selected);

            return (
              <AdvancedMarker
                key={item._id}
                position={pos}
                title={item.name}
                zIndex={isSelected ? 100 : 1}
                onClick={() => onSelect(String(item._id))}
              >
                <Pin
                  background={isSelected ? "#10151a" : markerColors[item.category || category] || primaryColor}
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
              onCloseClick={() => onSelect("")}
              pixelOffset={[0, -36]}
            >
              <div className="p-1" style={{ maxWidth: 300, color: "#1c2024" }}>
                <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                  <span
                    className="badge"
                    style={{
                      backgroundColor: primaryColor,
                      color: "#fff",
                      fontSize: "0.72rem",
                    }}
                  >
                    {selectedCategory === "blood-banks"
                      ? "Blood Bank"
                      : selectedCategory === "diagnostics"
                      ? "Diagnostic Centre"
                      : selectedCategory === "ambulances"
                      ? "Ambulance Provider"
                      : "Hospital"}
                  </span>
                  {selectedItem.emergencyStatus ? (
                    <span
                      className={`small fw-bold ${
                        selectedItem.emergencyStatus === "available"
                          ? "text-success"
                          : "text-warning"
                      }`}
                    >
                      <span
                        className="d-inline-block rounded-circle bg-success me-1"
                        style={{ width: 8, height: 8 }}
                      />{" "}
                      {selectedItem.emergencyStatus}
                    </span>
                  ) : selectedItem.verificationStatus === "verified" ? (
                    <span className="small fw-semibold text-success">
                      <span
                        className="d-inline-block rounded-circle bg-success me-1"
                        style={{ width: 8, height: 8 }}
                      />{" "}
                      Verified
                    </span>
                  ) : selectedItem.operatingHours ? (
                    <span className="small text-muted fw-semibold">
                      {selectedItem.operatingHours}
                    </span>
                  ) : null}
                </div>

                <h6 className="mb-1 fw-bold" style={{ fontSize: "0.95rem" }}>
                  {selectedItem.name}
                </h6>
                <p className="text-muted small mb-1">
                  {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                </p>

                {/* Category-adapted details summary */}
                {selectedCategory === "blood-banks" && Array.isArray(selectedItem.listedBloodGroups) && selectedItem.listedBloodGroups.length > 0 && (
                  <div className="small mb-1">
                    <span className="text-muted">Groups: </span>
                    <span className="fw-semibold text-danger">
                      {selectedItem.listedBloodGroups.slice(0, 5).join(" · ")}
                      {selectedItem.listedBloodGroups.length > 5 ? "…" : ""}
                    </span>
                  </div>
                )}
                {selectedCategory === "diagnostics" && Array.isArray(selectedItem.services) && selectedItem.services.length > 0 && (
                  <div className="small mb-1 text-truncate" title={selectedItem.services.join(", ")}>
                    <span className="text-muted">Tests: </span>
                    <span className="fw-semibold text-primary">
                      {selectedItem.services.slice(0, 3).join(" · ")}
                    </span>
                  </div>
                )}
                {selectedCategory === "ambulances" && (selectedItem.providerType || selectedItem.coverageArea) && (
                  <div className="small mb-1">
                    <span className="text-muted">Fleet: </span>
                    <span className="fw-semibold text-warning-emphasis">
                      {selectedItem.providerType || selectedItem.coverageArea}
                    </span>
                  </div>
                )}
                {selectedCategory === "hospitals" && selectedItem.specialties?.length > 0 && (
                  <div className="small mb-1 text-truncate" title={selectedItem.specialties.join(", ")}>
                    <span className="text-muted">Specialties: </span>
                    <span className="fw-semibold text-secondary">
                      {selectedItem.specialties.slice(0, 2).join(" · ")}
                    </span>
                  </div>
                )}

                {(selectedItem.emergencyPhone || selectedItem.phone) && (
                  <p className="small mb-2">
                    <span className="text-muted">Tel:</span>{" "}
                    <a
                      href={`tel:${selectedItem.emergencyPhone || selectedItem.phone}`}
                      className="text-decoration-none fw-semibold"
                    >
                      {selectedItem.emergencyPhone || selectedItem.phone}
                    </a>
                  </p>
                )}

                <div className="d-flex gap-2 pt-1 border-top">
                  <Link
                    className="btn btn-outline-primary btn-sm flex-fill"
                    href={
                      selectedCategory === "hospitals"
                        ? `/hospitals/${selectedItem.slug || selectedItem._id}`
                        : `/${selectedCategory}`
                    }
                  >
                    View details
                  </Link>
                  <a
                    className="btn btn-primary btn-sm flex-fill text-white"
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
