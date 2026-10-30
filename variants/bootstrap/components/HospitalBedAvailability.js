"use client";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";

export default function HospitalBedAvailability({ hospitalId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const result = snapshot?.hospitalId === hospitalId ? snapshot.rows : null;
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null); setFailed(false);
    if (!hospitalId) return () => controller.abort();
    productApi(`/api/inventory/hospital/${encodeURIComponent(hospitalId)}`, { signal: controller.signal, cache: "no-store" })
      .then(value => { if (!controller.signal.aborted) { setSnapshot({ hospitalId, rows: value.data || [] }); setNow(Date.now()); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [hospitalId, revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const next = result?.map(row => new Date(row.expiresAt).getTime()).filter(value => Number.isFinite(value) && value > Date.now()).sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = setTimeout(() => setNow(Date.now()), next - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [result, now]);
  return <section className="surface p-3 mb-4" aria-label="Current hospital bed availability">
    <div className="d-flex justify-content-between flex-wrap gap-2 align-items-center mb-3"><h2 className="h5 mb-0">Bed availability</h2><button type="button" className="btn btn-outline-primary btn-sm" disabled={!hospitalId} onClick={() => setRevision(value => value + 1)}>Refresh bed counts</button></div>
    {!result && !failed ? <p role="status">Checking the latest verified report…</p> : <>
      <div className="row g-3">{[["general_beds", "General beds"], ["icu_beds", "ICU beds"]].map(([key, label]) => {
        const row = result?.find(value => value.resourceKey === key);
        const verified = row?.classification === "provider_confirmed" && row.expiresAt && new Date(row.expiresAt).getTime() > now && Number.isSafeInteger(row.available) && row.available >= 0;
        return <div className="col-6" key={key}><strong className="d-block">{label}</strong><span className="d-block fs-5">{verified ? `${row.available} available` : "Availability unknown"}</span>
          {verified && Number.isSafeInteger(row.capacity) && row.capacity >= row.available && <p className="text-secondary mb-1">Operational capacity: {row.capacity}</p>}
          {verified && row.observedAt && Number.isFinite(new Date(row.observedAt).getTime()) && <p className="text-secondary mb-0">Observed {new Date(row.observedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST</p>}
        </div>;
      })}</div>
      <p className="text-secondary mt-3 mb-0">{failed ? "The latest report could not be loaded. " : ""}Counts are shown only for fresh provider-confirmed inventory. The hospital must confirm your request.</p>
    </>}
  </section>;
}
