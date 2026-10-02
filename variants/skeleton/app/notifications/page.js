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
    <div className="mb-4"><span className="eyebrow">Updates</span><h1>Notifications</h1></div>
    {status === "loading" && <p role="status">Loading notifications…</p>}
    {status !== "ready" && status !== "loading" && <div className="alert alert-danger">{status}</div>}
    {status === "ready" && !items.length && <div className="surface">No notifications yet.</div>}
    {items.map((n) => <div className="surface mb-3" key={n._id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <div><h2 className="h6 mb-1">{n.title} {!n.readAt && <span className="status-pill tone-info">New</span>}</h2><p className="small mb-1">{n.message}</p>{n.relatedType === "EmergencyRequest" && n.relatedId && <Link href={`/requests/${n.relatedId}`}>Open bed request</Link>}<time className="disclaimer">{new Date(n.createdAt).toLocaleString()}</time></div>
      {!n.readAt && <button className="btn btn-outline-secondary btn-sm" style={{ alignSelf: "start" }} onClick={() => read(n._id)}>Mark read</button>}
    </div>)}
  </>;
}
