"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, validateLogin, validateRegister } from "@medreach/core";

const control = "w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-2 focus:outline-none";
const controlInvalid = "border-[var(--color-danger)]";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const check = mode === "login" ? validateLogin(form) : validateRegister(form);
    setErrors(check.errors);
    if (!check.valid) return;
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ email: form.email, password: form.password, name: form.name });
      router.push("/");
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <div className="flex justify-center">
      <div className="w-full md:w-7/12 lg:w-5/12">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5">
          <h1 className="text-2xl mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="text-[.78rem] text-[var(--color-muted)] mb-3">Sign in to save hospitals for quick access.</p>
          {serverError && <div className="rounded bg-[var(--color-danger-bg)] text-[var(--color-danger)] px-3 py-2 mb-3">{serverError}</div>}
          <form onSubmit={submit} noValidate className="flex flex-col gap-3">
            {mode === "register" && (
              <div>
                <label htmlFor="name" className="block font-semibold mb-1">Name</label>
                <input id="name" className={`${control} ${errors.name ? controlInvalid : ""}`} value={form.name} onChange={set("name")} />
                {errors.name && <div className="text-[var(--color-danger)] text-sm mt-1">{errors.name}</div>}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block font-semibold mb-1">Email</label>
              <input id="email" type="email" autoComplete="email" className={`${control} ${errors.email ? controlInvalid : ""}`} value={form.email} onChange={set("email")} />
              {errors.email && <div className="text-[var(--color-danger)] text-sm mt-1">{errors.email}</div>}
            </div>
            <div>
              <label htmlFor="password" className="block font-semibold mb-1">Password</label>
              <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={`${control} ${errors.password ? controlInvalid : ""}`} value={form.password} onChange={set("password")} />
              {errors.password && <div className="text-[var(--color-danger)] text-sm mt-1">{errors.password}</div>}
            </div>
            <button className="inline-flex items-center justify-center font-bold text-lg rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-4 py-2 hover:bg-[var(--color-emergency-dark)]" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="text-center mt-3">
            <button className="p-0 bg-transparent text-[var(--color-emergency-dark)] underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); }}>
              {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
            </button>
          </div>
          <p className="text-[.78rem] text-[var(--color-muted)] text-center mt-2 mb-0">Demo: admin@medreach.test / Admin1234</p>
        </div>
      </div>
    </div>
  );
}
