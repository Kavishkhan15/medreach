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
  return <div className="flex justify-center"><div className="w-full max-w-md"><form className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6 space-y-4" onSubmit={submit}>
    <h1 className="text-xl font-bold">Forgot password</h1>
    <label className="block text-sm font-semibold mb-1" htmlFor="email">Email</label>
    <input id="email" type="email" autoComplete="email" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" required disabled={pending} value={email} onChange={(e) => setEmail(e.target.value)} />
    <button className="w-full bg-[var(--color-emergency)] text-white font-bold py-2 rounded-md disabled:opacity-50" disabled={pending}>{pending ? "Requesting…" : "Send reset link"}</button>
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </form></div></div>;
}
