"use client";
import { useHospitals, freshnessLabel } from "@medreach/core";
import { toneClass, statusPill } from "../../lib/tone";
import AdminGuard from "../../components/AdminGuard";

export default function AdminOverviewPage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });
  const tracked = data.length;
  const recentlyUpdated = data.filter((h) => ["RECENT", "UPDATED_RECENTLY"].includes(freshnessLabel(h.lastUpdated))).length;
  const stale = data.filter((h) => ["STALE", "OUTDATED", "UNKNOWN"].includes(freshnessLabel(h.lastUpdated))).length;
  const pending = data.filter((h) => h.verificationStatus !== "verified").length;

  const cards = [
    { t: "Hospitals tracked", v: tracked, tone: "info" },
    { t: "Recently updated", v: recentlyUpdated, tone: "success" },
    { t: "Stale / unknown", v: stale, tone: "warning" },
    { t: "Verification queue", v: pending, tone: "danger" },
  ];

  return (
    <AdminGuard title="Admin dashboard" subtitle="Overview of tracked hospitals, data freshness, and verification.">
      <div className="flex flex-wrap -mx-1.5">
        {cards.map((c) => (
          <div className="w-1/2 lg:w-1/4 px-1.5 mb-3" key={c.t}>
            <div className="h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">
              <div className="text-3xl font-bold mb-0">{loading ? "—" : c.v}</div>
              <span className={`${statusPill} ${toneClass[c.tone]}`}>{c.t}</span>
            </div>
          </div>
        ))}
      </div>
    </AdminGuard>
  );
}
