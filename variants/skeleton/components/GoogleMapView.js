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

export function MapFallback() {
  return (
    <div className="map-fallback">
      <div className="text-center p-4">
        <div style={{ fontSize: "2rem" }} aria-hidden="true">🗺️</div>
        <p className="mb-1 fw-semibold">Map view</p>
        <p className="disclaimer mb-0">
          A tile-map provider plugs in here. Use the list to select a hospital.
        </p>
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

export default function GoogleMapView({ items = [], selected, onSelect }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <div className="map-canvas" role="img" aria-label="Map of Mumbai hospitals (interactive list provided alongside)">
        <MapFallback />
      </div>
    );
  }

  const selectedItem = selected ? items.find((h) => (h._id || h.slug) === selected) : null;

  return (
    <div className="gmap-container">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat: 19.076, lng: 72.8777 }}
          defaultZoom={11}
          mapId="DEMO_MAP_ID"
        >
          {items.map((h) => {
            if (!h.location || !h.location.coordinates) return null;
            const [lng, lat] = h.location.coordinates;
            const id = h._id || h.slug;
            const isSelected = selected === id;

            return (
              <AdvancedMarker
                key={id}
                position={{ lat, lng }}
                onClick={() => onSelect(id)}
                zIndex={isSelected ? 100 : 1}
              >
                <Pin
                  background={isSelected ? "#a51620" : "#d32029"}
                  borderColor={isSelected ? "#a51620" : "#d32029"}
                  glyphColor="#ffffff"
                  scale={isSelected ? 1.2 : 1}
                />
              </AdvancedMarker>
            );
          })}

          {selectedItem && selectedItem.location && selectedItem.location.coordinates && (
            <InfoWindow
              position={{
                lat: selectedItem.location.coordinates[1],
                lng: selectedItem.location.coordinates[0]
              }}
              onCloseClick={() => onSelect(null)}
              pixelOffset={[0, -30]}
            >
              <div className="p-2" style={{ maxWidth: "250px", color: "#1c2024" }}>
                <h3 className="h6 mb-1" style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0 0 0.5rem 0" }}>{selectedItem.name}</h3>
                <p className="disclaimer mb-2" style={{ fontSize: "1rem", margin: "0 0 1rem 0" }}>{selectedItem.locality || selectedItem.city}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <a href={`tel:${selectedItem.emergencyPhone || "112"}`} style={{ fontSize: "1rem", color: "#d32029", textDecoration: "none", fontWeight: "bold" }}>📞 {selectedItem.emergencyPhone || "112"}</a>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
                    <Link href={`/hospitals/${selectedItem.slug}`} style={{ fontSize: "1rem", color: "#1f5f8b", textDecoration: "underline" }}>Details</Link>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedItem.location.coordinates[1]},${selectedItem.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "1rem", color: "#1f5f8b", textDecoration: "underline" }}
                    >
                      Directions
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
