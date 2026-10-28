"use client";
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
  const review = (id, decision) => action.run(() => post(`/api/admin/provider-approvals/${id}/review`, { decision }), { validate: adminAcknowledgement, success: "Provider review confirmed. Check the resulting account and invitation status in Provider Accounts.", refresh: resource.reload });

  return (
    <AdminGuard title="Provider approvals" subtitle="System Admin review for all healthcare provider categories.">
      <AdminActionFeedback action={action} refresh={resource.reload} />
      <AdminDataState resource={resource} label="provider submissions" emptyMessage="No provider submissions found.">
        {(rows) => <div className="admin-review-list">{rows.map((r) => (
          <article className="admin-review-card" key={r._id}>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2"><h2>{r.name}</h2><span className={`status-pill ${r.status === "approved" ? "tone-success" : r.status === "rejected" ? "tone-danger" : "tone-warning"}`}>{r.status}</span></div>
            {r.status === "pending" && (
              <div className="d-flex gap-2 mt-3">
                <button type="button" className="btn btn-primary" aria-label={`Approve and provision ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "approve")}>Approve and provision</button>
                <button type="button" className="btn btn-outline-primary" aria-label={`Reject ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "reject")}>Reject</button>
              </div>
            )}
          </article>
        ))}</div>}
      </AdminDataState>
    </AdminGuard>
  );
}
