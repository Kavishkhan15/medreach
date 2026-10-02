"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi, patch } from "../../lib/productApi";
export default function Notifications() {
  const [items, setItems] = useState([]); const [status, setStatus] = useState("loading");
  const load = () => productApi("/api/notifications").then((r) => { setItems(r.data || []); setStatus("ready"); }).catch((e) => setStatus(e.message));
  useEffect(() => { load(); }, []);
  const read = async (id) => { try { await patch(`/api/notifications/${id}/read`, {}); load(); } catch (e) { setStatus(e.message); } };
  return <>
    <div className="mb-6"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">Updates</span><h1 className="text-2xl font-bold mt-1">Notifications</h1></div>
    {status === "loading" && <p role="status" className="text-gray-500">Loading notifications…</p>}
    {status !== "ready" && status !== "loading" && <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">{status}</div>}
    {status === "ready" && !items.length && <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5">No notifications yet.</div>}
    <div className="space-y-3">{items.map((n) => <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-4 flex justify-between gap-3" key={n._id}>
      <div><h2 className="text-base font-bold mb-1">{n.title} {!n.readAt && <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full ml-2">New</span>}</h2><p className="text-sm text-gray-700 mb-1">{n.message}</p>{n.relatedType === "EmergencyRequest" && n.relatedId && <Link href={`/requests/${n.relatedId}`}>Open bed request</Link>}<time className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</time></div>
      {!n.readAt && <button className="self-start border border-gray-300 rounded-md px-3 py-1 text-xs font-semibold hover:bg-gray-50" onClick={() => read(n._id)}>Mark read</button>}
    </div>)}</div>
  </>;
}
