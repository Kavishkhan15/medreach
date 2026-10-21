// Public-page documentation captures. Never seeds, signs in, or submits a form.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("../docs/screenshots/current/", import.meta.url);
const variants = [
  ["bootstrap", process.env.MEDREACH_DOCS_BOOTSTRAP_URL || "http://localhost:3400"],
  ["tailwind", process.env.MEDREACH_DOCS_TAILWIND_URL || "http://localhost:3401"],
  ["skeleton", process.env.MEDREACH_DOCS_SKELETON_URL || "http://localhost:3402"],
];
for (const [, value] of variants) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Documentation screenshots require a loopback HTTP origin without credentials or a path.");
  }
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MEDREACH_PLAYWRIGHT_CHANNEL ? { channel: process.env.MEDREACH_PLAYWRIGHT_CHANNEL } : {}),
});
const captures = [];
try {
  for (const [variant, baseURL] of variants) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    // Defence in depth: public screenshots must not create requests or refresh sessions.
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return local && ["GET", "HEAD", "OPTIONS"].includes(request.method())
        ? route.continue()
        : route.abort();
    });
    const page = await context.newPage();
    async function capture(name, route, options = {}) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      if (!response?.ok()) throw new Error(`${variant} ${route}: HTTP ${response?.status()}`);
      await page.evaluate(() => document.fonts.ready);
      if (options.section) {
        await page.locator(options.section).scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }
      const file = `${name}.jpg`;
      await page.screenshot({ path: fileURLToPath(new URL(file, output)), type: "jpeg", quality: 82, animations: "disabled" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) throw new Error(`${variant} ${route}: horizontal overflow`);
      captures.push({ file, variant, route, viewport: page.viewportSize(), horizontalOverflow: false });
      console.log(`Captured ${file}`);
    }

    await capture(`${variant}-home`, "/");
    await capture(`${variant}-hospitals`, "/hospitals");
    const hospitalPath = await page.locator('a[href^="/hospitals/"]').first().getAttribute("href");
    if (!hospitalPath) throw new Error(`${variant}: no stored hospital detail link available`);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`${variant}-mobile`, "/");
    if (variant === "bootstrap") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await capture("hospital-detail", hospitalPath);
      await capture("careers", "/careers");
      await capture("blood-banks", "/blood-banks");
      await capture("emergency", "/emergency");
      await capture("provider-application", "/", { section: "#join-network" });
    }
    await context.close();
  }
  await writeFile(new URL("manifest.json", output), JSON.stringify({
    capturedAt: new Date().toISOString(),
    mode: "Public local pages; no sign-in, submissions, fixture seeding or external requests",
    captures,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}
