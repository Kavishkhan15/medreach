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
        <div style={{ fontSize: "2rem" }} aria-hidden="true"><svg width="2rem" height="2rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg></div>
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
                  <a href={`tel:${selectedItem.emergencyPhone || "112"}`} style={{ fontSize: "1rem", color: "#d32029", textDecoration: "none", fontWeight: "bold" }}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>{selectedItem.emergencyPhone || "112"}</a>
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
