import type { Lead } from "@/lib/db/queries";
import { getOutreachAngle } from "@/lib/review-intelligence";

export interface OutreachPackage {
  opener: string;
  websiteIssue: string;
  valueProps: string[];
  callToAction: string;
  fullMessage: string;
}

export function generateOutreachPackage(lead: Lead): OutreachPackage {
  const name = lead.name ?? "your business";
  const city = extractCity(lead.address);
  const category = formatCategory(lead.categories);
  const reviewText = lead.review_count && lead.rating
    ? `${lead.review_count} reviews at ${lead.rating.toFixed(1)} stars`
    : "great customer feedback";

  const opener = `Hi${lead.phone ? "" : " there"}, I came across ${name} in ${city} and was really impressed — ${reviewText} speaks for itself.`;

  const websiteIssue = getWebsiteIssue(lead);

  const angle = lead.review_highlights
    ? getOutreachAngle(lead.review_highlights)
    : null;

  const valueProps = getValueProps(lead, category, angle);

  const callToAction = `I'd love to show you a quick preview of what a modern site for ${name} could look like — no cost or commitment. Would you have 5 minutes this week for a quick chat?`;

  const fullMessage = [
    opener,
    "",
    websiteIssue,
    "",
    valueProps.map((v) => `• ${v}`).join("\n"),
    "",
    callToAction,
  ].join("\n");

  return { opener, websiteIssue, valueProps, callToAction, fullMessage };
}

function getWebsiteIssue(lead: Lead): string {
  if (lead.website_health) {
    const health = lead.website_health;
    if (typeof health.statusCode === "number" && health.statusCode >= 400) {
      return "I tried visiting your website and it seems to be having some issues — visitors looking for your services might be hitting the same problem, which could mean lost business.";
    }
    if (typeof health.responseMs === "number" && health.responseMs > 3000) {
      return "I noticed your website takes a while to load. Studies show over 50% of visitors leave if a page takes more than 3 seconds — a faster site could make a real difference for you.";
    }
    if (health.ssl === false) {
      return "I noticed your website isn't secured with HTTPS. Browsers show a 'Not Secure' warning to visitors, which can scare away potential customers.";
    }
  }

  switch (lead.website_status) {
    case "none":
      return "I noticed you don't currently have a website, which means potential customers searching online might not find you as easily as they should.";
    case "social":
      return "Right now it looks like your online presence is mainly through social media. While that's great for engagement, a dedicated website helps capture customers who are actively searching for your services.";
    case "basic":
      return "I saw you have a basic website, but it may not be doing your business justice. A modern, mobile-optimized site could help convert more of your visitors into actual customers.";
    default:
      return "A strong online presence can make a big difference in attracting new customers who are searching for services like yours.";
  }
}

function getValueProps(lead: Lead, category: string, angle: string | null): string[] {
  if (angle === "booking") {
    return [
      `Online booking and scheduling so ${category} customers can book 24/7`,
      "Mobile-friendly design — over 60% of local searches happen on phones",
      "Easy-to-find contact info and click-to-call buttons so customers can reach you in seconds",
    ];
  }

  if (angle === "seo") {
    return [
      `Show up in Google search results when people look for ${category} near them`,
      "Professional website that builds instant trust when customers find you online",
      "Mobile-friendly design — over 60% of local searches happen on phones",
    ];
  }

  if (angle === "redesign") {
    return [
      `Modern, fast ${category} website that converts visitors into customers`,
      "Mobile-optimized design that looks great on every device",
      "Clear calls-to-action so visitors know exactly how to reach you",
    ];
  }

  if (angle === "social_upgrade") {
    return [
      "Own your online presence instead of relying solely on social media algorithms",
      `Professional ${category} website that builds instant trust with new customers`,
      "Easy-to-find contact info and click-to-call buttons so customers can reach you in seconds",
    ];
  }

  const base = [
    `Professional ${category} website that builds instant trust with new customers`,
    "Mobile-friendly design — over 60% of local searches happen on phones",
    "Easy-to-find contact info and click-to-call buttons so customers can reach you in seconds",
  ];

  return base;
}

function extractCity(address: string | null): string {
  if (!address) return "your area";
  const parts = address.split(",");
  if (parts.length >= 2) {
    return parts[parts.length - 2].trim().replace(/\s+\d{5}.*/, "");
  }
  return "your area";
}

function formatCategory(categories: string[]): string {
  if (categories.length === 0) return "local business";
  const primary = categories[0]
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return primary;
}
