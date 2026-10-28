import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import "./account-workspace.css";
import "./site-theme.css";
import "./navbar.css";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SystemBanner from "../components/SystemBanner";
import SosButton from "../components/SosButton";
import HealthcareAssistant from "../components/DeferredHealthcareAssistant";
import AccountChrome from "../components/AccountChrome";
import PublicBreadcrumbs from "../components/PublicBreadcrumbs";
import { SITE_URL, absoluteUrl, siteImage } from "../lib/seo.js";

const medreachSans = localFont({
  src: "../public/fonts/geist-variable.woff2",
  variable: "--font-medreach",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MedReach — Healthcare Discovery in Mumbai", template: "%s | MedReach Mumbai" },
  description: "Find hospitals, blood banks, ambulance providers and diagnostic services in Mumbai. Review reported information and coordinate requests with providers.",
  keywords: ["Mumbai hospitals", "hospital directory Mumbai", "blood banks Mumbai", "ambulance providers Mumbai", "diagnostic centres Mumbai", "healthcare jobs Mumbai", "MedReach"],
  authors: [{ name: "MedReach" }], creator: "MedReach", publisher: "MedReach Mumbai",
  alternates: { canonical: "/" },
  openGraph: {
    title: "MedReach — Healthcare Discovery in Mumbai",
    description: "Explore healthcare providers in Mumbai, check reported information and coordinate requests. Confirm care and availability directly with providers.",
    url: SITE_URL, siteName: "MedReach Mumbai", locale: "en_IN", type: "website", images: [siteImage],
  },
  twitter: { card: "summary_large_image", title: "MedReach — Healthcare Discovery in Mumbai", description: "Healthcare provider discovery and request coordination across Mumbai.", images: [siteImage.url] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 } },
  icons: { icon: { url: "/logo.png?v=057ffc8008e8", type: "image/png" }, shortcut: "/logo.png?v=057ffc8008e8", apple: "/logo.png?v=057ffc8008e8" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": absoluteUrl("/#website"), url: SITE_URL, name: "MedReach Mumbai", description: "Healthcare provider discovery and request coordination in Mumbai.", publisher: { "@id": absoluteUrl("/#organization") } },
    { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "MedReach", url: SITE_URL, logo: absoluteUrl("/logo.png"), areaServed: { "@type": "City", name: "Mumbai" } },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={medreachSans.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className="medreach-theme">
        <a href="#main" className="visually-hidden-focusable p-2">Skip to content</a>
        <PublicBreadcrumbs />
        <SystemBanner />
        <Navbar />
        <main id="main" className="container py-4"><AccountChrome>{children}</AccountChrome></main>
        <SosButton />
        <HealthcareAssistant />
        <footer className="app-footer py-4 mt-5">
          <div className="container d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span className="footer-brand"><Image src="/brand-word-mark.png" alt="MedReach Connected Healthcare" width={108} height={36} /></span>
            <span>Emergency hospital discovery · Mumbai · Bootstrap variant</span>
            <span className="disclaimer">Not an official emergency service. In danger, call 112.</span>
          </div>
          <div className="container landing-footer-links">
            <div><h3>Explore MedReach</h3><Link href="/hospitals">Hospitals</Link><Link href="/map">Healthcare map</Link><Link href="/diagnostics">Diagnostics</Link></div>
            <div><h3>Care and requests</h3><Link href="/emergency">Emergency care</Link><Link href="/blood-banks">Blood banks</Link><Link href="/urgent-blood">Urgent blood</Link><Link href="/ambulances">Ambulance providers</Link></div>
            <div><h3>Your next step</h3><Link href="/careers">Healthcare careers</Link><Link href="/track">Track a request</Link><Link href="/login">Sign in</Link><Link href="/profile">Profile and security</Link></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
