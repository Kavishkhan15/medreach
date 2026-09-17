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
        📍
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

export default function GoogleMapView({ items = [], selected, onSelect }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  const selectedItem = useMemo(
    () => items.find((h) => (h._id || h.slug) === selected),
    [items, selected]
  );
  const selectedPos = useMemo(() => toLatLng(selectedItem), [selectedItem]);

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
            const id = h._id || h.slug;
            const isSelected = id === selected;
            return (
              <AdvancedMarker
                key={id}
                position={pos}
                title={h.name}
                zIndex={isSelected ? 100 : 1}
                onClick={() => onSelect(id)}
              >
                <Pin
                  background={isSelected ? "#10151a" : "#d32029"}
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
              <div className="p-1" style={{ maxWidth: 280, color: "#1c2024" }}>
                <h6 className="font-bold text-[.95rem] mb-1">{selectedItem.name}</h6>
                <p className="text-[var(--color-muted)] text-sm mb-1">
                  {selectedItem.address || selectedItem.locality || selectedItem.city || "Mumbai"}
                </p>
                {(selectedItem.emergencyPhone || selectedItem.phone) && (
                  <p className="text-sm mb-2">
                    <span className="text-[var(--color-muted)]">Tel:</span>{" "}
                    <a href={`tel:${selectedItem.emergencyPhone || selectedItem.phone}`}
                      className="no-underline">{selectedItem.emergencyPhone || selectedItem.phone}</a>
                  </p>
                )}
                <div className="flex gap-2 pt-1 border-t border-[var(--color-border)]">
                  <Link
                    className="flex-1 inline-flex items-center justify-center text-sm font-bold
                      rounded-[var(--radius)] border border-[var(--color-emergency)] text-[var(--color-emergency)]
                      px-2 py-1 no-underline hover:bg-[#fef2f2]"
                    href={`/hospitals/${selectedItem.slug}`}
                  >
                    Details
                  </Link>
                  <a
                    className="flex-1 inline-flex items-center justify-center text-sm font-bold
                      rounded-[var(--radius)] bg-[var(--color-emergency)] text-white
                      px-2 py-1 no-underline hover:bg-[var(--color-emergency-dark)]"
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
