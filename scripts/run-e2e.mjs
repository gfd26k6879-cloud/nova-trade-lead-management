import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertE2EAuth, assertMutationSafety } from "./e2e-safety.mjs";

const playwrightCli = fileURLToPath(new URL("../node_modules/playwright/cli.js", import.meta.url));
const mode = process.argv[2] ?? "all-read-only";

const modes = {
  "all-read-only": {
    auth: true,
    args: ["test", "--project=public-read-only", "--project=authenticated-read-only"],
  },
  public: {
    auth: false,
    args: ["test", "--project=public-read-only"],
  },
  auth: {
    auth: true,
    args: ["test", "--project=authenticated-read-only"],
  },
  launch: {
    auth: true,
    args: ["test", "e2e/launch-auth-screenshots.spec.ts", "--project=authenticated-read-only"],
  },
  mutating: {
    auth: true,
    mutating: true,
    args: ["test", "--project=mutating"],
  },
};

const selected = modes[mode];
if (!selected) {
  console.error(`Unknown E2E mode: ${mode}. Expected one of: ${Object.keys(modes).join(", ")}`);
  process.exit(2);
}

try {
  if (selected.auth) assertE2EAuth();
  if (selected.mutating) assertMutationSafety();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const result = spawnSync(process.execPath, [playwrightCli, ...selected.args, ...process.argv.slice(3)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
