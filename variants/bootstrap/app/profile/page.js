"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LogoutButton from "../../components/LogoutButton";
import MfaSecurityPanel from "../../components/MfaSecurityPanel";
import { authStatus, changePassword, me, requestVerification, revokeSession,
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
  const [onboardingReturnTo, setOnboardingReturnTo] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOnboarding(params.get("onboarding") === "1");
    const candidate = safeReturnTo(params.get("returnTo"));
    const parsed = new URL(candidate, window.location.origin);
    const loopsToOnboarding = parsed.pathname === "/profile" && parsed.searchParams.get("onboarding") === "1";
    setOnboardingReturnTo(loopsToOnboarding ? "/" : candidate);
  }, []);

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
    try { await fn(); setStatus(message); await refresh(); return true; } catch (error) { setStatus(error.message); return false; }
    finally { setBusy(false); }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    const region = form.region.trim();
    if (onboarding && !region) {
      setStatus("Region is required to finish account setup.");
      document.getElementById("region")?.focus();
      return;
    }
    const saved = await action(() => updateProfile({ ...form, region }), "Profile saved.");
    if (saved && onboarding) router.replace(onboardingReturnTo);
  };
  if (!user) return <div className="profile-workspace"><div className="profile-card"><h1>Profile &amp; security</h1><p role="status">{status || "Loading account…"}</p></div></div>;
  return <div className="profile-workspace">
    <header className="profile-page-header"><h1>Profile &amp; security</h1>
    <p>Update your details, protect your account and review where you are signed in.</p></header>
    {onboarding && <div className="alert alert-warning" role="alert"><strong>Complete your account setup.</strong> Choose your region below. It is required so MedReach can prioritize relevant local healthcare services.</div>}
    {status && <div className="alert alert-info" role="status">{status}</div>}
    <div className="profile-grid">
      {/* Your Profile Card */}
      <div className="profile-grid-details">
        <form className="profile-card" onSubmit={saveProfile}>
          <div className="profile-card-heading"><h2>Your profile</h2><p>Keep your information current for your MedReach account.</p></div>
          <div className="row g-3">
            {/* Left Column: Email and Name */}
            <div className="col-12 col-md-6 d-flex flex-column gap-3">
              <div>
                <label htmlFor="email" className="form-label fw-semibold text-secondary small mb-1">Email address</label>
                <input id="email" className="form-control bg-light text-muted" type="email" readOnly value={user.email} />
              </div>
              <div>
                <label htmlFor="name" className="form-label fw-semibold text-secondary small mb-1">Name</label>
                <input id="name" className="form-control" maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
            </div>

            {/* Right Column: Region and Emergency contact */}
            <div className="col-12 col-md-6 d-flex flex-column gap-3">
              <div>
                <label htmlFor="region" className="form-label fw-semibold text-secondary small mb-1">
                  Region{onboarding ? " (required)" : ""}
                </label>
                <input
                  id="region"
                  className="form-control"
                  maxLength={120}
                  required={onboarding}
                  autoFocus={onboarding}
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="emergencyContact" className="form-label fw-semibold text-secondary small mb-1">Emergency contact</label>
                <input
                  id="emergencyContact"
                  className="form-control"
                  maxLength={120}
                  value={form.emergencyContact}
                  onChange={(event) => setForm({ ...form, emergencyContact: event.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="profile-form-actions">
            <button className="btn btn-primary px-4 py-2" disabled={busy}>
              {busy ? "Saving…" : onboarding ? "Save and continue" : "Save profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="profile-grid-password">
        <form
          className="profile-card"
          onSubmit={(event) => {
            event.preventDefault();
            action(async () => {
              await changePassword(password);
              window.dispatchEvent(new Event("medreach:auth-changed"));
              router.push("/login");
            }, "Password changed. Sign in again.");
          }}
        >
          <div className="profile-card-heading"><h2>Change password</h2><p>Choose a strong password for this account.</p></div>
          {security.providers.password ? (
            <>
              <div className="profile-password-fields">
                {/* Left Column: Current password */}
                <div>
                  <label className="form-label fw-semibold text-secondary small mb-1" htmlFor="oldPassword">Current password</label>
                  <input
                    id="oldPassword"
                    type="password"
                    autoComplete="current-password"
                    className="form-control"
                    required
                    value={password.currentPassword}
                    onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                  />
                </div>

                {/* Right Column: New password and validation guidance */}
                <div>
                  <div>
                    <label className="form-label fw-semibold text-secondary small mb-1" htmlFor="newPassword">New password</label>
                    <input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      className="form-control"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password.newPassword}
                      onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
                    />
                  </div>
                  <p className="disclaimer mb-0 text-muted small">
                    Use 12+ characters with upper, lower, and numeric characters. Changing it signs out every session.
                  </p>
                </div>
              </div>

              <div className="profile-form-actions">
                <button className="btn btn-outline-primary px-4 py-2" disabled={busy}>
                  Change password
                </button>
              </div>
            </>
          ) : (
            <p className="text-secondary mb-0">This account has no password. <Link href="/forgot-password">Use password reset</Link> to add one safely.</p>
          )}
        </form>
      </div>

      <div className="profile-grid-sessions"><MfaSecurityPanel /></div>
      {/* Active Sessions */}
      <div className="profile-grid-sessions">
        <section className="profile-card">
          <div className="profile-session-heading">
            <div>
              <h2>Active sessions</h2>
              <p>Review recent sign-ins and revoke sessions you do not recognize.</p>
            </div>
            <LogoutButton className="btn btn-outline-danger">Log out this browser</LogoutButton>
          </div>
          <div className="table-responsive profile-session-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Expires</th>
                  <th>Device fingerprint</th>
                  <th><span className="visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {security.sessions.map((session) => (
                  <tr key={session._id}>
                    <td data-label="Started">{date(session.createdAt)}</td>
                    <td data-label="Expires">{date(session.expiresAt)}</td>
                    <td data-label="Device"><code>{session.userAgentHash?.slice(0, 10) || "unknown"}</code></td>
                    <td className="text-end profile-session-action">
                      <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => action(() => revokeSession(session._id), "Session revoked.")}>Revoke</button>
                    </td>
                  </tr>
                ))}
                {!security.sessions.length && <tr><td colSpan="4" className="text-secondary">No refresh sessions are active.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
