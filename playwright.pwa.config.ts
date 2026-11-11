import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/pwa", testMatch: "**/*.spec.ts", workers: 1, fullyParallel: false,
  timeout: 60000, expect: {timeout:15000}, reporter: "list", outputDir: "test-results/pwa",
  use: { baseURL: "http://127.0.0.1:4187", viewport:{width:390,height:844},
    launchOptions: { executablePath: process.env.PLAYWRIGHT_USE_BUNDLED ? undefined : "/usr/bin/chromium", args:["--no-sandbox"] } },
  webServer: { command:"node tests/pwa/server.mjs", url:"http://127.0.0.1:4187/health", reuseExistingServer:false },
});
