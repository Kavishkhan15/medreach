"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";

export default function TrackRequestPage() {
  const [type, setType] = useState("blood");
  const [reference, setReference] = useState("");
  const [token, setToken] = useState("");
  const [record, setRecord] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(kind, ref, privateToken) {
    const cleanReference = ref.trim();
    if (!cleanReference) return;
    setLoading(true);
    setError("");
    setRecord(null);
    setDelivery(null);
    try {
      const path = kind === "ambulance"
        ? `/api/ambulances/bookings/${encodeURIComponent(cleanReference)}`
        : `/api/blood-requests/${encodeURIComponent(cleanReference)}`;
      const data = await productApi(path, {
        headers: privateToken ? { "X-MedReach-Tracking-Token": privateToken } : {},
      });
      setRecord(kind === "ambulance" ? data.booking : data.bloodRequest);
      setDelivery(data.delivery || null);
      if (privateToken) {
        window.sessionStorage.setItem(
          kind === "ambulance"
            ? `medreach:ambulance-booking-token:${cleanReference}`
            : `medreach:blood-request-token:${cleanReference}`,
          privateToken
        );
      }
    } catch (err) {
      setError(err.message || "Could not load this request. Check the reference and tracking token.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("type") === "ambulance" ? "ambulance" : "blood";
    const ref = params.get("reference") || "";
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    const savedToken = ref ? window.sessionStorage.getItem(
      kind === "ambulance" ? `medreach:ambulance-booking-token:${ref}` : `medreach:blood-request-token:${ref}`
    ) || "" : "";
    const privateToken = fragmentToken || savedToken;
    setType(kind);
    setReference(ref);
    setToken(privateToken);
    if (ref) load(kind, ref, privateToken);
  }, []);

  return (
    <main className="container py-5">
      <div className="page-head mb-4">
        <span className="eyebrow">Private request lookup</span>
        <h1>Track a request</h1>
        <p>Use your reference and private tracking token. If you submitted while signed in, your account can access its own request.</p>
      </div>
      <form className="surface mb-4" onSubmit={(event) => { event.preventDefault(); load(type, reference, token); }}>
        <div className="mb-3">
          <label htmlFor="tracking-type" className="form-label">Request type</label>
          <select id="tracking-type" className="form-select" value={type} onChange={(event) => { setType(event.target.value); setRecord(null); }}>
            <option value="blood">Blood request or donation pledge</option>
            <option value="ambulance">Ambulance booking</option>
          </select>
        </div>
        <div className="mb-3">
          <label htmlFor="tracking-reference" className="form-label">Reference</label>
          <input id="tracking-reference" className="form-control" value={reference} onChange={(event) => setReference(event.target.value)} required autoComplete="off" />
        </div>
        <div className="mb-3">
          <label htmlFor="tracking-token" className="form-label">Private tracking token</label>
          <input id="tracking-token" className="form-control" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
          <p className="small text-muted mt-1">Guest tokens are included in the tracking link shown after submission. Keep that link private.</p>
        </div>
        <button type="submit" className="btn btn-danger" disabled={loading}>{loading ? "Checking…" : "Check status"}</button>
      </form>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      {record && <section className="surface" aria-label="Request status">
        <h2 className="h5">{record.reference}</h2>
        <p><strong>Status:</strong> {record.status}</p>
        {type === "blood" ? <>
          <p><strong>Blood bank:</strong> {record.bloodBankName}</p>
          <p><strong>Blood group:</strong> {record.bloodGroup}</p>
          <p>Contact the blood bank directly to confirm inventory and fulfillment.</p>
          <Link href="/blood-banks">Blood bank directory</Link>
        </> : <>
          <p><strong>Provider:</strong> {record.providerSnapshot?.name || "Provider details unavailable"}</p>
          <p><strong>Provider email:</strong> {delivery?.provider?.sent ? "Notification email sent" : "Notification email not confirmed"}</p>
          <p>Call the provider to confirm dispatch and availability.</p>
          <Link href="/ambulances">Ambulance directory</Link>
        </>}
      </section>}
    </main>
  );
}
