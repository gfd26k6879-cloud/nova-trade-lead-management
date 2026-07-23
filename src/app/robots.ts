import type { MetadataRoute } from "next";

const publicTrustPages = ["/privacy", "/terms", "/support", "/data-sources"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          ...publicTrustPages,
          "/_next/static/",
          "/_next/image",
          "/icons/",
          "/favicon.ico",
          "/site.webmanifest",
        ],
        disallow: [
          "/",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/auth/",
          "/dashboard",
          "/coverage",
          "/scheduler",
          "/quality",
          "/leads",
          "/queue",
          "/statistics",
          "/settings",
          "/users",
          "/fulfillment",
          "/team",
          "/api/",
        ],
      },
    ],
  };
}
