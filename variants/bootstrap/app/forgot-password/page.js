"use client";
import { useState } from "react";
import Link from "next/link";
import { post } from "../../lib/productApi";
export default function ForgotPassword() { const [email, setEmail] = useState(""); const [result, setResult] = useState(null); const [error, setError] = useState("");
  const submit = async (e) => { e.preventDefault(); try { setResult(await post("/api/auth/forgot-password", { email })); setError(""); } catch (e) { setError(e.message); } };
  return <div className="row justify-content-center"><div className="col-md-7 col-lg-5"><form className="surface vstack gap-3" onSubmit={submit}><h1 className="h3">Reset your password</h1><p className="disclaimer">If the account exists, a reset link is prepared. With email disabled, a local development link is shown.</p><label htmlFor="email" className="form-label">Email</label><input id="email" type="email" className="form-control" required value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn btn-primary">Request reset</button>{result && <div className="alert alert-success">{result.message}{result.resetLink && <p className="mt-2 mb-0"><Link href={new URL(result.resetLink).pathname + new URL(result.resetLink).search}>Open local reset link</Link></p>}</div>}{error && <div className="alert alert-danger">{error}</div>}</form></div></div>;
}
