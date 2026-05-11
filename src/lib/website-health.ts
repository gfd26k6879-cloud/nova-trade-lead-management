export interface WebsiteHealth {
  statusCode: number;
  ssl: boolean;
  redirectCount: number;
  responseMs: number;
  finalUrl: string;
  healthy: boolean;
}

export async function checkWebsiteHealth(url: string, timeoutMs = 5000): Promise<WebsiteHealth> {
  const start = Date.now();
  let redirectCount = 0;
  let currentUrl = url;
  let statusCode = 0;
  const ssl = currentUrl.startsWith("https://");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(currentUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "NoSiteLeads-HealthCheck/1.0" },
    });

    clearTimeout(timer);

    statusCode = response.status;
    const finalUrl = response.url || currentUrl;

    if (finalUrl !== currentUrl) {
      redirectCount = countRedirects(currentUrl, finalUrl);
    }
    currentUrl = finalUrl;

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
  } catch (err) {
    const responseMs = Date.now() - start;
    const isTimeout = err instanceof Error && err.name === "AbortError";

    return {
      statusCode: isTimeout ? 0 : 0,
      ssl,
      redirectCount,
      responseMs,
      finalUrl: currentUrl,
      healthy: false,
    };
  }
}

function countRedirects(original: string, final: string): number {
  try {
    const origHost = new URL(original).hostname;
    const finalHost = new URL(final).hostname;
    return origHost !== finalHost ? 2 : 1;
  } catch {
    return 1;
  }
}
