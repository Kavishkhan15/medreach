"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authStatus, changePassword, logout, me, requestVerification, revokeSession,
  unlinkGoogle, updateProfile } from "@medreach/core";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const date = (value) => value ? new Date(value).toLocaleString() : "Unknown";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [security, setSecurity] = useState({ sessions: [], providers: {}, emailVerified: false });
  const [form, setForm] = useState({ name: "", region: "", emergencyContact: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [account, state] = await Promise.all([me(), authStatus()]);
      setUser(account.user); setSecurity(state);
      setForm({ name: account.user.name || "", region: account.user.region || "", emergencyContact: account.user.emergencyContact || "" });
    } catch (error) { setStatus(error.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const action = async (fn, message = "Saved.") => {
    setBusy(true); setStatus("");
    try { await fn(); setStatus(message); await refresh(); } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  const signOut = async () => { await logout(); window.dispatchEvent(new Event("medreach:auth-changed")); router.push("/login"); };
  if (!user) return <div className="surface"><h1 className="h3">Profile & security</h1><p role="status">{status || "Loading account…"}</p></div>;
  return <><div className="page-head mb-4"><span className="eyebrow">Account</span><h1>Profile & security</h1>
    <p>Manage your verified email, sign-in methods, password, and active sessions.</p></div>
    {status && <div className="alert alert-info" role="status">{status}</div>}
    <div className="row g-3">
      <div className="col-lg-6"><form className="surface vstack gap-2" onSubmit={(event) => { event.preventDefault(); action(() => updateProfile(form)); }}>
        <h2 className="h5">Your profile</h2><p className="small text-secondary mb-1">{user.email}</p>
        {["name", "region", "emergencyContact"].map((key) => <div key={key}><label htmlFor={key} className="form-label">{key === "emergencyContact" ? "Emergency contact" : key[0].toUpperCase() + key.slice(1)}</label><input id={key} className="form-control" maxLength={120} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}
        <button className="btn btn-primary" disabled={busy}>Save profile</button>
      </form></div>
      <div className="col-lg-6"><section className="surface h-100"><h2 className="h5">Email verification</h2>
        <p>{security.emailVerified ? "Verified" : "Not verified"}</p>
        {!security.emailVerified && <button className="btn btn-outline-primary" disabled={busy} onClick={() => action(requestVerification, "Verification instructions prepared.")}>Resend verification</button>}
      </section></div>
      <div className="col-lg-6"><section className="surface h-100"><h2 className="h5">Sign-in providers</h2>
        <div className="d-flex justify-content-between align-items-center border-bottom py-2"><span>Password</span><span className="badge text-bg-light">{security.providers.password ? "Configured" : "Not set"}</span></div>
        <div className="d-flex justify-content-between align-items-center py-2"><span>Google</span><span className="badge text-bg-light">{security.providers.google ? "Linked" : "Not linked"}</span></div>
        {!security.providers.google && <a className="btn btn-outline-dark mt-2" href={`${API}/api/auth/google?flow=link&confirm=link-google`}>Link Google account</a>}
        {security.providers.google && <button className="btn btn-outline-danger mt-2" disabled={!security.providers.password || busy}
          title={!security.providers.password ? "Set a password before removing your only sign-in method" : undefined}
          onClick={() => window.confirm("Remove Google sign-in? You will be signed out.") && action(async () => { await unlinkGoogle(); window.dispatchEvent(new Event("medreach:auth-changed")); router.push("/login"); }, "Google sign-in removed.")}>Unlink Google</button>}
        {!security.providers.password && <p className="disclaimer mt-2">Google is your only sign-in method and cannot be removed.</p>}
      </section></div>
      <div className="col-lg-6"><form className="surface vstack gap-2" onSubmit={(event) => { event.preventDefault(); action(async () => { await changePassword(password); window.dispatchEvent(new Event("medreach:auth-changed")); router.push("/login"); }, "Password changed. Sign in again."); }}>
        <h2 className="h5">Change password</h2>
        {security.providers.password ? <><label className="form-label" htmlFor="oldPassword">Current password</label><input id="oldPassword" type="password" autoComplete="current-password" className="form-control" required value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} />
          <label className="form-label" htmlFor="newPassword">New password</label><input id="newPassword" type="password" autoComplete="new-password" className="form-control" required minLength={12} maxLength={128} value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} />
          <p className="disclaimer">Use 12+ characters with upper, lower, and numeric characters. Changing it signs out every session.</p><button className="btn btn-outline-primary" disabled={busy}>Change password</button></> :
          <p className="text-secondary">This Google-only account has no password. <Link href="/forgot-password">Use password reset</Link> to add one safely.</p>}
      </form></div>
      <div className="col-12"><section className="surface"><div className="d-flex justify-content-between align-items-center"><div><h2 className="h5 mb-1">Active sessions</h2><p className="disclaimer mb-0">Only hashed device and network fingerprints are stored.</p></div><button className="btn btn-outline-danger" onClick={signOut}>Log out this browser</button></div>
        <div className="table-responsive mt-3"><table className="table"><thead><tr><th>Started</th><th>Expires</th><th>Device fingerprint</th><th><span className="visually-hidden">Action</span></th></tr></thead><tbody>
          {security.sessions.map((session) => <tr key={session._id}><td>{date(session.createdAt)}</td><td>{date(session.expiresAt)}</td><td><code>{session.userAgentHash?.slice(0, 10) || "unknown"}</code></td><td className="text-end"><button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => action(() => revokeSession(session._id), "Session revoked.")}>Revoke</button></td></tr>)}
          {!security.sessions.length && <tr><td colSpan="4" className="text-secondary">No refresh sessions are active.</td></tr>}
        </tbody></table></div>
      </section></div>
    </div></>;
}
