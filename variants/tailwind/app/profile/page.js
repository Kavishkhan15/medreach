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
  if (!user) return <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5"><h1 className="h3">Profile & security</h1><p role="status">{status || "Loading account…"}</p></div>;
  return <><div className="page-head mb-4"><span className="eyebrow">Account</span><h1>{onboarding ? "Complete your profile" : "Profile & security"}</h1>
    <p>{onboarding ? "Add your region so MedReach can prioritize nearby care and regional alerts." : "Manage your verified email, password, and active sessions."}</p></div>
    {status && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 text-sm mb-4" role="status">{status}</div>}
    <div className="flex flex-col gap-6">
      {/* Your Profile Card */}
      <div className="w-full">
        <form className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6" onSubmit={saveProfile}>
          <h2 className="text-xl font-bold text-gray-900 mb-6">Your profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Email and Name */}
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-gray-600 mb-1">Email address</label>
                <input id="email" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" type="email" readOnly value={user.email} />
              </div>
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                <input id="name" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
            </div>

            {/* Right Column: Region and Emergency contact */}
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="region" className="block text-xs font-semibold text-gray-600 mb-1">
                  Region{onboarding ? " (required)" : ""}
                </label>
                <input
                  id="region"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  maxLength={120}
                  required={onboarding}
                  autoFocus={onboarding}
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="emergencyContact" className="block text-xs font-semibold text-gray-600 mb-1">Emergency contact</label>
                <input
                  id="emergencyContact"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  maxLength={120}
                  value={form.emergencyContact}
                  onChange={(event) => setForm({ ...form, emergencyContact: event.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button className="bg-[var(--color-emergency)] text-white font-bold px-6 py-2.5 rounded-md hover:bg-[var(--color-emergency-dark)] text-sm shadow-sm transition-colors" disabled={busy}>
              {busy ? "Saving…" : onboarding ? "Save and continue" : "Save profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="w-full">
        <form
          className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6"
          onSubmit={(event) => {
            event.preventDefault();
            action(async () => {
              await changePassword(password);
              window.dispatchEvent(new Event("medreach:auth-changed"));
              router.push("/login");
            }, "Password changed. Sign in again.");
          }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">Change password</h2>
          {security.providers.password ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Current password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="oldPassword">Current password</label>
                  <input
                    id="oldPassword"
                    type="password"
                    autoComplete="current-password"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    required
                    value={password.currentPassword}
                    onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                  />
                </div>

                {/* Right Column: New password and validation guidance */}
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="newPassword">New password</label>
                    <input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password.newPassword}
                      onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Use 12+ characters with upper, lower, and numeric characters. Changing it signs out every session.
                  </p>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button className="border border-[var(--color-emergency)] text-[var(--color-emergency)] font-semibold px-6 py-2.5 rounded-md hover:bg-red-50 text-sm transition-colors" disabled={busy}>
                  Change password
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">This account has no password. <Link href="/forgot-password" className="text-blue-600 underline">Use password reset</Link> to add one safely.</p>
          )}
        </form>
      </div>

      {/* Active Sessions */}
      <div className="w-full">
        <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Active sessions</h2>
              <p className="text-xs text-gray-500 mb-0">Only hashed device and network fingerprints are stored.</p>
            </div>
            <button className="border border-red-500 text-red-600 font-semibold px-4 py-2 rounded-md hover:bg-red-50 text-sm transition-colors" onClick={signOut}>Log out this browser</button>
          </div>
          <div className="table-responsive mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-xs">
                  <th className="pb-2">Started</th>
                  <th className="pb-2">Expires</th>
                  <th className="pb-2">Device fingerprint</th>
                  <th className="pb-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {security.sessions.map((session) => (
                  <tr key={session._id}>
                    <td className="py-2.5">{date(session.createdAt)}</td>
                    <td className="py-2.5">{date(session.expiresAt)}</td>
                    <td className="py-2.5"><code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{session.userAgentHash?.slice(0, 10) || "unknown"}</code></td>
                    <td className="py-2.5 text-right">
                      <button className="border border-red-400 text-red-600 font-semibold px-2.5 py-1 rounded text-xs hover:bg-red-50" disabled={busy} onClick={() => action(() => revokeSession(session._id), "Session revoked.")}>Revoke</button>
                    </td>
                  </tr>
                ))}
                {!security.sessions.length && <tr><td colSpan="4" className="text-gray-500 py-3">No refresh sessions are active.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div></>;
}
