// Strict parsing prevents an enforcement typo from quietly disabling MFA.
export function validateMfaConfiguration(source = process.env) {
  for (const name of ["MFA_ENFORCE_PRIVILEGED", "MFA_ENFORCE_PROVIDERS"]) {
    if (source[name] !== undefined && !["true", "false"].includes(source[name])) {
      throw Object.assign(new Error(`${name} must be exactly true or false`), { status: 503, code: "MFA_CONFIGURATION_INVALID" });
    }
  }
  if (source.MFA_ENFORCE_PROVIDERS === "true" && source.MFA_ENFORCE_PRIVILEGED !== "true") {
    throw Object.assign(new Error("Provider MFA requires privileged MFA enforcement"), { status: 503, code: "MFA_CONFIGURATION_INVALID" });
  }
  if ((source.MFA_ENFORCE_PRIVILEGED === "true" || Boolean(source.MFA_ENCRYPTION_KEY))
    && !/^[a-fA-F0-9]{64}$/.test(source.MFA_ENCRYPTION_KEY || "")) {
    throw Object.assign(new Error("MFA_ENCRYPTION_KEY must contain 32 bytes encoded as hex"), { status: 503, code: "MFA_CONFIGURATION_INVALID" });
  }
  return true;
}
