"use client";
import Link from "next/link";
import { bedRequestLabel } from "@medreach/core";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Requests() { const [items, setItems] = useState([]); const [state, setState] = useState("loading"); const [revision, setRevision] = useState(0);
  useEffect(() => { setState("loading"); productApi("/api/emergency-requests").then((r) => { setItems(r.data || []); setState("ready"); }).catch((e) => { setItems([]); setState(e.message); }); }, [revision]);
  const authError = /authentication required|login required/i.test(state);
  return <><div className="page-head mb-4"><span className="eyebrow">Your coordination history</span><h1>Bed requests</h1><p>Track hospital responses. An accepted request does not guarantee a reserved bed.</p></div>
    <Link className="btn btn-primary mb-3" href="/requests/new?flow=standard">New standard request</Link>
    {state === "loading" && <p role="status">Loading requests…</p>}{state !== "ready" && state !== "loading" && <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2"><span className="me-auto">{state}</span>{authError ? <Link href="/login?returnTo=%2Frequests">Sign in</Link> : <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRevision((value) => value + 1)}>Retry</button>}</div>}
    {state === "ready" && !items.length && <div className="surface">No requests yet. Start from a hospital profile or create one above.</div>}
    <div className="vstack gap-3">{items.map((r) => <Link href={`/requests/${r._id}`} key={r._id} className="surface text-decoration-none text-reset d-flex justify-content-between align-items-center"><div><strong>{r.requestId}</strong><div className="small text-secondary">{r.hospital?.name} · {r.emergencyType} · {new Date(r.createdAt).toLocaleString()}</div></div><span className="status-pill tone-info">{bedRequestLabel(r.status)}</span></Link>)}</div>
  </>;
}
