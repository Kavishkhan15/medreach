"use client";
import { useCallback, useEffect, useState } from "react";
import { adminListUsers, adminResendUserVerification, adminRevokeUserSessions,
  adminSetUserRole, adminSetUserStatus, adminTriggerUserReset } from "@medreach/core";
import { adminUnlinkUserGoogle } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]); const [status, setStatus] = useState(""); const [busy, setBusy] = useState("");
  const refresh = useCallback(() => adminListUsers().then((result) => setUsers(result.data || [])).catch((error) => setStatus(error.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  const action = async (id, label, fn) => { setBusy(`${id}:${label}`); setStatus(""); try { await fn(); setStatus(`${label} completed.`); await refresh(); } catch (error) { setStatus(error.message); } finally { setBusy(""); } };
  return <AdminGuard systemOnly title="User management" subtitle="System administrators only. Hospital roles never receive this access.">
    {status && <div className="alert alert-info" role="status">{status}</div>}
    <div className="surface table-responsive"><table className="table align-middle"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Verification</th><th>Providers</th><th>Security actions</th></tr></thead><tbody>
      {users.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><div className="small text-secondary">{user.email}</div><div className="disclaimer">Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "never"}</div></td>
        <td><select className="form-select form-select-sm" aria-label={`Role for ${user.name}`} value={user.role === "admin" ? "system_admin" : user.role} disabled={Boolean(busy)} onChange={(event) => action(user._id, "Role change", () => adminSetUserRole(user._id, event.target.value))}><option value="user">User</option><option value="hospital_admin">Hospital admin</option><option value="system_admin">System admin</option></select></td>
        <td><span className={`badge ${user.accountStatus === "active" ? "text-bg-success" : "text-bg-secondary"}`}>{user.accountStatus}</span><div><button className="btn btn-sm btn-link px-0" disabled={Boolean(busy)} onClick={() => action(user._id, user.accountStatus === "active" ? "Disable" : "Enable", () => adminSetUserStatus(user._id, user.accountStatus === "active" ? "suspended" : "active"))}>{user.accountStatus === "active" ? "Disable" : "Enable"}</button></div></td>
        <td>{user.emailVerifiedAt ? "Verified" : <button className="btn btn-sm btn-outline-secondary" disabled={Boolean(busy)} onClick={() => action(user._id, "Verification resend", () => adminResendUserVerification(user._id))}>Resend</button>}</td>
        <td><span className="small">{user.providers.password ? "Password" : ""}{user.providers.password && user.providers.google ? " + " : ""}{user.providers.google ? "Google" : ""}</span>{user.providers.google && user.providers.password && <div><button className="btn btn-sm btn-link text-danger px-0" disabled={Boolean(busy)} onClick={() => window.confirm("Remove this user's Google sign-in? Their password will remain.") && action(user._id, "Google unlink", () => adminUnlinkUserGoogle(user._id))}>Unlink Google</button></div>}</td>
        <td><div className="d-flex flex-wrap gap-1"><button className="btn btn-sm btn-outline-danger" disabled={Boolean(busy)} onClick={() => action(user._id, "Session revoke", () => adminRevokeUserSessions(user._id))}>Revoke sessions</button><button className="btn btn-sm btn-outline-primary" disabled={Boolean(busy)} onClick={() => action(user._id, "Reset trigger", () => adminTriggerUserReset(user._id))}>Send reset</button></div></td></tr>)}
      {!users.length && <tr><td colSpan="6" className="text-secondary">No users found.</td></tr>}
    </tbody></table></div>
  </AdminGuard>;
}
