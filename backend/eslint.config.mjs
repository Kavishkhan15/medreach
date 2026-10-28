import js from "@eslint/js";
export default [{
  files: ["**/*.js", "**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: {
    process:"readonly", Buffer:"readonly", console:"readonly", setTimeout:"readonly",clearTimeout:"readonly",
    setInterval:"readonly",clearInterval:"readonly",setImmediate:"readonly",clearImmediate:"readonly",
    fetch:"readonly",URL:"readonly",URLSearchParams:"readonly",AbortController:"readonly",AbortSignal:"readonly",
    TextEncoder:"readonly",TextDecoder:"readonly",performance:"readonly",structuredClone:"readonly",
  } },
  rules: { ...js.configs.recommended.rules, "no-unused-vars":"off", "no-empty":["error",{allowEmptyCatch:true}],
    "no-useless-assignment":"warn", "preserve-caught-error":"warn" },
}, {
  // Explicit control-character matching is the purpose of this input sanitizer.
  files: ["**/src/utils/sanitize.js"], rules: { "no-control-regex":"off" },
}];
