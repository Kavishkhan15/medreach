"use client";
import { useState, useEffect } from "react";
import { demoSources, listSources, relativeTime } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminSourcesPage() {
  const [sources, setSources] = useState(demoSources);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    listSources().then((r) => { setSources(r.data); setDemo(false); }).catch(() => { setSources(demoSources); setDemo(true); });
  }, []);

  return (
    <AdminGuard title="Data sources" subtitle="Approved registry the crawler is allowed to fetch. APIs and authorized feeds are preferred.">
      {demo && <div className="alert alert-warning py-2">Demo dataset — not live source registry.</div>}
      <div className="surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead><tr><th scope="col">Source</th><th scope="col">Type</th><th scope="col">Reliability</th><th scope="col">Enabled</th><th scope="col">Last success</th><th scope="col">Last failure</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s._id}>
                  <th scope="row" className="fw-semibold">{s.name}</th>
                  <td className="small">{s.type}</td>
                  <td className="small">{Math.round((s.reliability ?? 0) * 100)}%</td>
                  <td><span className={`status-pill ${s.enabled ? toneClass.success : toneClass.neutral}`}>{s.enabled ? <><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><polyline points="20 6 9 17 4 12"/></svg>Enabled</> : "Disabled"}</span></td>
                  <td className="small text-secondary">{s.lastSuccessfulFetch ? relativeTime(s.lastSuccessfulFetch) : "—"}</td>
                  <td className="small text-secondary">{s.lastFailedFetch ? relativeTime(s.lastFailedFetch) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
