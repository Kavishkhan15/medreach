"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminOverviewIcon from "./AdminOverviewIcon";

const links = [
  ["/provider", "Requests & organisation", "hospital"],
  ["/provider/inventory", "Availability & inventory", "grid"],
  ["/provider/jobs", "Jobs & applicants", "users"],
];
export default function ProviderNav() {
  const path = usePathname();
  return <nav className="provider-nav" aria-label="Provider sections">{links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><AdminOverviewIcon name={icon} size={20} /><span>{label}</span></Link>)}</nav>;
}
