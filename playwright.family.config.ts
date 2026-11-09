import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/family",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_USE_BUNDLED
        ? undefined
        : "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=test-public-key VITE_VAPID_PUBLIC_KEY=contract-public-key npm run dev -- --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
  outputDir: "test-results-family",
});
