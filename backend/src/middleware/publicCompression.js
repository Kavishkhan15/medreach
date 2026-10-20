import compression from "compression";

// Revalidate public directory reads. Never cache/compress account or patient
// responses; the security middleware's no-store policy takes precedence.
const directory = /^\/api\/(hospitals|blood-banks|diagnostics|ambulances|jobs)\/?$/;
const isDirectory = req => directory.test(req.originalUrl.split("?")[0]) && ["GET", "HEAD"].includes(req.method);
export function publicCompression() {
  const compress = compression({
    filter: (req, res) => isDirectory(req)
      && !String(res.getHeader("Cache-Control") || "").includes("no-store") && compression.filter(req, res),
  });
  return (req, res, next) => {
    if (isDirectory(req) && !res.getHeader("Cache-Control")) {
      res.set("Cache-Control", "public, no-cache");
    }
    compress(req, res, next);
  };
}
