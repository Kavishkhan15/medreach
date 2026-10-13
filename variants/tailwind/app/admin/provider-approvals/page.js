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
          <article className="surface mb-4 p-4" key={r._id}>
            <h2 className="text-xl font-bold">{r.name}</h2>
            <p className="my-2"><span className="text-xs px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold uppercase">{r.status}</span></p>
            {r.status === "pending" && (
              <div className="flex gap-2 mt-3">
                <button type="button" className="rounded bg-emergency px-4 py-2 text-white font-medium hover:bg-emergency-dark disabled:opacity-50" aria-label={`Approve and provision ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "approve")}>Approve and provision</button>
                <button type="button" className="rounded border border-[var(--color-border)] px-3 py-2 font-medium disabled:opacity-50" aria-label={`Reject ${r.name}`} disabled={action.disabled} onClick={() => review(r._id, "reject")}>Reject</button>
              </div>
            )}
          </article>
        ))}
      </AdminDataState>
    </AdminGuard>
  );
}
