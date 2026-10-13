import js from "@eslint/js";
import hooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/.next/**", "**/.next-*/**", "**/node_modules/**", "backend/**", "evaluation/**", "probe-react/**", "scripts/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["variants/**/app/**/*.js", "variants/**/components/**/*.js", "variants/**/lib/**/*.js", "variants/**/_core/**/*.js", "packages/core/src/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: "readonly", document: "readonly", navigator: "readonly", process: "readonly", fetch: "readonly", console: "readonly", setInterval: "readonly", clearInterval: "readonly", sessionStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly", URL: "readonly", URLSearchParams: "readonly", AbortController: "readonly", IntersectionObserver: "readonly", Event: "readonly", CustomEvent: "readonly", FileReader: "readonly", TextEncoder: "readonly", alert: "readonly", requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly" } },
    plugins: { "react-hooks": hooks },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": "off", "no-empty": ["error", { allowEmptyCatch: true }], "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
];
