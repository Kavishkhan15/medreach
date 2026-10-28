import { absoluteUrl } from "../lib/seo.js";

// Resource detail routes are not enumerated from an unbounded backend request.
// Only add lastModified when an actual editorial/content update date is supplied.
export default function sitemap() {
  const updated = process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT;
  const date = updated ? new Date(updated) : null;
  const lastModified = date && Number.isFinite(date.getTime()) ? date : null;
  return [
    ["/", "daily", 1], ["/emergency", "daily", 0.95], ["/hospitals", "daily", 0.9],
    ["/blood-banks", "daily", 0.85], ["/urgent-blood", "daily", 0.85], ["/ambulances", "daily", 0.8],
    ["/diagnostics", "daily", 0.8], ["/careers", "weekly", 0.75], ["/map", "weekly", 0.7],
    ["/track", "weekly", 0.6], ["/login", "monthly", 0.5], ["/register", "monthly", 0.5],
  ].map(([path, changeFrequency, priority]) => ({ url: absoluteUrl(path), changeFrequency, priority, ...(lastModified ? { lastModified } : {}) }));
}
