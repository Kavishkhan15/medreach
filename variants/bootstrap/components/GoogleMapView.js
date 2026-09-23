"use client";
import { useMemo, useEffect } from "react";
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

export function MapFallback({ itemCount = 0, categoryLabel = "resources" }) {
  return (
    <div className="map-fallback" role="region" aria-label="Map configuration notice">
      <div className="mb-3">
        <span
          className="d-inline-flex align-items-center justify-content-center bg-light text-primary rounded-circle border shadow-sm"
          style={{ width: "60px", height: "60px", fontSize: "1.6rem" }}
          aria-hidden="true"
        >
          <EmergencyIcon name="pin" size={16} className="text-danger" />
        </span>
      </div>
      <h2 className="h5 fw-bold mb-2">Google Maps JavaScript API key required</h2>
      <p className="text-muted small mb-3" style={{ maxWidth: "460px" }}>
        Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your environment to display the interactive map with live markers and navigation.
      </p>
      <div className="alert alert-light border text-start small mb-3 py-2 px-3 w-100" style={{ maxWidth: "460px" }}>
        <div className="fw-semibold mb-1">Quick Setup:</div>
        <ol className="mb-1 ps-3 text-muted">
          <li>Enable <strong>Maps JavaScript API</strong> in Google Cloud Console.</li>
          <li>Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key</code> to your environment.</li>
          <li>Restart the development server.</li>
        </ol>
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
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  const selectedItem = useMemo(
    () => items.find((item) => String(item._id) === String(selected)),
    [items, selected]
  );
  const selectedPos = useMemo(() => toLatLng(selectedItem), [selectedItem]);

  const primaryColor = CATEGORY_COLORS[category] || "#d32029";

  if (!apiKey) {
    return <MapFallback itemCount={items.length} categoryLabel={categoryLabel} />;
  }

  return (
    <div className="gmap-container">
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
              onCloseClick={() => onSelect("")}
              pixelOffset={[0, -36]}
            >
              <div className="p-1" style={{ maxWidth: 280, color: "#1c2024" }}>
                <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                  <span
                    className="badge"
                    style={{
                      backgroundColor: primaryColor,
                      color: "#fff",
                      fontSize: "0.72rem",
                    }}
                  >
                    {categoryLabel.replace(/s$/, "")}
                  </span>
                  {selectedItem.emergencyStatus && (
                    <span
                      className={`small fw-bold ${
                        selectedItem.emergencyStatus === "available"
                          ? "text-success"
                          : "text-warning"
                      }`}
                    >
                      <span className="d-inline-block rounded-circle bg-success me-1" style={{ width: 8, height: 8 }} /> {selectedItem.emergencyStatus}
                    </span>
                  )}
                </div>
                <h6 className="mb-1 fw-bold" style={{ fontSize: "0.95rem" }}>
                  {selectedItem.name}
                </h6>
                <p className="text-muted small mb-1">
                  {selectedItem.address || selectedItem.locality || "Mumbai"}
                </p>
                {selectedItem.phone && (
                  <p className="small mb-2">
                    <span className="text-muted">Tel:</span>{" "}
                    <a href={`tel:${selectedItem.phone}`} className="text-decoration-none">
                      {selectedItem.phone}
                    </a>
                  </p>
                )}
                <div className="d-flex gap-2 pt-1 border-top">
                  <Link
                    className="btn btn-outline-primary btn-sm flex-fill"
                    href={
                      category === "hospitals"
                        ? `/hospitals/${selectedItem.slug}`
                        : `/${category}`
                    }
                  >
                    Details
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
