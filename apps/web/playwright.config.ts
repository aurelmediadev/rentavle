import { defineConfig } from "@playwright/test";

// Requires the local Supabase stack (`pnpm exec supabase start` at the repo root).
// Uses the installed Microsoft Edge locally; CI installs Chromium instead.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 90_000,
  // The dev server compiles each route on first visit, which can take several seconds.
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: process.env.CI ? undefined : "msedge",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
