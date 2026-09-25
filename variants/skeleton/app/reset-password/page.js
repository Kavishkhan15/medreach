"use client";
import { useEffect, useState } from "react";
import { post } from "../../lib/productApi";
export default function ResetPassword() {
  const [token, setToken] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  const submit = async (e) => { e.preventDefault(); try { await post("/api/auth/reset-password", { token, password }); setMessage("Password reset. You can sign in now."); } catch (err) { setMessage(err.message); } };
  return <div className="container" style={{ maxWidth: 480, margin: "0 auto" }}><form className="surface" onSubmit={submit}>
    <h1 className="h3">Choose a new password</h1>
    <div className="form-group"><label className="form-label" htmlFor="password">New password</label><input id="password" type="password" autoComplete="new-password" className="form-control" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    <p className="disclaimer">Use 12+ characters with upper, lower, and numeric characters. Resetting signs out every existing session.</p>
    <button className="btn btn-primary btn-block" disabled={!token}>Reset password</button>
    {message && <p role="status" className="mt-3 small">{message}</p>}
  </form></div>;
}
