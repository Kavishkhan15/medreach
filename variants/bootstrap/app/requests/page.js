"use client";
import ServiceRequestHistory from "../../components/ServiceRequestHistory";
import Link from "next/link";
import { bedRequestLabel } from "@medreach/core";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";

export default function Requests() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState("loading");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState("loading");
    productApi("/api/emergency-requests", { signal: controller.signal })
      .then((r) => {
        if (!Array.isArray(r.data)) throw new Error("The service returned an unexpected response. Please retry.");
        if (active) {
          setItems(r.data);
          setState("ready");
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          setState(e.message);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision]);

  const authError = /authentication required|login required/i.test(state);

  return (
    <>
      <div className="page-head mb-4">
        <span className="eyebrow">Your coordination history</span>
        <h1>Bed requests</h1>
        <p>Track hospital responses for emergency and standard requests. An accepted request does not guarantee a reserved bed.</p>
      </div>
      <Link className="btn btn-primary mb-3" href="/requests/new?flow=standard">
        New standard request
      </Link>
      {state === "loading" && <p role="status">Loading requests…</p>}
      {state !== "ready" && state !== "loading" && (
        <div role="alert" className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
          <span className="me-auto">{state}</span>
          {authError ? (
            <Link href="/login?returnTo=%2Frequests">Sign in</Link>
          ) : (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          )}
        </div>
      )}
      {state === "ready" && !items.length && <div className="surface mb-3">No requests yet. Start from a hospital profile or create one above.</div>}
      <div className="vstack gap-3 mb-4">
        {items.map((r) => (
          <Link
            href={`/requests/${r._id}`}
            key={r._id}
            className="surface text-decoration-none text-reset d-flex justify-content-between align-items-center p-3 border rounded"
          >
            <div>
              <strong>{r.requestId}</strong> ·{" "}
              <span className={`badge ${r.isEmergency ? "bg-danger" : "bg-primary"}`}>
                {r.isEmergency ? "Emergency" : "Normal"}
              </span>
              <div className="small text-secondary">
                {r.hospital?.name || "Hospital"} · {r.emergencyType} · {new Date(r.createdAt).toLocaleString()} · Track details →
              </div>
            </div>
            <span className="status-pill tone-info">{bedRequestLabel(r.status)}</span>
          </Link>
        ))}
      </div>
      <ServiceRequestHistory enabled={state === "ready"} />
    </>
  );
}
