export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://medreachmumbai.vercel.app";
  const now = new Date();

  const routes = [
    { path: "", changeFrequency: "daily", priority: 1.0 },
    { path: "/emergency", changeFrequency: "daily", priority: 0.95 },
    { path: "/hospitals", changeFrequency: "daily", priority: 0.9 },
    { path: "/blood-banks", changeFrequency: "daily", priority: 0.85 },
    { path: "/urgent-blood", changeFrequency: "daily", priority: 0.85 },
    { path: "/ambulances", changeFrequency: "daily", priority: 0.8 },
    { path: "/diagnostics", changeFrequency: "daily", priority: 0.8 },
    { path: "/careers", changeFrequency: "weekly", priority: 0.75 },
    { path: "/map", changeFrequency: "weekly", priority: 0.7 },
    { path: "/track", changeFrequency: "weekly", priority: 0.6 },
    { path: "/login", changeFrequency: "monthly", priority: 0.5 },
    { path: "/register", changeFrequency: "monthly", priority: 0.5 },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
