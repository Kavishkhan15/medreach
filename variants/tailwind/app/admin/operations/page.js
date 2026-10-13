"use client";
import { useState } from "react";
import { useAdminAccess, useAdminResource, useAdminAction, adminList, adminAnalyticsData,
  adminRefinementData, adminEntity, adminRefinementResult } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { productApi, post } from "../../../lib/productApi";

const read = (path) => (signal) => productApi(path, { signal });
const loadAnalytics = read("/api/analytics/overview");
const loadProviderAccounts = read("/api/admin/provider-accounts");
const loadOwnership = read("/api/admin/ownership-claims");
const loadJobs = read("/api/jobs/manage");
const loadRequests = read("/api/emergency-requests");
const loadRefinement = read("/api/admin/refinement/status");
const loadCandidates = read("/api/admin/refinement/candidates");
const loadClaims = read("/api/admin/facility-claims");
const parseProviderAccounts = adminList("providerAccount");
const parseOwnership = adminList("ownership"), parseJobs = adminList("job"), parseRequests = adminList("request"), parseCandidates = adminList("candidate"), parseClaims = adminList("claim");
const pendingOwnership = (r) => parseOwnership(r).filter((c) => c.status === "pending");
const pendingJobs = (r) => parseJobs(r).filter((j) => j.status === "pending");
const sourceClaims = (r) => parseClaims(r).filter((c) => c.evidenceKind === "source_excerpt");
const initialProvider = { kind: "blood_bank", name: "", sourceName: "Manual admin entry", locality: "", phone: "", services: "", demo: false };

export default function Operations() {
  const { allowed } = useAdminAccess();
  const analytics = useAdminResource(loadAnalytics, adminAnalyticsData, allowed);
  const providerAccounts = useAdminResource(loadProviderAccounts, parseProviderAccounts, allowed);
  const ownership = useAdminResource(loadOwnership, pendingOwnership, allowed);
  const jobs = useAdminResource(loadJobs, pendingJobs, allowed);
  const requests = useAdminResource(loadRequests, parseRequests, allowed);
  const refinement = useAdminResource(loadRefinement, adminRefinementData, allowed);
  const candidates = useAdminResource(loadCandidates, parseCandidates, allowed);
  const claims = useAdminResource(loadClaims, sourceClaims, allowed);
  const action = useAdminAction();
  const [provider, setProvider] = useState(initialProvider);
  const [selectedClaim, setSelectedClaim] = useState("");
  const act = (path, body, key, refresh, success = "Action confirmed.") => action.run(() => post(path, body), { validate: adminEntity(key), refresh, success });
  const refreshJobs = async () => (await Promise.all([jobs.reload(), analytics.reload()])).every(Boolean);
  const review = (path, decision, key, refresh) => {
    const note = window.prompt(`Record the reason to ${decision} (at least 5 characters):`);
    if (note?.trim().length >= 5) act(path, { decision, note: note.trim() }, key, refresh);
  };
  const addProvider = async (e) => {
    e.preventDefault();
    const result = await act("/api/admin/resources", { ...provider, services: provider.services.split(",").map((s) => s.trim()).filter(Boolean) }, "data", analytics.reload, "Provider creation confirmed.");
    if (result) setProvider(initialProvider);
  };
  return <AdminGuard title="Operations & analytics" subtitle="Database counts, ownership review, job moderation and resource onboarding.">
    <AdminActionFeedback action={action} />
    <section aria-label="Provider account availability"><h2>Provider accounts</h2><AdminDataState resource={providerAccounts} label="provider accounts" emptyMessage="No Provider Admin accounts provisioned.">{(accounts) => <p>{accounts.length} provider accounts available for assignment. <a href="/admin/provider-accounts">Manage provider accounts</a></p>}</AdminDataState></section>
    <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4" aria-label="Operational analytics"><h2>Operational analytics</h2><AdminDataState resource={analytics} label="analytics">{(a) => <>
      <dl>{[["Hospitals", a.hospitals.total], ["Open conflicts", a.conflicts.facility + a.conflicts.field], ["Listed resources", a.resources.reduce((n, r) => n + r.count, 0)]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
      {[["Requests", a.emergencyRequests], ["Jobs", a.jobs], ["Applications", a.applications]].map(([label, rows]) => <p key={label}><strong>{label}: </strong>{rows.length ? rows.map((r) => `${r._id || "Unknown"}: ${r.count}`).join(" · ") : "No recorded activity."}</p>)}
    </>}</AdminDataState></section>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="min-w-0">
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4" aria-label="Hospital ownership requests"><h2>Hospital ownership requests</h2><AdminDataState resource={ownership} label="ownership requests" emptyMessage="No pending requests.">{(data) => data.map((c) => <div className="border-t border-[var(--color-border)] py-3" key={c._id}><strong>{c.hospital.name}</strong><p>{c.requester?.name || "Requester unavailable"} · {c.hospitalEmail} · {c.officialDomain || "No domain supplied"}</p><p>{c.explanation || "No explanation"}</p>
        <form onSubmit={(event) => { event.preventDefault(); const fields = new globalThis.FormData(event.currentTarget); action.run(() => productApi(`/api/admin/ownership-claims/${c._id}/review`, { method: "POST", body: { decision: "approve", providerAccountId: fields.get("providerAccountId") } }), { validate: adminEntity("claim"), success: "Ownership approval confirmed", refresh: ownership.reload }); }}>
          <label htmlFor={`claim-account-${c._id}`}>Provider Admin account for {c.hospital.name}</label>
          <select id={`claim-account-${c._id}`} name="providerAccountId" required disabled={action.disabled || providerAccounts.status !== "success"}>
            <option value="">Choose the authorised representative</option>
            {(providerAccounts.status === "success" ? providerAccounts.data : []).filter((account) => account.accountStatus === "active").map((account) => <option key={account._id} value={account._id}>{account.name} · {account.email}</option>)}
          </select><button disabled={action.disabled || providerAccounts.status !== "success"}>Approve assigned account</button>
        </form>{["reject"].map((decision) => <button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50" disabled={action.disabled} key={decision} onClick={() => review(`/api/admin/ownership-claims/${c._id}/review`, decision, "claim", ownership.reload)}>{decision === "approve" ? "Approve" : "Reject"}</button>)}</div>)}</AdminDataState></section>
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4" aria-label="Job moderation"><h2>Job moderation</h2><AdminDataState resource={jobs} label="job moderation" emptyMessage="No pending jobs.">{(data) => data.map((j) => <div key={j._id} className="border-t border-[var(--color-border)] py-3"><strong>{j.title}</strong><p>{j.hospital?.name || j.provider?.name || "Organization unavailable"} · {j.category}</p><p>{j.description}</p><button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50" disabled={action.disabled} onClick={() => act(`/api/jobs/${j._id}/status`, { status: "published" }, "job", refreshJobs, "Job publication confirmed.")}>Publish</button><button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50" disabled={action.disabled} onClick={() => act(`/api/jobs/${j._id}/status`, { status: "rejected" }, "job", refreshJobs, "Job rejection confirmed.")}>Reject</button></div>)}</AdminDataState></section>
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4" aria-label="Emergency request outcomes"><h2>Emergency request outcomes</h2><p>No patient summaries are shown in this overview.</p><AdminDataState resource={requests} label="request outcomes" emptyMessage="No requests yet.">{(data) => data.map((r) => <p className="border-t border-[var(--color-border)] py-3" key={r._id}>{r.requestId} · {r.hospital?.name || "Hospital unavailable"} · <strong>{r.status}</strong></p>)}</AdminDataState></section>
    </div><div className="min-w-0">
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4"><h2>Add source-backed resource</h2><p>Enter information confirmed by the cited source. Live inventory and dispatch are never inferred.</p>
        <form onSubmit={addProvider}><fieldset disabled={action.disabled}>
          <label htmlFor="resource-kind">Resource type</label><select id="resource-kind" className="w-full rounded border border-[var(--color-border)] px-3 py-2" value={provider.kind} onChange={(e) => setProvider({ ...provider, kind: e.target.value })}><option value="blood_bank">Blood bank</option><option value="diagnostic">Diagnostic center</option><option value="ambulance">Ambulance</option></select>
          {[["name", "Provider name"], ["sourceName", "Source name"], ["locality", "Locality"], ["phone", "Phone"], ["services", "Services, comma-separated"]].map(([field, label]) => <div key={field}><label htmlFor={`resource-${field}`}>{label}</label><input id={`resource-${field}`} className="w-full rounded border border-[var(--color-border)] px-3 py-2" required={["name", "sourceName"].includes(field)} value={provider[field]} onChange={(e) => setProvider({ ...provider, [field]: e.target.value })} /></div>)}
          <label><input type="checkbox" checked={provider.demo} onChange={(e) => setProvider({ ...provider, demo: e.target.checked })} /> Demo record</label><button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50">Add provider</button>
        </fieldset></form>
        {action.uncertain && <a href={provider.kind === "blood_bank" ? "/blood-banks" : provider.kind === "diagnostic" ? "/diagnostics" : "/ambulances"}>Open provider directory to verify the result</a>}
      </section>
    </div></div>
    <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-4"><h2>Optional evidence refinement</h2><p>Suggestions require human review. Reviewing a suggestion does not change canonical hospital facts.</p>
      <AdminDataState resource={refinement} label="refinement configuration">{(data) => <p>{data.configured ? `Configured · ${data.model}` : "Not configured. Stored evidence remains available."}</p>}</AdminDataState>
      <section aria-label="Source evidence"><h3>Source evidence</h3><AdminDataState resource={claims} label="source evidence" emptyMessage="No source excerpts available.">{(data) => <><label htmlFor="refine-claim">Source excerpt to refine</label><select id="refine-claim" className="w-full rounded border border-[var(--color-border)] px-3 py-2" value={selectedClaim} onChange={(e) => setSelectedClaim(e.target.value)}><option value="">Select claim</option>{data.map((c) => <option key={c._id} value={c._id}>{c.hospital?.name || "Hospital"} · {c.facility}</option>)}</select>
        <button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50" disabled={action.disabled || !selectedClaim || !data.some((c) => c._id === selectedClaim) || refinement.status !== "success" || !refinement.data.configured} onClick={() => action.run(() => post(`/api/admin/refinement/claims/${selectedClaim}`, {}), { validate: adminRefinementResult, success: "Evidence refinement response confirmed.", refresh: candidates.reload })}>Generate evidence suggestions</button></>}</AdminDataState></section>
      <section aria-label="Refinement suggestions"><h3>Refinement suggestions</h3><AdminDataState resource={candidates} label="refinement suggestions" emptyMessage="No refinement suggestions.">{(data) => data.map((c) => <div className="border-t border-[var(--color-border)] py-3" key={c._id}><strong>{c.hospital?.name || "Hospital"}: {c.facility} = {c.candidateCapability}</strong><p>Status: {c.status}</p><p>Evidence: “{c.evidenceExcerpt}”</p><p>Source: {c.source?.name || "Unknown"} · {/^https?:\/\//i.test(c.sourcePageUrl || "") && <a href={c.sourcePageUrl} target="_blank" rel="noopener noreferrer">Source page</a>} · Model: {c.model}</p>{c.status === "pending" && ["approve", "reject"].map((decision) => <button className="rounded border border-[var(--color-border)] px-3 py-2 mr-2 disabled:opacity-50" disabled={action.disabled} key={decision} onClick={() => review(`/api/admin/refinement/candidates/${c._id}/review`, decision, "candidate", candidates.reload)}>{decision}</button>)}</div>)}</AdminDataState></section>
    </section>
  </AdminGuard>;
}
