import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // @medreach/core is bundled locally in _core/ so it works outside the monorepo.
    config.resolve.alias["@medreach/core"] =
      path.resolve(__dirname, "_core/index.js");
    return config;
  },
};
export default nextConfig;
