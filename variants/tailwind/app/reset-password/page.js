"use client";
import { useEffect, useState } from "react";
import { post } from "../../lib/productApi";
export default function ResetPassword() {
  const [token, setToken] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  const submit = async (e) => { e.preventDefault(); try { await post("/api/auth/reset-password", { token, password }); setMessage("Password reset. You can sign in now."); } catch (err) { setMessage(err.message); } };
  return <div className="flex justify-center"><div className="w-full max-w-md"><form className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6 space-y-4" onSubmit={submit}>
    <h1 className="text-xl font-bold">Choose a new password</h1>
    <label className="block text-sm font-semibold mb-1" htmlFor="password">New password</label>
    <input id="password" type="password" autoComplete="new-password" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
    <p className="text-xs text-gray-500">Use 12+ characters with upper, lower, and numeric characters. Resetting signs out every existing session.</p>
    <button className="w-full bg-[var(--color-emergency)] text-white font-bold py-2 rounded-md" disabled={!token}>Reset password</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form></div></div>;
}
