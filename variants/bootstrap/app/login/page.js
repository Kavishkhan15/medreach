"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { profileDestination, safeReturnTo, useAuth, validateLogin, validateRegister } from "@medreach/core";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [verification, setVerification] = useState({ code: "", recoveryCode: "" });
  const [useRecovery, setUseRecovery] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState("/");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnTo(params.get("returnTo")));
    if (params.get("registered") === "1") {
      const pendingEmail = window.sessionStorage.getItem("medreach:pending-registration-email") || "";
      window.sessionStorage.removeItem("medreach:pending-registration-email");
      setForm((current) => ({ ...current, email: pendingEmail, password: "" }));
      setNotice("Registration accepted. Check your email for verification instructions, then sign in to finish Profile & Security.");
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    setServerError("");
    setNotice("");
    const check = mode === "login" ? validateLogin(form) : validateRegister(form);
    setErrors(check.errors);
    if (!check.valid) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (mode === "login") {
        const user = await login(form.email, form.password, verification);
        setVerification({ code: "", recoveryCode: "" });
        setForm((current) => ({ ...current, password: "" }));
        router.push(profileDestination(user, returnTo));
      }
      else {
        const result = await register({ email: form.email, password: form.password, name: form.name });
        if (result.user) router.push(profileDestination(result.user, returnTo));
        else if (result.accepted) {
          window.sessionStorage.setItem("medreach:pending-registration-email", form.email.trim());
          router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}&registered=1`);
          setMode("login");
          setForm((current) => ({ ...current, password: "" }));
          setNotice("Registration accepted. Check your email for verification instructions, then sign in to finish Profile & Security.");
        } else setNotice(result.message);
      }
    } catch (err) {
      setServerError(err.message);
      setForm((current) => ({ ...current, password: "" }));
      setVerification({ code: "", recoveryCode: "" });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-7 col-lg-5">
        <div className="surface">
          <h1 className="h3 mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="disclaimer mb-3">Sign in to save hospitals for quick access.</p>
          {serverError && <div className="alert alert-danger py-2">{serverError}</div>}
          {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
          <form aria-busy={busy} onSubmit={submit} noValidate className="vstack gap-3">
            {mode === "register" && (
              <div>
                <label htmlFor="name" className="form-label fw-semibold">Name</label>
                <input id="name" className={`form-control ${errors.name ? "is-invalid" : ""}`} value={form.name} onChange={set("name")} />
                {errors.name && <div className="invalid-feedback">{errors.name}</div>}
              </div>
            )}
            <div>
              <label htmlFor="email" className="form-label fw-semibold">Email</label>
              <input id="email" type="email" autoComplete="email" className={`form-control ${errors.email ? "is-invalid" : ""}`} value={form.email} onChange={set("email")} />
              {errors.email && <div className="invalid-feedback">{errors.email}</div>}
            </div>
            <div>
              <label htmlFor="password" className="form-label fw-semibold">Password</label>
              <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={`form-control ${errors.password ? "is-invalid" : ""}`} value={form.password} onChange={set("password")} />
              {errors.password && <div className="invalid-feedback">{errors.password}</div>}
            </div>
            {mode === "login" && <fieldset><legend className="h6">Two-factor authentication</legend><p className="disclaimer">If enabled for your account, enter your authenticator code or a single-use recovery code.</p>
              <label htmlFor="login-verification" className="form-label">{useRecovery ? "Recovery code" : "Authenticator code"}</label>
              <input id="login-verification" className="form-control" autoComplete="one-time-code" inputMode={useRecovery ? "text" : "numeric"} maxLength={useRecovery ? 100 : 6} value={useRecovery ? verification.recoveryCode : verification.code} onChange={(e) => setVerification(useRecovery ? { code: "", recoveryCode: e.target.value } : { recoveryCode: "", code: e.target.value })} />
              <button className="btn btn-link px-0" type="button" onClick={() => { setUseRecovery(!useRecovery); setVerification({ code: "", recoveryCode: "" }); }}>{useRecovery ? "Use authenticator code" : "Use a recovery code"}</button>
            </fieldset>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "Sign in" : "Create account")}</button>
          </form>
          <div className="text-center mt-3">
            <button className="btn btn-link p-0" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); setVerification({ code: "", recoveryCode: "" }); }}>
              {mode === "login" ? "Need an account? Register here" : "Have an account? Sign in"}
            </button>
          </div>
          {mode === "login" && <p className="text-center mt-2 mb-0"><Link href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Open the registration page</Link></p>}
          {mode === "login" && <p className="text-center mt-2 mb-0"><Link href="/forgot-password">Forgot password?</Link></p>}
        </div>
      </div>
    </div>
  );
}
