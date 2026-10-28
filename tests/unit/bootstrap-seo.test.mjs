import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_PAGES, PRIVATE_PAGES, SITE_URL, absoluteUrl, pageMetadata, detailMetadata, breadcrumbItems } from "../../variants/bootstrap/lib/seo.js";
import sitemap from "../../variants/bootstrap/app/sitemap.js";
import robots from "../../variants/bootstrap/app/robots.js";

test("Bootstrap public metadata has unique titles, canonical and matching social URLs", () => {
  const titles = new Set();
  for (const [path, page] of Object.entries(PUBLIC_PAGES)) {
    const result = pageMetadata(path);
    assert.ok(page.title.length > 5); assert.ok(page.description.length > 80);
    assert.ok(!titles.has(result.title), `Duplicate title at ${path}`); titles.add(result.title);
    assert.equal(result.alternates.canonical, path);
    assert.equal(result.openGraph.url, new URL(path, SITE_URL).href);
    assert.equal(result.openGraph.description, result.description);
    assert.equal(result.twitter.description, result.description);
    assert.equal(result.openGraph.images[0].width, 2172);
    assert.ok(!/real.time availability|fast.track.*admission|guaranteed.*supply/i.test(result.description));
  }
});
test("Bootstrap detail canonicals identify the listing and metadata does not require backend requests", () => {
  const hospital = detailMetadata("hospital", "king-edward-memorial-hospital");
  assert.equal(hospital.alternates.canonical, "/hospitals/king-edward-memorial-hospital");
  assert.match(hospital.title, /king edward memorial hospital/);
  const job = detailMetadata("job", "a12b34c");
  assert.equal(job.alternates.canonical, "/jobs/a12b34c");
  assert.notEqual(job.title, detailMetadata("job", "b987xyz").title);
  const hostile = detailMetadata("hospital", '</script><script>alert("x")</script>');
  assert.ok(!hostile.title.includes("<"));
  assert.match(hostile.alternates.canonical, /^\/hospitals\/%3C/);
});
test("Bootstrap structured breadcrumbs exclude private routes and include the correct listing parent", () => {
  for (const path of Object.keys(PRIVATE_PAGES)) assert.equal(breadcrumbItems(path), null);
  assert.equal(breadcrumbItems("/requests/private-sensitive-reference"), null);
  assert.equal(breadcrumbItems("/"), null);
  assert.equal(breadcrumbItems("/login"), null);
  const hospital = breadcrumbItems("/hospitals/kem-hospital");
  assert.deepEqual(hospital.map((item) => item.item), [absoluteUrl("/"), absoluteUrl("/hospitals"), absoluteUrl("/hospitals/kem-hospital")]);
  assert.equal(breadcrumbItems("/jobs/abc123")[1].item, absoluteUrl("/careers"));
});
test("Bootstrap sitemap contains only intended public routes and does not invent update dates", () => {
  const original = process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT;
  try {
    delete process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT;
    const rows = sitemap();
    assert.equal(rows.length, 12);
    assert.equal(new Set(rows.map((row) => row.url)).size, rows.length);
    assert.ok(rows.every((row) => !Object.hasOwn(row, "lastModified")));
    for (const path of Object.keys(PRIVATE_PAGES)) assert.ok(!rows.some((row) => row.url === absoluteUrl(path)));
    process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT = "2026-10-20T12:00:00Z";
    assert.ok(sitemap().every((row) => row.lastModified.toISOString() === "2026-10-20T12:00:00.000Z"));
  } finally { if (original === undefined) delete process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT; else process.env.NEXT_PUBLIC_CONTENT_UPDATED_AT = original; }
});
test("Bootstrap crawl rules exclude private surfaces while allowing hospital discovery", () => {
  const result = robots(), disallow = result.rules[0].disallow;
  assert.equal(result.sitemap, absoluteUrl("/sitemap.xml"));
  assert.equal(result.rules[0].allow, "/");
  for (const path of ["/admin", "/provider", "/profile", "/requests", "/hospital/", "/reset-password", "/verify-email", "/api/"]) assert.ok(disallow.includes(path));
  assert.ok(!disallow.includes("/hospital"), "A prefix block on /hospital also blocks /hospitals");
  assert.ok(disallow.includes("/hospital$"));
});
