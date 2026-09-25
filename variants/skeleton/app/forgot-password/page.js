"use client";
import { useState } from "react";
import { post } from "../../lib/productApi";
export default function ForgotPassword() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState("");
  const submit = async (e) => { e.preventDefault(); try { await post("/api/auth/forgot-password", { email }); setMessage("If that address exists, reset instructions have been sent."); } catch (err) { setMessage(err.message); } };
  return <div className="container" style={{ maxWidth: 480, margin: "0 auto" }}><form className="surface" onSubmit={submit}>
    <h1 className="h3">Forgot password</h1>
    <div className="form-group"><label className="form-label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className="form-control" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <button className="btn btn-primary btn-block">Send reset link</button>
    {message && <p role="status" className="mt-3 small">{message}</p>}
  </form></div>;
}
