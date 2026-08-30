// Shared, framework-free input validation used by forms across all variants so
// client-side validation behavior is identical. Backend remains the source of truth.

export const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const minLen = (v, n) => typeof v === "string" && v.trim().length >= n;
export const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

export function validateLogin({ email, password }) {
  const errors = {};
  if (!isEmail(email)) errors.email = "Enter a valid email address";
  if (!nonEmpty(password)) errors.password = "Password is required";
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateRegister({ name, email, password }) {
  const errors = {};
  if (!nonEmpty(name)) errors.name = "Name is required";
  if (!isEmail(email)) errors.email = "Enter a valid email address";
  if (!minLen(password, 8)) errors.password = "Password must be at least 8 characters";
  return { valid: Object.keys(errors).length === 0, errors };
}

// Guards against obviously unsafe strings before they hit the API (defense in depth).
export function sanitizeText(v, max = 200) {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}
