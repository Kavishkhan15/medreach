"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";
import { DIAGNOSTIC_TESTS, diagnosticDate } from "../lib/diagnostics";

export default function DiagnosticAvailability({ centres, urgency = "ROUTINE" }) {
  const [centreId, setCentreId] = useState("");
  const [date, setDate] = useState(() => diagnosticDate(new Date()));
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const centre = centres.find(item => item._id === centreId);
  const selectedId = centre?._id;

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null); setError("");
    if (!selectedId || !date) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    productApi(`/api/capacity/diagnostic/${encodeURIComponent(selectedId)}/daily?date=${encodeURIComponent(date)}`, { signal: controller.signal, cache: "no-store" })
      .then(result => {
        if (!controller.signal.aborted) setSnapshot({ centreId: selectedId, date, rows: result.data || [], readAt: new Date() });
      })
      .catch(() => { if (!controller.signal.aborted) setError("Daily slots could not be checked. Refresh to try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId, date, revision]);

  useEffect(() => {
    if (!centreId) return;
    const timer = setInterval(() => setRevision(value => value + 1), 30000);
    return () => clearInterval(timer);
  }, [centreId]);

  const current = centre && snapshot?.centreId === centreId && snapshot.date === date ? snapshot : null;
  return <section className="surface mb-4" aria-label="Diagnostic slot availability">
    <h2 className="h4 mb-2">Check daily test slots</h2>
    <p className="text-secondary">See remaining routine request slots for a centre and date. Each test has a maximum daily limit of 30 patients. The centre confirms the test and appointment time.</p>
    <div className="row g-3 align-items-end">
      <div className="col-md-6">
        <label className="form-label" htmlFor="availability-centre">Diagnostic centre for availability</label>
        <select id="availability-centre" className="form-select" value={centre ? centreId : ""} onChange={event => setCentreId(event.target.value)}>
          <option value="">Choose a centre</option>
          {centres.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select>
      </div>
      <div className="col-md-4">
        <label className="form-label" htmlFor="availability-date">Availability date</label>
        <input id="availability-date" className="form-control" type="date" value={date} min={diagnosticDate(new Date())} max={diagnosticDate(new Date(Date.now() + 180 * 86400000))} onChange={event => setDate(event.target.value)} />
      </div>
      <div className="col-md-2"><button type="button" className="btn btn-outline-primary w-100" disabled={!centre || !date || loading} onClick={() => setRevision(value => value + 1)}>Refresh slots</button></div>
    </div>
    {loading && <p role="status" className="mt-3 mb-0">Checking daily slots…</p>}
    {error && <p role="alert" className="text-danger mt-3 mb-0">{error}</p>}
    {current && <>
      <div className="table-responsive mt-3">
        <table className="table align-middle mb-2">
          <caption className="visually-hidden">Routine test slots at {centre.name} on {date}</caption>
          <thead><tr><th scope="col">Test</th><th scope="col">Routine limit</th><th scope="col">Booked / held</th><th scope="col">Available slots</th></tr></thead>
          <tbody>{DIAGNOSTIC_TESTS.map(([test, label]) => {
            const row = current.rows.find(value => value.test === test && value.date === date);
            const known = row?.configured === true && [row.capacity, row.urgentCapacity, row.routineRemaining].every(value => Number.isSafeInteger(value) && value >= 0)
              && row.capacity <= 30 && row.urgentCapacity <= row.capacity && row.routineRemaining <= row.capacity - row.urgentCapacity;
            const limit = known ? row.capacity - row.urgentCapacity : null;
            return <tr key={test}><th scope="row">{label}</th><td>{limit ?? "Not established"}</td><td>{known ? limit - row.routineRemaining : "Unknown"}</td><td><strong>{known ? row.routineRemaining === 0 ? "0 — Fully booked" : `${row.routineRemaining} available out of ${limit} routine slots` : "Availability unknown"}</strong></td></tr>;
          })}</tbody>
        </table>
      </div>
      <p className="text-secondary">Checked at {current.readAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST. Updates every 30 seconds. Counts can change before submission. Unreviewed centres remain review-only; unknown never means zero.</p>
      <Link className="btn btn-primary" href={`/diagnostics/request?centre=${centreId}&date=${encodeURIComponent(date)}${urgency === "URGENT" ? "&urgency=URGENT" : ""}`}>{urgency === "URGENT" ? "Request emergency review at this centre" : "Request tests at this centre"}</Link>
    </>}
  </section>;
}
