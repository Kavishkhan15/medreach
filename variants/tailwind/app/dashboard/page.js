"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Dashboard() {
  const [user, setUser] = useState(null); const [requests, setRequests] = useState([]); const [apps, setApps] = useState([]); const [error, setError] = useState("");
  useEffect(() => { Promise.all([productApi("/api/auth/me"), productApi("/api/emergency-requests"), productApi("/api/applications/mine")])
    .then(([u, r, a]) => { setUser(u.user); setRequests(r.data || []); setApps(a.data || []); }).catch((e) => setError(e.message)); }, []);
  return <>
    <div className="mb-6"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">Your MedReach</span><h1 className="text-2xl font-bold mt-1">{user ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}</h1><p className="text-gray-600 mt-2">Quick access to your requests, applications, saved hospitals.</p></div>
    {error && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md p-3 text-sm mb-4">{error} · <Link href="/login" className="underline">Sign in</Link></div>}
    {!user && !error && <p role="status" className="text-gray-500">Loading dashboard…</p>}
    {user && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5"><h2 className="text-lg font-bold mb-2">Emergency requests</h2>{requests.length ? requests.slice(0,4).map((r) => <p key={r._id} className="text-sm mb-1"><Link href={`/requests/${r._id}`} className="text-[var(--color-emergency)] font-semibold">{r.requestId}</Link> · {r.status}</p>) : <p className="text-sm text-gray-500">No requests yet.</p>}<Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/requests">View requests</Link></section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5"><h2 className="text-lg font-bold mb-2">Applications</h2>{apps.length ? apps.slice(0,4).map((a) => <p key={a._id} className="text-sm mb-1">{a.job?.title || a.hospital?.name || a.provider?.name || a.roleInterested || "Role"} · {a.status}</p>) : <p className="text-sm text-gray-500">No applications yet.</p>}<Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/careers">Browse careers</Link></section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5"><h2 className="text-lg font-bold mb-2">Saved hospitals</h2>{user.savedHospitals?.length ? user.savedHospitals.map((h) => <p key={h._id} className="text-sm mb-1"><Link href={`/hospitals/${h.slug}`} className="text-[var(--color-emergency)]">{h.name}</Link></p>) : <p className="text-sm text-gray-500">No saved hospitals.</p>}<Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/hospitals">Find hospitals</Link></section>
      <div className="col-span-full"><Link href="/profile" className="text-[var(--color-emergency)] text-sm font-semibold">Edit profile and security →</Link></div>
    </div>}
  </>;
}
