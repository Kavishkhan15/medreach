"use client";
import { useEffect, useState } from "react";
import { post } from "../../lib/productApi";
export default function ResetPassword() { const [token, setToken] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  const submit = async (e) => { e.preventDefault(); try { await post("/api/auth/reset-password", { token, password }); setMessage("Password reset. You can sign in now."); } catch (e) { setMessage(e.message); } };
  return <div className="row justify-content-center"><div className="col-md-7 col-lg-5"><form className="surface vstack gap-3" onSubmit={submit}><h1 className="h3">Choose a new password</h1><label className="form-label" htmlFor="password">New password</label><input id="password" type="password" className="form-control" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /><button className="btn btn-primary" disabled={!token}>Reset password</button>{message && <p role="status">{message}</p>}</form></div></div>;
}
