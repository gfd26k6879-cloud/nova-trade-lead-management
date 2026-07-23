import {
  fetchSafeHttpUrl,
  type SafeHttpFetch,
  type SafeHttpLookup,
} from "@/lib/safe-http";
import { createTimeoutAbortScope } from "@/lib/abort-scope";

export interface WebsiteHealth {
  statusCode: number;
  ssl: boolean;
  redirectCount: number;
  responseMs: number;
  finalUrl: string;
  healthy: boolean;
}

export interface WebsiteHealthCheckOptions {
  fetchImpl?: SafeHttpFetch;
  lookupImpl?: SafeHttpLookup;
  signal?: AbortSignal;
}

export async function checkWebsiteHealth(
  url: string,
  timeoutMs = 5000,
  options: WebsiteHealthCheckOptions = {},
): Promise<WebsiteHealth> {
  const start = Date.now();
  let redirectCount = 0;
  let currentUrl = url;
  let statusCode = 0;
  const ssl = currentUrl.startsWith("https://");
  const abortScope = createTimeoutAbortScope(options.signal, timeoutMs);

  try {
    const result = await fetchSafeHttpUrl(currentUrl, {
      method: "HEAD",
      signal: abortScope.signal,
      headers: { "User-Agent": "NovaTradeLeadManagement-HealthCheck/1.0" },
    }, {
      fetchImpl: options.fetchImpl,
      lookupImpl: options.lookupImpl,
    });
    const response = result.response;
    statusCode = response.status;
    redirectCount = result.redirectCount;
    currentUrl = result.finalUrl;

    const responseMs = Date.now() - start;
    const healthy = statusCode >= 200 && statusCode < 400 && responseMs < 3000;

    return {
      statusCode,
      ssl: currentUrl.startsWith("https://"),
      redirectCount,
      responseMs,
      finalUrl: currentUrl,
      healthy,
    };
  } catch {
    options.signal?.throwIfAborted();
    const responseMs = Date.now() - start;

    return {
      statusCode: 0,
      ssl,
      redirectCount,
      responseMs,
      finalUrl: currentUrl,
      healthy: false,
    };
  } finally {
    abortScope.dispose();
  }
}
