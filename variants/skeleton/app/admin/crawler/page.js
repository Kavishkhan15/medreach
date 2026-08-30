"use client";
import { useState, useEffect } from "react";
import { demoCrawlJobs, listCrawlerJobs, relativeTime } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

const STATUS_TONE = {
  success: "success", partial: "warning", failed: "danger", blocked: "danger",
  rate_limited: "warning", parsing_error: "danger", queued: "neutral", running: "info",
};

export default function AdminCrawlerPage() {
  const [jobs, setJobs] = useState(demoCrawlJobs);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    listCrawlerJobs().then((r) => { setJobs(r.data); setDemo(false); }).catch(() => { setJobs(demoCrawlJobs); setDemo(true); });
  }, []);

  const stat = (s) => jobs.filter((j) => j.status === s).length;
  const cards = [
    { t: "Total jobs", v: jobs.length, tone: "info" },
    { t: "Successful", v: stat("success"), tone: "success" },
    { t: "Failed / blocked", v: stat("failed") + stat("blocked"), tone: "danger" },
    { t: "Parsing errors", v: stat("parsing_error"), tone: "warning" },
  ];

  return (
    <AdminGuard title="Crawler" subtitle="Crawl jobs, outcomes, and data confidence. Infrastructure monitoring — not AI.">
      {demo && <div className="alert alert-warning py-2">Demo dataset — not live crawler activity.</div>}
      <div className="grid-stats mb-4">
        {cards.map((c) => (
          <div key={c.t}>
            <div className="surface h-100"><div className="h2 mb-0">{c.v}</div><span className={`status-pill ${toneClass[c.tone]}`}>{c.t}</span></div>
          </div>
        ))}
      </div>
      <div className="surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Found</th><th scope="col">Updated</th><th scope="col">Errors</th><th scope="col">When</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id}>
                  <th scope="row" className="fw-semibold">{j.source?.name}</th>
                  <td><span className={`status-pill ${toneClass[STATUS_TONE[j.status] || "neutral"]}`}>{j.status}</span></td>
                  <td className="small">{j.recordsFound}</td>
                  <td className="small">{j.recordsUpdated}</td>
                  <td className="small text-secondary">{(j.errorMessages || []).join("; ") || "—"}</td>
                  <td className="small text-secondary">{relativeTime(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
