import { test, expect } from "@playwright/test";

// Booking, reached via the email deep link (no auth needed). Stops at the
// Stripe payment step on purpose: completing a charge needs the cross-origin
// Stripe iframe (not automatable) and would send a confirmation email.
test.describe("in-app booking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app?book=1&dest=Lisbon&days=4&party=2");
    await expect(page.getByRole("heading", { name: /Book your 4-day Lisbon trip/i })).toBeVisible();
    await expect(page.getByText(/nights/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("hotels load and there are no external booking tabs", async ({ page }) => {
    const hotelButtons = page.getByRole("button").filter({ hasText: /nights/i });
    expect(await hotelButtons.count()).toBeGreaterThan(0);
    expect(await page.locator("a[href*='skyscanner'], a[href*='booking.com']").count()).toBe(0);
  });

  test("currency selector converts prices", async ({ page }) => {
    await page.locator("select").selectOption("EUR");
    await expect(page.getByText(/€/).first()).toBeVisible({ timeout: 10_000 });
    await page.locator("select").selectOption("GBP");
    await expect(page.getByText(/£/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("hotel photo gallery opens (skips without live photos)", async ({ page }) => {
    const firstView = page.locator('button[aria-label^="View photos"]').first();
    const hasPhoto = await firstView.locator("img").waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    test.skip(!hasPhoto, "no live hotel photos (demo mode)");
    await firstView.click();
    await expect(page.getByRole("button", { name: /Close/i })).toBeVisible({ timeout: 10_000 });
    // thumbnail strip => multiple images
    expect(await page.locator(".fixed img").count()).toBeGreaterThan(1);
  });

  test("select hotel -> details -> payment step (or direct book without Stripe)", async ({ page }) => {
    await page.getByRole("button").filter({ hasText: /nights/i }).first().click();
    await page.getByRole("button", { name: /Continue to book/i }).click();
    await expect(page.getByRole("heading", { name: /Who is travelling/i })).toBeVisible();
    const firsts = page.getByPlaceholder(/first name/i);
    const lasts = page.getByPlaceholder("Last name");
    const n = await firsts.count();
    for (let i = 0; i < n; i++) { await firsts.nth(i).fill("Trav" + i); await lasts.nth(i).fill("Test"); }
    await page.getByPlaceholder(/Email for your confirmation/i).fill("test@example.com");

    const cta = page.getByRole("button", { name: /Continue to payment|Confirm and book/i });
    const label = (await cta.textContent()) || "";
    test.skip(!/payment/i.test(label), "Stripe not configured (no payment step)");
    await cta.click();
    await expect(page.getByRole("heading", { name: /^Payment$/i })).toBeVisible({ timeout: 15_000 });
    // Stripe Payment Element iframe mounts
    await expect(page.locator("iframe[src*='stripe']").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Pay /i })).toBeVisible();
    // do NOT complete payment (would charge + email)
  });
});
