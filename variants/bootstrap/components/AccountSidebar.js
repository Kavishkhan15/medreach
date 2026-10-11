"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@medreach/core";
import EmergencyIcon from "./EmergencyIcons";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "document" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export default function AccountSidebar() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    window.dispatchEvent(new Event("medreach:auth-changed"));
    router.push("/login");
  };

  const roleItems = user ? [
    ...(["provider_admin", "hospital_admin"].includes(user.role) ? [{ href: "/provider", label: "Provider", icon: "hospital" }] : []),
    ...(isAdmin && user.role === "system_admin" ? [{ href: "/admin", label: "Admin", icon: "shield" }] : []),
  ] : [];

  const renderItem = ({ href, label, icon }) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
    return (
      <li key={href}>
        <Link
          className={`account-sidebar-item${active ? " account-sidebar-item--active" : ""}`}
          href={href}
          aria-current={active ? "page" : undefined}
        >
          <EmergencyIcon name={icon} size={18} />
          <span>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="account-sidebar" aria-label="Account">
      <span className="account-sidebar-label">Account</span>
      <ul className="account-sidebar-list">
        {ITEMS.map(renderItem)}
        {roleItems.length > 0 && <li aria-hidden="true"><hr className="account-sidebar-divider" /></li>}
        {roleItems.map(renderItem)}
        {user && (
          <li>
            <button className="account-sidebar-item account-sidebar-logout" type="button" onClick={handleLogout}>
              <EmergencyIcon name="user" size={18} />
              <span>Log out</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

