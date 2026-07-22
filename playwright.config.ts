import { defineConfig } from "@playwright/test";

const includeMutatingProject = process.env.E2E_ALLOW_MUTATIONS === "1";
const storageState = process.env.E2E_STORAGE_STATE?.trim() || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  projects: [
    {
      name: "public-read-only",
      testMatch: /public-read-only\.spec\.ts/,
    },
    {
      name: "authenticated-read-only",
      testMatch: /(launch-auth-screenshots|settings-verify|smoke-ui|smoke)\.spec\.ts/,
    },
    ...(includeMutatingProject
      ? [{
          name: "mutating",
          testMatch: /(excluded-drag-verify|excluded-to-verified|kanban-exclusion-prompt|lead-workbench-flow|leads-fixes-verify)\.spec\.ts/,
        }]
      : []),
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState,
    trace: "retain-on-failure",
  },
});
