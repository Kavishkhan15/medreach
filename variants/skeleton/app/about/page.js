"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { productApi } from "../../lib/productApi";
export default function AboutPage() {
  const [total, setTotal] = useState(null);
  useEffect(() => { productApi("/api/hospitals?limit=1").then((r) => setTotal(r.total)).catch(() => {}); }, []);
  return <>
    <div className="mb-4"><span className="eyebrow">About MedReach</span><h1>Healthcare facts you can inspect</h1><p>MedReach helps people find Mumbai healthcare resources and coordinate requests with connected hospital staff.</p></div>
    <div className="grid-2">
      <section className="surface"><h2 className="h5">Source-backed hospital information</h2><p className="small">{total != null ? `${total} hospitals are currently indexed.` : "Live index count unavailable."} Field and facility evidence is kept by source, page, observed time, confidence and verification state.</p><Link href="/hospitals">Explore hospital evidence →</Link></section>
      <section className="surface"><h2 className="h5">Capability is not availability</h2><p className="small">A website saying it has an ICU does not tell us whether a bed is free right now. Current status appears only from a recent verified observation.</p><Link href="/hospitals">View hospital profiles →</Link></section>
      <section className="surface"><h2 className="h5">Requests are not reservations</h2><p className="small">An emergency bed request is a coordination message. It does not reserve a bed.</p><Link href="/requests/new">Start a request →</Link></section>
      <section className="surface"><h2 className="h5">Independent services</h2><p className="small">Blood banks, diagnostics and ambulance providers are listings. We do not claim current blood inventory or dispatch.</p><Link href="/map">Explore care network →</Link></section>
    </div>
    <div className="alert alert-warning mt-4">In an immediate medical emergency, call 112. MedReach is not an emergency dispatch service.</div>
  </>;
}
