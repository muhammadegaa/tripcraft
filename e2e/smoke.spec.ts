import { test, expect } from "@playwright/test";

// These cover the flows a logged-out visitor can reach. Generation is gated
// behind Google sign-in, which can't run headless, so it's covered manually.
// The point of this suite: catch a deploy that breaks the public surface.

test("home loads and gates planning behind sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /planned to the minute/i })).toBeVisible();
  // Not signed in: the primary CTA must ask for sign-in, not plan directly.
  await expect(page.getByRole("button", { name: /sign in to plan/i })).toBeVisible();
});

test("typing a brief still shows the gated CTA, not a plan", async ({ page }) => {
  await page.goto("/");
  await page.locator("textarea").fill("5 days in Lisbon, 2 people, seafood and viewpoints");
  await page.getByRole("button", { name: /sign in to plan/i }).click();
  // Sign-in popup can't complete headless, so we must stay on the input page.
  await expect(page.getByRole("heading", { name: /planned to the minute/i })).toBeVisible();
});

test("legal pages render", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
});

test("email deep link opens in-app booking with options", async ({ page }) => {
  await page.goto("/?book=1&dest=Lisbon&days=4&party=2");
  await expect(page.getByRole("heading", { name: /Book your 4-day Lisbon trip/i })).toBeVisible();
  // Hotels load (demo data in CI). At least one selectable option appears.
  await expect(page.getByText(/nights/i).first()).toBeVisible({ timeout: 15_000 });
  // No external booking tabs anywhere on the page.
  const externalLinks = await page.locator("a[href*='skyscanner'], a[href*='booking.com']").count();
  expect(externalLinks).toBe(0);
});
