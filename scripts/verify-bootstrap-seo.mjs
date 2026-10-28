import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PUBLIC_PAGES, PRIVATE_PAGES, absoluteUrl } from "../variants/bootstrap/lib/seo.js";
const target = new URL(process.env.MEDREACH_SEO_REVIEW_URL || "http://localhost:3016");
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("This verifier only checks an isolated local frontend");
const titles = new Set(), checks = [], failures = [];
const routes = ["/", ...Object.keys(PUBLIC_PAGES), ...Object.keys(PRIVATE_PAGES), "/hospitals/kem-hospital", "/jobs/fixture-job-id", "/requests/fixture-private-reference"];
const attribute = (html, key, value) => {
  const tags = html.match(/<(?:meta|link)\b[^>]*>/g) || [];
  return tags.find((tag) => tag.includes(`${key}="${value}"`));
};
for (const path of routes) {
  try {
    const response = await fetch(new URL(path, target), { signal: AbortSignal.timeout(30000) }), html = await response.text();
    assert.equal(response.status, 200);
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    assert.ok(title, "Missing title"); assert.ok(!titles.has(title), `Duplicate title: ${title}`); titles.add(title);
    const description = attribute(html, "name", "description"); assert.ok(description, "Missing description");
    assert.ok(!attribute(html, "name", "robots")?.includes("noindex"), "Unexpected noindex directive");
    const expectedPath = path.startsWith("/requests/fixture") ? "/requests" : path;
    assert.ok(attribute(html, "rel", "canonical")?.includes(`href="${absoluteUrl(expectedPath)}"`), "Canonical does not match route");
    if (!path.startsWith("/requests/fixture")) assert.ok(attribute(html, "property", "og:url")?.includes(absoluteUrl(path)), "OpenGraph URL does not match route");
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((match) => JSON.parse(match[1]));
    assert.ok(schemas.some((schema) => schema["@graph"]?.some((entry) => entry["@type"] === "Organization")), "Missing platform organisation schema");
    assert.ok(!schemas.some((schema) => schema["@graph"]?.some((entry) => entry["@type"] === "MedicalOrganization")), "Platform wrongly described as a clinical organisation");
    const breadcrumbs = schemas.filter((schema) => schema["@type"] === "BreadcrumbList");
    const expectsBreadcrumb = PUBLIC_PAGES[path]?.breadcrumb || path.startsWith("/hospitals/") || path.startsWith("/jobs/");
    assert.equal(breadcrumbs.length, expectsBreadcrumb ? 1 : 0, "Incorrect breadcrumb count");
    if (breadcrumbs.length) assert.equal(breadcrumbs[0].itemListElement.at(-1).item, absoluteUrl(path));
    checks.push({ path, status: "passed", title });
  } catch (error) { failures.push({ path, error: error.message }); }
}
for (const path of ["/sitemap.xml", "/robots.txt", "/llms.txt"]) {
  try { const response = await fetch(new URL(path, target), { signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200); const body = await response.text(); assert.ok(body.includes("MedReach") || body.includes("sitemap") || body.includes("urlset")); checks.push({ path, status: "passed" }); }
  catch (error) { failures.push({ path, error: error.message }); }
}
const report = { generatedAt: new Date().toISOString(), target: target.origin, checked: checks.length + failures.length, passed: checks.length, failed: failures.length, checks, failures };
await mkdir("output/bootstrap-seo-review", { recursive: true });
await writeFile("output/bootstrap-seo-review/verification.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ checked: report.checked, passed: report.passed, failed: report.failed, failures }, null, 2));
if (failures.length) process.exitCode = 1;
