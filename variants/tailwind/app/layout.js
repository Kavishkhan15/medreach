import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SystemBanner from "../components/SystemBanner";
import SosButton from "../components/SosButton";
import HealthcareAssistant from "../components/HealthcareAssistant";

export const metadata = {
  title: "MedReach — Emergency care, when every second matters",
  description:
    "Find and contact emergency hospitals in Mumbai. Deterministic, transparent hospital discovery with healthcare listings and rule-based ranking.",
  icons: {
    icon: { url: "/logo.png?v=057ffc8008e8", type: "image/png" },
    shortcut: "/logo.png?v=057ffc8008e8",
    apple: "/logo.png?v=057ffc8008e8",
  },
};

import FooterWordmarkReveal from "../components/FooterWordmarkReveal";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white p-2">Skip to content</a>
        <SystemBanner />
        <Navbar />
        <main id="main" className="mx-auto w-full max-w-[1140px] px-3 py-4">{children}</main>
        <SosButton />
        <HealthcareAssistant />
        <footer className="tw-site-footer border-t border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] text-[.85rem] py-4 mt-12">
          <div className="mx-auto w-full max-w-[1140px] px-3 flex flex-wrap justify-between gap-2">
            <span><Image src="/brand-word-mark.png" alt="MedReach" width={108} height={36} /></span>
            <span>Emergency hospital discovery · Mumbai · Tailwind variant</span>
            <span className="text-[.78rem] text-[var(--color-muted)]">Not an official emergency service. In danger, call 112.</span>
          </div>
          <div className="tw-landing-footer-links">
            <div><h2>Explore MedReach</h2><Link href="/hospitals">Hospitals</Link><Link href="/map">Healthcare map</Link><Link href="/diagnostics">Diagnostics</Link></div>
            <div><h2>Care and requests</h2><Link href="/emergency">Emergency care</Link><Link href="/blood-banks">Blood banks</Link><Link href="/urgent-blood">Urgent blood</Link><Link href="/ambulances">Ambulance providers</Link></div>
            <div><h2>Your next step</h2><Link href="/careers">Healthcare careers</Link><Link href="/track">Track a request</Link><Link href="/login">Sign in</Link><Link href="/profile">Profile and security</Link></div>
          </div>
          <FooterWordmarkReveal />
        </footer>
      </body>
    </html>
  );
}
