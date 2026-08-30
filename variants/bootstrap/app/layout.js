import "bootstrap/dist/css/bootstrap.min.css";
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
        <a href="#main" className="visually-hidden-focusable p-2">Skip to content</a>
        <SystemBanner />
        <Navbar />
        <main id="main" className="container py-4">{children}</main>
        <SosButton />
        <footer className="app-footer py-4 mt-5">
          <div className="container d-flex flex-wrap justify-content-between gap-2">
            <span className="fw-semibold">🏥 MedReach</span>
            <span>Emergency hospital discovery · Mumbai · Bootstrap variant</span>
            <span className="disclaimer">Not an official emergency service. In danger, call 112.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
