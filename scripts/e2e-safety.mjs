import { existsSync } from "node:fs";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DISPOSABLE_LEAD_NAME_PREFIX = "[E2E DISPOSABLE] ";
const DISPOSABLE_LEAD_QUALIFICATION_STATUS = "needs_verification";
const DISPOSABLE_LEAD_QUALIFICATION_LABEL = "Needs Verification";
const SAFE_LEAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** @typedef {Record<string, string | undefined>} E2EEnvironment */
/** @typedef {{id: string, name: string, href: string, qualificationStatus: string, qualificationLabel: string}} DisposableLeadFixture */

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

  return assertDisposableLeadFixture(env);
}

/** @param {E2EEnvironment} [env] */
export function assertDisposableLeadFixture(env = process.env) {
  const id = env.E2E_DISPOSABLE_LEAD_ID?.trim() ?? "";
  const name = env.E2E_DISPOSABLE_LEAD_NAME?.trim() ?? "";

  if (!id) {
    throw new Error("Mutating E2E requires E2E_DISPOSABLE_LEAD_ID for an approved disposable fixture.");
  }
  if (!name) {
    throw new Error("Mutating E2E requires E2E_DISPOSABLE_LEAD_NAME for the same approved disposable fixture.");
  }
  if (!SAFE_LEAD_ID.test(id)) {
    throw new Error("E2E_DISPOSABLE_LEAD_ID must be a safe lead identifier containing only letters, numbers, dot, underscore, colon, or hyphen.");
  }
  if (!name.startsWith(DISPOSABLE_LEAD_NAME_PREFIX)) {
    throw new Error(`E2E_DISPOSABLE_LEAD_NAME must start with ${DISPOSABLE_LEAD_NAME_PREFIX.trim()}.`);
  }

  return Object.freeze({
    id,
    name,
    href: `/leads/${id}`,
    qualificationStatus: DISPOSABLE_LEAD_QUALIFICATION_STATUS,
    qualificationLabel: DISPOSABLE_LEAD_QUALIFICATION_LABEL,
  });
}

/**
 * @param {string} baseUrl
 * @param {DisposableLeadFixture} fixture
 */
export function buildDisposableLeadKanbanUrl(baseUrl, fixture) {
  const url = new URL("/leads", baseUrl);
  url.searchParams.set("view", "kanban");
  url.searchParams.set("search", fixture.name);
  return url.toString();
}
