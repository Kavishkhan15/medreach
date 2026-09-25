"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/hospitals", label: "Hospitals" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/crawler", label: "Crawler" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/audit", label: "Audit", systemOnly: true },
  { href: "/admin/users", label: "Users", systemOnly: true },
  { href: "/admin/security", label: "Security & auth", systemOnly: true },
  { href: "/admin/operations", label: "Operations" },
];

export default function AdminNav() {
  const path = usePathname();
  const { user } = useAuth();
  return (
    <nav aria-label="Admin sections" className="mb-6">
      <ul className="flex flex-wrap gap-1.5">
        {LINKS.filter((link) => !link.systemOnly || user?.role === "system_admin").map((l) => (
          <li key={l.href}>
            <Link
              className={`inline-block px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                path === l.href
                  ? "bg-[var(--color-emergency)] text-white font-bold"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
