"use client";
import { useHospitals, freshnessLabel } from "@medreach/core";
import { toneClass } from "../../lib/tone";
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
      <div className="grid-stats">
        {cards.map((c) => (
          <div key={c.t}>
            <div className="surface h-100">
              <div className="h2 mb-0">{loading ? "—" : c.v}</div>
              <span className={`status-pill ${toneClass[c.tone]}`}>{c.t}</span>
            </div>
          </div>
        ))}
      </div>
    </AdminGuard>
  );
}
