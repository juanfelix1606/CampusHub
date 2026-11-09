import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(__dirname, ".env") });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for end-to-end tests.");
}
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("End-to-end tests require a dedicated database ending in _test.");
}

const apiEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  API_PORT: "3000",
  WEB_ORIGIN: "http://127.0.0.1:5173",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ?? "e2e-jwt-secret-has-at-least-32-distinct-characters",
  ATTENDANCE_QR_SECRET:
    process.env.ATTENDANCE_QR_SECRET ?? "e2e-attendance-secret-has-32-distinct-characters",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npm run dev --workspace @campushub/api",
      url: "http://127.0.0.1:3000/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: apiEnvironment,
    },
    {
      command: "npm run dev --workspace @campushub/web -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
