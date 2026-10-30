import { test, expect } from "@playwright/test";

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== "bootstrap", "Bootstrap scoped directory"); });

test("diagnostic search fetches only bounded diagnostic pages and debounces typing", async ({ page }) => {
  const requests = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/diagnostics") {
      requests.push(url);
      const offset = url.searchParams.get("page") === "2" ? 12 : 0;
      return route.fulfill({ json: { data: Array.from({ length: 12 }, (_, i) => ({ _id: String(offset+i).padStart(24,"0"), name: `Scoped clinic ${offset+i}` })), pagination: { hasMore: offset === 0 } } });
    }
    return route.fulfill({ json: { data: [], user: null } });
  });
  await page.goto("/diagnostics");
  await expect(page.getByRole("heading", {name:"Scoped clinic 0", exact:true})).toBeVisible();
  expect(requests[0].searchParams.get("limit")).toBe("12");
  expect(requests[0].searchParams.get("view")).toBe("summary");
  await page.getByRole("button", { name: "Next providers" }).click();
  await expect(page.getByRole("heading", {name:"Scoped clinic 12", exact:true})).toBeVisible();
  expect(requests.at(-1).searchParams.get("page")).toBe("2");
  const count = requests.length;
  await page.getByLabel("Search diagnostics").pressSequentially("thyroid", { delay: 15 });
  await expect.poll(() => requests.at(-1).searchParams.get("q")).toBe("thyroid");
  expect(requests.length - count).toBe(1);
  expect(requests.at(-1).searchParams.get("page")).toBe("1");
});

test("selected bed request reads only its hospital identity before exact inventory", async ({ page }) => {
  const id = "111111111111111111111111";
  const reads = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); reads.push(url);
    let json = { data: [], user: null };
    if (url.pathname === "/api/hospitals") json = { data: [{_id:id, name:"Selected clinic",slug:"selected-clinic"}], nextPage:null };
    await route.fulfill({ json });
  });
  await page.goto(`/requests/new?flow=standard&hospital=${id}`);
  await expect(page.getByLabel("Target Hospital")).toHaveValue(id);
  await expect.poll(() => reads.filter(url => url.pathname === `/api/inventory/hospital/${id}`).length).toBe(1);
  const options = reads.filter(url=>url.pathname === "/api/hospitals");
  expect(options).toHaveLength(1);
  expect(options[0].searchParams.get("id")).toBe(id);
  expect(options[0].searchParams.get("view")).toBe("options");
});

test("hospital cards request the summary view and preserve care actions", async ({ page }) => {
  const reads = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let json = { data: [], user: null };
    if (url.pathname === "/api/hospitals") {
      reads.push(url);
      json = { data: [{ _id: "111111111111111111111111", slug: "summary-clinic", name: "Summary Clinic", address: "Recorded Mumbai address", specialties: ["Cardiology"], operatingHours: "24/7", facilities: [], bedsAvailable: null, emergencyStatus: "unknown" }], total: 1 };
    }
    await route.fulfill({ json });
  });
  await page.goto("/hospitals");
  await expect(page.getByRole("heading", { name: "Summary Clinic", exact: true })).toBeVisible();
  expect(reads[0].searchParams.get("view")).toBe("summary");
  await expect(page.getByText("Recorded Mumbai address", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request beds" })).toHaveAttribute("href", /hospital=111111111111111111111111/);
  await page.getByLabel("Search hospitals").fill("cardiology");
  await expect.poll(() => reads.at(-1).searchParams.get("q")).toBe("cardiology");
  expect(reads.at(-1).searchParams.get("view")).toBe("summary");
});
