import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testIgnore: "**/family/**",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    browserName: process.env.BROWSER === "webkit" ? "webkit" : "chromium",
    launchOptions:
      process.env.BROWSER === "webkit"
        ? {}
        : {
            executablePath: process.env.PLAYWRIGHT_USE_BUNDLED
              ? undefined
              : "/usr/bin/chromium",
            args: ["--no-sandbox"],
          },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  outputDir: "test-results",
});
