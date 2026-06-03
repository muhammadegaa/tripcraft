import { test, expect } from "@playwright/test";

// Stepped booking, reached via the email deep link (no auth needed):
// Flights -> Stay -> Travellers -> Payment. Stops at the Stripe payment step
// (the card iframe isn't automatable and a charge would send an email).
test.describe("in-app booking", () => {
  // Live hotel/flight APIs can be slow under parallel load; retry timing flakes.
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    await page.goto("/app?book=1&dest=Lisbon&days=4&party=2");
    await expect(page.getByRole("heading", { name: /Choose your flights/i })).toBeVisible();
  });

  async function gotoStay(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: /Skip flights|Continue to stay/i }).click();
    await expect(page.getByRole("heading", { name: /Choose your stay/i })).toBeVisible();
    await expect(page.getByText(/nights/i).first()).toBeVisible({ timeout: 15_000 });
  }

  test("stepper shows the four stages and no external tabs", async ({ page }) => {
    for (const s of ["Flights", "Stay", "Travellers", "Payment"]) {
      await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    }
    expect(await page.locator("a[href*='skyscanner'], a[href*='booking.com']").count()).toBe(0);
  });

  test("stay step loads live hotels", async ({ page }) => {
    await gotoStay(page);
    expect(await page.getByRole("button").filter({ hasText: /nights/i }).count()).toBeGreaterThan(0);
  });

  test("currency selector converts prices", async ({ page }) => {
    await gotoStay(page);
    await page.locator("select").selectOption("EUR");
    await expect(page.getByText(/€/).first()).toBeVisible({ timeout: 10_000 });
    await page.locator("select").selectOption("GBP");
    await expect(page.getByText(/£/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("hotel photo gallery opens (skips without live photos)", async ({ page }) => {
    await gotoStay(page);
    const firstView = page.locator('button[aria-label^="View photos"]').first();
    const hasPhoto = await firstView.locator("img").waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    test.skip(!hasPhoto, "no live hotel photos (demo mode)");
    await firstView.click();
    await expect(page.getByRole("button", { name: /Close/i })).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(".fixed img").count()).toBeGreaterThan(1);
  });

  test("pick hotel -> review -> payment step (or direct book without Stripe)", async ({ page }) => {
    await gotoStay(page);
    await page.getByRole("button").filter({ hasText: /nights/i }).first().click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.getByRole("heading", { name: /Review and travellers/i })).toBeVisible();

    const firsts = page.getByPlaceholder(/first name/i);
    const lasts = page.getByPlaceholder("Last name");
    const n = await firsts.count();
    for (let i = 0; i < n; i++) { await firsts.nth(i).fill("Trav" + i); await lasts.nth(i).fill("Test"); }
    await page.getByPlaceholder(/Email for your tickets/i).fill("test@example.com");

    const cta = page.getByRole("button", { name: /Continue to payment|Confirm and book/i });
    const label = (await cta.textContent()) || "";
    test.skip(!/payment/i.test(label), "Stripe not configured (no payment step)");
    await cta.click();
    await expect(page.getByRole("heading", { name: /^Payment$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("iframe[src*='stripe']").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Pay /i })).toBeVisible();
    // do NOT complete payment (would charge + email)
  });
});
