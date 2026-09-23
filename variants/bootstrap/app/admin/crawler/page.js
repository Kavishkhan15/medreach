"use client";
import { useState } from "react";
import { useCrawlerAdmin, relativeTime } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";
import EmergencyIcon from "../../../components/EmergencyIcons";

const STATUS_TONE = {
  success: "success", partial: "warning", failed: "danger", blocked: "danger",
  rate_limited: "warning", parsing_error: "danger", queued: "neutral", running: "info",
  healthy: "success", warning: "warning", stale: "warning", error: "danger",
  disabled: "neutral", unknown: "neutral",
};
const fmtDur = (ms) => (ms == null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtFreq = (ms) => (ms == null ? "—" : ms >= 3600000 ? `${Math.round(ms / 3600000)}h` : `${Math.round(ms / 60000)}m`);
const TABS = ["overview", "sources", "jobs", "data quality", "verification", "facility claims", "hospital fields", "data conflicts"];

export default function AdminCrawlerPage() {
  const { overview, sources, jobs, quality, queue, claims, claimsAvailable, conflicts, conflictsAvailable, fieldClaims, fieldConflicts, fieldsAvailable, paused, live, busy, message, refresh, actions } = useCrawlerAdmin();
  const [tab, setTab] = useState("overview");

  const cards = overview ? [
    { t: "Total sources", v: overview.cards.totalSources, tone: "info" },
    { t: "Active", v: overview.cards.activeSources, tone: "success" },
    { t: "Blocked", v: overview.cards.blockedSources, tone: "danger" },
    { t: "Hospitals tracked", v: overview.cards.hospitalsTracked, tone: "info" },
    { t: "Facilities", v: overview.cards.facilitiesTracked, tone: "info" },
    { t: "Observations", v: overview.cards.observations, tone: "neutral" },
    { t: "Successful jobs", v: overview.cards.successfulJobs, tone: "success" },
    { t: "Failed jobs", v: overview.cards.failedJobs, tone: "danger" },
    { t: "Records rejected", v: overview.cards.recordsRejected, tone: "warning" },
    { t: "Parsing anomalies", v: overview.cards.parsingAnomalies, tone: "warning" },
  ] : [];

  return (
    <AdminGuard systemOnly title="Crawler control" subtitle="Source management, jobs, health, and data quality. Infrastructure monitoring — not AI.">
      {!live && <div className="alert alert-warning py-2">Live crawler API unreachable — is the backend running?</div>}
      {message && <div className="alert alert-info py-2">{message}</div>}

      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={actions.runAll}><EmergencyIcon name="play" size={14} className="me-1" /> Run all enabled</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={actions.dryRunAll}>Dry-run all</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={busy || !overview?.system?.schedulerConfigured}
          title={overview?.system?.schedulerConfigured ? "Change the real scheduler state" : "Set CRAWLER_SCHEDULER_ENABLED=true and restart the API"}
          onClick={() => actions.setScheduler(!paused)}>{overview?.system?.schedulerConfigured ? (paused ? "Resume scheduler" : "Pause scheduler") : "Scheduler not configured"}</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={refresh}>Refresh</button>
        {busy && <span className="small text-secondary">Working: {busy}…</span>}
      </div>

      <ul className="nav nav-pills mb-3 flex-wrap gap-1">
        {TABS.map((t) => (
          <li className="nav-item" key={t}><button className={`nav-link ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button></li>
        ))}
      </ul>

      {tab === "overview" && (
        <>
          <div className="row g-3 mb-4">
            {cards.map((c) => (
              <div className="col-6 col-lg-3" key={c.t}>
                <div className="surface h-100"><div className="h2 mb-0">{c.v}</div><span className={`status-pill ${toneClass[c.tone]}`}>{c.t}</span></div>
              </div>
            ))}
          </div>
          {overview && (
            <div className="surface">
              <h2 className="h6">System health</h2>
              <div className="row g-2 small">
                <div className="col-6 col-md-3">Last global crawl<br /><strong>{overview.system.lastGlobalCrawl ? relativeTime(overview.system.lastGlobalCrawl) : "—"}</strong></div>
                <div className="col-6 col-md-3">Success rate<br /><strong>{overview.system.successRate}%</strong></div>
                <div className="col-6 col-md-3">Avg crawl duration<br /><strong>{fmtDur(overview.system.avgCrawlDurationMs)}</strong></div>
                <div className="col-6 col-md-3">Scheduler<br /><strong>{overview.system.schedulerConfigured ? (overview.system.schedulerPaused ? "Paused" : overview.system.scheduler?.running ? "Running" : "Starting") : "Not configured"}</strong></div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "sources" && (
        <div className="surface">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Source</th><th>Type</th><th>Health</th><th>robots</th><th>Freq</th><th>Rate</th><th>Last success</th><th>Next due</th><th>Fails</th><th>Actions</th></tr></thead>
              <tbody>{sources.map((s) => <SourceRow key={s.sourceKey} s={s} busy={busy} actions={actions} />)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "jobs" && (
        <div className="surface">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Source</th><th>Status</th><th>Found</th><th>Updated</th><th>Duration</th><th>Errors</th><th>When</th><th></th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j._id}>
                    <th scope="row" className="fw-semibold small">{j.source?.name || String(j.source)}</th>
                    <td><span className={`status-pill ${toneClass[STATUS_TONE[j.status] || "neutral"]}`}>{j.status}</span></td>
                    <td className="small">{j.recordsFound}</td>
                    <td className="small">{j.recordsUpdated}</td>
                    <td className="small">{fmtDur(j.durationMs)}</td>
                    <td className="small text-secondary" style={{ maxWidth: 240 }}>{(j.errorMessages || []).join("; ") || "—"}</td>
                    <td className="small text-secondary">{relativeTime(j.createdAt)}</td>
                    <td>{j.status !== "success" && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => actions.retryJob(j._id)}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "data quality" && quality && (
        <div className="row g-3">
          <div className="col-md-6"><div className="surface h-100"><h2 className="h6">Confidence</h2>
            {Object.entries(quality.confidence).map(([k, v]) => <div key={k} className="d-flex justify-content-between small border-bottom py-1"><span>{k}</span><strong>{v}</strong></div>)}
          </div></div>
          <div className="col-md-6"><div className="surface h-100"><h2 className="h6">Freshness</h2>
            {Object.entries(quality.freshness).map(([k, v]) => <div key={k} className="d-flex justify-content-between small border-bottom py-1"><span>{k}</span><strong>{v}</strong></div>)}
          </div></div>
          <div className="col-12"><div className="surface"><h2 className="h6">Needs attention</h2>
            <p className="small mb-0">Missing critical fields: <strong>{quality.missingCriticalFields.length}</strong> · Needs verification: <strong>{quality.needsVerification.length}</strong> · Stale: <strong>{quality.staleHospitals.length}</strong></p>
          </div></div>
        </div>
      )}

      {tab === "verification" && (
        <div className="surface">
          <p className="disclaimer">Hospitals awaiting verification (mostly directory-sourced stubs). Approve promotes to verified; reject marks rejected.</p>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Hospital</th><th>Locality</th><th>Sources</th><th>Updated</th><th>Actions</th></tr></thead>
              <tbody>
                {queue.map((h) => (
                  <tr key={h._id}>
                    <th scope="row" className="fw-semibold small">{h.name}</th>
                    <td className="small">{h.locality || h.city || "—"}</td>
                    <td className="small">{h.sourceIds?.length || 0}</td>
                    <td className="small text-secondary">{relativeTime(h.updatedAt)}</td>
                    <td>
                      <button className="btn btn-sm btn-primary me-1" disabled={busy} onClick={() => actions.approve(h._id)}>Approve</button>
                      <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => actions.reject(h._id)}>Reject</button>
                    </td>
                  </tr>
                ))}
                {queue.length === 0 && <tr><td colSpan={5} className="small text-secondary">Nothing awaiting verification.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "facility claims" && (
        <div className="surface table-responsive">
          <p className="disclaimer">Review each source's facility claim. Disagreements remain visible until resolved. System admin access required.</p>
          {!claimsAvailable ? <p>Claim queue unavailable or access denied.</p> : (
            <table className="table align-middle mb-0">
              <thead><tr><th>Hospital</th><th>Facility</th><th>Claim</th><th>Review</th><th>Source</th><th>Actions</th></tr></thead>
              <tbody>
                {claims.map((claim) => <tr key={claim._id}>
                  <td>{claim.hospital?.name || "Unknown hospital"}</td>
                  <td>{claim.facility}</td>
                  <td>{claim.capability}</td>
                  <td>{claim.verificationStatus}</td>
                  <td><strong>{claim.source?.name || "Unknown source"}</strong><br /><span className="small text-secondary">{claim.sourcePageUrl || "No page URL"}</span><details><summary>Evidence</summary><span className="small">{claim.evidenceText || "No excerpt recorded; inspect source page before approval."}</span><br /><span className="small text-secondary">Observed: {claim.observedAt ? new Date(claim.observedAt).toLocaleString() : "unknown"} · Confidence: {claim.confidence || "UNKNOWN"} · Kind: {claim.evidenceKind || "legacy"} · Parser: {claim.parserVersion || "unknown"}</span><ol>{(claim.reviewHistory || []).map((entry, index) => <li key={index}>{entry.decision} by {entry.actor} · {entry.at ? new Date(entry.at).toLocaleString() : "Time unknown"}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ol></details></td>
                  <td><button className="btn btn-sm btn-primary me-1" disabled={busy} onClick={() => actions.reviewClaim(claim._id, "approve")}>Approve</button><button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => actions.reviewClaim(claim._id, "reject")}>Reject</button></td>
                </tr>)}
                {claims.length === 0 && <tr><td colSpan={6}>No facility claims yet. Run an approved source to collect evidence.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "hospital fields" && (
        <section className="surface">
          <h2 className="h6">Hospital identity, contact and specialty evidence</h2>
          <p className="disclaimer">Disagreeing source values remain visible. A reviewed claim can resolve a conflict without deleting the other claims.</p>
          {!fieldsAvailable ? <p>Hospital field evidence unavailable or access denied.</p> : <>
            <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Hospital</th><th>Field</th><th>Value</th><th>Source and evidence</th><th>Review</th><th>Actions</th></tr></thead><tbody>
              {fieldClaims.map((claim) => <tr key={claim._id}><td>{claim.hospital?.name || "Unknown hospital"}</td><td>{claim.field}</td><td>{JSON.stringify(claim.value)}</td><td>{claim.source?.name || "Unknown source"}<br />{claim.sourcePageUrl}<details><summary>Evidence</summary>{claim.evidenceText}<br />{claim.evidenceKind} · {claim.confidence} · {claim.observedAt ? new Date(claim.observedAt).toLocaleString() : "Time unknown"} · parser {claim.parserVersion || "unrecorded"}{claim.sourcePageUrls?.length > 1 && <ul>{claim.sourcePageUrls.map((page) => <li key={page}>{page}</li>)}</ul>}</details></td><td>{claim.verificationStatus}</td><td><button disabled={busy} onClick={() => actions.reviewFieldClaim(claim._id, "approve")}>Approve</button> <button disabled={busy} onClick={() => actions.reviewFieldClaim(claim._id, "reject")}>Reject</button></td></tr>)}
              {fieldClaims.length === 0 && <tr><td colSpan={6}>No hospital field claims yet.</td></tr>}
            </tbody></table></div>
            <h2 className="h6">Field conflicts and resolution history</h2>
            {fieldConflicts.map((conflict) => <section key={conflict._id}><h3 className="h6">{conflict.hospital?.name} · {conflict.field} · {conflict.status}</h3><ul>{(conflict.claims || []).map((claim) => <li key={claim._id}>{claim.source?.name}: {JSON.stringify(claim.value)} ({claim.verificationStatus}) · {claim.sourcePageUrl}</li>)}</ul><details><summary>History</summary><ol>{(conflict.history || []).map((entry, index) => <li key={index}>{entry.status} · {entry.at ? new Date(entry.at).toLocaleString() : "Time unknown"} · {entry.actor || "system"}</li>)}</ol></details></section>)}
          </>}
        </section>
      )}
      {tab === "data conflicts" && (
        <div className="surface">
          <p className="disclaimer">Source disagreements remain visible after review. A resolved capability does not indicate current availability.</p>
          {!conflictsAvailable ? <p>Conflict center unavailable or access denied.</p> : conflicts.length === 0 ? <p>No recorded facility conflicts.</p> : conflicts.map((conflict) => (
            <section key={conflict._id} className="border-bottom py-3">
              <h2 className="h6">{conflict.hospital?.name || "Unknown hospital"} · {conflict.facility}</h2>
              <p className="small">Status: <strong>{conflict.status}</strong> · Resolved capability: {conflict.resolvedValue} · Decisions: {conflict.history?.length || 0}</p>
              <ul>{(conflict.claims || []).map((claim) => <li key={claim._id} className="mb-2 small"><strong>{claim.source?.name || "Unknown source"}: {claim.capability}</strong> ({claim.verificationStatus})<br />{claim.evidenceText || "No excerpt recorded"}<br /><span className="text-secondary">{claim.sourcePageUrl || "No page URL"} · {claim.observedAt ? relativeTime(claim.observedAt) : "Time unknown"}</span></li>)}</ul>
              <details><summary>Resolution history</summary><ol>{(conflict.history || []).map((entry, index) => <li key={index}>{entry.status} · {entry.value} · {entry.method || "review needed"} · {entry.at ? new Date(entry.at).toLocaleString() : "Time unknown"} · Reviewer: {entry.actor || "system"}</li>)}</ol></details>
            </section>
          ))}
        </div>
      )}
    </AdminGuard>
  );
}

function SourceRow({ s, busy, actions }) {
  const [freq, setFreq] = useState(Math.round((s.crawlFrequencyMs || 0) / 60000));
  const [edit, setEdit] = useState(false);
  return (
    <tr>
      <th scope="row" className="fw-semibold small">{s.name}<br /><span className="text-secondary">{s.sourceKey}</span></th>
      <td className="small">{s.sourceType}</td>
      <td><span className={`status-pill ${toneClass[STATUS_TONE[s.healthStatus] || "neutral"]}`}>{s.healthStatus || "unknown"}</span></td>
      <td className="small text-secondary">{s.robotsStatus}</td>
      <td className="small">{edit ? <input type="number" className="form-control form-control-sm" style={{ width: 70 }} value={freq} onChange={(e) => setFreq(e.target.value)} /> : fmtFreq(s.crawlFrequencyMs)}</td>
      <td className="small">{s.rateLimitMs ? `${Math.round(s.rateLimitMs / 1000)}s` : "—"}</td>
      <td className="small text-secondary">{s.lastSuccessfulCrawl ? relativeTime(s.lastSuccessfulCrawl) : "never"}</td>
      <td className="small text-secondary">{s.nextRun ? new Date(s.nextRun) <= new Date() ? "due now" : new Date(s.nextRun).toLocaleString() : s.healthStatus === "blocked" ? "blocked" : "—"}</td>
      <td className="small">{s.failureCount || 0}</td>
      <td>
        <div className="d-flex flex-wrap gap-1">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => actions.runSource(s._id, s.sourceKey)}>Run</button>
          <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => actions.dryRunSource(s._id, s.sourceKey)}>Dry</button>
          <button className={`btn btn-sm ${s.enabled ? "btn-outline-secondary" : "btn-success"}`} disabled={busy} onClick={() => actions.toggleSource(s.sourceKey, s.enabled)}>{s.enabled ? "Disable" : "Enable"}</button>
          {edit
            ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => { await actions.setFrequency(s.sourceKey, freq); setEdit(false); }}>Save</button>
            : <button className="btn btn-sm btn-outline-secondary" onClick={() => setEdit(true)}>Freq</button>}
          <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => actions.resetSource(s.sourceKey)}>Reset</button>
        </div>
      </td>
    </tr>
  );
}
