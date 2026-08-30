import "./globals.css";
import { Inter } from "next/font/google";
import Navbar from "../components/Navbar";
import SystemBanner from "../components/SystemBanner";
import SosButton from "../components/SosButton";

const inter = Inter({ subsets: ["latin"], display: "swap", weight: ["400", "500", "600", "700", "800"], variable: "--font-inter" });

export const metadata = {
  title: "MedReach — Emergency care, when every second matters",
  description:
    "Find and contact emergency hospitals in Mumbai. Deterministic, transparent hospital discovery with verified data, freshness, and rule-based ranking.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white p-2">Skip to content</a>
        <SystemBanner />
        <Navbar />
        <main id="main" className="mx-auto w-full max-w-[1140px] px-3 py-4">{children}</main>
        <SosButton />
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] text-[.85rem] py-4 mt-12">
          <div className="mx-auto w-full max-w-[1140px] px-3 flex flex-wrap justify-between gap-2">
            <span className="font-semibold">🏥 MedReach</span>
            <span>Emergency hospital discovery · Mumbai · Tailwind variant</span>
            <span className="text-[.78rem] text-[var(--color-muted)]">Not an official emergency service. In danger, call 112.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
