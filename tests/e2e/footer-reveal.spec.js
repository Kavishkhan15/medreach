import { test, expect } from "@playwright/test";

/**
 * Footer Reveal & Oversized Wordmark E2E Verification
 * 
 * Tests across viewports:
 * - Mobile (375px)
 * - Tablet (768px)
 * - Desktop (1440px)
 * 
 * Asserts:
 * 1. Wordmark presence, cobalt color (#0047AB / rgb(0, 71, 171)), white background (#FFFFFF / rgb(255, 255, 255)).
 * 2. aria-hidden="true" on decorative reveal.
 * 3. Zero horizontal overflow (document.documentElement.scrollWidth <= window.innerWidth).
 * 4. Existing footer links and disclaimers remain fully intact and clickable.
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

test.describe("MEDREACH Footer Reveal Animation & Layout Parity", () => {
  for (const vp of VIEWPORTS) {
    test(`[${vp.name}] Footer reveal wordmark renders, dominates bottom, and prevents horizontal overflow`, async ({ page }) => {
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

      // Verify reveal container and wordmark
      const revealContainer = page.locator(".medreach-footer-reveal");
      await expect(revealContainer).toBeVisible();
      await expect(revealContainer).toHaveAttribute("aria-hidden", "true");

      const wordmark = page.locator(".medreach-footer-wordmark");
      await expect(wordmark).toBeVisible();
      await expect(wordmark).toHaveText("MEDREACH");

      // Verify color styling (Cobalt Blue: rgb(0, 71, 171))
      const wordmarkColor = await wordmark.evaluate((el) => window.getComputedStyle(el).color);
      expect(wordmarkColor).toBe("rgb(0, 71, 171)");

      // Verify background of reveal container (Pure White: rgb(255, 255, 255))
      const bgColor = await revealContainer.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bgColor).toBe("rgb(255, 255, 255)");

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
