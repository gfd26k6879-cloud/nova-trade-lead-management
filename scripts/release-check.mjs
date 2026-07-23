import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bins = {
  eslint: fileURLToPath(new URL("../node_modules/eslint/bin/eslint.js", import.meta.url)),
  next: fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  playwright: fileURLToPath(new URL("../node_modules/playwright/cli.js", import.meta.url)),
  recovery: fileURLToPath(new URL("./verify-data-recovery.mjs", import.meta.url)),
  tsc: fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
  vitest: fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
};

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (nodeMajor !== 24) {
  console.error(`release:check requires Node 24; current runtime is ${process.version}.`);
  process.exit(2);
}

for (const [name, path] of Object.entries(bins)) {
  if (!existsSync(path)) {
    console.error(`Missing ${name} dependency at ${path}. Run npm ci with Node 24 first.`);
    process.exit(2);
  }
}

try {
  run("TypeScript", bins.tsc, ["--noEmit", "--pretty", "false"]);
  run("ESLint", bins.eslint, ["."]);
  run("Recovery contract and schema verifier", bins.recovery, []);
  run("Vitest", bins.vitest, ["run"]);
  run("Next production build", bins.next, ["build"]);

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [bins.next, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer(`${baseUrl}/privacy`, server);
    const browserEnv = { ...process.env, E2E_BASE_URL: baseUrl };
    delete browserEnv.E2E_ALLOW_MUTATIONS;
    delete browserEnv.E2E_ALLOW_REMOTE_MUTATIONS;
    run("Playwright public read-only smoke", bins.playwright, ["test", "--project=public-read-only"], browserEnv);
  } catch (error) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw error;
  } finally {
    await stopServer(server);
  }

  console.log("release:check passed: local code checks, recovery schema contract, production build, and public read-only browser smoke are green.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = typeof error?.exitCode === "number" ? error.exitCode : 1;
}

function run(label, script, args, env = process.env) {
  console.log(`\n[release:check] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status ?? 1}.`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (port == null) reject(new Error("Could not reserve a local port."));
        else resolvePort(port);
      });
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Next server exited before becoming ready (code ${child.exitCode}).`);
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Next server did not become ready at ${url} within 30 seconds.`);
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);
  if (child.exitCode == null) child.kill("SIGKILL");
}
