"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useApiLoadingStatus } from "@vis.gl/react-google-maps";
import EmergencyIcon from "./EmergencyIcons";

function MapLoadStatus({ onUnavailable }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === "AUTH_FAILURE" || status === "FAILED") onUnavailable();
  }, [status, onUnavailable]);
  return null;
}

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

function MapRecenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !position) return;
    map.panTo(position);
    if (typeof map.getZoom === "function" && map.getZoom() < 13) map.setZoom(13);
  }, [map, position]);
  return null;
}

export function MapFallback({ itemCount = 0, categoryLabel = "resources", category = "hospitals" }) {
  return <div className="map-fallback skeleton-map-fallback" role="region" aria-label="Map unavailable">
    <EmergencyIcon name="pin" size={28} />
    <h2>Map view is unavailable</h2>
    <p>Browse the provider list on this page, open the full directory, or call emergency services if help is needed now.</p>
    <div className="skeleton-map-actions">
      <Link className="btn btn-outline-secondary" href={category === "all" ? "/map" : `/${category}`}>Open {categoryLabel.toLowerCase()} directory</Link>
      <a className="btn btn-danger" href="tel:112">Call 112</a>
    </div>
    <p>You can continue exploring all <strong>{itemCount} {categoryLabel.toLowerCase()}</strong> using the list view.</p>
  </div>;
}

export default function GoogleMapView({ items = [], selected = "", onSelect = () => {}, category = "hospitals", categoryLabel = "Hospitals", markerColors = CATEGORY_COLORS }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    const previousHandler = window.gm_authFailure;
    const onAuthFailure = () => {
      setMapUnavailable(true);
      if (typeof previousHandler === "function") previousHandler();
    };
    window.gm_authFailure = onAuthFailure;
    return () => {
      if (window.gm_authFailure === onAuthFailure) {
        if (previousHandler) window.gm_authFailure = previousHandler;
        else delete window.gm_authFailure;
      }
    };
  }, [apiKey]);

  const selectedItem = useMemo(() => items.find((item) => String(item._id || item.slug) === String(selected)), [items, selected]);
  const selectedPos = useMemo(() => toLatLng(selectedItem), [selectedItem]);
  const selectedCategory = category === "all" ? selectedItem?.category || "hospitals" : category;
  const color = markerColors[selectedCategory] || CATEGORY_COLORS.hospitals;

  if (!apiKey || mapUnavailable) return <MapFallback itemCount={items.length} categoryLabel={categoryLabel} category={category} />;

  return <div className="gmap-container skeleton-map-container">
    <APIProvider apiKey={apiKey} onError={() => setMapUnavailable(true)}>
        <MapLoadStatus onUnavailable={() => setMapUnavailable(true)} />
      <Map defaultCenter={MUMBAI_CENTER} defaultZoom={11} mapId={mapId} gestureHandling="greedy" mapTypeControl={false} streetViewControl={false} fullscreenControl zoomControl style={{ width: "100%", height: "100%" }}>
        <MapRecenter position={selectedPos} />
        {items.map((item) => {
          const position = toLatLng(item);
          if (!position) return null;
          const chosen = String(item._id || item.slug) === String(selected);
          return <AdvancedMarker key={item._id || item.slug} position={position} title={item.name} zIndex={chosen ? 100 : 1} onClick={() => onSelect(String(item._id || item.slug))}>
            <Pin background={chosen ? "#10151a" : markerColors[item.category || category] || color} borderColor="#fff" glyphColor="#fff" scale={chosen ? 1.25 : 1} />
          </AdvancedMarker>;
        })}
        {selectedItem && selectedPos && <InfoWindow shouldFocus={false} position={selectedPos} onCloseClick={() => onSelect("")} pixelOffset={[0, -36]}>
          <div className="skeleton-map-popup">
            <div className="skeleton-map-popup-top">
              <span className="skeleton-map-category" style={{ background: color }}>{selectedCategory === "blood-banks" ? "Blood Bank" : selectedCategory === "diagnostics" ? "Diagnostic Centre" : selectedCategory === "ambulances" ? "Ambulance Provider" : "Hospital"}</span>
              {selectedItem.emergencyStatus ? <span>{selectedItem.emergencyStatus}</span> : selectedItem.operatingHours ? <span>{selectedItem.operatingHours}</span> : null}
            </div>
            <h3>{selectedItem.name}</h3>
            <p>{selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}</p>
            {selectedCategory === "blood-banks" && selectedItem.listedBloodGroups?.length > 0 && <p>Groups: {selectedItem.listedBloodGroups.slice(0, 5).join(" · ")}</p>}
            {selectedCategory === "diagnostics" && selectedItem.services?.length > 0 && <p>Tests: {selectedItem.services.slice(0, 3).join(" · ")}</p>}
            {selectedCategory === "ambulances" && (selectedItem.providerType || selectedItem.coverageArea) && <p>Fleet: {selectedItem.providerType || selectedItem.coverageArea}</p>}
            {selectedCategory === "hospitals" && selectedItem.specialties?.length > 0 && <p>Specialties: {selectedItem.specialties.slice(0, 2).join(" · ")}</p>}
            {(selectedItem.emergencyPhone || selectedItem.phone) && <p>Tel: <a href={`tel:${selectedItem.emergencyPhone || selectedItem.phone}`}>{selectedItem.emergencyPhone || selectedItem.phone}</a></p>}
            <div className="skeleton-map-actions">
              <Link className="btn btn-outline-secondary" href={selectedCategory === "hospitals" ? `/hospitals/${selectedItem.slug || selectedItem._id}` : `/${selectedCategory}`}>View details</Link>
              <a className="btn btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPos.lat},${selectedPos.lng}`} target="_blank" rel="noopener noreferrer">Directions ↗</a>
            </div>
          </div>
        </InfoWindow>}
      </Map>
    </APIProvider>
  </div>;
}
