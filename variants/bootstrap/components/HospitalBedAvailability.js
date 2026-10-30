"use client";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";

export default function HospitalBedAvailability({ hospitalId }) {
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setFailed(false);
    productApi(`/api/inventory/hospital/${encodeURIComponent(hospitalId)}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setResult(value.data); setNow(Date.now()); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [hospitalId]);
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
    <h2 className="h5 mb-3">Bed availability</h2>
    {!result && !failed ? <p role="status">Checking the latest verified report…</p> : <>
      <div className="row g-3">{[["general_beds", "General beds"], ["icu_beds", "ICU beds"]].map(([key, label]) => {
        const row = result?.find(value => value.resourceKey === key);
        const verified = row?.classification === "provider_confirmed" && row.expiresAt && new Date(row.expiresAt).getTime() > now && Number.isInteger(row.available);
        return <div className="col-6" key={key}><strong className="d-block">{label}</strong><span>{verified ? `${row.available} available` : "Availability unknown"}</span></div>;
      })}</div>
      <p className="text-secondary mt-3 mb-0">{failed ? "The latest report could not be loaded. " : ""}Counts are shown only for fresh provider-confirmed inventory. The hospital must confirm your request.</p>
    </>}
  </section>;
}
