import { existsSync } from "node:fs";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** @typedef {Record<string, string | undefined>} E2EEnvironment */

/** @param {E2EEnvironment} [env] */
export function hasE2EAuth(env = process.env) {
  const storageState = env.E2E_STORAGE_STATE?.trim() ?? "";
  const email = (env.E2E_SUPABASE_EMAIL ?? env.NOSITE_BOOTSTRAP_ADMIN_EMAIL ?? "").trim();
  const password = env.E2E_SUPABASE_PASSWORD?.trim() ?? "";
  return Boolean(storageState || (email && password));
}

/** @param {E2EEnvironment} [env] */
export function assertE2EAuth(env = process.env) {
  if (!hasE2EAuth(env)) {
    throw new Error(
      "Authenticated E2E requires E2E_STORAGE_STATE or both E2E_SUPABASE_EMAIL and E2E_SUPABASE_PASSWORD.",
    );
  }

  const storageState = env.E2E_STORAGE_STATE?.trim();
  if (storageState && !existsSync(resolve(storageState))) {
    throw new Error(`E2E_STORAGE_STATE does not exist: ${resolve(storageState)}`);
  }
}

/** @param {E2EEnvironment} [env] */
export function assertMutationSafety(env = process.env) {
  if (env.E2E_ALLOW_MUTATIONS !== "1") {
    throw new Error("Mutating E2E is disabled. Set E2E_ALLOW_MUTATIONS=1 to opt in.");
  }

  const baseUrl = env.E2E_BASE_URL ?? "http://localhost:3000";
  let hostname;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${baseUrl}`);
  }

  if (!LOOPBACK_HOSTS.has(hostname) && env.E2E_ALLOW_REMOTE_MUTATIONS !== "1") {
    throw new Error(
      `Refusing mutating E2E against non-loopback host ${hostname}. Set E2E_ALLOW_REMOTE_MUTATIONS=1 only with an approved disposable target and cleanup plan.`,
    );
  }
}
