"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth, validateRegister } from "@medreach/core";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setMessage("");
    const result = validateRegister(form);
    setErrors(result.errors);
    if (!result.valid) return;
    setBusy(true);
    try { const r = await register(form); setMessage(r.message); }
    catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  };
  return <div className="container" style={{ maxWidth: 480, margin: "0 auto" }}>
    <form className="surface" onSubmit={submit} noValidate>
      <h1 className="h3">Create your MedReach account</h1>
      <p className="disclaimer">We send verification instructions without revealing whether an address already has an account.</p>
      <div className="form-group"><label className="form-label" htmlFor="name">Name</label><input id="name" autoComplete="name" className={`form-control ${errors.name ? "is-invalid" : ""}`} maxLength={120} value={form.name} onChange={set("name")} />{errors.name && <p className="text-danger small">{errors.name}</p>}</div>
      <div className="form-group"><label className="form-label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className={`form-control ${errors.email ? "is-invalid" : ""}`} value={form.email} onChange={set("email")} />{errors.email && <p className="text-danger small">{errors.email}</p>}</div>
      <div className="form-group"><label className="form-label" htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" className={`form-control ${errors.password ? "is-invalid" : ""}`} minLength={12} maxLength={128} value={form.password} onChange={set("password")} />{errors.password && <p className="text-danger small">{errors.password}</p>}<p className="disclaimer">Use 12+ characters with upper, lower, and numeric characters.</p></div>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      {message && <div className="alert alert-info mt-3" role="status">{message}</div>}
      <p className="text-center mt-3"><Link href="/login">Already registered? Sign in</Link></p>
    </form>
  </div>;
}
