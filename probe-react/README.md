# React rendering probe

[Documentation](../docs/README.md) · [Project overview](../README.md)

This focused probe compares React server-side text escaping with explicit raw HTML insertion. It is not a fourth MedReach frontend or an end-to-end XSS audit.

From the repository root with dependencies installed:

```sh
npm run probe:react
```

`probe.mjs` renders the same `<img src=x onerror=...>` payload twice using `renderToStaticMarkup`:

- Text interpolation escapes the markup, so this sample is rendered as text.
- `dangerouslySetInnerHTML` emits the sample as raw HTML.

The script checks output strings. It does not open a browser, execute the handler, exercise CSP, test other sinks, or measure real application vulnerabilities. Its broad printed statement about all reactive versus classic framework security is an interpretation beyond this test's evidence. React applications still need input handling, safe URL/HTML policies and backend authorization.

Use this example to explain a specific rendering boundary in the [proposed research plan](../docs/MedReach_Corrected_Plan.md). Historical Bootstrap tooltip CVEs require independent version-specific reproduction and should not be attributed to the current Bootstrap 5.3.3 build from this probe.

See [Release QA](../docs/release-qa.md) for current application checks and [evaluation limits](../evaluation/README.md) for planned measurements.
