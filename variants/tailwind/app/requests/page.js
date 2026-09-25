"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Requests() {
  const [items, setItems] = useState([]); const [state, setState] = useState("loading");
  useEffect(() => { productApi("/api/emergency-requests").then((r) => { setItems(r.data || []); setState("ready"); }).catch((e) => setState(e.message)); }, []);
  return <>
    <div className="mb-6"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">Your coordination history</span><h1 className="text-2xl font-bold mt-1">Emergency requests</h1><p className="text-gray-600 mt-2">Track hospital responses. An accepted request does not guarantee a reserved bed.</p></div>
    <Link className="inline-block bg-[var(--color-emergency)] text-white font-bold px-4 py-2 rounded-md mb-4" href="/requests/new">New request</Link>
    {state === "loading" && <p role="status" className="text-gray-500">Loading requests…</p>}
    {state !== "ready" && state !== "loading" && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md p-3 text-sm">{state} · <Link href="/login" className="underline">Sign in</Link></div>}
    {state === "ready" && !items.length && <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5">No requests yet. Start from a hospital profile or create one above.</div>}
    <div className="space-y-3">{items.map((r) => <Link href={`/requests/${r._id}`} key={r._id} className="block bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-4 no-underline hover:shadow-md transition-shadow flex justify-between items-center">
      <div><strong className="text-[var(--color-text)]">{r.requestId}</strong><div className="text-sm text-gray-500">{r.hospital?.name} · {r.emergencyType} · {new Date(r.createdAt).toLocaleString()}</div></div>
      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">{r.status.replaceAll("_", " ")}</span>
    </Link>)}</div>
  </>;
}
