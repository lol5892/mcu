import { defineConfig } from "@playwright/test";
const baseline = process.env.VISUAL_BASELINE === "1";
export default defineConfig({
  testDir: "tests/visual",
  testMatch: baseline
    ? "baseline.spec.ts"
    : ["polish.spec.ts", "trophies.spec.ts", "system252.spec.ts"],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: "list",
  outputDir: "test-results-visual",
  use: {
    baseURL: "http://127.0.0.1:4189",
    locale: "ru-RU",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "iPhone-11-Pro-Max-Chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 414, height: 896 },
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_USE_BUNDLED
            ? undefined
            : "/usr/bin/chromium",
          args: ["--no-sandbox"],
        },
      },
    },
    {
      name: "iPhone-16-Pro-Chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 402, height: 874 },
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_USE_BUNDLED
            ? undefined
            : "/usr/bin/chromium",
          args: ["--no-sandbox"],
        },
      },
    },
    {
      name: "iPhone-11-Pro-Max-WebKit",
      use: { browserName: "webkit", viewport: { width: 414, height: 896 } },
    },
    {
      name: "iPhone-16-Pro-WebKit",
      use: { browserName: "webkit", viewport: { width: 402, height: 874 } },
    },
  ],
  webServer: {
    command:
      "VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=test-public-key npm run dev -- --port 4189",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
  },
});
