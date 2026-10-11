"use client";
import { useState } from "react";
import { useAdminAccess, useAdminResource, useAdminAction, adminList, adminAcknowledgement } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { productApi, post } from "../../../lib/productApi";
const load = (signal) => productApi("/api/admin/provider-approvals", { signal });
const parse = adminList("providerApplication");
export default function ProviderApprovalsPage() {
  const { allowed } = useAdminAccess();
  const resource = useAdminResource(load, parse, allowed), action = useAdminAction();
  const [loginEmail, setLoginEmail] = useState("");
  const [demo, setDemo] = useState(false);
  const review = (id, decision) => action.run(() => post(`/api/admin/provider-approvals/${id}/review`, { decision, loginEmail, demo }), { validate: adminAcknowledgement, success: "Provider review confirmed. Check the resulting account and invitation status in Provider Accounts.", refresh: resource.reload });
  return <AdminGuard title="Provider approvals" subtitle="System Admin review for all healthcare provider categories."><AdminActionFeedback action={action} refresh={resource.reload} />
    <label htmlFor="approval-login">Provider administrator login email for approval</label><input id="approval-login" type="email" className="w-full rounded border border-[var(--color-border)] p-2" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /><label><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Isolated demo provisioning</label>
    <AdminDataState resource={resource} label="provider submissions" emptyMessage="No provider submissions found.">{(rows) => rows.map((r) => <article className="surface mb-4 p-4" key={r._id}><h2>{r.name}</h2><p>{r.kind} · {r.status}</p><p>{r.address} · {r.contactEmail}</p><p>{r.explanation}</p>{r.status === "pending" && <><button className="rounded bg-[var(--color-primary)] px-4 py-2 text-white" disabled={action.disabled || (!demo && !loginEmail)} onClick={() => review(r._id, "approve")}>Approve and provision</button><button className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled} onClick={() => review(r._id, "reject")}>Reject</button></>}</article>)}</AdminDataState>
  </AdminGuard>;
}
