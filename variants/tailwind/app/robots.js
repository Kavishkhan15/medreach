export default function robots() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://medreachmumbai.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/provider",
          "/provider/",
          "/dashboard",
          "/dashboard/",
          "/profile",
          "/api/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
