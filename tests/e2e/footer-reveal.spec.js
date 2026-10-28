import { test, expect } from "@playwright/test";

/**
 * Footer layout and variant-specific branding verification.
 * 
 * Tests across viewports:
 * - Mobile (375px)
 * - Tablet (768px)
 * - Desktop (1440px)
 * 
 * Asserts:
 * 1. Bootstrap omits the decorative wordmark; other variants retain their reveal.
 * 2. Retained decorative reveals remain hidden from assistive technology.
 * 3. Zero horizontal overflow (document.documentElement.scrollWidth <= window.innerWidth).
 * 4. Existing footer links and disclaimers remain fully intact and clickable.
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

test.describe("MEDREACH Footer Layout and Branding", () => {
  for (const vp of VIEWPORTS) {
    test(`[${vp.name}] Footer branding matches the variant without horizontal overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      const footer = page.locator("footer.app-footer, footer.tw-site-footer");
      await expect(footer).toBeAttached();

      // Scroll smoothly down to the bottom to trigger scroll-linked kinematics
      await page.evaluate(async () => {
        const totalHeight = document.documentElement.scrollHeight;
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          window.scrollTo(0, (totalHeight / steps) * i);
          await new Promise((r) => setTimeout(r, 40));
        }
      });
      await page.waitForTimeout(100);

      const revealContainer = page.locator(".medreach-footer-reveal");
      const wordmark = page.locator(".medreach-footer-wordmark");
      if (testInfo.project.name === "bootstrap") {
        await expect(revealContainer).toHaveCount(0);
        await expect(wordmark).toHaveCount(0);
      } else {
        await expect(revealContainer).toBeVisible();
        await expect(revealContainer).toHaveAttribute("aria-hidden", "true");
        await expect(wordmark).toBeVisible();
        await expect(wordmark).toHaveText("MEDREACH");
        await expect(wordmark).toHaveCSS("color", "rgb(0, 71, 171)");
        await expect(revealContainer).toHaveCSS("background-color", "rgb(255, 255, 255)");
      }

      // Verify zero horizontal overflow at bottom of document
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow, "Page must not have horizontal scrollbar").toBe(false);

      // Verify original brand image & disclaimer remain visible
      const brandLogo = footer.getByRole("img", { name: /^MedReach(?: Connected Healthcare)?$/ });
      await expect(brandLogo).toHaveAttribute("src", /brand-word-mark/);
      await expect(brandLogo).toBeVisible();
      await expect(footer).toContainText("Not an official emergency service. In danger, call 112.");
    });
  }

  test("Existing footer links remain interactive and reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);

    const linksContainer = page.locator(
      ".landing-footer-links, .tw-landing-footer-links, .skeleton-landing-footer-links"
    );
    await expect(linksContainer).toBeVisible();

    const mapLink = linksContainer.locator('a[href="/map"]');
    await expect(mapLink).toBeVisible();
    await mapLink.click();
    await expect(page).toHaveURL(/\/map$/);
  });
});
