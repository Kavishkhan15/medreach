"use client";
import Link from "next/link";
import { useHospitals } from "@medreach/core";
import HospitalList from "../components/HospitalList";
import LiveFeatureIcon from "../components/LiveFeatureIcon";

export default function HomePage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });

  return (
    <>
      <section className="rounded-[var(--radius-lg)] p-[clamp(1.5rem,4vw,3rem)] text-white shadow-[var(--shadow-lg)] relative overflow-hidden mb-4 bg-[linear-gradient(135deg,var(--color-critical),var(--color-emergency)_70%)]">
        <p className="uppercase font-bold mb-2" style={{ letterSpacing: ".1em", opacity: .9 }}>MedReach</p>
        <h1 className="text-white text-[clamp(1.75rem,5vw,2.75rem)] mb-2">Emergency care. When every second matters.</h1>
        <p className="text-[rgba(255,255,255,.92)] text-lg mb-4" style={{ maxWidth: "48ch" }}>
          Find the most relevant emergency hospitals near you in Mumbai, with transparent,
          rule-based ranking — no guesswork, no fabricated availability.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/emergency" className="inline-flex items-center justify-center bg-white text-[var(--color-critical)] font-extrabold rounded-[var(--radius)] px-[1.4rem] py-[.9rem] text-lg shadow-[var(--shadow-md)] hover:bg-[#fff5f5] no-underline"><svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Find emergency hospital</Link>
          <Link href="/hospitals" className="inline-flex items-center justify-center border border-white text-white font-semibold rounded-[var(--radius)] px-[1.4rem] py-[.9rem] text-lg hover:bg-white/10 no-underline">View all hospitals</Link>
          <Link href="/map" className="inline-flex items-center justify-center border border-white text-white font-semibold rounded-[var(--radius)] px-[1.4rem] py-[.9rem] text-lg hover:bg-white/10 no-underline">Open map</Link>
        </div>
      </section>

      <section className="mb-4">
        <div className="flex flex-wrap -mx-1.5">
          {[
            { t: "Transparent ranking", d: "Every result explains why it ranked where it did — specialty match, ER status, distance, data confidence.", icon: "radar" },
            { t: "Honest freshness", d: "We show when each availability was last updated, and say “unknown” rather than guess.", icon: "clock" },
            { t: "Verified sources", d: "Data carries provenance and a verification state. No AI, no fabricated numbers.", icon: "verified" },
          ].map((c) => (
            <div className="w-full md:w-1/3 px-1.5 mb-3" key={c.t}>
              <div className="h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">
                <LiveFeatureIcon name={c.icon} label={c.t} />
                <h2 className="text-base mt-2">{c.t}</h2>
                <p className="text-[.78rem] text-[var(--color-muted)] mb-0">{c.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg mb-0">Recently updated hospitals</h2>
          <Link href="/hospitals" className="text-sm text-[var(--color-emergency-dark)]">View all →</Link>
        </div>
        <HospitalList hospitals={data.slice(0, 6)} loading={loading} />
      </section>
    </>
  );
}
