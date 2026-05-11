import type { PlaceReview } from "@/lib/google-places";

export interface ReviewInsights {
  keywords: string[];
  painPoints: string[];
  sentimentRatio: number;
  totalReviews: number;
}

const DIGITAL_PAIN_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(website|web site|site)\b/i, label: "mentions website" },
  { pattern: /\b(can'?t find|hard to find|couldn'?t find|difficult to find)\b/i, label: "hard to find" },
  { pattern: /\b(online|internet)\b/i, label: "mentions online presence" },
  { pattern: /\b(book|booking|appointment|schedule|scheduling)\b/i, label: "needs online booking" },
  { pattern: /\b(google|search|look(ed|ing) up)\b/i, label: "found via search" },
  { pattern: /\b(no (website|site|page))\b/i, label: "no website" },
  { pattern: /\b(outdated|old.?(school|fashioned)|ugly)\b/i, label: "outdated presence" },
  { pattern: /\b(phone|call(ed|ing)?)\b/i, label: "relies on phone" },
  { pattern: /\b(social media|facebook|instagram)\b/i, label: "social-only presence" },
  { pattern: /\b(wait(ing)?|slow|long time)\b/i, label: "service wait times" },
];

const POSITIVE_INDICATORS = /\b(great|excellent|amazing|wonderful|fantastic|best|love|recommend|professional|friendly|helpful|clean|quick|fast|efficient)\b/i;
const NEGATIVE_INDICATORS = /\b(terrible|horrible|worst|awful|bad|rude|unprofessional|dirty|slow|never|avoid|scam|overcharged|poor)\b/i;

export function extractReviewInsights(reviews: PlaceReview[]): ReviewInsights {
  const keywords: Set<string> = new Set();
  const painPoints: Set<string> = new Set();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const review of reviews) {
    const text = review.text?.text ?? "";
    if (!text) continue;

    for (const { pattern, label } of DIGITAL_PAIN_PHRASES) {
      if (pattern.test(text)) {
        painPoints.add(label);
        keywords.add(label);
      }
    }

    if (POSITIVE_INDICATORS.test(text)) positiveCount++;
    if (NEGATIVE_INDICATORS.test(text)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  const sentimentRatio = total > 0 ? Math.round((positiveCount / total) * 100) / 100 : 0.5;

  return {
    keywords: [...keywords],
    painPoints: [...painPoints],
    sentimentRatio,
    totalReviews: reviews.length,
  };
}

export function getOutreachAngle(painPoints: string[]): string | null {
  const painSet = new Set(painPoints);

  if (painSet.has("no website") || painSet.has("hard to find")) {
    return "seo";
  }
  if (painSet.has("mentions website") || painSet.has("outdated presence")) {
    return "redesign";
  }
  if (painSet.has("needs online booking")) {
    return "booking";
  }
  if (painSet.has("social-only presence")) {
    return "social_upgrade";
  }
  if (painSet.has("found via search")) {
    return "seo";
  }
  return null;
}
