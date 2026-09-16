"use client";
import { useEffect, useState } from "react";
import { productApi, patch } from "../../lib/productApi";
export default function Notifications() { const [items, setItems] = useState([]); const [status, setStatus] = useState("loading");
  const load = () => productApi("/api/notifications").then((r) => { setItems(r.data || []); setStatus("ready"); }).catch((e) => setStatus(e.message));
  useEffect(() => { load(); }, []);
  const read = async (id) => { try { await patch(`/api/notifications/${id}/read`, {}); load(); } catch (e) { setStatus(e.message); } };
  return <><div className="page-head mb-4"><span className="eyebrow">Updates</span><h1>Notifications</h1></div>{status === "loading" && <p role="status">Loading notifications…</p>}{status !== "ready" && status !== "loading" && <div className="alert alert-danger">{status}</div>}{status === "ready" && !items.length && <div className="surface">No notifications yet.</div>}<div className="vstack gap-2">{items.map((n) => <div className="surface d-flex justify-content-between gap-3" key={n._id}><div><h2 className="h6 mb-1">{n.title} {!n.readAt && <span className="status-pill tone-info">New</span>}</h2><p className="mb-1">{n.message}</p><time className="disclaimer">{new Date(n.createdAt).toLocaleString()}</time></div>{!n.readAt && <button className="btn btn-outline-secondary btn-sm align-self-start" onClick={() => read(n._id)}>Mark read</button>}</div>)}</div></>;
}
