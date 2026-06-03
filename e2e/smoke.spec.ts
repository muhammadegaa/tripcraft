import { test, expect } from "@playwright/test";

// Public-surface smoke tests. The app lives at /app behind the marketing
// landing at /. Generation is gated behind Google sign-in (can't run headless),
// so that's covered manually.

test("landing page loads with hero and a CTA into the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /planned/i, level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /plan a trip/i }).first()).toBeVisible();
  // CTA points at the app
  const appLink = page.locator('a[href="/app"]').first();
  await expect(appLink).toBeVisible();
});

test("app gates planning behind sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /planned to the minute/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in to plan/i })).toBeVisible();
});

test("typing a brief still shows the gated CTA, not a plan", async ({ page }) => {
  await page.goto("/app");
  await page.locator("textarea").fill("5 days in Lisbon, 2 people, seafood and viewpoints");
  await page.getByRole("button", { name: /sign in to plan/i }).click();
  await expect(page.getByRole("heading", { name: /planned to the minute/i })).toBeVisible();
});

test("legal pages render", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
});

test("email deep link opens in-app booking", async ({ page }) => {
  await page.goto("/app?book=1&dest=Lisbon&days=4&party=2");
  await expect(page.getByRole("heading", { name: /Choose your flights/i })).toBeVisible();
  // stepper present
  await expect(page.getByText("Stay")).toBeVisible();
  const externalLinks = await page.locator("a[href*='skyscanner'], a[href*='booking.com']").count();
  expect(externalLinks).toBe(0);
});
