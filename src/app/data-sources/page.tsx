import type { Metadata } from "next";
import { PublicTrustPage, PUBLIC_TRUST_ROBOTS, SUPPORT_CONTACT } from "@/app/_components/public-trust-page";

export const metadata: Metadata = {
  title: "Data Sources | NoSite Leads",
  description: "Data-source and Google Places API compliance posture for NoSite Leads.",
  robots: PUBLIC_TRUST_ROBOTS,
};

export default function DataSourcesPage() {
  return (
    <PublicTrustPage
      currentPath="/data-sources"
      eyebrow="Data sources"
      title="Business discovery data comes from official sources"
      description="NoSite Leads is built for controlled lead research. Its Google local-business discovery data comes from the official Google Places API only, with clear limits around reviews, scraping, outreach, and demos."
      facts={[
        { label: "Google source", value: "Official Google Places API only." },
        { label: "Reviews", value: "Aggregate rating signals only; no Google review scraping or storage." },
        { label: "Use", value: "Manual research, prioritization, and operator-owned demos." },
      ]}
      sections={[
        {
          title: "Google Places API",
          body: "NoSite Leads uses the official Google Places API for Google local-business discovery and enrichment. The app does not scrape Google Search result pages, Google Maps pages, or Google review pages.",
        },
        {
          title: "Stored fields",
          body: "The workspace may store operational lead fields returned by the API or entered by operators.",
          items: [
            "Business name, place identifier, address, category, website, phone, rating, and review count.",
            "Lead status, owner, notes, manual outreach outcomes, generated demo links, and audit history.",
            "No Google review text, reviewer identity, review body, or scraped review archive is stored.",
          ],
        },
        {
          title: "No automated outbound",
          body: "The data is used to prioritize manual review and follow-up. NoSite Leads does not automatically send emails, calls, texts, social messages, or other outbound communications.",
        },
        {
          title: "Corrections and removals",
          body: `Business owners and operators can request corrections, removals, export help, or demo review by emailing ${SUPPORT_CONTACT}.`,
        },
        {
          title: "Demo ownership",
          body: "Generated demos are owned and controlled by the workspace operator that created them. A demo should be treated as a preview based on available business facts and operator input, not as a business-approved publication.",
        },
      ]}
    />
  );
}
