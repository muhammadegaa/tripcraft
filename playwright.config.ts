import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the critical public flows. Runs against a production build
// with canned itineraries and no API keys, so it is deterministic in CI (no
// Claude credits, no Firebase, hotels/flights fall back to demo data).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { TRIPCRAFT_CANNED: "1" },
  },
});
