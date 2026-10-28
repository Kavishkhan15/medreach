import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Bootstrap playback and responsive review requested for this change.");
  await page.route((url) => url.pathname.startsWith("/api/") || url.pathname.startsWith("/health"), (route) => route.fulfill({ json: { data: [], total: 0, ok: true } }));
});

test("demo pauses outside the viewport and responds to motion preferences", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const video = page.locator("#about video");
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  expect(await video.evaluate(v => v.autoplay)).toBe(false);
});

test("About website demo loads on demand, plays muted inline and loops without changing the information cards", async ({ page }) => {
  await page.goto("/");
  const about = page.locator("#about"), video = about.locator("video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).toHaveAttribute("poster", "/media/medreach-hospital-demo-poster.webp");
  await expect(video).not.toHaveAttribute("src", /.+/);
  await about.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate(v => ({ muted: v.muted, loop: v.loop, inline: v.playsInline, autoplay: v.autoplay, controls: v.controls }))).toEqual({ muted: true, loop: true, inline: true, autoplay: true, controls: false });
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(0);
  const duration = await video.evaluate(v => v.duration);
  expect(duration).toBeGreaterThanOrEqual(10); expect(duration).toBeLessThanOrEqual(45);
  await video.evaluate(v => { v.currentTime = v.duration - 0.15; });
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeLessThan(2);
  await expect(about.getByRole("heading", { name: "Care discovery", exact: true })).toBeVisible();
  await expect(about.getByRole("heading", { name: "Information with context", exact: true })).toBeVisible();
  await expect(about.getByText("A clearer next step.", { exact: true })).toHaveCount(0);
  await expect(about.getByText("Care, connected", { exact: true })).toHaveCount(0);
});

test("demo frame fits mobile, tablet and desktop and its poster remains usable with reduced motion", async ({ page }, testInfo) => {
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#about");
    const frame = page.locator(".home-about-demo"), video = frame.locator("video");
    await frame.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
    const box = await frame.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await frame.evaluate(f => getComputedStyle(f).borderRadius)).toBe("20px");
    expect(box.width).toBeGreaterThan(width >= 1400 ? 1100 : width >= 768 ? 650 : 300);
    expect(await video.evaluate(v => v.videoWidth)).toBe(width <= 575 ? 390 : 1440);
    expect(await video.evaluate(v => v.controls)).toBe(false);
    await frame.screenshot({ path: testInfo.outputPath(`demo-frame-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#about");
  const video = page.locator("#about video");
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute("src", /medreach-hospital-demo\.mp4/);
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  expect(await video.evaluate(v => v.autoplay)).toBe(false);
  const response = await page.request.get("/media/medreach-hospital-demo-poster.webp");
  expect(response.ok()).toBe(true);
});
