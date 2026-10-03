"use client";
import { useState } from "react";
import Link from "next/link";

export default function CareerReference({ reference, track = true, showReference = true }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  if (!reference) return null;
  return <div style={{ minWidth: 0 }}>
    {showReference && <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{reference}</code>}
    <div className="d-flex flex-wrap align-items-center gap-2">
      <button type="button" className="btn btn-outline-secondary btn-sm" style={{ minHeight: 44 }} onClick={async () => {
        try { await navigator.clipboard.writeText(reference); setCopied(true); setManual(false); }
        catch { setCopied(false); setManual(true); }
      }}>Copy reference</button>
      {track && <Link className="btn btn-outline-primary btn-sm" style={{ minHeight: 44 }} href={`/track?type=career&reference=${encodeURIComponent(reference)}`}>Track application</Link>}
    </div>
    {copied && <p role="status" className="small text-secondary">Reference copied.</p>}
    {manual && <><p role="status" className="small text-secondary">Copy is unavailable. Select and copy the reference below.</p><input aria-label="Application reference to copy" className="form-control" style={{ fontSize: 16, maxWidth: "100%" }} value={reference} readOnly onFocus={(event) => event.target.select()} /></>}
  </div>;
}
