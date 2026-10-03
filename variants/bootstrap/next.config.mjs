import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ] }];
  },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  webpack(config) {
    // @medreach/core is bundled locally in _core/ so it works outside the monorepo.
    config.resolve.alias["@medreach/core"] =
      path.resolve(__dirname, "_core/index.js");
    return config;
  },
};
export default nextConfig;
