import type { Metadata } from "next";
import { PublicTrustPage, PUBLIC_TRUST_ROBOTS, SUPPORT_CONTACT } from "@/app/_components/public-trust-page";

export const metadata: Metadata = {
  title: "Privacy | Nova Trade Lead Management",
  description: "Privacy, retention, export, and correction policies for the invite-only Nova Trade Lead Management workspace.",
  robots: PUBLIC_TRUST_ROBOTS,
};

export default function PrivacyPage() {
  return (
    <PublicTrustPage
      currentPath="/privacy"
      eyebrow="Privacy"
      title="How Nova Trade Lead Management handles business and workspace data"
      description="Nova Trade Lead Management is an invite-only lead research workspace. The public product surface is limited to trust, support, terms, and data-source information; the application itself requires an invited account."
      facts={[
        { label: "Access", value: "Invite-only workspace; app and login surfaces are not public marketing pages." },
        { label: "Google data", value: "Google local-business data comes from the official Google Places API only." },
        { label: "Outreach", value: "Nova Trade Lead Management does not automate outbound email, SMS, calls, or social messages." },
      ]}
      sections={[
        {
          title: "Business data used",
          body: "The workspace stores lead records needed for operator review, prioritization, and manual follow-up.",
          items: [
            "Business names, addresses, categories, websites, phone numbers, aggregate ratings, and review counts may be stored when returned by the official Google Places API.",
            "Operator-entered notes, lead status, ownership, outreach outcomes, and generated demo links may be stored so the team can avoid duplicate work.",
            "No Google review text, reviewer profiles, or review bodies are scraped, stored, or displayed.",
          ],
        },
        {
          title: "What is not collected",
          items: [
            "Nova Trade Lead Management does not scrape Google Search, Google Maps pages, or Google review pages.",
            "Nova Trade Lead Management does not store Google review content or create a shadow review database.",
            "Nova Trade Lead Management does not send automated outbound messages; operators must choose whether and how to contact a business.",
          ],
        },
        {
          title: "Retention and export",
          body: "Workspace data is retained while the invite-only workspace is active and while it is needed for lead review, audit history, or customer support.",
          items: [
            "Administrators can export lead records from the workspace as CSV when they need a portable operational record.",
            "Business correction, deletion, or demo removal requests can be sent to support and will be reviewed against the current lead and demo records.",
            "If a workspace is closed, operational data is scheduled for removal unless a legal, billing, or abuse-prevention reason requires a narrower retained record.",
          ],
        },
        {
          title: "Corrections and removal",
          body: `Businesses can request correction or removal by emailing ${SUPPORT_CONTACT} with the business name, location, URL if available, and the requested change. Inaccurate lead details and unwanted demo references are reviewed and corrected or removed where appropriate.`,
        },
      ]}
    />
  );
}
