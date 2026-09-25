"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";
export default function AboutPage() {
  const [total, setTotal] = useState(null);
  useEffect(() => { productApi("/api/hospitals?limit=1").then((r) => setTotal(r.total)).catch(() => {}); }, []);
  return <>
    <div className="mb-6"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">About MedReach</span><h1 className="text-2xl font-bold mt-1">Healthcare facts you can inspect</h1><p className="text-gray-600 mt-2">MedReach helps people find Mumbai healthcare resources and coordinate requests with connected hospital staff.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 h-full"><h2 className="text-lg font-bold mb-2">Source-backed hospital information</h2><p className="text-sm text-gray-600 mb-3">Hospitals come from approved official websites and government directories. {total != null ? `${total} hospitals are currently indexed.` : "Live index count unavailable."} Field and facility evidence is kept by source, page, observed time, confidence and verification state.</p><Link href="/hospitals" className="text-[var(--color-emergency)] text-sm font-semibold">Explore hospital evidence →</Link></section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 h-full"><h2 className="text-lg font-bold mb-2">Capability is not availability</h2><p className="text-sm text-gray-600 mb-3">A website saying it has an ICU does not tell us whether a bed is free right now. Current status appears only from a recent verified observation. Unknown remains unknown; older default bed counts are never shown as live.</p><Link href="/hospitals" className="text-[var(--color-emergency)] text-sm font-semibold">View hospital profiles →</Link></section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 h-full"><h2 className="text-lg font-bold mb-2">Requests are not reservations</h2><p className="text-sm text-gray-600 mb-3">An emergency bed request is a coordination message. It does not reserve a bed. If the hospital has no connected MedReach staff, the request screen says so and asks you to call directly.</p><Link href="/requests/new" className="text-[var(--color-emergency)] text-sm font-semibold">Start a request →</Link></section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 h-full"><h2 className="text-lg font-bold mb-2">Independent services</h2><p className="text-sm text-gray-600 mb-3">Blood banks, diagnostics and ambulance providers are listings. We do not claim current blood inventory, diagnostic slots, or ambulance dispatch without a verified current integration. Demo entries are labeled.</p><Link href="/map" className="text-[var(--color-emergency)] text-sm font-semibold">Explore care network →</Link></section>
    </div>
    <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md p-4 mt-6 text-sm">In an immediate medical emergency, call 112. MedReach is not an emergency dispatch service.</div>
  </>;
}
