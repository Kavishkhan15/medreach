import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import Image from "next/image";
import Navbar from "../components/Navbar";
import SystemBanner from "../components/SystemBanner";
import SosButton from "../components/SosButton";
import HealthcareAssistant from "../components/HealthcareAssistant";

export const metadata = {
  title: "MedReach — Emergency care, when every second matters",
  description:
    "Find and contact emergency hospitals in Mumbai. Deterministic, transparent hospital discovery with verified data, freshness, and rule-based ranking.",
  icons: {
    icon: { url: "/logo.png?v=057ffc8008e8", type: "image/png" },
    shortcut: "/logo.png?v=057ffc8008e8",
    apple: "/logo.png?v=057ffc8008e8",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="visually-hidden-focusable p-2">Skip to content</a>
        <SystemBanner />
        <Navbar />
        <main id="main" className="container py-4">{children}</main>
        <SosButton />
        <HealthcareAssistant />
        <footer className="app-footer py-4 mt-5">
          <div className="container d-flex flex-wrap justify-content-between gap-2">
            <span className="fw-semibold"><Image src="/brand-word-mark.png" alt="MedReach" width={108} height={36} /></span>
            <span>Emergency hospital discovery · Mumbai · Bootstrap variant</span>
            <span className="disclaimer">Not an official emergency service. In danger, call 112.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
