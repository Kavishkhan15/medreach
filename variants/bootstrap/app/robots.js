import { absoluteUrl } from "../lib/seo.js";

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [
      "/admin", "/admin/", "/provider", "/provider/", "/hospital$", "/hospital/",
      "/dashboard", "/dashboard/", "/profile", "/requests", "/requests/", "/api/",
      "/reset-password", "/verify-email", "/verify-notification-email", "/activate-provider",
    ] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
