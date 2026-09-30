"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Dashboard() {
  const [user, setUser] = useState(null); const [requests, setRequests] = useState([]); const [apps, setApps] = useState([]); const [notifications, setNotifications] = useState([]); const [error, setError] = useState("");
  useEffect(() => { Promise.all([productApi("/api/auth/me"), productApi("/api/emergency-requests"), productApi("/api/applications/mine"), productApi("/api/notifications")])
    .then(([u, r, a, n]) => { setUser(u.user); setRequests(r.data || []); setApps(a.data || []); setNotifications(n.data || []); }).catch((e) => setError(e.message)); }, []);
  return <>
    <div className="mb-4"><span className="eyebrow">Your MedReach</span><h1>{user ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}</h1><p>Quick access to your requests, applications, saved hospitals, and updates.</p></div>
    {error && <div className="alert alert-warning">{error} · <Link href="/login">Sign in</Link></div>}
    {!user && !error && <p role="status">Loading dashboard…</p>}
    {user && <div className="grid-2">
      <section className="surface"><h2 className="h5">Emergency requests</h2>{requests.length ? requests.slice(0,4).map((r) => <p key={r._id} className="small"><Link href={`/requests/${r._id}`}>{r.requestId}</Link> · {r.status}</p>) : <p className="small">No requests yet.</p>}<Link className="btn btn-outline-primary btn-sm" href="/requests">View requests</Link></section>
      <section className="surface"><h2 className="h5">Applications</h2>{apps.length ? apps.slice(0,4).map((a) => <p key={a._id} className="small">{a.job?.title || a.hospital?.name || a.provider?.name || a.roleInterested || "Role"} · {a.status}</p>) : <p className="small">No applications yet.</p>}<Link className="btn btn-outline-primary btn-sm" href="/careers">Browse careers</Link></section>
      <section className="surface"><h2 className="h5">Saved hospitals</h2>{user.savedHospitals?.length ? user.savedHospitals.map((h) => <p key={h._id} className="small"><Link href={`/hospitals/${h.slug}`}>{h.name}</Link></p>) : <p className="small">No saved hospitals.</p>}<Link className="btn btn-outline-primary btn-sm" href="/hospitals">Find hospitals</Link></section>
      <section className="surface"><h2 className="h5">Recent notifications</h2>{notifications.length ? notifications.slice(0,4).map((n) => <p key={n._id} className="small">{n.title}</p>) : <p className="small">No updates yet.</p>}<Link className="btn btn-outline-primary btn-sm" href="/notifications">Open notifications</Link></section>
      <div><Link href="/profile" className="btn btn-link">Edit profile and security →</Link></div>
    </div>}
  </>;
}
