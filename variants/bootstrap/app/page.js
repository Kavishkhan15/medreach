"use client";
import Link from "next/link";
import { useHospitals } from "@medreach/core";
import HospitalList from "../components/HospitalList";

export default function HomePage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });

  return (
    <>
      <section className="emergency-hero mb-4">
        <p className="text-uppercase fw-bold mb-2" style={{ letterSpacing: ".1em", opacity: .9 }}>MedReach</p>
        <h1 className="mb-2">Emergency care. When every second matters.</h1>
        <p className="lead mb-4" style={{ maxWidth: "48ch" }}>
          Find the most relevant emergency hospitals near you in Mumbai, with transparent,
          rule-based ranking — no guesswork, no fabricated availability.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Link href="/emergency" className="btn btn-emergency btn-lg">🚨 Find emergency hospital</Link>
          <Link href="/hospitals" className="btn btn-outline-light btn-lg">View all hospitals</Link>
          <Link href="/map" className="btn btn-outline-light btn-lg">Open map</Link>
        </div>
      </section>

      <section className="mb-4">
        <div className="row g-3">
          {[
            { t: "Transparent ranking", d: "Every result explains why it ranked where it did — specialty match, ER status, distance, data confidence.", i: "🔎" },
            { t: "Honest freshness", d: "We show when each availability was last updated, and say “unknown” rather than guess.", i: "🕒" },
            { t: "Verified sources", d: "Data carries provenance and a verification state. No AI, no fabricated numbers.", i: "✅" },
          ].map((c) => (
            <div className="col-12 col-md-4" key={c.t}>
              <div className="surface h-100">
                <div style={{ fontSize: "1.5rem" }} aria-hidden="true">{c.i}</div>
                <h2 className="h6 mt-2">{c.t}</h2>
                <p className="disclaimer mb-0">{c.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="d-flex align-items-baseline justify-content-between mb-3">
          <h2 className="h5 mb-0">Recently updated hospitals</h2>
          <Link href="/hospitals" className="small">View all →</Link>
        </div>
        <HospitalList hospitals={data.slice(0, 6)} loading={loading} />
      </section>
    </>
  );
}
