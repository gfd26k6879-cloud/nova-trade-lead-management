import "server-only";

import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const SESSION_COOKIE = "nosite_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface AuthConfig {
  username: string;
  password: string;
  sessionSecret: string;
}

interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
}

export class UnauthorizedError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function getAuthConfig(): AuthConfig | null {
  const username = process.env.NOSITE_ADMIN_USERNAME;
  const password = process.env.NOSITE_ADMIN_PASSWORD;
  const sessionSecret = process.env.NOSITE_SESSION_SECRET;

  if (!username || !password || !sessionSecret) {
    return null;
  }

  return { username, password, sessionSecret };
}

export async function isAuthConfigured(): Promise<boolean> {
  return getAuthConfig() !== null;
}

function toBase64Url(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function sign(payload: string, secret: string): string {
  return toBase64Url(createHmac("sha256", secret).update(payload).digest());
}

function createSessionToken(username: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: randomUUID(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const config = getAuthConfig();
  if (!config) return false;

  return safeEqual(username, config.username) && safeEqual(password, config.password);
}

export async function createSession(): Promise<void> {
  const config = getAuthConfig();
  if (!config) {
    throw new Error("Authentication is not configured");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(config.username, config.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<{ email: string } | null> {
  const config = getAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token, config.sessionSecret);
  if (!payload || payload.sub !== config.username) return null;

  return { email: payload.sub };
}

export async function requireSession(): Promise<{ email: string }> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}
