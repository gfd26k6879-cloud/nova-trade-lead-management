export type WebsiteStatus = "none" | "social" | "basic" | "custom";

const DEFAULT_SOCIAL_HOSTS = [
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "linktr.ee",
  "tiktok.com",
  "www.tiktok.com",
  "yelp.com",
  "www.yelp.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "www.linkedin.com",
  "youtube.com",
  "www.youtube.com",
  "nextdoor.com",
];

const DEFAULT_BASIC_HOSTS = [
  "business.site",
  "sites.google.com",
  "square.site",
  "squarespace.com",
  "wix.com",
  "weebly.com",
  "godaddy.com",
  "wordpress.com",
  "blogspot.com",
  "jimdo.com",
  "carrd.co",
  "webflow.io",
  "my.canva.site",
  "bio.link",
];

export function classifyWebsite(
  websiteUri: string | null | undefined,
  socialHosts?: string[],
  basicHosts?: string[],
): WebsiteStatus {
  if (!websiteUri || websiteUri.trim() === "") return "none";

  let host: string;
  try {
    host = new URL(websiteUri).hostname.toLowerCase();
  } catch {
    return "none";
  }

  const socials = socialHosts ?? DEFAULT_SOCIAL_HOSTS;
  const basics = basicHosts ?? DEFAULT_BASIC_HOSTS;

  if (socials.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "social";
  }

  if (basics.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "basic";
  }

  return "custom";
}

export function getDefaultSocialHosts(): string[] {
  return [...DEFAULT_SOCIAL_HOSTS];
}

export function getDefaultBasicHosts(): string[] {
  return [...DEFAULT_BASIC_HOSTS];
}
