import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

export type SafeHttpFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type SafeHttpLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

export interface SafeHttpOptions {
  fetchImpl?: SafeHttpFetch;
  lookupImpl?: SafeHttpLookup;
  maxRedirects?: number;
}

export interface SafeHttpResult {
  response: Response;
  finalUrl: string;
  redirectCount: number;
}

type ResolvedPublicAddress = { address: string; family: 4 | 6 };

export class UnsafeOutboundUrlError extends Error {
  readonly code = "UNSAFE_OUTBOUND_URL";

  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home",
  ".lan",
  ".home.arpa",
];

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [network: string, prefix: number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const defaultLookup: SafeHttpLookup = async (hostname, options) => lookup(hostname, options);

/**
 * Fetch an untrusted HTTP(S) URL without allowing automatic redirects or
 * connections to loopback, private, link-local, or other special-use ranges.
 * Every redirect target is parsed and resolved again before another request.
 */
export async function fetchSafeHttpUrl(
  input: string | URL,
  init: RequestInit = {},
  options: SafeHttpOptions = {},
): Promise<SafeHttpResult> {
  const lookupImpl = options.lookupImpl ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new RangeError("maxRedirects must be an integer between 0 and 10.");
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new UnsafeOutboundUrlError("Safe outbound HTTP only supports GET and HEAD requests.");
  }

  let currentUrl = parseHttpUrl(input);
  let redirectCount = 0;

  while (true) {
    const addresses = await resolvePublicHttpTarget(currentUrl, lookupImpl, init.signal);

    const requestInit = { ...init, method, redirect: "manual" as const };
    const response = options.fetchImpl
      ? await options.fetchImpl(currentUrl.toString(), requestInit)
      : await fetchPinnedHttpUrl(currentUrl, requestInit, addresses);
    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return {
        response,
        finalUrl: currentUrl.toString(),
        redirectCount,
      };
    }

    if (redirectCount >= maxRedirects) {
      await discardResponseBody(response);
      throw new UnsafeOutboundUrlError(`Safe outbound HTTP stopped after too many redirects (${maxRedirects}).`);
    }

    const nextUrl = parseHttpUrl(new URL(location, currentUrl));
    await discardResponseBody(response);
    currentUrl = nextUrl;
    redirectCount += 1;
  }
}

function parseHttpUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    throw new UnsafeOutboundUrlError("Outbound URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError("Outbound URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError("Outbound URL credentials are not allowed.");
  }
  return url;
}

async function resolvePublicHttpTarget(
  url: URL,
  lookupImpl: SafeHttpLookup,
  signal?: AbortSignal | null,
): Promise<ResolvedPublicAddress[]> {
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new UnsafeOutboundUrlError("Outbound URL hostname is missing.");
  }

  const family = isIP(hostname);
  if (family !== 0) {
    assertPublicIpAddress(hostname, family);
    return [{ address: hostname, family } as ResolvedPublicAddress];
  }
  if (isBlockedHostname(hostname)) {
    throw new UnsafeOutboundUrlError(`Outbound hostname ${hostname} is private or special-use.`);
  }

  let addresses: ReadonlyArray<{ address: string; family: number }>;
  try {
    addresses = await awaitWithAbort(
      lookupImpl(hostname, { all: true, verbatim: true }),
      signal,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const message = error instanceof Error ? error.message : "DNS lookup failed";
    throw new UnsafeOutboundUrlError(`Could not resolve outbound hostname ${hostname}: ${message}`);
  }

  if (addresses.length === 0) {
    throw new UnsafeOutboundUrlError(`Could not resolve outbound hostname ${hostname}.`);
  }
  const validated: ResolvedPublicAddress[] = [];
  for (const address of addresses) {
    const resolvedFamily = isIP(address.address);
    if (resolvedFamily === 0 || (address.family !== 4 && address.family !== 6)) {
      throw new UnsafeOutboundUrlError(`DNS returned an invalid address for ${hostname}.`);
    }
    assertPublicIpAddress(address.address, resolvedFamily);
    validated.push({
      address: address.address,
      family: resolvedFamily,
    } as ResolvedPublicAddress);
  }
  return validated;
}

async function fetchPinnedHttpUrl(
  url: URL,
  init: RequestInit,
  addresses: ReadonlyArray<ResolvedPublicAddress>,
): Promise<Response> {
  let lastError: unknown = new Error(`No resolved address was available for ${url.hostname}.`);
  for (const address of addresses) {
    try {
      return await requestPinnedAddress(url, init, address);
    } catch (error) {
      if (init.signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function requestPinnedAddress(
  url: URL,
  init: RequestInit,
  resolved: ResolvedPublicAddress,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const method = (init.method ?? "GET").toUpperCase();
    const outboundHeaders = new Headers(init.headers);
    outboundHeaders.set("host", url.host);
    if (!outboundHeaders.has("accept-encoding")) outboundHeaders.set("accept-encoding", "identity");
    const headers: Record<string, string> = {};
    outboundHeaders.forEach((value, key) => {
      headers[key] = value;
    });

    const request = (url.protocol === "https:" ? requestHttps : requestHttp)({
      protocol: url.protocol,
      hostname: resolved.address,
      family: resolved.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      agent: false,
      signal: init.signal ?? undefined,
      ...(url.protocol === "https:" && isIP(normalizeHostname(url.hostname)) === 0
        ? { servername: normalizeHostname(url.hostname) }
        : {}),
    }, (incoming) => {
      const status = incoming.statusCode;
      if (!status || status < 200 || status > 599) {
        incoming.destroy();
        reject(new Error(`Outbound server returned an invalid HTTP status: ${status ?? "missing"}.`));
        return;
      }

      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(key, item);
        } else if (value !== undefined) {
          responseHeaders.set(key, value);
        }
      }

      const hasNoBody = method === "HEAD" || status === 204 || status === 205 || status === 304;
      if (hasNoBody) incoming.resume();
      try {
        const body = hasNoBody
          ? null
          : Readable.toWeb(incoming) as unknown as BodyInit;
        resolve(new Response(body, {
          status,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });

    request.once("error", reject);
    request.end();
  });
}

function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("This operation was aborted", "AbortError");
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "metadata.google.internal") return true;
  if (!hostname.includes(".")) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function assertPublicIpAddress(address: string, family: number): void {
  const blocked = family === 4
    ? isBlockedIpv4(address)
    : family === 6
      ? isBlockedIpv6(address)
      : true;
  if (blocked) {
    throw new UnsafeOutboundUrlError(`Outbound address ${address} is private or special-use.`);
  }
}

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) return true;
  return BLOCKED_IPV4_CIDRS.some(([network, prefix]) => {
    const networkValue = ipv4ToNumber(network);
    if (networkValue === null) return true;
    const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0;
    return (value & mask) === (networkValue & mask);
  });
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value * 256) + octet;
  }
  return value >>> 0;
}

function isBlockedIpv6(address: string): boolean {
  const bytes = ipv6ToBytes(address);
  if (!bytes) return true;

  const ipv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
  if (ipv4Mapped) {
    return isBlockedIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  // Publicly routable IPv6 websites should be in global-unicast 2000::/3.
  if (bytes[0] < 0x20 || bytes[0] > 0x3f) return true;

  // Documentation, benchmarking/tunneling, and other non-production prefixes.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // 2001:db8::/32
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true; // 2001::/32
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return true; // 2002::/16 (6to4)
  if (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2] & 0xf0) === 0) return true; // 3fff::/20

  return false;
}

function ipv6ToBytes(address: string): number[] | null {
  let normalized = address.toLowerCase();
  if (normalized.includes("%")) return null;

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = ipv4ToNumber(normalized.slice(lastColon + 1));
    if (ipv4 === null) return null;
    normalized = `${normalized.slice(0, lastColon + 1)}${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;
  const groups = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8) return null;

  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [(value >>> 8) & 0xff, value & 0xff];
  });
}

async function discardResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The next request is still safe to attempt if a redirect body is already locked.
  }
}
