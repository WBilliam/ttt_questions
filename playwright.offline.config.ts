import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-offline",
  globalSetup: "./e2e-offline/preview-server.ts",
  use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:4174" },
  projects: [{ name: "offline-chromium", use: { browserName: "chromium" } }]
});
