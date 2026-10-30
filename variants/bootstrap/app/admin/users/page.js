"use client";
import { useCallback, useState } from "react";
import { adminList, adminEntity, adminAcknowledgement, useAdminResource, useAdminAccess, useAdminAction,
  adminResendUserVerification, adminRevokeUserSessions, adminSetUserRole, adminSetUserStatus, adminTriggerUserReset } from "@medreach/core";
import { productApi } from "../../../lib/productApi";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
const validate = adminList("user");
const validateUser = adminEntity("user");
export default function AdminUsersPage() {
  const [role, setRole] = useState("user");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async signal => {
    const result = await productApi(`/api/admin/users?roleGroup=${role}&page=${page}`, { signal });
    if (!signal.aborted) setHasMore(result.pagination?.hasMore === true);
    return result;
  }, [role, page]);
  const { allowed } = useAdminAccess();
  const users = useAdminResource(load, validate, allowed);
  const action = useAdminAction();
  const act = (fn, label, validate = adminAcknowledgement) => action.run(fn, { validate, success: `${label} confirmed.`, refresh: users.reload });
  return <AdminGuard title="User management" subtitle="Account support. System Admin manages platform accounts.">
    <AdminActionFeedback action={action} refresh={users.reload} />
    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Account roles">
      {[["user", "Users"], ["provider_admin", "Provider Admins"], ["system_admin", "System Admins"]].map(([value, label]) => <button key={value} type="button" className={`btn ${role === value ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={role === value} disabled={action.disabled} onClick={() => { setRole(value); setPage(1); setHasMore(false); }}>{label}</button>)}
    </div>
    <p className="text-secondary">Passwords are stored as secure hashes and cannot be displayed. Use Send reset to prepare password-reset instructions. Legacy roles remain labelled for review.</p>
    <section className="surface mb-3"><AdminDataState resource={users} label="users" emptyMessage="No users found.">
      {(data) => <div style={{ overflowX: "auto" }}><table className="table align-middle"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Verification</th><th>Sign-in</th><th>Security actions</th></tr></thead><tbody>
        {data.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><p>{user.email}</p><small>Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "never"}</small></td>
          <td><select className="form-control" aria-label={`Role for ${user.name}`} value={user.role} disabled={action.disabled || ["admin", "hospital_admin", "user_admin"].includes(user.role)} onChange={(e) => act(() => adminSetUserRole(user._id, e.target.value), "Role change", validateUser)}>{["admin", "hospital_admin", "user_admin"].includes(user.role) && <option value={user.role}>Legacy role · review required</option>}<option value="user">User</option><option value="provider_admin">Provider admin</option><option value="system_admin">System admin</option></select></td>
          <td>{user.accountStatus}<button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act(() => adminSetUserStatus(user._id, user.accountStatus === "active" ? "suspended" : "active"), "Account status change", validateUser)}>{user.accountStatus === "active" ? "Disable" : "Enable"}</button></td>
          <td>{user.emailVerifiedAt ? "Verified" : <button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act(() => adminResendUserVerification(user._id), "Verification instructions prepared")}>Resend</button>}</td>
          <td>{user.providers.password ? "Password set · securely hashed" : "Password not set"}</td>
          <td><button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act(() => adminRevokeUserSessions(user._id), "Session revocation")}>Revoke sessions</button><button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act(() => adminTriggerUserReset(user._id), "Reset instructions prepared")}>Send reset</button>{user.role === "system_admin" && <form onSubmit={(e) => { e.preventDefault(); const fields = new globalThis.FormData(e.currentTarget); act(() => productApi(`/api/admin/users/${user._id}/notifications`, { method: "PATCH", body: { email: fields.get("email"), enabled: fields.get("enabled") === "on" } }), "Notification settings recorded; verify the emailed link before relying on delivery"); }}><label htmlFor={`system-notification-${user._id}`}>Emergency notification email</label><input id={`system-notification-${user._id}`} type="email" name="email" required defaultValue={user.notificationEmail || ""} /><label><input type="checkbox" name="enabled" defaultChecked={user.notificationsEnabled} /> Receive platform emergency notifications</label><p>{user.notificationContactVerified ? "Contact verified" : "Contact verification pending"}</p><button disabled={action.disabled}>Save notification settings</button></form>}</td></tr>)}
      </tbody></table></div>}
    </AdminDataState></section>
    {users.status === "success" && (page > 1 || hasMore) && <nav className="d-flex align-items-center gap-3" aria-label="Account pages"><button type="button" className="btn btn-outline-primary" disabled={page === 1 || action.disabled} onClick={() => setPage(value => value - 1)}>Previous accounts</button><span>Page {page}</span><button type="button" className="btn btn-outline-primary" disabled={!hasMore || action.disabled} onClick={() => setPage(value => value + 1)}>Next accounts</button></nav>}
  </AdminGuard>;
}
