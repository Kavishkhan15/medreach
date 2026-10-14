"use client";
import { useEffect, useState } from "react";
import { useAdminAccess, useAdminResource, useAdminAction, adminList, adminAcknowledgement } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { productApi, post, patch } from "../../../lib/productApi";
const loadAccounts = (signal) => productApi("/api/admin/provider-accounts", { signal });
const loadOrganizations = (signal) => productApi("/api/admin/provider-approvals/organizations", { signal });
const parseAccountRows = adminList("providerAccount");
const parseAccounts = response => ({ rows: parseAccountRows(response), manualEnabled: response.manualCredentialsEnabled === true });
const parseOrganizations = adminList("organization");
export default function ProviderAccountsPage() {
  const { allowed } = useAdminAccess();
  const accounts = useAdminResource(loadAccounts, parseAccounts, allowed);
  const organizations = useAdminResource(loadOrganizations, parseOrganizations, allowed);
  const action = useAdminAction();
  const [organizationId, setOrganizationId] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [delivery, setDelivery] = useState("manual");
  const [credentials, setCredentials] = useState({});
  const [credentialFeedback, setCredentialFeedback] = useState("");
  const [provisionSummary, setProvisionSummary] = useState(null);
  useEffect(() => { if (!allowed) { setCredentials({}); setCredentialFeedback(""); } }, [allowed]);
  const accountRows = accounts.data?.rows || [];
  const manualEnabled = accounts.status === "success" && accounts.data?.manualEnabled;
  const [target, setTarget] = useState("");
  const current = organizations.data?.find((r) => r._id === organizationId);
  const run = (perform, success = "Action confirmed. Check the account and delivery status.") => action.run(perform, { validate: adminAcknowledgement, success, refresh: accounts.reload });
  const prepare = (selection = {}) => run(async () => {
    const result = await post("/api/admin/provider-accounts/manual-provision", selection);
    adminAcknowledgement(result);
    if (!result.summary || !Number.isInteger(result.summary.created) || !Number.isInteger(result.summary.awaitingPassword) || !Number.isInteger(result.summary.needsReview)) throw new Error("Account preparation could not be confirmed");
    setProvisionSummary(result.summary);
    return result;
  }, "Accounts prepared. Generate each missing password below for manual handover. No email was sent.");
  const provision = () => current && (delivery === "manual"
    ? prepare({ kind: current.kind, organizationId })
    : run(() => post("/api/admin/provider-accounts", { kind: current.kind, organizationId, loginEmail, notificationEmail }), "Account provisioning confirmed. Check invitation delivery separately."));
  const generate = a => {
    if (a.passwordSet && !window.confirm("Reset this provider's password? Their current password and sessions will stop working.")) return;
    setCredentials(previous => { const next = { ...previous }; delete next[a._id]; return next; });
    return run(async () => {
      const result = await post(`/api/admin/provider-accounts/${a._id}/credentials`, { mode: a.passwordSet ? "reset" : "generate", expectedRevision: a.credentialRevision });
      adminAcknowledgement(result);
      const c = result.credentials;
      if (!c || c.accountId !== a._id || c.email !== a.email || typeof c.password !== "string" || c.password.length < 32) throw new Error("Credentials could not be confirmed. Refresh before resetting.");
      // One-time secrets stay in React memory only. No browser storage or logs.
      setCredentials(previous => ({ ...previous, [a._id]: { ...c, visible: true } }));
      setCredentialFeedback("New password ready. Copy it before leaving this page. No email was sent.");
      return result;
    }, "New password confirmed. Previous sessions are invalid. No email was sent.");
  };
  const togglePassword = id => setCredentials(previous => ({ ...previous, [id]: { ...previous[id], visible: !previous[id].visible } }));
  const copyCredentials = async id => {
    const c = credentials[id];
    if (!c) return;
    try {
      await navigator.clipboard.writeText(`Demo login ID: ${c.email}\nPassword: ${c.password}`);
      setCredentialFeedback("Credentials copied. Share privately with the assigned provider only.");
    } catch { setCredentialFeedback("Clipboard unavailable. Show and manually copy the credentials from this page."); }
  };
  return <AdminGuard title="Provider Accounts" subtitle="Explicit accounts and assignments for approved healthcare organisations.">
    <AdminActionFeedback action={action} refresh={accounts.reload} />
    <section className="surface mb-3"><h2>Manual credential handover</h2>
      <p>Demo login IDs ending in .example are usernames, not real email addresses. Each generated password is unique and stored only as a secure hash. Existing passwords cannot be retrieved.</p>
      <button className="btn btn-primary" disabled={action.disabled || !manualEnabled} onClick={() => prepare()}>Provision eligible providers</button>
      {!manualEnabled && accounts.status === "success" && <p>Manual demo credentials require the approved local development database and a local API connection.</p>}
      {provisionSummary && <p role="status">Created: {provisionSummary.created} · Awaiting password: {provisionSummary.awaitingPassword} · Require manual review: {provisionSummary.needsReview}. Existing assignments and passwords were preserved.</p>}
      <p className="text-secondary">Generate/Reset reveals a new password in this session only. Leaving or reloading this page clears it; reset again if it was not copied. Resetting invalidates the previous password and sessions.</p>
      {credentialFeedback && <p role="status">{credentialFeedback}</p>}
      {Object.values(credentials).map(c => <div key={c.accountId} className="border rounded p-3 mb-2">
        <p className="text-break">Demo login ID: <strong>{c.email}</strong></p>
        <label htmlFor={`secret-${c.accountId}`}>Newly generated password</label>
        <input id={`secret-${c.accountId}`} className="form-control" type={c.visible ? "text" : "password"} value={c.password} readOnly autoComplete="off" spellCheck={false} />
        <button className="btn btn-outline-primary" onClick={() => togglePassword(c.accountId)}>{c.visible ? "Hide Password" : "Show Password"}</button>
        <button className="btn btn-primary" onClick={() => copyCredentials(c.accountId)}>Copy Credentials</button>
        <button className="btn btn-outline-secondary" onClick={() => setCredentials(previous => { const next = { ...previous }; delete next[c.accountId]; return next; })}>Clear password from this page</button>
      </div>)}
    </section>
    <section className="surface mb-3"><h2>Provision or assign an account</h2><AdminDataState resource={organizations} label="organisations" emptyMessage="No organisations available.">{(rows) => <form onSubmit={(e) => { e.preventDefault(); provision(); }}>
      <div className="row g-3"><div className="col-md-6"><label htmlFor="provider-organization">Organisation</label><select id="provider-organization" className="form-control" required value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}><option value="">Select organisation</option>{rows.map((r) => <option key={r._id} value={r._id}>{r.name} · {r.kind}</option>)}</select></div>
      <div className="col-md-6"><label htmlFor="credential-delivery">Credential delivery</label><select id="credential-delivery" className="form-control" value={delivery} onChange={e => setDelivery(e.target.value)}><option value="manual">Manual handover (unique demo login ID)</option><option value="invitation">Email invitation (requires configured delivery)</option></select></div>
      {delivery === "invitation" && <><div className="col-md-6"><label htmlFor="provider-login">Login email</label><input id="provider-login" type="email" className="form-control" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></div>
      <div className="col-md-6"><label htmlFor="provider-contact">Real notification / invitation email</label><input id="provider-contact" type="email" className="form-control" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} required /></div></>}</div>
      <p className="text-secondary">Approval, account activation and email delivery are separate. Existing credentials are never overwritten.</p>
      {current && (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus)) && <button type="button" className="btn btn-outline-primary" disabled={action.disabled} onClick={() => action.run(() => post(`/api/admin/provider-approvals/organizations/${current.kind}/${current._id}/approve`, {}), { validate: adminAcknowledgement, success: "Organisation approval confirmed. Provision its administrator account next.", refresh: organizations.reload })}>Approve selected organisation</button>}
      <button className="btn btn-primary" disabled={action.disabled || (delivery === "manual" && !manualEnabled) || !current || (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus))}>Create Provider Admin account</button>
      <label htmlFor="assignment-account">Existing Provider Admin account</label><select id="assignment-account" className="form-control" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Select account for additional assignment</option>{accountRows.map((a) => <option key={a._id} value={a._id}>{a.email}</option>)}</select>
      <button type="button" className="btn btn-outline-primary" disabled={action.disabled || !target || !current || (current.verificationStatus !== "verified" || ["pending", "rejected"].includes(current.approvalStatus))} onClick={() => run(() => post(`/api/admin/provider-accounts/${target}/assignments`, { kind: current.kind, organizationId }), "Assignment recorded. Existing assignments were preserved.")}>Assign selected organisation</button>
    </form>}</AdminDataState></section>
    <section className="surface mb-3"><h2>Organisation account coverage</h2>
      <AdminDataState resource={organizations} label="organisation coverage" emptyMessage="No organisations available.">{rows => <AdminDataState resource={{ ...accounts, data: accounts.data?.rows }} label="account coverage" empty={false}>{() => <div className="table-responsive"><table className="table"><thead><tr><th>Organisation</th><th>Login ID</th><th>Account status</th><th>Password status</th></tr></thead><tbody>{rows.map(org => {
        const assigned = accountRows.filter(a => a.organizations.some(o => o.organizationId === org._id && o.kind === org.kind));
        return <tr key={`${org.kind}-${org._id}`}><td>{org.name}<br /><small>{org.kind}</small></td><td>{assigned.length ? assigned.map(a => <div className="text-break" key={a._id}>{a.email}{a.demoLoginId && <small className="d-block">Demo login ID; not a real email address</small>}</div>) : "Not provisioned; approval or ownership review may be required"}</td><td>{assigned.map(a => <div key={a._id}>{a.accountStatus}</div>)}</td><td>{assigned.length ? assigned.map(a => <div key={a._id}>{a.passwordStatus || "Unavailable"}</div>) : "Not set"}</td></tr>;
      })}</tbody></table></div>}</AdminDataState>}</AdminDataState>
    </section>
    <section className="surface mb-3"><h2>Provider administrator accounts</h2><AdminDataState resource={{ ...accounts, data: accounts.data?.rows }} label="provider accounts" emptyMessage="No Provider Admin accounts found.">{(rows) => rows.map((a) => <article key={a._id} className="surface mb-3"><h3>{a.organizations.map(o => o.name).join(" / ") || a.name}</h3><p className="text-break">{a.demoLoginId ? "Demo login ID (not a real email address)" : "Login email"}: <strong>{a.email}</strong></p><p>Account status: {a.accountStatus} · Password status: {a.passwordStatus || "Unavailable"}</p>
      <button className="btn btn-primary" disabled={action.disabled || !manualEnabled || !a.organizations.some(o => o.active)} onClick={() => generate(a)}>Generate/Reset Password</button>
      <button className="btn btn-outline-primary" disabled={!credentials[a._id]} onClick={() => togglePassword(a._id)}>{credentials[a._id]?.visible ? "Hide Password" : "Show Password"}</button>
      <button className="btn btn-outline-primary" disabled={!credentials[a._id]} onClick={() => copyCredentials(a._id)}>Copy Credentials</button>
      <p>{credentials[a._id] ? "New password available above for this session only." : "Show and Copy become available after generating or resetting a password."}</p>
      <p>{a.credentialDelivery === "manual" ? "Manual handover: no credential email was sent." : `Activation email status: ${a.invitationStatus}`}</p><p>Notification contact: {a.notificationEmail || "Not configured"} · {a.notificationContactVerified ? "Verified" : "Verification pending"} · {a.notificationsEnabled ? "Enabled" : "Disabled"}</p>
      <ul>{a.organizations.map((o) => <li key={o._id}>{o.name} · {o.kind} · {o.active ? "Assigned" : "Access revoked"} <button className="btn btn-outline-primary" disabled={action.disabled} onClick={() => run(() => patch(`/api/admin/provider-accounts/${a._id}/assignments/${o._id}`, { active: !o.active }), "Assignment access updated. Other assignments were preserved.")}>{o.active ? "Revoke assignment" : "Restore assignment"}</button></li>)}</ul>
      {[[a.accountStatus === "active" ? "deactivate" : "activate", a.accountStatus === "active" ? "Deactivate account" : "Activate account"], ["invite", "Reissue activation invitation"], ["reset", "Prepare password reset"]].map(([key, label]) => <button key={key} className="btn btn-outline-primary" disabled={action.disabled} onClick={() => run(() => post(`/api/admin/provider-accounts/${a._id}/actions`, { action: key }))}>{label}</button>)}
      <form onSubmit={(e) => { e.preventDefault(); const fields = new globalThis.FormData(e.currentTarget); run(() => patch(`/api/admin/users/${a._id}/notifications`, { email: fields.get("email"), enabled: fields.get("enabled") === "on" }), "Notification settings recorded. Verify the address using the emailed link before delivery is enabled."); }}>
        <label htmlFor={`contact-${a._id}`}>Notification email</label><input id={`contact-${a._id}`} className="form-control" name="email" type="email" required defaultValue={a.notificationEmail} /><label><input name="enabled" type="checkbox" defaultChecked={a.notificationsEnabled} /> Receive relevant provider notifications</label><button className="btn btn-outline-primary" disabled={action.disabled}>Save notification settings</button>
      </form>
    </article>)}</AdminDataState></section>
  </AdminGuard>;
}
