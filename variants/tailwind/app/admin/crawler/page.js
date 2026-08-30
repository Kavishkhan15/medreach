"use client";
import { useState, useEffect } from "react";
import { demoCrawlJobs, listCrawlerJobs, relativeTime } from "@medreach/core";
import { toneClass, statusPill, surface } from "../../../lib/tone";
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
      {demo && <div className="rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-3 py-2 mb-3">Demo dataset — not live crawler activity.</div>}
      <div className="flex flex-wrap -mx-1.5 mb-4">
        {cards.map((c) => (
          <div className="w-1/2 lg:w-1/4 px-1.5 mb-3" key={c.t}>
            <div className="h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5"><div className="text-3xl font-bold mb-0">{c.v}</div><span className={`${statusPill} ${toneClass[c.tone]}`}>{c.t}</span></div>
          </div>
        ))}
      </div>
      <div className={surface}>
        <div className="overflow-x-auto">
          <table className="w-full align-middle mb-0 text-left">
            <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">Source</th><th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2 pr-3">Found</th><th scope="col" className="py-2 pr-3">Updated</th><th scope="col" className="py-2 pr-3">Errors</th><th scope="col" className="py-2 pr-3">When</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id} className="border-b border-[var(--color-border)]">
                  <th scope="row" className="py-2 pr-3 font-semibold">{j.source?.name}</th>
                  <td className="py-2 pr-3"><span className={`${statusPill} ${toneClass[STATUS_TONE[j.status] || "neutral"]}`}>{j.status}</span></td>
                  <td className="py-2 pr-3 text-sm">{j.recordsFound}</td>
                  <td className="py-2 pr-3 text-sm">{j.recordsUpdated}</td>
                  <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{(j.errorMessages || []).join("; ") || "—"}</td>
                  <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{relativeTime(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
