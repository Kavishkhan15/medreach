"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { productApi } from "../lib/productApi";

export default function MfaSecurityPanel() {
  const router = useRouter();
  const [state, setState] = useState(null), [password, setPassword] = useState(""), [code, setCode] = useState(""), [recoveryCode, setRecoveryCode] = useState("");
  const [enrollment, setEnrollment] = useState(null), [recovery, setRecovery] = useState([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const clearCredentials = () => { setPassword(""); setCode(""); setRecoveryCode(""); };
  useEffect(() => {
    let active = true;
    productApi("/api/auth/mfa").then((value) => { if (active) setState(value); }).catch((error) => { if (active) setNotice(error.message); });
    const clear = () => { clearCredentials(); setEnrollment(null); setRecovery([]); };
    window.addEventListener("medreach:auth-changed", clear);
    return () => { active = false; window.removeEventListener("medreach:auth-changed", clear); };
  }, []);
  const run = async (path, body, onSuccess) => {
    if (busy) return;
    setBusy(true); setNotice("");
    try { const result = await productApi(path, { method: "POST", body }); clearCredentials(); onSuccess(result); }
    catch (error) { setNotice(error.message); clearCredentials(); }
    finally { setBusy(false); }
  };
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setNotice("Copied. Store this securely and clear your clipboard when finished."); }
    catch { setNotice("Clipboard unavailable. Select and copy the text manually."); }
  };
  const signedOut = (result) => { setEnrollment(null); setRecovery(result.recoveryCodes || []); setState((value) => ({ ...value, enabled: true })); setNotice("All sessions were revoked. Save your recovery codes, then sign in again."); };
  const finish = () => { clearCredentials(); setRecovery([]); setEnrollment(null); window.dispatchEvent(new Event("medreach:auth-changed")); router.replace("/login"); };
  return <section id="multi-factor-authentication" className="profile-card mt-3" aria-busy={busy}>
    <div className="profile-card-heading"><h2>Two-factor authentication</h2><p>Protect privileged access with an authenticator app and single-use recovery codes.</p></div>
    {notice && <p className="alert alert-info" role="status">{notice}</p>}
    {!state ? <p>Loading security settings…</p> : !state.eligible ? <p>Authenticator enrollment is available to provider and system administrators.</p> : recovery.length ? <div><h3 className="h5">Save your recovery codes</h3><p>These codes are shown only now. Each can be used once. Keep them outside this browser.</p><pre className="border rounded p-3">{recovery.join("\n")}</pre><button className="btn btn-outline-primary me-2" type="button" onClick={() => copy(recovery.join("\n"))}>Copy recovery codes</button><button className="btn btn-primary" type="button" onClick={finish}>I saved the codes — sign in again</button></div> : <>
      <p>Status: <strong>{state.enabled ? "Enabled" : "Not enrolled"}</strong>{state.required ? " · Required for this role" : ""}</p>
      {enrollment && <div className="border rounded p-3 mb-3"><h3 className="h5">Add MedReach to your authenticator</h3><p>Enter this setup key in your app. It expires in 10 minutes and is kept only on this page.</p><p className="text-break"><code>{enrollment.secret}</code></p><button className="btn btn-outline-primary" type="button" onClick={() => copy(enrollment.secret)}>Copy setup key</button></div>}
      <form className="vstack gap-3" onSubmit={(event) => { event.preventDefault(); run(enrollment ? "/api/auth/mfa/confirm" : "/api/auth/mfa/enroll", { password, ...(enrollment ? { code } : {}) }, enrollment ? signedOut : setEnrollment); }}>
        <div><label className="form-label" htmlFor="mfa-password">Current password</label><input className="form-control" id="mfa-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        {(state.enabled || enrollment) && <div><label className="form-label" htmlFor="mfa-code">Authenticator code</label><input className="form-control" id="mfa-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required={Boolean(enrollment)} value={code} onChange={(event) => { setCode(event.target.value); setRecoveryCode(""); }} /></div>}
        {state.enabled && <div><label className="form-label" htmlFor="mfa-recovery">Recovery code (use instead of authenticator code)</label><input className="form-control" id="mfa-recovery" autoComplete="off" value={recoveryCode} maxLength={100} onChange={(event) => { setRecoveryCode(event.target.value); setCode(""); }} /></div>}
        <div className="d-flex flex-wrap gap-2">{!state.enabled && <button className="btn btn-primary" disabled={busy}>{enrollment ? "Confirm authenticator" : "Set up authenticator"}</button>}
        {state.enabled && <><button type="button" className="btn btn-primary" disabled={busy || !password || (!code && !recoveryCode)} onClick={() => run("/api/auth/reauthenticate", { password, code, recoveryCode }, (result) => setNotice(`Sensitive actions verified until ${new Date(result.expiresAt).toLocaleTimeString()}.`))}>Verify sensitive actions</button><button type="button" className="btn btn-outline-primary" disabled={busy || !password || (!code && !recoveryCode)} onClick={() => run("/api/auth/mfa/recovery-codes", { password, code, recoveryCode }, signedOut)}>Replace recovery codes and sign out</button></>}
        {enrollment && <button className="btn btn-outline-secondary" type="button" onClick={() => { setEnrollment(null); clearCredentials(); }}>Clear setup key</button>}</div>
      </form>
    </>}
  </section>;
}
