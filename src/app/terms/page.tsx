import type { Metadata } from "next";
import { PublicTrustPage, PUBLIC_TRUST_ROBOTS, SUPPORT_EMAIL } from "@/app/_components/public-trust-page";

export const metadata: Metadata = {
  title: "Terms | NoSite Leads",
  description: "Invite-only usage terms for NoSite Leads.",
  robots: PUBLIC_TRUST_ROBOTS,
};

export default function TermsPage() {
  return (
    <PublicTrustPage
      currentPath="/terms"
      eyebrow="Terms"
      title="Terms for the invite-only NoSite Leads workspace"
      description="These terms describe the current launch posture: NoSite Leads is a private operational workspace with public trust pages, not a self-serve public product."
      facts={[
        { label: "Availability", value: "Access is limited to invited operators and approved team members." },
        { label: "Sending", value: "No automated outbound sending is provided by the product." },
        { label: "Demos", value: "Generated demos are previews controlled by the workspace operator that created them." },
      ]}
      sections={[
        {
          title: "Invite-only access",
          body: "Users may access the application only through an invited account. The login, app routes, exports, protected APIs, and internal workflows are not intended for public browsing or indexing.",
        },
        {
          title: "Acceptable use",
          items: [
            "Use the workspace to research businesses, prioritize manual follow-up, and track operational outcomes.",
            "Do not use the product to misrepresent affiliation with a business, imply endorsement, or publish inaccurate business information.",
            "Do not use exported data for spam, harassment, resale, or automated outbound campaigns.",
          ],
        },
        {
          title: "Data-source compliance",
          body: "Google local-business data used by NoSite Leads comes from the official Google Places API only. NoSite Leads does not scrape Google Search, Google Maps pages, Google reviews, or store Google review text.",
        },
        {
          title: "No automated outbound sending",
          body: "NoSite Leads may help an operator prepare notes, scripts, reminders, or demo previews, but it does not automatically send emails, texts, calls, social messages, or other outbound communications.",
        },
        {
          title: "Demo ownership",
          body: "Demo pages and preview assets generated inside NoSite Leads are owned and controlled by the workspace operator that created them. A demo is a preview artifact; it does not mean the referenced business requested, approved, or endorsed the work.",
        },
        {
          title: "Support and disputes",
          body: `Questions, correction requests, removal requests, and demo ownership concerns can be sent to ${SUPPORT_EMAIL}.`,
        },
      ]}
    />
  );
}
