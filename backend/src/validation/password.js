// A small local denylist, not a claim of checking every breached password.
const predictablePasswords = new Set([
  "password1234", "password12345", "password123456", "password12345678",
  "admin12345678", "administrator123", "welcome123456", "qwerty12345678",
  "adminmedreach786", "providermedreach786", "medreach123456",
]);

export function validateNewPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128
    || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new Error("Password must be 12–128 characters with upper, lower, and numeric characters");
  }
  // bcrypt ignores bytes after 72. Never silently accept a truncated new secret.
  if (Buffer.byteLength(value, "utf8") > 72) throw new Error("Password must fit within 72 UTF-8 bytes");
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (predictablePasswords.has(normalized)) throw new Error("Choose a less predictable password; common and demo passwords are not allowed");
  return true;
}
