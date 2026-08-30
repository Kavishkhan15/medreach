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
      <ul className="flex flex-wrap gap-1 list-none p-0 m-0">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              className={`inline-block rounded-[var(--radius)] px-3 py-1.5 font-semibold no-underline ${
                path === l.href
                  ? "bg-[var(--color-emergency)] text-white"
                  : "text-[var(--color-text)] hover:bg-[#f1f3f5]"
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
