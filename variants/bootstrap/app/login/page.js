"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, validateLogin, validateRegister } from "@medreach/core";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [verificationLink, setVerificationLink] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const check = mode === "login" ? validateLogin(form) : validateRegister(form);
    setErrors(check.errors);
    if (!check.valid) return;
    try {
      if (mode === "login") { await login(form.email, form.password); router.push("/"); }
      else {
        const result = await register({ email: form.email, password: form.password, name: form.name });
        if (result.verificationLink) setVerificationLink(result.verificationLink);
        else router.push("/");
      }
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-7 col-lg-5">
        <div className="surface">
          <h1 className="h3 mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="disclaimer mb-3">Sign in to save hospitals for quick access.</p>
          {serverError && <div className="alert alert-danger py-2">{serverError}</div>}
          {verificationLink && <div className="alert alert-info" role="status">Account created. Email sending is disabled in this environment. <a href={verificationLink}>Verify your email with the local development link</a>, or <Link href="/dashboard">continue to your dashboard</Link>.</div>}
          <form onSubmit={submit} noValidate className="vstack gap-3">
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
            <button className="btn btn-primary btn-lg" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="text-center mt-3">
            <button className="btn btn-link p-0" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); }}>
              {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
            </button>
          </div>
          {mode === "login" && <p className="text-center mt-2 mb-0"><Link href="/forgot-password">Forgot password?</Link></p>}
          <p className="disclaimer text-center mt-2 mb-0">Demo: admin@medreach.test / Admin1234</p>
        </div>
      </div>
    </div>
  );
}
