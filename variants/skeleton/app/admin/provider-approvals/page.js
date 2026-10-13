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
        {(rows) => rows.map((r) => (
          <article className="surface mb-3" key={r._id}>
            <h2>{r.name}</h2>
            <p><span className="status-pill">{r.status}</span></p>
            {r.status === "pending" && (
              <div className="button-group" style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button type="button" className="btn btn-primary" aria-label={`Approve and provision ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "approve")}>Approve and provision</button>
                <button type="button" className="btn btn-outline-secondary" aria-label={`Reject ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "reject")}>Reject</button>
              </div>
            )}
          </article>
        ))}
      </AdminDataState>
    </AdminGuard>
  );
}
