"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Requests() {
  const [items, setItems] = useState([]); const [state, setState] = useState("loading");
  useEffect(() => { productApi("/api/emergency-requests").then((r) => { setItems(r.data || []); setState("ready"); }).catch((e) => setState(e.message)); }, []);
  return <>
    <div className="mb-4"><span className="eyebrow">Your coordination history</span><h1>Emergency requests</h1><p>Track hospital responses. An accepted request does not guarantee a reserved bed.</p></div>
    <Link className="btn btn-primary mb-3" href="/requests/new">New request</Link>
    {state === "loading" && <p role="status">Loading requests…</p>}
    {state !== "ready" && state !== "loading" && <div className="alert alert-warning">{state} · <Link href="/login">Sign in</Link></div>}
    {state === "ready" && !items.length && <div className="surface">No requests yet. Start from a hospital profile or create one above.</div>}
    {items.map((r) => <Link href={`/requests/${r._id}`} key={r._id} className="surface mb-3" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}>
      <div><strong>{r.requestId}</strong><div className="small text-secondary">{r.hospital?.name} · {r.emergencyType} · {new Date(r.createdAt).toLocaleString()}</div></div>
      <span className="status-pill tone-info">{r.status.replaceAll("_", " ")}</span>
    </Link>)}
  </>;
}
