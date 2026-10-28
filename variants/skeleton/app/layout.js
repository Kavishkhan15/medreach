import "skeleton-css/css/normalize.css";
import "skeleton-css/css/skeleton.css";
import "./globals.css";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SystemBanner from "../components/SystemBanner";
import SosButton from "../components/SosButton";
import HealthcareAssistant from "../components/HealthcareAssistant";

const medreachSans = localFont({
  src: "../public/fonts/geist-variable.woff2",
  variable: "--font-medreach",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://medreachmumbai.vercel.app"),
  title: {
    default: "MedReach — Connected Healthcare for Mumbai",
    template: "%s | MedReach Mumbai",
  },
  description:
    "Find and contact emergency hospitals, blood banks, ambulances and diagnostics across Mumbai. Verified healthcare listings, real-time availability and request coordination.",
  keywords: [
    "Mumbai hospitals",
    "emergency beds Mumbai",
    "blood banks Mumbai",
    "urgent blood",
    "ambulance booking Mumbai",
    "healthcare jobs Mumbai",
    "MedReach",
  ],
  authors: [{ name: "MedReach Healthcare Network" }],
  creator: "MedReach",
  publisher: "MedReach Mumbai",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    title: "MedReach — Connected Healthcare for Mumbai",
    description: "Verified healthcare discovery, emergency bed requisitions, and urgent blood coordination across Mumbai facilities.",
    url: "https://medreachmumbai.vercel.app",
    siteName: "MedReach Mumbai",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/brand-word-mark.png",
        width: 1200,
        height: 630,
        alt: "MedReach Connected Healthcare Mumbai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MedReach — Connected Healthcare for Mumbai",
    description: "Fast, transparent emergency hospital and healthcare discovery across Mumbai.",
    images: ["/brand-word-mark.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: { url: "/logo.png?v=057ffc8008e8", type: "image/png" },
    shortcut: "/logo.png?v=057ffc8008e8",
    apple: "/logo.png?v=057ffc8008e8",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://medreachmumbai.vercel.app/#website",
      "url": "https://medreachmumbai.vercel.app",
      "name": "MedReach Mumbai",
      "description": "Connected healthcare discovery, emergency bed coordination, and urgent blood requisition for Mumbai.",
      "publisher": {
        "@id": "https://medreachmumbai.vercel.app/#organization",
      },
    },
    {
      "@type": "MedicalOrganization",
      "@id": "https://medreachmumbai.vercel.app/#organization",
      "name": "MedReach Healthcare Network",
      "url": "https://medreachmumbai.vercel.app",
      "logo": "https://medreachmumbai.vercel.app/logo.png",
      "areaServed": {
        "@type": "City",
        "name": "Mumbai",
      },
      "medicalSpecialty": [
        "EmergencyMedicine",
        "Trauma",
        "CriticalCare",
      ],
    },
  ],
};

import FooterWordmarkReveal from "../components/FooterWordmarkReveal";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={medreachSans.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SystemBanner />
        <Navbar />
        <main id="main" className="container py-4">{children}</main>
        <SosButton />
        <HealthcareAssistant />
        <footer className="app-footer py-4 mt-5">
          <div className="container footer-inner">
            <span className="fw-semibold"><Image src="/brand-word-mark.png" alt="MedReach Connected Healthcare" width={108} height={36} /></span>
            <span>Emergency hospital discovery · Mumbai · Skeleton variant</span>
            <span className="disclaimer">Not an official emergency service. In danger, call 112.</span>
          </div>
          <div className="container skeleton-landing-footer-links">
            <div><h3 className="section-title" style={{ fontSize: "13px", textTransform: "uppercase", fontWeight: "bold", marginBottom: "8px" }}>Explore MedReach</h3><Link href="/hospitals">Hospitals</Link><Link href="/map">Healthcare map</Link><Link href="/diagnostics">Diagnostics</Link></div>
            <div><h3 className="section-title" style={{ fontSize: "13px", textTransform: "uppercase", fontWeight: "bold", marginBottom: "8px" }}>Care and requests</h3><Link href="/emergency">Emergency care</Link><Link href="/blood-banks">Blood banks</Link><Link href="/urgent-blood">Urgent blood</Link><Link href="/ambulances">Ambulance providers</Link></div>
            <div><h3 className="section-title" style={{ fontSize: "13px", textTransform: "uppercase", fontWeight: "bold", marginBottom: "8px" }}>Your next step</h3><Link href="/careers">Healthcare careers</Link><Link href="/track">Track a request</Link><Link href="/login">Sign in</Link><Link href="/profile">Profile and security</Link></div>
          </div>
        </footer>
        <FooterWordmarkReveal />
      </body>
    </html>
  );
}
