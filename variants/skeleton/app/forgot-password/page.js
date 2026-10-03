"use client";
import { useRef, useState } from "react";
import { post } from "../../lib/productApi";
export default function ForgotPassword() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState("");
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setPending(true); setMessage(""); setError("");
    try { const result = await post("/api/auth/forgot-password", { email }); setMessage(result.message); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setPending(false); }
  };
  return <div className="container" style={{ maxWidth: 480, margin: "0 auto" }}><form className="surface" onSubmit={submit}>
    <h1 className="h3">Forgot password</h1>
    <div className="form-group"><label className="form-label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className="form-control" required disabled={pending} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "Requesting…" : "Send reset link"}</button>
    {message && <p role="status" className="mt-3 small">{message}</p>}
    {error && <p role="alert" className="mt-3 small text-danger">{error}</p>}
  </form></div>;
}
