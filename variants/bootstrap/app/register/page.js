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
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const result = validateRegister(form);
    setErrors(result.errors);
    if (!result.valid) return;
    setBusy(true);
    try {
      const response = await register(form);
      setMessage(response.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="row justify-content-center"><div className="col-12 col-md-7 col-lg-5">
    <form className="surface vstack gap-3" onSubmit={submit} noValidate>
      <h1 className="h3 mb-0">Create your MedReach account</h1>
      <p className="disclaimer mb-0">We send verification instructions without revealing whether an address already has an account.</p>
      <div><label className="form-label fw-semibold" htmlFor="name">Name</label><input id="name" autoComplete="name" className={`form-control ${errors.name ? "is-invalid" : ""}`} maxLength={120} value={form.name} onChange={set("name")} />{errors.name && <div className="invalid-feedback">{errors.name}</div>}</div>
      <div><label className="form-label fw-semibold" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className={`form-control ${errors.email ? "is-invalid" : ""}`} value={form.email} onChange={set("email")} />{errors.email && <div className="invalid-feedback">{errors.email}</div>}</div>
      <div><label className="form-label fw-semibold" htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" className={`form-control ${errors.password ? "is-invalid" : ""}`} minLength={12} maxLength={128} value={form.password} onChange={set("password")} />{errors.password && <div className="invalid-feedback">{errors.password}</div>}<p className="disclaimer mt-1 mb-0">Use 12+ characters with upper, lower, and numeric characters.</p></div>
      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      {message && <div className="alert alert-info mb-0" role="status">{message}</div>}
      <p className="text-center mb-0"><Link href="/login">Already registered? Sign in</Link></p>
    </form>
  </div></div>;
}
