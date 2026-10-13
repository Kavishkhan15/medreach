"use client";
import { useState } from "react";
import { useAdminAccess, useAdminResource, useAdminAction, adminList, adminAcknowledgement } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { productApi, post, patch } from "../../../lib/productApi";
const loadAccounts = (signal) => productApi("/api/admin/provider-accounts", { signal });
const loadOrganizations = (signal) => productApi("/api/admin/provider-approvals/organizations", { signal });
const parseAccounts = adminList("providerAccount"), parseOrganizations = adminList("organization");
export default function ProviderAccountsPage() {
  const { allowed } = useAdminAccess();
  const accounts = useAdminResource(loadAccounts, parseAccounts, allowed);
  const organizations = useAdminResource(loadOrganizations, parseOrganizations, allowed);
  const action = useAdminAction();
  const [organizationId, setOrganizationId] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [demo, setDemo] = useState(false);
  const [target, setTarget] = useState("");
  const current = organizations.data?.find((r) => r._id === organizationId);
  const run = (perform, success = "Action confirmed. Check the account and delivery status.") => action.run(perform, { validate: adminAcknowledgement, success, refresh: accounts.reload });
  const provision = () => current && run(() => post("/api/admin/provider-accounts", { kind: current.kind, organizationId, loginEmail, notificationEmail, demo }), "Account provisioning confirmed. Invitation delivery is separate from activation.");
  return <AdminGuard title="Provider Accounts" subtitle="Explicit accounts and assignments for approved healthcare organisations.">
    <AdminActionFeedback action={action} refresh={accounts.reload} />
    <section className="surface mb-4 p-4"><h2>Provision or assign an account</h2><AdminDataState resource={organizations} label="organisations" emptyMessage="No organisations available.">{(rows) => <form onSubmit={(e) => { e.preventDefault(); provision(); }}>
      <div className="grid gap-4 md:grid-cols-2"><div className="min-w-0"><label htmlFor="provider-organization">Organisation</label><select id="provider-organization" className="w-full rounded border border-[var(--color-border)] p-2" required value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}><option value="">Select organisation</option>{rows.map((r) => <option key={r._id} value={r._id}>{r.name} · {r.kind}</option>)}</select></div>
      <div className="min-w-0"><label htmlFor="provider-login">Login email</label><input id="provider-login" type="email" className="w-full rounded border border-[var(--color-border)] p-2" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required={!demo} /></div>
      <div className="min-w-0"><label htmlFor="provider-contact">Real notification / invitation email</label><input id="provider-contact" type="email" className="w-full rounded border border-[var(--color-border)] p-2" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} required={!demo} /></div></div>
      <label><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Isolated demo account (server-enforced; outbound email must be disabled)</label>
      <p className="text-[var(--color-muted)]">Approval, account activation and email delivery are separate. Existing credentials are never overwritten.</p>
      {current && (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus)) && <button type="button" className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled} onClick={() => action.run(() => post(`/api/admin/provider-approvals/organizations/${current.kind}/${current._id}/approve`, {}), { validate: adminAcknowledgement, success: "Organisation approval confirmed. Provision its administrator account next.", refresh: organizations.reload })}>Approve selected organisation</button>}
      <button className="rounded bg-[var(--color-primary)] px-4 py-2 text-white" disabled={action.disabled || !current || (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus))}>Create Provider Admin account</button>
      <label htmlFor="assignment-account">Existing Provider Admin account</label><select id="assignment-account" className="w-full rounded border border-[var(--color-border)] p-2" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Select account for additional assignment</option>{accounts.data?.map((a) => <option key={a._id} value={a._id}>{a.email}</option>)}</select>
      <button type="button" className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled || !target || !current || (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus))} onClick={() => run(() => post(`/api/admin/provider-accounts/${target}/assignments`, { kind: current.kind, organizationId }), "Assignment recorded. Existing assignments were preserved.")}>Assign selected organisation</button>
    </form>}</AdminDataState></section>
    <section className="surface mb-4 p-4"><h2>Provider administrator accounts</h2><AdminDataState resource={accounts} label="provider accounts" emptyMessage="No Provider Admin accounts found.">{(rows) => rows.map((a) => <article key={a._id} className="surface mb-4 p-4"><h3>{a.name}</h3><p>Login: {a.email} · Status: {a.accountStatus}</p><p>{a.credentialLabel}</p><p>Activation email: {a.invitationStatus}</p><p>Notification contact: {a.notificationEmail || "Not configured"} · {a.notificationContactVerified ? "Verified" : "Verification pending"} · {a.notificationsEnabled ? "Enabled" : "Disabled"}</p>
      <ul>{a.organizations.map((o) => <li key={o._id}>{o.name} · {o.kind} · {o.active ? "Assigned" : "Access revoked"} <button className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled} onClick={() => run(() => patch(`/api/admin/provider-accounts/${a._id}/assignments/${o._id}`, { active: !o.active }), "Assignment access updated. Other assignments were preserved.")}>{o.active ? "Revoke assignment" : "Restore assignment"}</button></li>)}</ul>
      {[[a.accountStatus === "active" ? "deactivate" : "activate", a.accountStatus === "active" ? "Deactivate account" : "Activate account"], ["invite", "Reissue activation invitation"], ["reset", "Prepare password reset"]].map(([key, label]) => <button key={key} className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled} onClick={() => run(() => post(`/api/admin/provider-accounts/${a._id}/actions`, { action: key }))}>{label}</button>)}
      <form onSubmit={(e) => { e.preventDefault(); const fields = new globalThis.FormData(e.currentTarget); run(() => patch(`/api/admin/users/${a._id}/notifications`, { email: fields.get("email"), enabled: fields.get("enabled") === "on" }), "Notification settings recorded. Verify the address using the emailed link before delivery is enabled."); }}>
        <label htmlFor={`contact-${a._id}`}>Notification email</label><input id={`contact-${a._id}`} className="w-full rounded border border-[var(--color-border)] p-2" name="email" type="email" required defaultValue={a.notificationEmail} /><label><input name="enabled" type="checkbox" defaultChecked={a.notificationsEnabled} /> Receive relevant provider notifications</label><button className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled}>Save notification settings</button>
      </form>
    </article>)}</AdminDataState></section>
  </AdminGuard>;
}
