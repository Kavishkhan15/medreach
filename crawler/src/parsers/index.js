// Parsers turn raw fetched content (JSON or simple HTML) into loosely-structured
// records. Selectors/paths are passed IN via the adapter config — never hardcoded
// across the app — so a source's structure lives with its DataSource entry.

// --- JSON path helpers -------------------------------------------------------
function getPath(obj, path) {
  if (!path) return undefined;
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export function parseJson(raw) {
  try { return { ok: true, data: JSON.parse(raw) }; }
  catch { return { ok: false, data: null, error: "invalid_json" }; }
}

// --- Minimal HTML text extraction (dependency-free) --------------------------
// Extracts inner text for the FIRST element carrying a given data attribute,
// e.g. <span data-field="ed_status">available</span>. Intentionally conservative:
// we do not run a full DOM — adapters that need one should use a JSON API instead.
export function extractByDataField(html, field) {
  if (typeof html !== "string") return undefined;
  const re = new RegExp(`data-field=["']${field}["'][^>]*>([^<]*)<`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : undefined;
}

export function stripTags(html) {
  return typeof html === "string" ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

// hospitalParser: pull identity fields using a field→path/selector map.
export function parseHospital(raw, cfg = {}) {
  if (cfg.format === "json") {
    const { ok, data } = parseJson(raw);
    if (!ok) return null;
    const map = cfg.map || {};
    const out = {};
    for (const [field, path] of Object.entries(map)) out[field] = getPath(data, path);
    return out;
  }
  // html
  const map = cfg.map || {};
  const out = {};
  for (const field of Object.keys(map)) out[field] = extractByDataField(raw, map[field]);
  return out;
}

// facilityParser: extract a list of { facility, status } pairs.
export function parseFacilities(raw, cfg = {}) {
  if (cfg.format === "json") {
    const { ok, data } = parseJson(raw);
    if (!ok) return [];
    const list = getPath(data, cfg.listPath || "facilities") || [];
    return Array.isArray(list)
      ? list.map((f) => ({ facility: getPath(f, cfg.nameKey || "name"), status: getPath(f, cfg.statusKey || "status") }))
      : [];
  }
  // html: repeated <li data-facility="ICU" data-status="available">
  const out = [];
  const re = /data-facility=["']([^"']+)["'][^>]*data-status=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(raw))) out.push({ facility: m[1].trim(), status: m[2].trim() });
  return out;
}

// availabilityParser: same shape as facilities but includes a timestamp if present.
export function parseAvailability(raw, cfg = {}) {
  const facilities = parseFacilities(raw, cfg);
  let observedAt = null;
  if (cfg.format === "json") {
    const { ok, data } = parseJson(raw);
    if (ok) observedAt = getPath(data, cfg.observedAtPath || "observedAt") || null;
  } else {
    observedAt = extractByDataField(raw, cfg.observedAtField || "observed_at") || null;
  }
  return { facilities, observedAt };
}
