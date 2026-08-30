"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/hospitals", label: "Hospitals" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/crawler", label: "Crawler" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-4">
      <ul className="admin-nav flex flex-wrap gap-1">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link className={`admin-nav-link ${path === l.href ? "active" : ""}`} href={l.href}
              aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
