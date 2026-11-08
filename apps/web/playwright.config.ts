import { defineConfig } from "@playwright/test";

const apiUrl = "http://127.0.0.1:8100";
const webUrl = "http://127.0.0.1:3100";
const databaseUrl = "postgresql+psycopg://pace:pace@127.0.0.1:5432/pace_e2e";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  outputDir: "test-results/artifacts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: `DATABASE_URL=${databaseUrl} JWT_SECRET=pace-e2e-secret-at-least-32-characters WEB_ORIGIN=${webUrl} .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100`,
      cwd: "../api",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `NEXT_PUBLIC_API_URL=${apiUrl} pnpm build && NEXT_PUBLIC_API_URL=${apiUrl} pnpm exec next start --hostname 127.0.0.1 --port 3100`,
      cwd: ".",
      url: webUrl,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
