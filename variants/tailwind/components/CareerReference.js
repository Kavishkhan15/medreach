"use client";
import { useState } from "react";
import Link from "next/link";

export default function CareerReference({ reference, track = true, showReference = true }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  if (!reference) return null;
  return <div style={{ minWidth: 0 }}>
    {showReference && <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{reference}</code>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold" style={{ minHeight: 44 }} onClick={async () => {
        try { await navigator.clipboard.writeText(reference); setCopied(true); setManual(false); }
        catch { setCopied(false); setManual(true); }
      }}>Copy reference</button>
      {track && <Link className="rounded border border-[var(--color-emergency)] px-3 py-2 text-sm font-semibold text-[var(--color-emergency)]" style={{ minHeight: 44 }} href={`/track?type=career&reference=${encodeURIComponent(reference)}`}>Track application</Link>}
    </div>
    {copied && <p role="status" className="text-sm text-gray-600">Reference copied.</p>}
    {manual && <><p role="status" className="text-sm text-gray-600">Copy is unavailable. Select and copy the reference below.</p><input aria-label="Application reference to copy" className="w-full rounded border border-gray-300 p-2 text-base" style={{ fontSize: 16, maxWidth: "100%" }} value={reference} readOnly onFocus={(event) => event.target.select()} /></>}
  </div>;
}
