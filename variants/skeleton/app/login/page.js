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
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState("/");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("returnTo");
    setReturnTo(safeReturnTo(candidate));
    if (params.get("registered") === "1") {
      const pendingEmail = window.sessionStorage.getItem("medreach:pending-registration-email") || "";
      window.sessionStorage.removeItem("medreach:pending-registration-email");
      setMode("login");
      setForm({ email: pendingEmail, password: "", name: "" });
      setNotice("Registration accepted. Check your email for verification instructions, then sign in to continue.");
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
        const user = await login(form.email, form.password);
        router.push(profileDestination(user, returnTo));
      } else {
        const result = await register({ email: form.email, password: form.password, name: form.name });
        if (result.accepted && !result.user) {
          setMode("login");
          setForm({ email: form.email, password: "", name: "" });
          setErrors({});
          setNotice(`${result.message} Sign in to continue.`);
        }
        else router.push(profileDestination(result.user, returnTo));
      }
    } catch (err) {
      setServerError(err.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-center">
      <div className="auth-col">
        <div className="surface">
          <h1 className="h3 mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="disclaimer mb-3">Sign in to save hospitals for quick access.</p>
          {serverError && <div className="alert alert-danger py-2">{serverError}</div>}
          {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
          <form aria-busy={busy} onSubmit={submit} noValidate className="stack gap-3">
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
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "Sign in" : "Create account")}</button>
          </form>
          <div className="text-center mt-3">
            <button className="btn-link p-0" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); }}>
              {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
            </button>
          </div>
          {mode === "login" && <p className="text-center mt-2 mb-0"><Link href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Open the registration page</Link></p>}
          {mode === "login" && <p className="text-center mt-2 mb-0"><Link href="/forgot-password">Forgot password?</Link></p>}
        </div>
      </div>
    </div>
  );
}
