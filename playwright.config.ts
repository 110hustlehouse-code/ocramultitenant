import "dotenv/config";
import { defineConfig } from "@playwright/test";

/**
 * Server avviato a mano fuori da Playwright (serve DB seedato e .env reali):
 * vedi docs/test/E2E-ACCESSI.md per come lanciare la verifica.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3102",
    trace: "retain-on-failure",
  },
});
