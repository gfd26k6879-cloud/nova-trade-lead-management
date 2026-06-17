import type { Metadata } from "next";
import { PublicTrustPage, PUBLIC_TRUST_ROBOTS, SUPPORT_CONTACT } from "@/app/_components/public-trust-page";

export const metadata: Metadata = {
  title: "Support | NoSite Leads",
  description: "Support, correction, removal, export, and demo ownership contact paths for NoSite Leads.",
  robots: PUBLIC_TRUST_ROBOTS,
};

export default function SupportPage() {
  return (
    <PublicTrustPage
      currentPath="/support"
      eyebrow="Support"
      title="Support for accounts, corrections, removals, and demos"
      description="Support is handled manually during the invite-only launch. Use the contact path below for account issues, business-data corrections, data export questions, and demo ownership or removal requests."
      facts={[
        { label: "Contact", value: SUPPORT_CONTACT },
        { label: "Best for", value: "Account help, corrections, removal requests, export questions, and demo concerns." },
        { label: "Launch mode", value: "Manual support for an invite-only workspace." },
      ]}
      sections={[
        {
          title: "Support contact",
          body: `Email ${SUPPORT_CONTACT} for account support, correction requests, removal requests, retention and export questions, or demo page concerns.`,
        },
        {
          title: "Correction or removal path",
          body: "Businesses can request a correction or removal of a lead record or public demo reference.",
          items: [
            "Include the business name, location, website if available, and the specific detail that should be corrected or removed.",
            "If the request concerns a generated demo page, include the demo URL or the page title visible in the browser.",
            "NoSite Leads reviews requests against the current workspace record and corrects or removes inaccurate, unwanted, or stale references where appropriate.",
          ],
        },
        {
          title: "Retention and export help",
          body: "Workspace administrators can export lead records from the app. Businesses and workspace operators can ask support about retained records, exports, and removal handling.",
        },
        {
          title: "Demo ownership",
          body: "Demo pages are preview assets owned and controlled by the workspace operator that generated them. They are not proof of business endorsement, and a referenced business can request review or removal.",
        },
        {
          title: "Outbound sending",
          body: "NoSite Leads does not provide automated outbound sending. Operators are responsible for any manual email, phone, SMS, or in-person outreach they choose to perform.",
        },
      ]}
    />
  );
}
