import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF_FILE = join(process.cwd(), "supabase/.temp/project-ref");
const CANONICAL_APP_URL = "https://www.nosite.xyz";
const AUTH_CALLBACK_URL = `${CANONICAL_APP_URL}/auth/callback`;
const AUTH_CALLBACK_QUERY_URL = `${AUTH_CALLBACK_URL}**`;
const LEGACY_VERCEL_HOST = "lead-generation-orcin.vercel.app";
const API_BASE_URL = "https://api.supabase.com/v1";

const INVITE_TEMPLATE = [
  "<h2>Welcome to Nova Trade Lead Management</h2>",
  "<p>You have been invited to create your workspace account.</p>",
  `<p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=invite">Set up account</a></p>`,
  "<p>This link can only be used once. If it looks expired, ask an admin for a fresh invite.</p>",
].join("");

const RECOVERY_TEMPLATE = [
  "<h2>Reset your Nova Trade Lead Management password</h2>",
  "<p>We received a request to reset your workspace password.</p>",
  `<p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>`,
  "<p>This link can only be used once. If you did not request this, you can ignore this email.</p>",
].join("");

const REQUIRED_CONFIG = {
  site_url: CANONICAL_APP_URL,
  mailer_subjects_invite: "Set up your Nova Trade Lead Management account",
  mailer_templates_invite_content: INVITE_TEMPLATE,
  mailer_subjects_recovery: "Reset your Nova Trade Lead Management password",
  mailer_templates_recovery_content: RECOVERY_TEMPLATE,
};

function getProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) return process.env.SUPABASE_PROJECT_REF.trim();
  return readFileSync(PROJECT_REF_FILE, "utf8").trim();
}

function parseAllowList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLegacyVercelRedirect(entry) {
  try {
    return new URL(entry.replace(/\*+$/, "")).hostname === LEGACY_VERCEL_HOST;
  } catch {
    return entry.includes(LEGACY_VERCEL_HOST);
  }
}

function buildAllowList(value) {
  return Array.from(new Set([
    ...parseAllowList(value).filter((entry) => !isLegacyVercelRedirect(entry)),
    AUTH_CALLBACK_URL,
    AUTH_CALLBACK_QUERY_URL,
  ])).join(",");
}

function checkTemplate(name, template, type) {
  return {
    name,
    hasSiteUrl: template.includes(".SiteURL"),
    hasRedirectTo: template.includes(".RedirectTo"),
    hasTokenHash: template.includes(".TokenHash"),
    hasType: template.includes(`type=${type}`),
    hasCallbackUrl: template.includes(AUTH_CALLBACK_URL) || template.includes(".RedirectTo"),
  };
}

function summarizeConfig(config) {
  const allowList = parseAllowList(config.uri_allow_list);
  return {
    projectRef: getProjectRef(),
    siteUrl: config.site_url ?? null,
    siteUrlOk: config.site_url === CANONICAL_APP_URL,
    callbackRedirectAllowed: allowList.includes(AUTH_CALLBACK_URL),
    queryCallbackRedirectAllowed: allowList.includes(AUTH_CALLBACK_QUERY_URL),
    inviteTemplate: checkTemplate(
      "invite",
      config.mailer_templates_invite_content ?? "",
      "invite",
    ),
    recoveryTemplate: checkTemplate(
      "recovery",
      config.mailer_templates_recovery_content ?? "",
      "recovery",
    ),
  };
}

async function request(path, options = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required. Use a Supabase Management API personal access token.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Supabase Management API ${response.status}: ${body.message ?? text}`);
  }
  return body;
}

async function main() {
  const projectRef = getProjectRef();
  const currentConfig = await request(`/projects/${projectRef}/config/auth`);

  if (process.env.APPLY_SUPABASE_AUTH_CONFIG === "1") {
    const payload = {
      ...REQUIRED_CONFIG,
      uri_allow_list: buildAllowList(currentConfig.uri_allow_list),
    };
    const updatedConfig = await request(`/projects/${projectRef}/config/auth`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    console.log(JSON.stringify({ applied: true, ...summarizeConfig(updatedConfig) }, null, 2));
    return;
  }

  console.log(JSON.stringify({ applied: false, ...summarizeConfig(currentConfig) }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
