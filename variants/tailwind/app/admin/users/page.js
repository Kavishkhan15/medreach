"use client";
import { adminListUsers, adminList, adminEntity, adminAcknowledgement, useAdminResource, useAdminAccess, useAdminAction,
  adminResendUserVerification, adminRevokeUserSessions, adminSetUserRole, adminSetUserStatus, adminTriggerUserReset } from "@medreach/core";
import { productApi } from "../../../lib/productApi";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
const load = (signal) => adminListUsers({ signal });
const validate = adminList("user");
const validateUser = adminEntity("user");
export default function AdminUsersPage() {
  const { allowed } = useAdminAccess();
  const users = useAdminResource(load, validate, allowed);
  const action = useAdminAction();
  const act = (fn, label, validate = adminAcknowledgement) => action.run(fn, { validate, success: `${label} confirmed.`, refresh: users.reload });
  return <AdminGuard title="User management" subtitle="Account support. System Admin manages platform accounts.">
    <AdminActionFeedback action={action} refresh={users.reload} />
    <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-3"><AdminDataState resource={users} label="users" emptyMessage="No users found.">
      {(data) => <div style={{ overflowX: "auto" }}><table className="w-full text-left"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Verification</th><th>Sign-in</th><th>Security actions</th></tr></thead><tbody>
        {data.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><p>{user.email}</p><small>Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "never"}</small></td>
          <td><select className="w-full rounded border border-[var(--color-border)] px-3 py-2" aria-label={`Role for ${user.name}`} value={user.role} disabled={action.disabled || ["admin", "hospital_admin", "user_admin"].includes(user.role)} onChange={(e) => act(() => adminSetUserRole(user._id, e.target.value), "Role change", validateUser)}>{["admin", "hospital_admin", "user_admin"].includes(user.role) && <option value={user.role}>Legacy role · review required</option>}<option value="user">User</option><option value="provider_admin">Provider admin</option><option value="system_admin">System admin</option></select></td>
          <td>{user.accountStatus}<button className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" disabled={action.disabled} onClick={() => act(() => adminSetUserStatus(user._id, user.accountStatus === "active" ? "suspended" : "active"), "Account status change", validateUser)}>{user.accountStatus === "active" ? "Disable" : "Enable"}</button></td>
          <td>{user.emailVerifiedAt ? "Verified" : <button className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" disabled={action.disabled} onClick={() => act(() => adminResendUserVerification(user._id), "Verification instructions prepared")}>Resend</button>}</td>
          <td>{user.providers.password ? "Password" : "Password not set"}</td>
          <td><button className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" disabled={action.disabled} onClick={() => act(() => adminRevokeUserSessions(user._id), "Session revocation")}>Revoke sessions</button><button className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" disabled={action.disabled} onClick={() => act(() => adminTriggerUserReset(user._id), "Reset instructions prepared")}>Send reset</button>{user.role === "system_admin" && <form onSubmit={(e) => { e.preventDefault(); const fields = new globalThis.FormData(e.currentTarget); act(() => productApi(`/api/admin/users/${user._id}/notifications`, { method: "PATCH", body: { email: fields.get("email"), enabled: fields.get("enabled") === "on" } }), "Notification settings recorded; verify the emailed link before relying on delivery"); }}><label htmlFor={`system-notification-${user._id}`}>Emergency notification email</label><input id={`system-notification-${user._id}`} type="email" name="email" required defaultValue={user.notificationEmail || ""} /><label><input type="checkbox" name="enabled" defaultChecked={user.notificationsEnabled} /> Receive platform emergency notifications</label><p>{user.notificationContactVerified ? "Contact verified" : "Contact verification pending"}</p><button disabled={action.disabled}>Save notification settings</button></form>}</td></tr>)}
      </tbody></table></div>}
    </AdminDataState></section>
  </AdminGuard>;
}
