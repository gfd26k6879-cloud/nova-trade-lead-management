import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DataSourcesPage, { metadata as dataSourcesMetadata } from "@/app/data-sources/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import robots from "@/app/robots";
import SupportPage, { metadata as supportMetadata } from "@/app/support/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";

describe("public trust pages", () => {
  it("renders invite-only privacy, terms, support, and data-source copy", () => {
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    const terms = renderToStaticMarkup(<TermsPage />);
    const support = renderToStaticMarkup(<SupportPage />);
    const dataSources = renderToStaticMarkup(<DataSourcesPage />);

    expect(privacy).toContain("invite-only lead research workspace");
    expect(privacy).toContain("official Google Places API only");
    expect(privacy).toContain("No Google review text");
    expect(privacy).toContain("Retention and export");
    expect(privacy).toContain("support [at] nosite.xyz");

    expect(terms).toContain("Invite-only access");
    expect(terms).toContain("No automated outbound sending");
    expect(terms).toContain("Demo ownership");
    expect(terms).toContain("does not mean the referenced business requested, approved, or endorsed");

    expect(support).toContain("Correction or removal path");
    expect(support).toContain("Retention and export help");
    expect(support).toContain("NoSite Leads does not provide automated outbound sending");

    expect(dataSources).toContain("official Google Places API only");
    expect(dataSources).toContain("no Google review scraping or storage");
    expect(dataSources).toContain("No Google review text");
  });

  it("overrides the global noindex metadata for public trust pages", () => {
    for (const metadata of [privacyMetadata, termsMetadata, supportMetadata, dataSourcesMetadata]) {
      expect(metadata.robots).toMatchObject({
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
        },
      });
    }
  });
});

describe("robots", () => {
  it("allows trust pages while disallowing the private app surface", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const rule = rules[0];

    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toEqual(expect.arrayContaining(["/privacy", "/terms", "/support", "/data-sources"]));
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/", "/login", "/dashboard", "/queue", "/api/"]));
  });
});
