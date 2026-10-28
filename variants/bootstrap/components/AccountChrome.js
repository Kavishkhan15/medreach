"use client";
import { usePathname } from "next/navigation";
import AccountSidebar from "./AccountSidebar";

const ACCOUNT_ROUTES = ["/profile", "/dashboard", "/admin", "/hospital"];

export default function AccountChrome({ children }) {
  const pathname = usePathname();

  const inAccount = ACCOUNT_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));

  const workspace = pathname === "/dashboard" || pathname === "/profile" || pathname === "/admin" || pathname?.startsWith("/admin/");

  if (inAccount) {
    return (
      <div className={`account-shell${workspace ? " account-shell--workspace" : ""}${pathname?.startsWith("/admin") ? " account-shell--admin" : ""}${pathname === "/admin" ? " account-shell--overview" : ""}`}>
        <AccountSidebar />
        <div className="account-content">{children}</div>
      </div>
    );
  }

  return children;
}
