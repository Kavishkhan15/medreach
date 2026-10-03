export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/;

const RESUME_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function validateResume(value) {
  if (value == null) return true;
  if (typeof value !== "string" && (typeof value !== "object" || Array.isArray(value))) return false;
  const url = typeof value === "string" ? value : value.fileUrl || value.url || value.dataUrl || value.data || "";
  if (typeof url !== "string") return false;
  if (!url.trim()) return true;
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(url);
    if (!match || !RESUME_TYPES.has(match[1].toLowerCase()) || !match[2] || match[2].length % 4 !== 0) return false;
    const bytes = Buffer.from(match[2], "base64");
    return bytes.toString("base64") === match[2] && bytes.length <= 10 * 1024 * 1024;
  }
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

export const applicationValidators = (body) => [
  body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("email").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("contactPhone").optional({ checkFalsy: true }).trim().matches(PHONE_PATTERN),
  body("phone").optional({ checkFalsy: true }).trim().matches(PHONE_PATTERN),
  body("experienceYears").optional().isFloat({ min: 0, max: 70 }).toFloat(),
  body("experience").optional().isFloat({ min: 0, max: 70 }).toFloat(),
  body("resume").optional().custom(validateResume).withMessage("Resume must be a public HTTP(S) link or a PDF/Word upload"),
  body("resume.fileSize").optional().isInt({ min: 0, max: 10 * 1024 * 1024 }).toInt(),
];
