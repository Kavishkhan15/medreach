"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authStatus, changePassword, logout, me, requestVerification, revokeSession,
  safeReturnTo, updateProfile } from "@medreach/core";

const date = (value) => value ? new Date(value).toLocaleString() : "Unknown";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [security, setSecurity] = useState({ sessions: [], providers: {}, emailVerified: false });
  const [form, setForm] = useState({ name: "", region: "", emergencyContact: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [returnTo, setReturnTo] = useState("/dashboard");

  const refresh = useCallback(async () => {
    try {
      const [account, state] = await Promise.all([me(), authStatus()]);
      setUser(account.user); setSecurity(state);
      setForm({ name: account.user.name || "", region: account.user.region || "", emergencyContact: account.user.emergencyContact || "" });
    } catch (error) { setStatus(error.message); }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOnboarding(params.get("onboarding") === "1");
    const candidate = safeReturnTo(params.get("returnTo"), "/dashboard");
    const parsed = new URL(candidate, window.location.origin);
    setReturnTo(parsed.pathname === "/profile" && parsed.searchParams.get("onboarding") === "1" ? "/dashboard" : candidate);
    refresh();
  }, [refresh]);
  const action = async (fn, message = "Saved.") => {
    setBusy(true); setStatus("");
    try { await fn(); setStatus(message); await refresh(); } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    const next = { ...form, region: form.region.trim() };
    if (onboarding && !next.region) {
      setStatus("Enter your region to finish setting up your profile.");
      return;
    }
    setBusy(true); setStatus("");
    try {
      const response = await updateProfile(next);
      setUser(response.user);
      window.dispatchEvent(new Event("medreach:auth-changed"));
      if (onboarding) router.replace(returnTo);
      else { setStatus("Saved."); await refresh(); }
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  const signOut = async () => { await logout(); window.dispatchEvent(new Event("medreach:auth-changed")); router.push("/login"); };
  if (!user) return <div className="surface"><h1 className="h3">Profile & security</h1><p role="status">{status || "Loading account…"}</p></div>;
  return <><div className="page-head mb-4"><span className="eyebrow">Account</span><h1>{onboarding ? "Complete your profile" : "Profile & security"}</h1>
    <p>{onboarding ? "Add your region so MedReach can prioritize nearby care and regional alerts." : "Manage your verified email, password, and active sessions."}</p></div>
    {status && <div className="alert alert-info" role="status">{status}</div>}
    <div className="grid-2">
      <div ><form className="surface vstack gap-2" onSubmit={saveProfile}>
        <h2 className="h5">Your profile</h2><p className="small text-secondary mb-1">{user.email}</p>
        {["name", "region", "emergencyContact"].map((key) => <div key={key}><label htmlFor={key} className="form-label">{key === "emergencyContact" ? "Emergency contact" : key[0].toUpperCase() + key.slice(1)}{onboarding && key === "region" ? " (required)" : ""}</label><input id={key} className="form-control" maxLength={120} required={onboarding && key === "region"} autoFocus={onboarding && key === "region"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : onboarding ? "Save and continue" : "Save profile"}</button>
      </form></div>
      <div ><section className="surface h-100"><h2 className="h5">Email verification</h2>
        <p>{security.emailVerified ? "Verified" : "Not verified"}</p>
        {!security.emailVerified && <button className="btn btn-outline-primary" disabled={busy} onClick={() => action(requestVerification, "Verification instructions prepared.")}>Resend verification</button>}
      </section></div>
      <div ><section className="surface h-100"><h2 className="h5">Sign-in method</h2>
        <div className="d-flex justify-content-between align-items-center border-bottom py-2"><span>Password</span><span className="badge text-bg-light">{security.providers.password ? "Configured" : "Not set"}</span></div>
        {!security.providers.password && <p className="disclaimer mt-2">This account has no password. <Link href="/forgot-password">Use password reset</Link> to set one.</p>}
      </section></div>
      <div ><form className="surface vstack gap-2" onSubmit={(event) => { event.preventDefault(); action(async () => { await changePassword(password); window.dispatchEvent(new Event("medreach:auth-changed")); router.push("/login"); }, "Password changed. Sign in again."); }}>
        <h2 className="h5">Change password</h2>
        {security.providers.password ? <><label className="form-label" htmlFor="oldPassword">Current password</label><input id="oldPassword" type="password" autoComplete="current-password" className="form-control" required value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} />
          <label className="form-label" htmlFor="newPassword">New password</label><input id="newPassword" type="password" autoComplete="new-password" className="form-control" required minLength={12} maxLength={128} value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} />
          <p className="disclaimer">Use 12+ characters with upper, lower, and numeric characters. Changing it signs out every session.</p><button className="btn btn-outline-primary" disabled={busy}>Change password</button></> :
          <p className="text-secondary">This account has no password. <Link href="/forgot-password">Use password reset</Link> to add one safely.</p>}
      </form></div>
      <div style={{ gridColumn: "1 / -1" }}><section className="surface"><div className="d-flex justify-content-between align-items-center"><div><h2 className="h5 mb-1">Active sessions</h2><p className="disclaimer mb-0">Only hashed device and network fingerprints are stored.</p></div><button className="btn btn-outline-danger" onClick={signOut}>Log out this browser</button></div>
        <div className="table-responsive mt-3"><table className="table"><thead><tr><th>Started</th><th>Expires</th><th>Device fingerprint</th><th><span className="visually-hidden">Action</span></th></tr></thead><tbody>
          {security.sessions.map((session) => <tr key={session._id}><td>{date(session.createdAt)}</td><td>{date(session.expiresAt)}</td><td><code>{session.userAgentHash?.slice(0, 10) || "unknown"}</code></td><td className="text-end"><button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => action(() => revokeSession(session._id), "Session revoked.")}>Revoke</button></td></tr>)}
          {!security.sessions.length && <tr><td colSpan="4" className="text-secondary">No refresh sessions are active.</td></tr>}
        </tbody></table></div>
      </section></div>
    </div></>;
}
