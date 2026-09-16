"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";

const bounds = { west: 72.75, east: 73.05, south: 18.87, north: 19.30 };
const categories = { hospitals: "Hospitals", "blood-banks": "Blood banks", diagnostics: "Diagnostics", ambulances: "Ambulances" };
function point(item) {
  const [lng, lat] = item.location?.coordinates || [];
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
    ? { x: 12 + ((lng - bounds.west) / (bounds.east - bounds.west)) * 76,
      y: 8 + ((bounds.north - lat) / (bounds.north - bounds.south)) * 84 } : null;
}
export default function MapPage() {
  const [category, setCategory] = useState("hospitals"); const [query, setQuery] = useState("");
  const [items, setItems] = useState([]); const [status, setStatus] = useState("loading"); const [selected, setSelected] = useState("");
  useEffect(() => { let live = true; setStatus("loading"); productApi(`/api/${category}${category === "hospitals" ? "?limit=50" : ""}`).then((r) => { if (live) { setItems(r.data || []); setStatus("ready"); } }).catch((e) => { if (live) setStatus(e.message); }); return () => { live = false; }; }, [category]);
  const visible = useMemo(() => items.filter((item) => `${item.name} ${item.locality || ""} ${(item.services || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const selectedItem = visible.find((item) => String(item._id) === selected);
  return <><div className="page-head mb-4"><span className="eyebrow">Mumbai care network</span><h1>Explore nearby care</h1><p>Filter hospitals and listed resources together with their map positions. This is a schematic coordinate view; travel time is shown only with a configured routing provider.</p></div>
    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Resource category">{Object.entries(categories).map(([kind, label]) => <button key={kind} className={`btn ${category === kind ? "btn-primary" : "btn-outline-secondary"}`} aria-pressed={category === kind} onClick={() => { setCategory(kind); setSelected(""); }}>{label}</button>)}</div>
    <label className="form-label fw-semibold" htmlFor="map-search">Search {categories[category].toLowerCase()}</label><input id="map-search" className="form-control mb-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, locality, or service" />
    {status === "loading" && <p role="status">Loading map data…</p>}{status !== "ready" && status !== "loading" && <div className="alert alert-danger">{status}</div>}
    <div className="row g-3"><div className="col-lg-7"><div className="map-shell"><svg className="resource-map" viewBox="0 0 100 100" role="img" aria-label={`${visible.length} ${categories[category].toLowerCase()} plotted in a schematic Mumbai coordinate view`}>
      <rect x="0" y="0" width="100" height="100" fill="#e9f2f4" /><path d="M7 0 Q18 25 13 45 Q18 75 22 100 L100 100 L100 0Z" fill="#f2eee3" /><path d="M19 0 Q30 45 24 100 M37 0 Q41 50 36 100 M10 32 L86 38 M16 60 L92 64 M20 78 L90 83" fill="none" stroke="#c9d2cf" strokeWidth=".4" />
      {visible.map((item) => { const p = point(item); if (!p) return null; return <g key={item._id} onClick={() => setSelected(String(item._id))} className="map-marker" role="button" tabIndex="0" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(String(item._id)); }} aria-label={`Select ${item.name}`}><circle cx={p.x} cy={p.y} r={selected === String(item._id) ? 2 : 1.35} fill={category === "hospitals" ? "#c72a34" : "#176b78"} stroke="white" strokeWidth=".5" /></g>; })}<text x="5" y="6" fontSize="3.5" fill="#37515a">MUMBAI · SCHEMATIC</text></svg></div><p className="disclaimer mt-2">Markers use stored coordinates. Providers without coordinates remain in the list.</p>{selectedItem && <div className="surface"><h2 className="h5">{selectedItem.name}</h2><p className="small">{selectedItem.locality || selectedItem.address || "Location details unavailable"}</p><Link className="btn btn-outline-primary btn-sm" href={category === "hospitals" ? `/hospitals/${selectedItem.slug}` : `/${category}`}>View details</Link></div>}</div>
    <div className="col-lg-5"><div className="surface map-results"><h2 className="h5">{categories[category]} <span className="small text-secondary">({visible.length})</span></h2>{status === "ready" && !visible.length && <p>No matching resources.</p>}{visible.map((item) => <button key={item._id} className={`map-result ${selected === String(item._id) ? "selected" : ""}`} onClick={() => setSelected(String(item._id))}><strong>{item.name}</strong><span>{item.locality || "Mumbai"}{item.demo ? " · DEMO" : ""}</span></button>)}</div></div></div>
  </>;
}
