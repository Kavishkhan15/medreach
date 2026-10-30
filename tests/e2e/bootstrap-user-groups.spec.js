import { test, expect } from "@playwright/test";
test("System Admin switches account groups without displaying password material", async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Bootstrap role groups only");
  const roles = ["user", "provider_admin", "system_admin"];
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { _id: "111111111111111111111111", role: "system_admin", name: "Reviewer", region: "Mumbai" } } }));
  await page.route("**/api/admin/users?**", route => {
    const role = new URL(route.request().url()).searchParams.get("roleGroup");
    return route.fulfill({ json: { data: [{ _id: `22222222222222222222222${roles.indexOf(role)}`, name: `${role} fixture`, email: `${role}@isolated.example`, role, accountStatus: "active", providers: { password: true } }], pagination: { hasMore: false } } });
  });
  await page.goto("/admin/users");
  for (const [role, name] of [["user", "Users"], ["provider_admin", "Provider Admins"], ["system_admin", "System Admins"]]) {
    const button = page.getByRole("group", { name: "Account roles" }).getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("cell", { name: `${role}@isolated.example`, exact: false })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Password set · securely hashed", exact: true })).toHaveCount(1);
    for (const other of roles.filter(value => value !== role)) await expect(page.getByText(`${other}@isolated.example`, { exact: true })).toHaveCount(0);
  }
});
