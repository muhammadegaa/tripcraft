import { test, expect } from "@playwright/test";

// The marketing landing at /.
test.describe("landing page", () => {
  test("hero, flight animation, and CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /planned/i })).toBeVisible();
    // flight path animation is present
    expect(await page.locator("svg animateMotion").count()).toBeGreaterThan(0);
    // real line icons, not emoji
    expect(await page.locator("svg.lucide").count()).toBeGreaterThan(10);
    // primary CTA goes into the app
    await expect(page.locator('a[href="/app"]').first()).toBeVisible();
  });

  test("all key sections render", async ({ page }) => {
    await page.goto("/");
    for (const name of [
      /do all the real work/i,
      /honors every dealbreaker/i,
      /without leaving the plan/i,
      /guide that travels with you/i,
      /three steps/i,
      /hate planning trips/i,
      /honest pricing/i,
      /Questions, answered/i,
      /planned to the minute/i,
    ]) {
      await expect(page.getByRole("heading", { name }).first()).toBeVisible();
    }
  });

  test("nav and footer links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
    // pricing cards
    await expect(page.getByText("Most popular")).toBeVisible();
  });

  test("FAQ accordion expands", async ({ page }) => {
    await page.goto("/");
    const q = page.getByRole("button", { name: /Where does my booking actually happen/i });
    await q.scrollIntoViewIfNeeded();
    await q.click();
    await expect(page.getByText(/Inside the app/i)).toBeVisible();
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(errors.join("\n")).toBe("");
  });
});
