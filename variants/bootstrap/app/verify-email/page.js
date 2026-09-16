"use client";
import { useEffect, useState } from "react";
import { post } from "../../lib/productApi";
export default function VerifyEmail() { const [message, setMessage] = useState("Checking verification link…");
  useEffect(() => { const token = new URLSearchParams(window.location.search).get("token"); if (!token) { setMessage("Verification link missing."); return; }
    post("/api/auth/verify-email", { token }).then(() => setMessage("Email verified. You can continue using MedReach.")).catch((e) => setMessage(e.message)); }, []);
  return <div className="surface"><h1 className="h3">Email verification</h1><p role="status">{message}</p></div>;
}
