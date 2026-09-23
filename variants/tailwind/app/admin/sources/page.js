"use client";
import { useState, useEffect } from "react";
import { demoSources, listSources, relativeTime } from "@medreach/core";
import { toneClass, statusPill, surface } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminSourcesPage() {
  const [sources, setSources] = useState(demoSources);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    listSources().then((r) => { setSources(r.data); setDemo(false); }).catch(() => { setSources(demoSources); setDemo(true); });
  }, []);

  return (
    <AdminGuard title="Data sources" subtitle="Approved registry the crawler is allowed to fetch. APIs and authorized feeds are preferred.">
      {demo && <div className="rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-3 py-2 mb-3">Demo dataset — not live source registry.</div>}
      <div className={surface}>
        <div className="overflow-x-auto">
          <table className="w-full align-middle mb-0 text-left">
            <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">Source</th><th scope="col" className="py-2 pr-3">Type</th><th scope="col" className="py-2 pr-3">Reliability</th><th scope="col" className="py-2 pr-3">Enabled</th><th scope="col" className="py-2 pr-3">Last success</th><th scope="col" className="py-2 pr-3">Last failure</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s._id} className="border-b border-[var(--color-border)]">
                  <th scope="row" className="py-2 pr-3 font-semibold">{s.name}</th>
                  <td className="py-2 pr-3 text-sm">{s.type}</td>
                  <td className="py-2 pr-3 text-sm">{Math.round((s.reliability ?? 0) * 100)}%</td>
                  <td className="py-2 pr-3"><span className={`${statusPill} ${s.enabled ? toneClass.success : toneClass.neutral}`}>{s.enabled ? <><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><polyline points="20 6 9 17 4 12"/></svg>Enabled</> : "Disabled"}</span></td>
                  <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{s.lastSuccessfulFetch ? relativeTime(s.lastSuccessfulFetch) : "—"}</td>
                  <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{s.lastFailedFetch ? relativeTime(s.lastFailedFetch) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
