import { test, expect } from "@playwright/test";

test("Users and System Admins have separate pages and the sidebar links only for authorised admins", async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Bootstrap account navigation only");
  let accountRole = "system_admin";
  let reads = 0;
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { _id: "111111111111111111111111", role: accountRole, name: "Reviewer", region: "Mumbai" } } }));
  await page.route("**/api/admin/users?**", route => {
    reads++;
    const role = new URL(route.request().url()).searchParams.get("role");
    expect(["user", "system_admin"]).toContain(role);
    return route.fulfill({ json: { data: [{ _id: "222222222222222222222222", name: `${role} fixture`, email: `${role}@isolated.example`, role, accountStatus: "active", providers: { password: true } }], pagination: { hasMore: false } } });
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("cell", { name: "user@isolated.example", exact: false })).toBeVisible();
  await expect(page.getByRole("group", { name: "Account roles" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Provider Admins", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Password set · securely hashed", exact: true })).toHaveCount(1);
  const sidebar = page.getByRole("navigation", { name: "Account", exact: true });
  await sidebar.getByRole("link", { name: "System Admins", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/system-admins$/);
  await expect(page.getByRole("heading", { name: "System administrators", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "system_admin@isolated.example", exact: false })).toBeVisible();
  await expect(page.getByText("user@isolated.example", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "System Admins", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Admin", exact: true })).not.toHaveAttribute("aria-current", "page");
  accountRole = "user"; reads = 0;
  await page.reload();
  await expect(page.getByText(/Admin access required/)).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "System Admins", exact: true })).toHaveCount(0);
  expect(reads).toBe(0);
});
