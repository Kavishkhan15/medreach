"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeReturnTo, useAuth, validateRegister } from "@medreach/core";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  useEffect(() => {
    setReturnTo(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
  }, []);
  const submit = async (e) => {
    e.preventDefault(); setMessage("");
    const result = validateRegister(form);
    setErrors(result.errors);
    if (!result.valid) return;
    setBusy(true);
    try {
      const response = await register(form);
      if (response.accepted) {
        window.sessionStorage.setItem("medreach:pending-registration-email", form.email.trim());
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}&registered=1`);
      } else setMessage(response.message);
    }
    catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  };
  return <div className="flex justify-center"><div className="w-full max-w-md">
    <form className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6 space-y-4" onSubmit={submit} noValidate>
      <h1 className="text-xl font-bold">Create your MedReach account</h1>
      <p className="text-xs text-gray-500">We send verification instructions without revealing whether an address already has an account.</p>
      <div><label className="block text-sm font-semibold mb-1" htmlFor="name">Name</label><input id="name" autoComplete="name" className={`w-full border rounded-md px-3 py-2 text-sm ${errors.name ? "border-red-500" : "border-gray-300"}`} maxLength={120} value={form.name} onChange={set("name")} />{errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}</div>
      <div><label className="block text-sm font-semibold mb-1" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className={`w-full border rounded-md px-3 py-2 text-sm ${errors.email ? "border-red-500" : "border-gray-300"}`} value={form.email} onChange={set("email")} />{errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}</div>
      <div><label className="block text-sm font-semibold mb-1" htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" className={`w-full border rounded-md px-3 py-2 text-sm ${errors.password ? "border-red-500" : "border-gray-300"}`} minLength={12} maxLength={128} value={form.password} onChange={set("password")} />{errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}<p className="text-xs text-gray-500 mt-1">Use 12+ characters with upper, lower, and numeric characters.</p></div>
      <button className="w-full bg-[var(--color-emergency)] text-white font-bold py-2 rounded-md hover:bg-[var(--color-emergency-dark)]" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 text-sm" role="status">{message}</div>}
      <p className="text-center text-sm"><Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-[var(--color-emergency)]">Already registered? Sign in</Link></p>
    </form>
  </div></div>;
}
