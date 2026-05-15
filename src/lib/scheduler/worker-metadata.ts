export type SchedulerWorkerName = "ai_verification" | "crawl" | "enrichment" | "artifact" | "score_recompute";

export interface SchedulerWorkerMetadata {
  workerName: SchedulerWorkerName;
  label: string;
  shortLabel: string;
  purpose: string;
  endpoint: string;
  schedule: string;
  externalApi: string;
  costSource: string;
  inputLabel: string;
  outputLabel: string;
  cadenceMinutes: number;
}

export const SCHEDULER_WORKER_METADATA: SchedulerWorkerMetadata[] = [
  {
    workerName: "crawl",
    label: "Discovery Crawl",
    shortLabel: "Discovery",
    purpose: "Searches selected ZIP/category units and creates new business leads.",
    endpoint: "/api/crawl/process-next",
    schedule: "Every minute when a discovery run is active",
    externalApi: "Google Places Search",
    costSource: "Google Places search calls",
    inputLabel: "Pending ZIP/category units",
    outputLabel: "New leads persisted and queued for AI verification",
    cadenceMinutes: 1,
  },
  {
    workerName: "enrichment",
    label: "Lead Enrichment",
    shortLabel: "Enrichment",
    purpose: "Pulls deeper Place Details, reviews, and website health evidence for existing leads.",
    endpoint: "/api/crawl/enrich-next",
    schedule: "Every minute while eligible leads need enrichment",
    externalApi: "Google Place Details plus website checks",
    costSource: "Google Place Details calls",
    inputLabel: "Leads waiting for enrichment",
    outputLabel: "Enriched lead data, reviews, website checks, and score updates",
    cadenceMinutes: 1,
  },
  {
    workerName: "ai_verification",
    label: "AI Verification",
    shortLabel: "AI Verify",
    purpose: "Verifies whether each eligible business truly has no usable website or has a weak/broken site.",
    endpoint: "/api/ai/verify-next",
    schedule: "Every minute, one job at a time by default",
    externalApi: "OpenAI Responses API using gpt-5.4-mini",
    costSource: "OpenAI input/output tokens",
    inputLabel: "Queued AI verification jobs",
    outputLabel: "Verified no-site, usable-site-found, broken-site, or manual-review outcomes",
    cadenceMinutes: 1,
  },
  {
    workerName: "artifact",
    label: "Pitch Pack Generator",
    shortLabel: "Pitch Packs",
    purpose: "Generates requested Business Detail and Competitive Report artifacts for sales-ready leads.",
    endpoint: "/api/ai/artifacts/process-next",
    schedule: "Every 2 minutes after a pitch pack is requested",
    externalApi: "OpenAI Responses API using gpt-5.4-mini",
    costSource: "OpenAI input/output tokens",
    inputLabel: "Queued Business Detail and Competitive Report jobs",
    outputLabel: "Completed website brief and pitch report artifacts",
    cadenceMinutes: 2,
  },
  {
    workerName: "score_recompute",
    label: "Score Recompute",
    shortLabel: "Scores",
    purpose: "Recomputes lead quality and sales priority after evidence changes.",
    endpoint: "/api/scores/recompute-stale",
    schedule: "Every 10 minutes when stale scores exist",
    externalApi: "None",
    costSource: "No paid external API",
    inputLabel: "Leads with stale scores",
    outputLabel: "Fresh quality buckets and sales queue priority",
    cadenceMinutes: 10,
  },
];

export const SCHEDULER_WORKER_NAMES = SCHEDULER_WORKER_METADATA.map((worker) => worker.workerName);

export function getSchedulerWorkerMetadata(workerName: SchedulerWorkerName): SchedulerWorkerMetadata {
  return SCHEDULER_WORKER_METADATA.find((worker) => worker.workerName === workerName) ?? SCHEDULER_WORKER_METADATA[0];
}
