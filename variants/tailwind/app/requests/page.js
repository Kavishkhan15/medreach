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
      <Link className="inline-block bg-[var(--color-emergency)] text-white font-bold px-4 py-2 rounded-md mb-4" href="/requests/new?flow=standard">
        New standard request
      </Link>
      {state === "loading" && <p role="status" className="text-gray-500">Loading requests…</p>}
      {state !== "ready" && state !== "loading" && (
        <div role="alert" className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md p-3 text-sm flex flex-wrap items-center gap-2">
          <span className="mr-auto">{state}</span>
          {authError ? (
            <Link href="/login?returnTo=%2Frequests" className="underline">
              Sign in
            </Link>
          ) : (
            <button type="button" className="border border-yellow-400 rounded px-3 py-1 font-semibold" onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          )}
        </div>
      )}
      {state === "ready" && !items.length && <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 mb-4">No requests yet. Start from a hospital profile or create one above.</div>}
      <div className="space-y-3 mb-4">
        {items.map((r) => (
          <Link
            href={`/requests/${r._id}`}
            key={r._id}
            className="block bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-4 no-underline hover:shadow-md transition-shadow flex justify-between items-center"
          >
            <div>
              <strong className="text-[var(--color-text)]">{r.requestId}</strong> ·{" "}
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.isEmergency ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                {r.isEmergency ? "Emergency" : "Normal"}
              </span>
              <div className="text-sm text-gray-500">
                {r.hospital?.name || "Hospital"} · {r.emergencyType} · {new Date(r.createdAt).toLocaleString()} · Track details →
              </div>
            </div>
            <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">{bedRequestLabel(r.status)}</span>
          </Link>
        ))}
      </div>
      <ServiceRequestHistory enabled={state === "ready"} />
    </>
  );
}
