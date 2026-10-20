import { test, expect } from "@playwright/test";

test("ambulance confirmations distinguish queued, accepted and uncertain notification outcomes", async ({ page }) => {
  let status = "pending";
  await page.route(url => url.hostname === "localhost" && url.pathname === "/api/ambulances/book", route => route.fulfill({
    json: { reference: "AMB-ISOLATED-FEEDBACK", delivery: { provider: { status, sent: status === "sent" } } },
  }));
  for (const [state, message] of [
    ["pending", "The provider notification email is queued."],
    ["sent", "The mail service accepted the provider notification."],
    ["uncertain", "The provider notification outcome is unconfirmed."],
  ]) {
    status = state;
    await page.goto("/ambulances");
    await page.getByRole("button", { name: "Book Ambulance" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/Enter patient name|Rahul Sharma/).fill("Isolated notification fixture");
    await dialog.getByPlaceholder("Age in years").fill("42");
    await dialog.getByPlaceholder(/9876543210|98200 12345/).fill("9876540303");
    await dialog.locator("select").selectOption("yes");
    await dialog.getByPlaceholder(/Enter address|Street address|Apartment, Street/).fill("Isolated test address");
    await dialog.getByRole("button", { name: /Submit Booking|Confirm Booking/ }).click();
    await expect(dialog.getByText(new RegExp(message.replace(/[.]/g, "\\.")))).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Track request" })).toBeVisible();
    await expect(dialog).not.toContainText("dispatch confirmed");
  }
});
