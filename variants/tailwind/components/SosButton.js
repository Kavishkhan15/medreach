"use client";
import { useState } from "react";
import Link from "next/link";
import { btnPrimary, btnOutlineSecondary } from "../lib/tone";

// Prominent SOS control. Does NOT claim to dispatch emergency services (no such
// integration exists) — it surfaces the real emergency actions and requires a
// confirmation tap to avoid accidental activation.
export default function SosButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="fixed right-4 bottom-4 z-40 bg-[var(--color-critical)] text-white border-0 rounded-full font-extrabold px-[1.15rem] py-[.8rem] shadow-[var(--shadow-lg)] hover:bg-[#8f0015]"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        🆘 SOS
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sosTitle"
          style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-[500px]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-lg font-bold m-0" id="sosTitle">Emergency help</h2>
                <button type="button" className="text-2xl leading-none px-2" aria-label="Close" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="flex flex-col gap-2 p-4">
                <p className="text-[.78rem] text-[var(--color-muted)] mb-1">
                  MedReach helps you find and contact hospitals. It does not dispatch
                  emergency services. In a life-threatening emergency, call the number below.
                </p>
                <a className={`${btnPrimary} text-lg`} href="tel:112">📞 Call 112 (Emergency)</a>
                <a className={btnOutlineSecondary} href="tel:102">🚑 Call 102 (Ambulance)</a>
                <Link className={btnOutlineSecondary} href="/emergency" onClick={() => setOpen(false)}>
                  🏥 Find nearest emergency hospital
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
