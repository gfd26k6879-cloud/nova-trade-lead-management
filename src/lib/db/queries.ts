import { getDb, generateId, nowISO, type DbClient } from "./index";
import { seedZipCodes } from "./seed-zips";
import { computeScoreBandThresholds, type ScoreBandThresholds } from "@/lib/score-bands";
import { computeWinProbability } from "@/lib/scoring";
import {
  GOOGLE_PLACES_SKU_PRICING,
  estimateMarginalSkuCost,
  type GooglePlacesSku,
} from "@/lib/google-pricing";
import { qualifyLead, type QualificationStatus } from "@/lib/qualification";
import { BUSINESS_TYPE_OPTIONS, classifyBusinessType, type BusinessType } from "@/lib/business-types";
import type { WebsiteStatus } from "@/lib/classify-website";
import { OPENAI_LEAD_VERIFICATION_MODEL, assertAllowedOpenAIModel } from "@/lib/ai/config";
import type { AiRecommendation, AiVerificationSource, AiVerificationStatus } from "@/lib/ai/lead-verification";
import type { WebsiteHealthSnapshot, WebsiteViabilityStatus } from "@/lib/ai/website-viability";
import {
  computeLeadQuality,
  type PhoneVerificationStatus,
  type QualityBucket,
  type RecommendedOffer,
} from "@/lib/lead-quality";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import { getAuditActor } from "@/lib/audit-context";

// ─── Types ───

export interface Lead {
  id: string;
  place_id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  categories: string[];
  rating: number | null;
  review_count: number | null;
  website_uri: string | null;
  website_status: string;
  maps_uri: string | null;
  business_status: string | null;
  price_level: string | null;
  photo_count: number;
  has_opening_hours: boolean;
  primary_type: string | null;
  lat: number | null;
  lng: number | null;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  excluded_at: string | null;
  selling_niche: string | null;
  business_type: BusinessType;
  win_probability_score: number;
  lead_quality_score: number;
  quality_bucket: QualityBucket;
  easy_build_score: number;
  cash_speed_score: number;
  need_score: number;
  quality_reason: string | null;
  recommended_offer: RecommendedOffer;
  next_best_action: string | null;
  phone_verification_status: PhoneVerificationStatus;
  last_quality_scored_at: string | null;
  quality_checked_by_user_id: string | null;
  ai_verification_status: AiVerificationStatus;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: AiRecommendation | null;
  ai_summary: string | null;
  ai_checked_at: string | null;
  ai_website_viability_status: WebsiteViabilityStatus | null;
  ai_website_health: WebsiteHealthSnapshot | null;
  ai_queue_status: AiQueueStatus;
  ai_attempt_count: number;
  ai_last_error: string | null;
  ai_next_retry_at: string | null;
  ai_input_hash: string | null;
  raw_opportunity_score: number;
  verification_score: number;
  sales_priority_score: number;
  pitch_outcome: string | null;
  objection_reason: string | null;
  decision_maker_reached: boolean;
  quoted_amount: number;
  close_value: number;
  demo_sent_at: string | null;
  assigned_to_user_id: string | null;
  qualification_status: QualificationStatus;
  disqualification_reason: string | null;
  website_verified_at: string | null;
  contactability_score: number;
  estimated_deal_value: number;
  notes: string | null;
  reminder_date: string | null;
  enrichment_status: string;
  enriched_at: string | null;
  review_highlights: string[] | null;
  editorial_summary: string | null;
  website_health: Record<string, unknown> | null;
  website_checked_at: string | null;
  verification: Record<string, boolean>;
  discovered_at: string;
  first_contacted_at: string | null;
  first_reply_at: string | null;
  meeting_booked_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KanbanLead {
  id: string;
  name: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  website_status: string;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  enrichment_status: string;
  primary_type: string | null;
  selling_niche: string | null;
  business_type: BusinessType;
  win_probability_score: number;
  lead_quality_score: number;
  quality_bucket: QualityBucket;
  easy_build_score: number;
  cash_speed_score: number;
  need_score: number;
  quality_reason: string | null;
  recommended_offer: RecommendedOffer;
  next_best_action: string | null;
  phone_verification_status: PhoneVerificationStatus;
  ai_verification_status: AiVerificationStatus;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: AiRecommendation | null;
  ai_summary: string | null;
  ai_checked_at: string | null;
  ai_website_viability_status: WebsiteViabilityStatus | null;
  ai_website_health: WebsiteHealthSnapshot | null;
  ai_queue_status: AiQueueStatus;
  raw_opportunity_score: number;
  verification_score: number;
  sales_priority_score: number;
  qualification_status: QualificationStatus;
}

export interface QueueLead {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  categories: string[];
  score: number;
  website_status: string;
  rating: number | null;
  review_count: number | null;
  last_contacted_at: string | null;
  reminder_date: string | null;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  selling_niche: string | null;
  business_type: BusinessType;
  win_probability_score: number;
  lead_quality_score: number;
  quality_bucket: QualityBucket;
  easy_build_score: number;
  cash_speed_score: number;
  need_score: number;
  quality_reason: string | null;
  recommended_offer: RecommendedOffer;
  next_best_action: string | null;
  phone_verification_status: PhoneVerificationStatus;
  ai_verification_status: AiVerificationStatus;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: AiRecommendation | null;
  ai_checked_at: string | null;
  ai_website_viability_status: WebsiteViabilityStatus | null;
  ai_queue_status: AiQueueStatus;
  qualification_status: QualificationStatus;
  contactability_score: number;
  estimated_deal_value: number;
  raw_opportunity_score: number;
  verification_score: number;
  sales_priority_score: number;
  demo_slug: string | null;
}

export interface OutreachEvent {
  id: string;
  lead_id: string;
  channel: string;
  note: string | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  author_user_id: string;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Demo {
  id: string;
  lead_id: string;
  slug: string;
  template_id: string | null;
  config_json: Record<string, unknown>;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublishedDemo {
  demo: Demo;
  lead: Lead;
}

export interface ConversionMetrics {
  totalContacted: number;
  totalReplies: number;
  totalMeetings: number;
  replyRate: number;
  meetingRate: number;
  medianHoursToContact: number | null;
}

export interface CrawlRun {
  id: string;
  mode: string;
  status: string;
  categories: string[];
  started_at: string | null;
  ended_at: string | null;
  discovered_count: number;
  enriched_count: number;
  error_count: number;
  api_calls_used: number;
  last_error: string | null;
  created_at: string;
}

export interface CrawlUnit {
  id: string;
  crawl_run_id: string;
  zip: string;
  category: string;
  keyword: string | null;
  status: string;
  next_page_token: string | null;
  attempt_count: number;
  discovered_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  created_at: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ZipCode {
  zip: string;
  city: string;
  state: string;
  county: string;
  lat: number | null;
  lng: number | null;
  is_active: number;
}

export interface Settings {
  niche_weights: Record<string, number>;
  social_hosts: string[];
  basic_hosts: string[];
  rate_limit_ms: number;
  max_calls_per_day: number;
  max_calls_per_run: number;
  max_monthly_api_spend: number;
  stop_on_budget_limit: boolean;
  search_radius_km: number;
  enrichment_enabled: boolean;
  max_enrichment_per_run: number;
  website_health_enabled: boolean;
  cache_ttl_days: number;
  enrichment_stage_b_min_score: number;
  max_atmosphere_enrichment_per_run: number;
  cost_engine_v2_enabled: boolean;
  ai_enabled: boolean;
  ai_model: string;
  ai_daily_budget_usd: number;
  ai_monthly_budget_usd: number;
  ai_batch_limit: number;
  ai_cache_ttl_days: number;
  ai_manual_apply_required: boolean;
  ai_auto_verify_enabled: boolean;
  ai_verify_after_discovery: boolean;
  ai_reverify_after_enrichment: boolean;
  ai_verification_concurrency: number;
  ai_max_attempts: number;
  openai_api_key_configured: boolean;
  openai_api_key_source: "ui" | "env" | "none";
  google_places_api_key_configured: boolean;
  google_places_api_key_source: "ui" | "env" | "none";
}

export interface AiLeadVerification {
  id: string;
  lead_id: string;
  model: string;
  status: AiVerificationStatus;
  confidence: number;
  found_website_url: string | null;
  found_email: string | null;
  found_phone: string | null;
  social_profiles: string[];
  sources: AiVerificationSource[];
  recommendation: AiRecommendation;
  reason: string;
  summary: string;
  website_viability_status: WebsiteViabilityStatus | null;
  website_health_json: WebsiteHealthSnapshot | null;
  website_viability_reason: string | null;
  raw_json: Record<string, unknown>;
  input_hash: string | null;
  usage_input_tokens: number;
  usage_output_tokens: number;
  estimated_cost: number;
  error: string | null;
  created_at: string;
}

export interface AiLeadVerificationInput {
  lead_id: string;
  model: string;
  status: AiVerificationStatus;
  confidence?: number;
  found_website_url?: string | null;
  found_email?: string | null;
  found_phone?: string | null;
  social_profiles?: string[];
  sources?: AiVerificationSource[];
  recommendation: AiRecommendation;
  reason?: string;
  summary?: string;
  website_viability_status?: WebsiteViabilityStatus | null;
  website_health_json?: WebsiteHealthSnapshot | null;
  website_viability_reason?: string | null;
  raw_json?: Record<string, unknown>;
  input_hash?: string | null;
  usage_input_tokens?: number;
  usage_output_tokens?: number;
  estimated_cost?: number;
  error?: string | null;
}

export interface AiUsageEventInput {
  lead_id?: string | null;
  verification_id?: string | null;
  model: string;
  endpoint?: string;
  success?: boolean;
  was_cached?: boolean;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost?: number;
  metadata?: Record<string, unknown>;
}

export interface AiBudgetStatus {
  dailyCost: number;
  monthlyCost: number;
  dailyBudget: number;
  monthlyBudget: number;
  reservedCost: number;
  allowed: boolean;
  reason: string | null;
}

export interface ApiUsageSummary {
  totalCalls: number;
  totalCost: number;
  discoveryCalls: number;
  discoveryCost: number;
  enrichmentCalls: number;
  enrichmentCost: number;
  atmosphereCalls: number;
  atmosphereCost: number;
}

export interface ApiUsageEventInput {
  crawl_run_id?: string | null;
  crawl_unit_id?: string | null;
  lead_id?: string | null;
  endpoint: string;
  sku: GooglePlacesSku;
  field_mask?: string | null;
  success?: boolean;
  was_cached?: boolean;
  billable_units?: number;
  metadata?: Record<string, unknown>;
}

export interface PlaceObservationInput {
  place_id: string;
  endpoint: string;
  sku: GooglePlacesSku;
  field_mask?: string | null;
  raw_json: string;
  crawl_run_id?: string | null;
  crawl_unit_id?: string | null;
  lead_id?: string | null;
  observed_at?: string;
}

interface PlaceMasterUpsertInput {
  place_id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  website_uri?: string | null;
  maps_uri?: string | null;
  categories?: string[];
  rating?: number | null;
  user_rating_count?: number | null;
  business_status?: string | null;
  price_level?: string | null;
  photo_count?: number;
  has_opening_hours?: boolean;
  primary_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  editorial_summary?: string | null;
  review_highlights?: string[] | null;
  website_health?: Record<string, unknown> | null;
  verification_coverage?: number;
  last_details_at?: string | null;
  last_enriched_at?: string | null;
}

export interface LeadFilters {
  search?: string;
  status?: string;
  websiteStatus?: string;
  enrichment?: string;
  minReviews?: number;
  minRating?: number;
  minScore?: number;
  category?: string;
  businessType?: BusinessType | string;
  sellingNiche?: string;
  qualificationStatus?: QualificationStatus;
  qualityBucket?: QualityBucket | string;
  recommendedOffer?: RecommendedOffer | string;
  phoneVerificationStatus?: PhoneVerificationStatus | string;
  aiVerificationStatus?: AiVerificationStatus | string;
  includeExcluded?: boolean;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export type AiQueueStatus = "not_checked" | "queued" | "running" | "verified" | "error";

export interface AiQueueStats {
  notChecked: number;
  queued: number;
  running: number;
  verified: number;
  error: number;
  total: number;
}

export interface QualityLead extends QueueLead {
  city: string | null;
  quality_reason: string | null;
  next_best_action: string | null;
}

export interface QualitySummary {
  readyToCall: number;
  aiVerifiedNoWebsite: number;
  brokenSiteOpportunities: number;
  needsAiVerify: number;
  needsManualReview: number;
  removedBecauseWebsiteFound: number;
  averageQualityScore: number;
  estimatedPipelineValue: number;
}

export interface QualityFilters {
  search?: string;
  qualityBucket?: QualityBucket | string;
  businessType?: BusinessType | string;
  recommendedOffer?: RecommendedOffer | string;
  phoneVerificationStatus?: PhoneVerificationStatus | string;
  aiVerificationStatus?: AiVerificationStatus | string;
  denverOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ZipProgress {
  state: string;
  county: string;
  zip: string;
  city: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
}

export interface PlannerStateOption {
  state: string;
  countyCount: number;
  zipCount: number;
  activeZipCount: number;
}

export interface PlannerCountyOption {
  state: string;
  county: string;
  zipCount: number;
  activeZipCount: number;
}

export interface ZipCoverageStatus {
  zip: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  completed: boolean;
}

export interface CountyCoverageProgress {
  state: string;
  county: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  zipCount: number;
}

export interface StateCoverageProgress {
  state: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  countyCount: number;
  zipCount: number;
}

export interface GeographyProgress {
  zipCodesSelected: number;
  zipCodesCompleted: number;
  countiesSelected: number;
  countiesCompleted: number;
}

export interface BusinessTypeCount {
  id: BusinessType;
  label: string;
  total: number;
  active: number;
}

export type StatisticsRangeKey = "all" | "today" | "7d" | "30d" | "month" | "custom";

export interface StatisticsRangeInput {
  range?: StatisticsRangeKey | string;
  from?: string;
  to?: string;
}

export interface ResolvedStatisticsRange {
  range: StatisticsRangeKey;
  label: string;
  from: string | null;
  to: string | null;
}

export interface StatisticsBreakdownRow {
  key: string;
  label: string;
  count: number;
}

export interface StatisticsBusinessTypeRow {
  id: BusinessType;
  label: string;
  total: number;
  active: number;
  qualified: number;
  needsVerification: number;
  excluded: number;
  noWebsite: number;
  socialWebsite: number;
  basicWebsite: number;
  customWebsite: number;
  contacted: number;
  demos: number;
  meetings: number;
  closedWon: number;
  closedLost: number;
  averageScore: number;
  averageDealValue: number;
  pipelineValue: number;
}

export interface StatisticsQualityValueRow {
  key: string;
  label: string;
  count: number;
  value: number;
}

export interface StatisticsSummary {
  range: ResolvedStatisticsRange;
  kpis: {
    totalDiscovered: number;
    activeLeads: number;
    qualifiedLeads: number;
    queueCandidates: number;
    excludedLeads: number;
    demosCreated: number;
    contactedLeads: number;
    replies: number;
    meetings: number;
    closedWon: number;
    closedLost: number;
  };
  economics: {
    pipelineValue: number;
    averageDealValue: number;
    apiCost: number;
    apiCalls: number;
    costPerQualifiedLead: number | null;
    costPerContactedLead: number | null;
    costPerMeeting: number | null;
  };
  ai: {
    cost: number;
    calls: number;
    verifications: number;
    cachedResults: number;
    siteFound: number;
    usableSiteFound: number;
    weakSiteFound: number;
    websiteOpportunityFound: number;
    uncertain: number;
    costPerVerification: number | null;
  };
  quality: {
    readyToCall: number;
    needsAiVerify: number;
    needsManualReview: number;
    brokenSiteOpportunities: number;
    notFit: number;
    aiVerifiedNoSiteRate: number;
    usableSiteFoundRate: number;
    brokenSiteRate: number;
    contactedToReplyRate: number;
    replyToMeetingRate: number;
    meetingToCloseRate: number;
    pipelineByBucket: StatisticsQualityValueRow[];
    topReadyByType: StatisticsQualityValueRow[];
    topValueByType: StatisticsQualityValueRow[];
  };
  businessTypes: StatisticsBusinessTypeRow[];
  dataQuality: {
    websiteStatus: StatisticsBreakdownRow[];
    qualificationStatus: StatisticsBreakdownRow[];
    enrichmentStatus: StatisticsBreakdownRow[];
    exclusionReasons: StatisticsBreakdownRow[];
    verificationAverage: number;
    verificationCheckedLeads: number;
  };
  operations: {
    apiByEndpoint: Array<{ key: string; calls: number; cost: number }>;
    apiBySku: Array<{ key: string; calls: number; cost: number }>;
    crawlRunsByStatus: StatisticsBreakdownRow[];
    failedUnits: number;
    enrichmentBacklog: number;
  };
}

// ─── Initialization ───

let dbReadyPromise: Promise<void> | null = null;

export async function ensureDbReady(): Promise<void>{
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      await getDb();
      await seedZipCodes();
    })();
  }
  await dbReadyPromise;
}

// ─── Settings ───

export async function getSettings(): Promise<Settings>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, unknown>;
  assertAllowedOpenAIModel(row.ai_model as string | null | undefined);
  const configuredModel = assertAllowedOpenAIModel(process.env.OPENAI_MODEL || OPENAI_LEAD_VERIFICATION_MODEL);
  return {
    niche_weights: safeParseJson<Record<string, number>>(row.niche_weights, {}),
    social_hosts: safeParseJson<string[]>(row.social_hosts, []),
    basic_hosts: safeParseJson<string[]>(row.basic_hosts, []),
    rate_limit_ms: row.rate_limit_ms as number,
    max_calls_per_day: row.max_calls_per_day as number,
    max_calls_per_run: row.max_calls_per_run as number,
    max_monthly_api_spend: row.max_monthly_api_spend as number,
    stop_on_budget_limit: (row.stop_on_budget_limit as number) === 1,
    search_radius_km: (row.search_radius_km as number) ?? 8.0,
    enrichment_enabled: ((row.enrichment_enabled as number) ?? 1) === 1,
    max_enrichment_per_run: (row.max_enrichment_per_run as number) ?? 50,
    website_health_enabled: ((row.website_health_enabled as number) ?? 1) === 1,
    cache_ttl_days: (row.cache_ttl_days as number) ?? 30,
    enrichment_stage_b_min_score: (row.enrichment_stage_b_min_score as number) ?? 9.0,
    max_atmosphere_enrichment_per_run: (row.max_atmosphere_enrichment_per_run as number) ?? 25,
    cost_engine_v2_enabled: ((row.cost_engine_v2_enabled as number) ?? 1) === 1,
    ai_enabled: ((row.ai_enabled as number) ?? 0) === 1,
    ai_model: configuredModel,
    ai_daily_budget_usd: (row.ai_daily_budget_usd as number) ?? 2.0,
    ai_monthly_budget_usd: (row.ai_monthly_budget_usd as number) ?? 25.0,
    ai_batch_limit: (row.ai_batch_limit as number) ?? 25,
    ai_cache_ttl_days: (row.ai_cache_ttl_days as number) ?? 30,
    ai_manual_apply_required: ((row.ai_manual_apply_required as number) ?? 1) === 1,
    ai_auto_verify_enabled: ((row.ai_auto_verify_enabled as number) ?? 1) === 1,
    ai_verify_after_discovery: ((row.ai_verify_after_discovery as number) ?? 1) === 1,
    ai_reverify_after_enrichment: ((row.ai_reverify_after_enrichment as number) ?? 1) === 1,
    ai_verification_concurrency: Math.max(1, Math.min(5, Math.floor((row.ai_verification_concurrency as number) ?? 1))),
    ai_max_attempts: Math.max(1, Math.min(10, Math.floor((row.ai_max_attempts as number) ?? 3))),
    openai_api_key_configured: !!row.openai_api_key_encrypted || !!process.env.OPENAI_API_KEY,
    openai_api_key_source: row.openai_api_key_encrypted ? "ui" : process.env.OPENAI_API_KEY ? "env" : "none",
    google_places_api_key_configured: !!row.google_places_api_key_encrypted || !!process.env.GOOGLE_PLACES_API_KEY,
    google_places_api_key_source: row.google_places_api_key_encrypted ? "ui" : process.env.GOOGLE_PLACES_API_KEY ? "env" : "none",
  };
}

export async function updateSettings(settings: Partial<Settings>): Promise<void>{
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (settings.niche_weights !== undefined) {
    updates.push("niche_weights = ?");
    values.push(JSON.stringify(settings.niche_weights));
  }
  if (settings.social_hosts !== undefined) {
    updates.push("social_hosts = ?");
    values.push(JSON.stringify(settings.social_hosts));
  }
  if (settings.basic_hosts !== undefined) {
    updates.push("basic_hosts = ?");
    values.push(JSON.stringify(settings.basic_hosts));
  }
  if (settings.rate_limit_ms !== undefined) {
    updates.push("rate_limit_ms = ?");
    values.push(settings.rate_limit_ms);
  }
  if (settings.max_calls_per_day !== undefined) {
    updates.push("max_calls_per_day = ?");
    values.push(settings.max_calls_per_day);
  }
  if (settings.max_calls_per_run !== undefined) {
    updates.push("max_calls_per_run = ?");
    values.push(settings.max_calls_per_run);
  }
  if (settings.max_monthly_api_spend !== undefined) {
    updates.push("max_monthly_api_spend = ?");
    values.push(settings.max_monthly_api_spend);
  }
  if (settings.stop_on_budget_limit !== undefined) {
    updates.push("stop_on_budget_limit = ?");
    values.push(settings.stop_on_budget_limit ? 1 : 0);
  }
  if (settings.search_radius_km !== undefined) {
    updates.push("search_radius_km = ?");
    values.push(settings.search_radius_km);
  }
  if (settings.enrichment_enabled !== undefined) {
    updates.push("enrichment_enabled = ?");
    values.push(settings.enrichment_enabled ? 1 : 0);
  }
  if (settings.max_enrichment_per_run !== undefined) {
    updates.push("max_enrichment_per_run = ?");
    values.push(settings.max_enrichment_per_run);
  }
  if (settings.website_health_enabled !== undefined) {
    updates.push("website_health_enabled = ?");
    values.push(settings.website_health_enabled ? 1 : 0);
  }
  if (settings.cache_ttl_days !== undefined) {
    updates.push("cache_ttl_days = ?");
    values.push(settings.cache_ttl_days);
  }
  if (settings.enrichment_stage_b_min_score !== undefined) {
    updates.push("enrichment_stage_b_min_score = ?");
    values.push(settings.enrichment_stage_b_min_score);
  }
  if (settings.max_atmosphere_enrichment_per_run !== undefined) {
    updates.push("max_atmosphere_enrichment_per_run = ?");
    values.push(settings.max_atmosphere_enrichment_per_run);
  }
  if (settings.cost_engine_v2_enabled !== undefined) {
    updates.push("cost_engine_v2_enabled = ?");
    values.push(settings.cost_engine_v2_enabled ? 1 : 0);
  }
  if (settings.ai_enabled !== undefined) {
    updates.push("ai_enabled = ?");
    values.push(settings.ai_enabled ? 1 : 0);
  }
  if (settings.ai_model !== undefined) {
    updates.push("ai_model = ?");
    values.push(assertAllowedOpenAIModel(settings.ai_model));
  }
  if (settings.ai_daily_budget_usd !== undefined) {
    updates.push("ai_daily_budget_usd = ?");
    values.push(Math.max(0, settings.ai_daily_budget_usd));
  }
  if (settings.ai_monthly_budget_usd !== undefined) {
    updates.push("ai_monthly_budget_usd = ?");
    values.push(Math.max(0, settings.ai_monthly_budget_usd));
  }
  if (settings.ai_batch_limit !== undefined) {
    updates.push("ai_batch_limit = ?");
    values.push(Math.max(1, Math.min(100, Math.floor(settings.ai_batch_limit))));
  }
  if (settings.ai_cache_ttl_days !== undefined) {
    updates.push("ai_cache_ttl_days = ?");
    values.push(Math.max(1, Math.min(365, Math.floor(settings.ai_cache_ttl_days))));
  }
  if (settings.ai_manual_apply_required !== undefined) {
    updates.push("ai_manual_apply_required = ?");
    values.push(1);
  }
  if (settings.ai_auto_verify_enabled !== undefined) {
    updates.push("ai_auto_verify_enabled = ?");
    values.push(settings.ai_auto_verify_enabled ? 1 : 0);
  }
  if (settings.ai_verify_after_discovery !== undefined) {
    updates.push("ai_verify_after_discovery = ?");
    values.push(settings.ai_verify_after_discovery ? 1 : 0);
  }
  if (settings.ai_reverify_after_enrichment !== undefined) {
    updates.push("ai_reverify_after_enrichment = ?");
    values.push(settings.ai_reverify_after_enrichment ? 1 : 0);
  }
  if (settings.ai_verification_concurrency !== undefined) {
    updates.push("ai_verification_concurrency = ?");
    values.push(Math.max(1, Math.min(5, Math.floor(settings.ai_verification_concurrency))));
  }
  if (settings.ai_max_attempts !== undefined) {
    updates.push("ai_max_attempts = ?");
    values.push(Math.max(1, Math.min(10, Math.floor(settings.ai_max_attempts))));
  }
  if (
    "openai_api_key_configured" in settings ||
    "openai_api_key_source" in settings ||
    "google_places_api_key_configured" in settings ||
    "google_places_api_key_source" in settings
  ) {
    // API keys are managed through dedicated secret actions, never by the generic settings save.
  }

  if (updates.length === 0) return;

  updates.push("updated_at = ?");
  values.push(nowISO());

  await db.prepare(`UPDATE settings SET ${updates.join(", ")} WHERE id = 1`).run(...values);
}

export async function setStoredOpenAiApiKey(apiKey: string): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE settings SET openai_api_key_encrypted = ?, updated_at = ? WHERE id = 1")
    .run(encryptSecret(apiKey), nowISO());
}

export async function clearStoredOpenAiApiKey(): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE settings SET openai_api_key_encrypted = NULL, updated_at = ? WHERE id = 1")
    .run(nowISO());
}

export async function getConfiguredOpenAiApiKey(): Promise<string>{
  const db = await getDb();
  const row = await db.prepare("SELECT openai_api_key_encrypted FROM settings WHERE id = 1").get() as { openai_api_key_encrypted: string | null } | undefined;
  if (row?.openai_api_key_encrypted) {
    return decryptSecret(row.openai_api_key_encrypted);
  }
  return (process.env.OPENAI_API_KEY || "").trim();
}

export async function setStoredGooglePlacesApiKey(apiKey: string): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE settings SET google_places_api_key_encrypted = ?, updated_at = ? WHERE id = 1")
    .run(encryptSecret(apiKey), nowISO());
}

export async function clearStoredGooglePlacesApiKey(): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE settings SET google_places_api_key_encrypted = NULL, updated_at = ? WHERE id = 1")
    .run(nowISO());
}

export async function getConfiguredGooglePlacesApiKey(): Promise<string>{
  const db = await getDb();
  const row = await db.prepare("SELECT google_places_api_key_encrypted FROM settings WHERE id = 1").get() as { google_places_api_key_encrypted: string | null } | undefined;
  if (row?.google_places_api_key_encrypted) {
    return decryptSecret(row.google_places_api_key_encrypted);
  }
  return (process.env.GOOGLE_PLACES_API_KEY || "").trim();
}

// ─── Zip Codes ───

export async function getActiveZipCodes(): Promise<ZipCode[]>{
  const db = await getDb();
  return await db.prepare("SELECT * FROM zip_codes WHERE is_active = 1 ORDER BY zip").all() as ZipCode[];
}

export async function getZipCodeCount(): Promise<number>{
  const db = await getDb();
  const row = await db.prepare("SELECT COUNT(*) as count FROM zip_codes WHERE is_active = 1").get() as { count: number };
  return row.count;
}

export async function getStatesWithCounts(): Promise<PlannerStateOption[]>{
  const db = await getDb();
  return await db.prepare(
    `SELECT
      state,
      COUNT(DISTINCT county) as countyCount,
      COUNT(*) as zipCount,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as activeZipCount
     FROM zip_codes
     GROUP BY state
     ORDER BY state`
  ).all() as PlannerStateOption[];
}

export async function getCountiesByState(state: string): Promise<PlannerCountyOption[]>{
  const db = await getDb();
  return await db.prepare(
    `SELECT
      state,
      county,
      COUNT(*) as zipCount,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as activeZipCount
     FROM zip_codes
     WHERE state = ?
     GROUP BY state, county
     ORDER BY county`
  ).all(state) as PlannerCountyOption[];
}

export async function getZipCodesByCounty(state: string, county: string): Promise<ZipCode[]>{
  const db = await getDb();
  return await db.prepare(
    `SELECT zip, city, state, county, lat, lng, is_active
     FROM zip_codes
     WHERE state = ? AND county = ?
     ORDER BY zip`
  ).all(state, county) as ZipCode[];
}

export async function getZipCoverageStatus(zip: string, categories?: readonly string[]): Promise<ZipCoverageStatus>{
  const db = await getDb();
  const normalizedCategories = Array.from(
    new Set((categories ?? []).map((category) => category.trim()).filter((category) => category.length > 0))
  );

  if (normalizedCategories.length === 0) {
    const row = await db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN has_done = 1 THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN has_done = 0 AND has_failed = 1 THEN 1 ELSE 0 END) as failed
      FROM (
        SELECT
          category,
          MAX(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as has_done,
          MAX(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as has_failed
        FROM crawl_units
        WHERE zip = ?
        GROUP BY category
      )`
    ).get(zip) as { total: number | null; done: number | null; failed: number | null };

    const total = row.total ?? 0;
    const done = row.done ?? 0;
    const failed = row.failed ?? 0;
    const remaining = Math.max(total - done - failed, 0);
    return { zip, total, done, failed, remaining, completed: total > 0 && done === total };
  }

  const placeholders = normalizedCategories.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT
      category,
      MAX(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as has_done,
      MAX(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as has_failed
     FROM crawl_units
     WHERE zip = ? AND category IN (${placeholders})
     GROUP BY category`
  ).all(zip, ...normalizedCategories) as Array<{ category: string; has_done: number; has_failed: number }>;

  const byCategory = new Map(rows.map((row) => [row.category, row]));
  let done = 0;
  let failed = 0;
  for (const category of normalizedCategories) {
    const row = byCategory.get(category);
    if (row?.has_done) done++;
    else if (row?.has_failed) failed++;
  }

  const total = normalizedCategories.length;
  const remaining = Math.max(total - done - failed, 0);
  return { zip, total, done, failed, remaining, completed: total > 0 && done === total };
}

// ─── Crawl Runs ───

export async function createCrawlRun(categories: string[]): Promise<CrawlRun>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();

  await db.prepare(
    `INSERT INTO crawl_runs (id, mode, status, categories, started_at, created_at) VALUES (?, 'coverage', 'running', ?, ?, ?)`
  ).run(id, JSON.stringify(categories), now, now);

  return (await getCrawlRun(id))!;
}

export async function getCrawlRun(id: string): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, categories: safeParseJson<string[]>(row.categories, []) } as unknown as CrawlRun;
}

export async function getActiveCrawlRun(): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs WHERE status IN ('running', 'queued', 'paused') ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, categories: safeParseJson<string[]>(row.categories, []) } as unknown as CrawlRun;
}

export async function getLatestCrawlRun(): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, categories: safeParseJson<string[]>(row.categories, []) } as unknown as CrawlRun;
}

export async function updateCrawlRunStatus(id: string, status: string): Promise<void>{
  const db = await getDb();
  const updates: Record<string, unknown> = { status };
  if (status === "done" || status === "error") updates.ended_at = nowISO();
  await db.prepare("UPDATE crawl_runs SET status = ?, ended_at = COALESCE(?, ended_at) WHERE id = ?")
    .run(status, updates.ended_at ?? null, id);
}

export async function incrementCrawlRunCounters(id: string, discovered: number, errors: number, apiCalls: number): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE crawl_runs SET discovered_count = discovered_count + ?, error_count = error_count + ?, api_calls_used = api_calls_used + ? WHERE id = ?`
  ).run(discovered, errors, apiCalls, id);
}

// ─── Crawl Units ───

export async function createCrawlUnits(runId: string, categories: string[]): Promise<number>{
  const db = await getDb();
  const zips = await getActiveZipCodes();

  const insert = await db.prepare(
    `INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
  );

  const now = nowISO();
  let count = 0;
  for (const zip of zips) {
    for (const category of categories) {
      await insert.run(generateId(), runId, zip.zip, category, now);
      count++;
    }
  }

  return count;
}

export async function createCrawlUnitsForSelection(runId: string, categories: string[], zipCodes: string[]): Promise<number>{
  const db = await getDb();
  const normalizedCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter((category) => category.length > 0))
  );
  const normalizedZipCodes = Array.from(
    new Set(zipCodes.map((zip) => zip.trim()).filter((zip) => zip.length > 0))
  );

  if (normalizedCategories.length === 0 || normalizedZipCodes.length === 0) {
    return 0;
  }

  const placeholders = normalizedZipCodes.map(() => "?").join(", ");
  const activeZips = await db.prepare(
    `SELECT zip
     FROM zip_codes
     WHERE is_active = 1 AND zip IN (${placeholders})
     ORDER BY zip`
  ).all(...normalizedZipCodes) as Array<{ zip: string }>;

  if (activeZips.length === 0) {
    return 0;
  }

  const insert = await db.prepare(
    `INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
  );

  const now = nowISO();
  let count = 0;
  for (const { zip } of activeZips) {
    for (const category of normalizedCategories) {
      await insert.run(generateId(), runId, zip, category, now);
      count++;
    }
  }

  return count;
}

export async function getNextPendingUnit(runId: string): Promise<CrawlUnit | null>{
  const db = await getDb();

  await db.prepare(
    `UPDATE crawl_units SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ? AND status = 'running'
     AND started_at < datetime('now', '-5 minutes')`
  ).run(runId);

  const row = await db.prepare(
    `SELECT cu.*, z.city, z.lat, z.lng
     FROM crawl_units cu
     LEFT JOIN zip_codes z ON cu.zip = z.zip
     WHERE cu.crawl_run_id = ? AND cu.status = 'pending'
     ORDER BY
       CASE
         WHEN z.county = 'Denver' THEN 0
         WHEN z.city = 'Denver' THEN 1
         ELSE 2
       END,
       cu.zip ASC,
       cu.category ASC,
       cu.created_at ASC
     LIMIT 1`
  ).get(runId) as CrawlUnit | undefined;

  return row ?? null;
}

export async function markUnitRunning(unitId: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    "UPDATE crawl_units SET status = 'running', started_at = ?, attempt_count = attempt_count + 1 WHERE id = ?"
  ).run(nowISO(), unitId);
}

export async function markUnitDone(unitId: string, discoveredCount: number): Promise<void>{
  const db = await getDb();
  await db.prepare(
    "UPDATE crawl_units SET status = 'done', finished_at = ?, discovered_count = ? WHERE id = ?"
  ).run(nowISO(), discoveredCount, unitId);
}

export async function markUnitFailed(unitId: string, error: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    "UPDATE crawl_units SET status = 'failed', finished_at = ?, last_error = ? WHERE id = ?"
  ).run(nowISO(), error, unitId);
}

export async function updateUnitPageToken(unitId: string, token: string | null): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE crawl_units SET next_page_token = ? WHERE id = ?").run(token, unitId);
}

export async function retryFailedUnits(runId: string): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    "UPDATE crawl_units SET status = 'pending', started_at = NULL, last_error = NULL WHERE crawl_run_id = ? AND status = 'failed'"
  ).run(runId);
  return result.changes;
}

export async function getCrawlProgress(runId: string): Promise<{ total: number; done: number; failed: number; running: number; pending: number }> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT status, COUNT(*) as count FROM crawl_units WHERE crawl_run_id = ? GROUP BY status`
  ).all(runId) as { status: string; count: number }[];

  const counts = { total: 0, done: 0, failed: 0, running: 0, pending: 0 };
  for (const row of rows) {
    const count = Number(row.count) || 0;
    counts.total += count;
    if (row.status === "done") counts.done = count;
    else if (row.status === "failed") counts.failed = count;
    else if (row.status === "running") counts.running = count;
    else if (row.status === "pending" || row.status === "retry_wait") counts.pending += count;
  }
  return counts;
}

export async function getCoverageByZip(runId?: string): Promise<ZipProgress[]>{
  const db = await getDb();

  let query: string;
  const params: unknown[] = [];

  if (runId) {
    query = `
      SELECT z.state, z.county, z.zip, z.city,
        CAST(COUNT(cu.id) AS INTEGER) as total,
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) AS INTEGER) as done,
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) AS INTEGER) as failed,
        CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining
      FROM zip_codes z
      LEFT JOIN crawl_units cu ON z.zip = cu.zip AND cu.crawl_run_id = ?
      WHERE z.is_active = 1
      GROUP BY z.state, z.county, z.zip, z.city
      HAVING COUNT(cu.id) > 0
      ORDER BY z.state, z.county, z.zip`;
    params.push(runId);
  } else {
    query = `
      SELECT z.state, z.county, z.zip, z.city,
        CAST(COUNT(cu.id) AS INTEGER) as total,
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) AS INTEGER) as done,
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) AS INTEGER) as failed,
        CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining
      FROM zip_codes z
      LEFT JOIN crawl_units cu ON z.zip = cu.zip
      WHERE z.is_active = 1
      GROUP BY z.state, z.county, z.zip, z.city
      HAVING COUNT(cu.id) > 0
      ORDER BY z.state, z.county, z.zip`;
  }

  const rows = await db.prepare(query).all(...params) as ZipProgress[];
  return rows.map(normalizeZipProgress);
}

export async function getCoverageByCounty(runId: string): Promise<CountyCoverageProgress[]>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
      z.state,
      z.county,
      CAST(COUNT(cu.id) AS INTEGER) as total,
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) AS INTEGER) as done,
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) AS INTEGER) as failed,
      CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining,
      CAST(COUNT(DISTINCT z.zip) AS INTEGER) as zipCount
     FROM zip_codes z
     LEFT JOIN crawl_units cu ON z.zip = cu.zip AND cu.crawl_run_id = ?
     WHERE z.is_active = 1
     GROUP BY z.state, z.county
     HAVING COUNT(cu.id) > 0
     ORDER BY z.state, z.county`
  ).all(runId) as CountyCoverageProgress[];
  return rows.map(normalizeCountyCoverageProgress);
}

export async function getCoverageByState(runId: string): Promise<StateCoverageProgress[]>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
      z.state,
      CAST(COUNT(cu.id) AS INTEGER) as total,
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) AS INTEGER) as done,
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) AS INTEGER) as failed,
      CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining,
      CAST(COUNT(DISTINCT z.county) AS INTEGER) as countyCount,
      CAST(COUNT(DISTINCT z.zip) AS INTEGER) as zipCount
     FROM zip_codes z
     LEFT JOIN crawl_units cu ON z.zip = cu.zip AND cu.crawl_run_id = ?
     WHERE z.is_active = 1
     GROUP BY z.state
     HAVING COUNT(cu.id) > 0
     ORDER BY z.state`
  ).all(runId) as StateCoverageProgress[];
  return rows.map(normalizeStateCoverageProgress);
}

function normalizeZipProgress(row: ZipProgress): ZipProgress {
  return {
    ...row,
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    remaining: Number(row.remaining) || 0,
  };
}

function normalizeCountyCoverageProgress(row: CountyCoverageProgress): CountyCoverageProgress {
  const raw = row as CountyCoverageProgress & { zipcount?: number };
  return {
    ...row,
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    remaining: Number(row.remaining) || 0,
    zipCount: Number(row.zipCount ?? raw.zipcount) || 0,
  };
}

function normalizeStateCoverageProgress(row: StateCoverageProgress): StateCoverageProgress {
  const raw = row as StateCoverageProgress & { countycount?: number; zipcount?: number };
  return {
    ...row,
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    remaining: Number(row.remaining) || 0,
    countyCount: Number(row.countyCount ?? raw.countycount) || 0,
    zipCount: Number(row.zipCount ?? raw.zipcount) || 0,
  };
}

// ─── Leads ───

export async function upsertLead(data: {
  place_id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  categories?: string[];
  rating?: number | null;
  review_count?: number | null;
  website_uri?: string | null;
  website_status?: string;
  maps_uri?: string | null;
  business_status?: string | null;
  price_level?: string | null;
  photo_count?: number;
  has_opening_hours?: boolean;
  primary_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  score?: number;
  selling_niche?: string | null;
  business_type?: BusinessType | null;
  qualification_status?: QualificationStatus;
  disqualification_reason?: string | null;
  website_verified_at?: string | null;
  contactability_score?: number;
  estimated_deal_value?: number;
  is_excluded?: boolean;
  exclusion_reason?: string | null;
}): Promise<string>{
  const db = await getDb();
  const existing = await db.prepare("SELECT id FROM leads WHERE place_id = ?").get(data.place_id) as { id: string } | undefined;
  const categories = data.categories ?? [];
  const websiteStatus = (data.website_status ?? "none") as WebsiteStatus;
  const qualification = qualifyLead({
    categories,
    websiteStatus,
    businessStatus: data.business_status,
    phone: data.phone,
    address: data.address,
    mapsUri: data.maps_uri,
    score: data.score,
  });
  const businessType = data.business_type ?? classifyBusinessType({ primaryType: data.primary_type, categories });
  const qualificationStatus = data.qualification_status ?? qualification.qualificationStatus;
  const disqualificationReason = data.disqualification_reason ?? qualification.disqualificationReason;
  const shouldExclude = data.is_excluded ?? qualificationStatus === "disqualified";
  const exclusionReason = data.exclusion_reason ?? (shouldExclude ? disqualificationReason : null);

  if (existing) {
    await db.prepare(
      `UPDATE leads SET
        name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone),
        categories = COALESCE(?, categories), rating = COALESCE(?, rating), review_count = COALESCE(?, review_count),
        website_uri = COALESCE(?, website_uri), website_status = COALESCE(?, website_status),
        maps_uri = COALESCE(?, maps_uri), business_status = COALESCE(?, business_status),
        price_level = COALESCE(?, price_level), photo_count = COALESCE(?, photo_count),
        has_opening_hours = COALESCE(?, has_opening_hours), primary_type = COALESCE(?, primary_type),
        lat = COALESCE(?, lat), lng = COALESCE(?, lng), score = COALESCE(?, score),
        selling_niche = COALESCE(?, selling_niche),
        business_type = COALESCE(?, business_type),
        qualification_status = COALESCE(?, qualification_status),
        disqualification_reason = COALESCE(?, disqualification_reason),
        website_verified_at = COALESCE(?, website_verified_at),
        contactability_score = COALESCE(?, contactability_score),
        estimated_deal_value = COALESCE(?, estimated_deal_value),
        is_excluded = CASE WHEN ? = 1 THEN 1 ELSE is_excluded END,
        exclusion_reason = COALESCE(exclusion_reason, ?),
        excluded_at = CASE WHEN ? = 1 AND excluded_at IS NULL THEN ? ELSE excluded_at END,
        updated_at = ?
      WHERE id = ?`
    ).run(
      data.name ?? null, data.address ?? null, data.phone ?? null,
      data.categories ? JSON.stringify(data.categories) : null,
      data.rating ?? null, data.review_count ?? null,
      data.website_uri ?? null, data.website_status ?? null,
      data.maps_uri ?? null, data.business_status ?? null,
      data.price_level ?? null, data.photo_count ?? null,
      data.has_opening_hours != null ? (data.has_opening_hours ? 1 : 0) : null,
      data.primary_type ?? null, data.lat ?? null, data.lng ?? null,
      data.score ?? null,
      data.selling_niche ?? qualification.sellingNiche,
      businessType,
      qualificationStatus,
      disqualificationReason,
      data.website_verified_at ?? null,
      data.contactability_score ?? qualification.contactabilityScore,
      data.estimated_deal_value ?? qualification.estimatedDealValue,
      shouldExclude ? 1 : 0,
      exclusionReason,
      shouldExclude ? 1 : 0,
      nowISO(),
      nowISO(), existing.id,
    );
    await updateLeadQualityScores(existing.id);
    return existing.id;
  }

  const id = generateId();
  await db.prepare(
    `INSERT INTO leads (id, place_id, name, address, phone, categories, rating, review_count,
      website_uri, website_status, maps_uri, business_status, price_level,
      photo_count, has_opening_hours, primary_type, lat, lng,
      score, selling_niche, business_type, qualification_status, disqualification_reason, website_verified_at,
      contactability_score, estimated_deal_value, is_excluded, exclusion_reason, excluded_at,
      discovered_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.place_id, data.name ?? null, data.address ?? null, data.phone ?? null,
    JSON.stringify(categories), data.rating ?? null, data.review_count ?? null,
    data.website_uri ?? null, websiteStatus,
    data.maps_uri ?? null, data.business_status ?? null,
    data.price_level ?? null, data.photo_count ?? 0,
    data.has_opening_hours ? 1 : 0, data.primary_type ?? null,
    data.lat ?? null, data.lng ?? null,
    data.score ?? 0,
    data.selling_niche ?? qualification.sellingNiche,
    businessType,
    qualificationStatus,
    disqualificationReason,
    data.website_verified_at ?? null,
    data.contactability_score ?? qualification.contactabilityScore,
    data.estimated_deal_value ?? qualification.estimatedDealValue,
    shouldExclude ? 1 : 0,
    exclusionReason,
    shouldExclude ? nowISO() : null,
    nowISO(), nowISO(), nowISO(),
  );
  await updateLeadQualityScores(id);
  return id;
}

export async function leadExists(placeId: string): Promise<boolean>{
  const db = await getDb();
  const row = await db.prepare("SELECT 1 FROM leads WHERE place_id = ?").get(placeId);
  return row !== undefined;
}

const LEAD_ALLOWED_SORT = [
  "score",
  "lead_quality_score",
  "win_probability_score",
  "raw_opportunity_score",
  "verification_score",
  "sales_priority_score",
  "rating",
  "review_count",
  "name",
  "created_at",
];
const SCORE_ELIGIBLE_CONDITION = "COALESCE(is_excluded, 0) = 0";
const NO_WEBSITE_OPPORTUNITY_STATUSES = new Set(["none", "social", "basic"]);
const EXCLUDED_STATUS_FILTER = "excluded";
export const API_ENDPOINT_TEXT_SEARCH = "places.searchText";
export const API_ENDPOINT_PLACE_DETAILS = "places.placeDetails";

function noUsableAiWebsiteCondition(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return `NOT (${prefix}ai_verification_status = 'site_found' AND ${prefix}ai_website_viability_status = 'usable' AND COALESCE(${prefix}ai_found_website_url, '') != '')`;
}

function startOfToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfCurrentMonth(): string {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 7)}-01`;
}

function buildLeadFilterWhere(filters: LeadFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status === EXCLUDED_STATUS_FILTER) {
    conditions.push("COALESCE(is_excluded, 0) = 1");
  } else {
    if (!filters.includeExcluded) {
      conditions.push(SCORE_ELIGIBLE_CONDITION);
    }
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
  }

  if (filters.search) {
    conditions.push("(name LIKE ? OR phone LIKE ? OR address LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.websiteStatus) {
    conditions.push("website_status = ?");
    params.push(filters.websiteStatus);
    if (NO_WEBSITE_OPPORTUNITY_STATUSES.has(filters.websiteStatus)) {
      conditions.push(noUsableAiWebsiteCondition());
    }
  }
  if (filters.enrichment) {
    conditions.push("enrichment_status = ?");
    params.push(filters.enrichment);
  }
  if (filters.minReviews != null && filters.minReviews > 0) {
    conditions.push("review_count >= ?");
    params.push(filters.minReviews);
  }
  if (filters.minRating != null && filters.minRating > 0) {
    conditions.push("rating >= ?");
    params.push(filters.minRating);
  }
  if (filters.minScore != null && filters.minScore > 0) {
    conditions.push("score >= ?");
    params.push(filters.minScore);
  }
  if (filters.category) {
    conditions.push("primary_type = ?");
    params.push(filters.category);
  }
  if (filters.businessType) {
    conditions.push("business_type = ?");
    params.push(filters.businessType);
  }
  if (filters.sellingNiche) {
    conditions.push("selling_niche = ?");
    params.push(filters.sellingNiche);
  }
  if (filters.qualificationStatus) {
    conditions.push("qualification_status = ?");
    params.push(filters.qualificationStatus);
  }
  if (filters.qualityBucket) {
    conditions.push("quality_bucket = ?");
    params.push(filters.qualityBucket);
  }
  if (filters.recommendedOffer) {
    conditions.push("recommended_offer = ?");
    params.push(filters.recommendedOffer);
  }
  if (filters.phoneVerificationStatus) {
    conditions.push("phone_verification_status = ?");
    params.push(filters.phoneVerificationStatus);
  }
  if (filters.aiVerificationStatus) {
    conditions.push("ai_verification_status = ?");
    params.push(filters.aiVerificationStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function resolveLeadSort(filters: LeadFilters): { safeSortBy: string; safeSortDir: "ASC" | "DESC" } {
  const sortBy = filters.sortBy || "score";
  const sortDir = filters.sortDir || "desc";
  const safeSortBy = LEAD_ALLOWED_SORT.includes(sortBy) ? sortBy : "score";
  const safeSortDir = sortDir === "asc" ? "ASC" : "DESC";
  return { safeSortBy, safeSortDir };
}

export async function getLeads(filters: LeadFilters = {}): Promise<{ leads: Lead[]; total: number }> {
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { safeSortBy, safeSortDir } = resolveLeadSort(filters);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads ${where}`).get(...params) as { count: number };

  const leads = await db.prepare(
    `SELECT * FROM leads ${where} ORDER BY ${safeSortBy} ${safeSortDir} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  return {
    total: countRow.count,
    leads: leads.map(parseLeadRow),
  };
}

export async function getLeadsForExport(filters: LeadFilters = {}, limit = 50000): Promise<Lead[]>{
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { safeSortBy, safeSortDir } = resolveLeadSort(filters);
  const safeLimit = Math.min(100000, Math.max(1, Math.floor(limit)));

  const rows = await db.prepare(
    `SELECT * FROM leads ${where} ORDER BY ${safeSortBy} ${safeSortDir} LIMIT ?`
  ).all(...params, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseLeadRow);
}

export async function getBusinessTypeCounts(): Promise<BusinessTypeCount[]>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT COALESCE(business_type, 'local_services') as business_type,
            COUNT(*) as total,
            SUM(CASE WHEN COALESCE(is_excluded, 0) = 0 THEN 1 ELSE 0 END) as active
     FROM leads
     GROUP BY COALESCE(business_type, 'local_services')`
  ).all() as Array<{ business_type: string; total: number; active: number }>;

  const byType = new Map(rows.map((row) => [row.business_type, row]));
  return BUSINESS_TYPE_OPTIONS.map((option) => {
    const row = byType.get(option.id);
    return {
      id: option.id,
      label: option.label,
      total: row?.total ?? 0,
      active: row?.active ?? 0,
    };
  });
}

export async function getKanbanLeads(filters: LeadFilters = {}): Promise<{ leads: KanbanLead[]; total: number }> {
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { safeSortBy, safeSortDir } = resolveLeadSort(filters);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 100));
  const offset = (page - 1) * pageSize;

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads ${where}`).get(...params) as { count: number };

  const rows = await db.prepare(
    `SELECT id, name, phone, rating, review_count, website_status, score, status, is_excluded, exclusion_reason,
      enrichment_status, primary_type, selling_niche, business_type, win_probability_score,
      lead_quality_score, quality_bucket, easy_build_score, cash_speed_score, need_score,
      quality_reason, recommended_offer, next_best_action, phone_verification_status,
      ai_verification_status, ai_confidence, ai_found_website_url, ai_recommendation, ai_summary, ai_checked_at,
      ai_website_viability_status, ai_website_health, ai_queue_status,
      raw_opportunity_score, verification_score, sales_priority_score, qualification_status
     FROM leads ${where}
     ORDER BY ${safeSortBy} ${safeSortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  const leads = rows.map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    review_count: (row.review_count as number | null) ?? null,
    website_status: (row.website_status as string) ?? "none",
    score: (row.score as number) ?? 0,
    status: (row.status as string) ?? "new",
    is_excluded: ((row.is_excluded as number) ?? 0) === 1,
    exclusion_reason: (row.exclusion_reason as string | null) ?? null,
    enrichment_status: (row.enrichment_status as string) ?? "pending",
    primary_type: (row.primary_type as string | null) ?? null,
    selling_niche: (row.selling_niche as string | null) ?? null,
    business_type: ((row.business_type as BusinessType | null) ?? "local_services"),
    win_probability_score: (row.win_probability_score as number | null) ?? 0,
    lead_quality_score: (row.lead_quality_score as number | null) ?? 0,
    quality_bucket: ((row.quality_bucket as QualityBucket | null) ?? "needs_ai_verify"),
    easy_build_score: (row.easy_build_score as number | null) ?? 0,
    cash_speed_score: (row.cash_speed_score as number | null) ?? 0,
    need_score: (row.need_score as number | null) ?? 0,
    quality_reason: (row.quality_reason as string | null) ?? null,
    recommended_offer: ((row.recommended_offer as RecommendedOffer | null) ?? "starter_site"),
    next_best_action: (row.next_best_action as string | null) ?? null,
    phone_verification_status: ((row.phone_verification_status as PhoneVerificationStatus | null) ?? (row.phone ? "unknown" : "no_phone")),
    last_quality_scored_at: (row.last_quality_scored_at as string | null) ?? null,
    quality_checked_by_user_id: (row.quality_checked_by_user_id as string | null) ?? null,
    ai_verification_status: ((row.ai_verification_status as AiVerificationStatus | null) ?? "not_checked"),
    ai_confidence: (row.ai_confidence as number | null) ?? 0,
    ai_found_website_url: (row.ai_found_website_url as string | null) ?? null,
    ai_recommendation: (row.ai_recommendation as AiRecommendation | null) ?? null,
    ai_summary: (row.ai_summary as string | null) ?? null,
    ai_checked_at: (row.ai_checked_at as string | null) ?? null,
    ai_website_viability_status: (row.ai_website_viability_status as WebsiteViabilityStatus | null) ?? null,
    ai_website_health: safeParseJson<WebsiteHealthSnapshot | null>(row.ai_website_health as string | null, null),
    ai_queue_status: normalizeAiQueueStatus(row.ai_queue_status),
    raw_opportunity_score: Number(row.raw_opportunity_score ?? row.score ?? 0),
    verification_score: Number(row.verification_score ?? 0),
    sales_priority_score: Number(row.sales_priority_score ?? row.lead_quality_score ?? row.score ?? 0),
    qualification_status: ((row.qualification_status as QualificationStatus | null) ?? "needs_verification"),
  }));

  return {
    total: countRow.count,
    leads,
  };
}

export async function getLeadsGroupedByStatus(filters: Omit<LeadFilters, "status" | "page" | "pageSize"> = {}): Promise<Record<string, Lead[]>>{
  const { leads } = await getLeads({ ...filters, pageSize: 200 });
  const grouped: Record<string, Lead[]> = {};
  for (const lead of leads) {
    if (!grouped[lead.status]) grouped[lead.status] = [];
    grouped[lead.status].push(lead);
  }
  return grouped;
}

export async function getQualifiedLeadCount(scoreThreshold = 5.0): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
      WHERE score >= ?
        AND website_status IN ('none', 'social', 'basic')
        AND ${noUsableAiWebsiteCondition()}
        AND qualification_status IN ('qualified', 'needs_verification')
        AND ${SCORE_ELIGIBLE_CONDITION}`
  ).get(scoreThreshold) as { count: number };
  return row.count;
}

export async function getScoreBandThresholds(): Promise<ScoreBandThresholds>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT score
     FROM leads
     WHERE score > 0
       AND website_status IN ('none', 'social', 'basic')
       AND ${noUsableAiWebsiteCondition()}
       AND qualification_status IN ('qualified', 'needs_verification')
       AND ${SCORE_ELIGIBLE_CONDITION}
     ORDER BY score ASC`
  ).all() as Array<{ score: number }>;

  return computeScoreBandThresholds(rows.map((row) => row.score));
}

export async function getLeadById(id: string): Promise<Lead | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseLeadRow(row);
}

export async function updateLeadStatus(id: string, status: string): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?").run(status, nowISO(), id);
  await updateLeadQualityScores(id);
}

export async function updateLeadVerification(id: string, verification: Record<string, boolean>): Promise<void>{
  const db = await getDb();
  const now = nowISO();
  await db.prepare(
    `UPDATE leads SET
      verification = ?,
      website_verified_at = CASE WHEN ? = 1 THEN COALESCE(website_verified_at, ?) ELSE website_verified_at END,
      qualification_status = CASE
        WHEN ? = 1 AND qualification_status = 'needs_verification' THEN 'qualified'
        ELSE qualification_status
      END,
      updated_at = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(verification),
    verification.no_real_website ? 1 : 0,
    now,
    verification.ready_for_outreach ? 1 : 0,
    now,
    id,
  );

  const lead = await db.prepare("SELECT place_id FROM leads WHERE id = ?").get(id) as { place_id: string } | undefined;
  if (!lead) return;

  const totalChecks = Object.keys(verification).length;
  const verifiedChecks = Object.values(verification).filter(Boolean).length;
  const coverage = totalChecks > 0 ? (verifiedChecks / totalChecks) * 100 : 0;
  await db.prepare(
    "UPDATE places_master SET verification_coverage = ?, updated_at = ? WHERE place_id = ?"
  ).run(clampPercentage(coverage), now, lead.place_id);
  await updateLeadQualityScores(id);
}

export async function updateLeadNotes(id: string, notes: string): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?").run(notes, nowISO(), id);
}

export async function createLeadNote(leadId: string, authorUserId: string, body: string): Promise<LeadNote> {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO lead_notes (id, lead_id, author_user_id, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, leadId, authorUserId, body, now, now);

  const note = await getLeadNoteById(id);
  if (!note) throw new Error("Unable to create lead note");
  return note;
}

export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT ln.*, au.email as author_email
     FROM lead_notes ln
     LEFT JOIN app_users au ON au.user_id = ln.author_user_id
     WHERE ln.lead_id = ? AND ln.deleted_at IS NULL
     ORDER BY ln.created_at DESC`
  ).all<Record<string, unknown>>(leadId);
  return rows.map(parseLeadNoteRow);
}

export async function assignLeadToUser(leadId: string, userId: string | null): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE leads SET assigned_to_user_id = ?, updated_at = ? WHERE id = ?")
    .run(userId, nowISO(), leadId);
}

async function getLeadNoteById(id: string): Promise<LeadNote | null> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT ln.*, au.email as author_email
     FROM lead_notes ln
     LEFT JOIN app_users au ON au.user_id = ln.author_user_id
     WHERE ln.id = ?`
  ).get<Record<string, unknown>>(id);
  return row ? parseLeadNoteRow(row) : null;
}

export async function setLeadExclusion(id: string, reason: string): Promise<number>{
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET is_excluded = 1,
         exclusion_reason = ?,
         excluded_at = COALESCE(excluded_at, ?),
         qualification_status = 'disqualified',
         disqualification_reason = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(reason, now, reason, now, id);
  await updateLeadQualityScores(id);
  return result.changes;
}

export async function clearLeadExclusion(id: string): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads
     SET is_excluded = 0,
         exclusion_reason = NULL,
         excluded_at = NULL,
         qualification_status = CASE
           WHEN qualification_status = 'disqualified' THEN 'needs_verification'
           ELSE qualification_status
         END,
         disqualification_reason = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(nowISO(), id);
  await updateLeadQualityScores(id);
  return result.changes;
}

// ─── AI Verification ───

export async function getLatestAiVerification(leadId: string): Promise<AiLeadVerification | null>{
  const db = await getDb();
  const row = await db.prepare(
    "SELECT * FROM ai_lead_verifications WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(leadId) as Record<string, unknown> | undefined;
  return row ? parseAiLeadVerificationRow(row) : null;
}

export async function getAiVerificationById(id: string): Promise<AiLeadVerification | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM ai_lead_verifications WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseAiLeadVerificationRow(row) : null;
}

export async function createAiLeadVerification(input: AiLeadVerificationInput): Promise<AiLeadVerification>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO ai_lead_verifications (
      id, lead_id, model, status, confidence, found_website_url, found_email, found_phone,
      social_profiles, sources, recommendation, reason, summary, raw_json, input_hash,
      website_viability_status, website_health_json, website_viability_reason,
      usage_input_tokens, usage_output_tokens, estimated_cost, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.lead_id,
    assertAllowedOpenAIModel(input.model),
    input.status,
    clamp01(input.confidence ?? 0),
    input.found_website_url ?? null,
    input.found_email ?? null,
    input.found_phone ?? null,
    JSON.stringify(input.social_profiles ?? []),
    JSON.stringify(input.sources ?? []),
    input.recommendation,
    input.reason ?? "",
    input.summary ?? "",
    JSON.stringify(input.raw_json ?? {}),
    input.input_hash ?? null,
    input.website_viability_status ?? null,
    input.website_health_json ? JSON.stringify(input.website_health_json) : null,
    input.website_viability_reason ?? null,
    Math.max(0, Math.floor(input.usage_input_tokens ?? 0)),
    Math.max(0, Math.floor(input.usage_output_tokens ?? 0)),
    roundCurrency(input.estimated_cost ?? 0),
    input.error ?? null,
    now,
  );

  const verification = await getAiVerificationById(id);
  if (!verification) throw new Error("Unable to load created AI verification.");
  return verification;
}

export async function updateLeadAiVerificationSummary(
  leadId: string,
  verification: AiLeadVerification,
  winProbabilityScore: number,
): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_verification_status = ?,
      ai_confidence = ?,
      ai_found_website_url = ?,
      ai_recommendation = ?,
      ai_summary = ?,
      ai_checked_at = ?,
      ai_website_viability_status = ?,
      ai_website_health = ?,
      win_probability_score = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    verification.status,
    clamp01(verification.confidence),
    verification.found_website_url,
    verification.recommendation,
    verification.summary,
    verification.created_at,
    verification.website_viability_status,
    verification.website_health_json ? JSON.stringify(verification.website_health_json) : null,
    clampPercentage(winProbabilityScore),
    nowISO(),
    leadId,
  );
  await updateLeadQualityScores(leadId);
}

export async function markLeadAiError(leadId: string, message: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_verification_status = 'error',
      ai_summary = ?,
      ai_checked_at = ?,
      ai_website_viability_status = NULL,
      ai_website_health = NULL,
      updated_at = ?
     WHERE id = ?`
  ).run(message, nowISO(), nowISO(), leadId);
  await updateLeadQualityScores(leadId);
}

export async function logAiUsageEvent(input: AiUsageEventInput): Promise<void>{
  const db = await getDb();
  const inputTokens = Math.max(0, Math.floor(input.input_tokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(input.output_tokens ?? 0));
  await db.prepare(
    `INSERT INTO ai_usage_events (
      id, lead_id, verification_id, model, endpoint, success, was_cached,
      input_tokens, output_tokens, total_tokens, estimated_cost, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId(),
    input.lead_id ?? null,
    input.verification_id ?? null,
    assertAllowedOpenAIModel(input.model),
    input.endpoint ?? "responses",
    (input.success ?? true) ? 1 : 0,
    (input.was_cached ?? false) ? 1 : 0,
    inputTokens,
    outputTokens,
    inputTokens + outputTokens,
    roundCurrency(input.estimated_cost ?? 0),
    JSON.stringify(input.metadata ?? {}),
    nowISO(),
  );
}

export async function getAiBudgetStatus(settings: Settings, reservedCost: number): Promise<AiBudgetStatus>{
  const dailyCost = await getAiUsageCostSince(startOfToday());
  const monthlyCost = await getAiUsageCostSince(startOfCurrentMonth());
  const safeReserved = roundCurrency(Math.max(0, reservedCost));
  const dailyBudget = Math.max(0, settings.ai_daily_budget_usd);
  const monthlyBudget = Math.max(0, settings.ai_monthly_budget_usd);

  if (dailyBudget > 0 && dailyCost + safeReserved > dailyBudget) {
    return {
      dailyCost,
      monthlyCost,
      dailyBudget,
      monthlyBudget,
      reservedCost: safeReserved,
      allowed: false,
      reason: `Daily AI budget would be exceeded ($${(dailyCost + safeReserved).toFixed(2)} / $${dailyBudget.toFixed(2)}).`,
    };
  }

  if (monthlyBudget > 0 && monthlyCost + safeReserved > monthlyBudget) {
    return {
      dailyCost,
      monthlyCost,
      dailyBudget,
      monthlyBudget,
      reservedCost: safeReserved,
      allowed: false,
      reason: `Monthly AI budget would be exceeded ($${(monthlyCost + safeReserved).toFixed(2)} / $${monthlyBudget.toFixed(2)}).`,
    };
  }

  return {
    dailyCost,
    monthlyCost,
    dailyBudget,
    monthlyBudget,
    reservedCost: safeReserved,
    allowed: true,
    reason: null,
  };
}

export async function markLeadAiQueued(leadId: string, inputHash: string, resetAttempts = false): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_attempt_count = CASE WHEN ? = 1 THEN 0 ELSE ai_attempt_count END,
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(resetAttempts ? 1 : 0, inputHash, nowISO(), leadId);
  return result.changes;
}

export async function markLeadAiRunning(leadId: string, inputHash: string): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'running',
      ai_attempt_count = ai_attempt_count + 1,
      ai_last_error = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE id = ?
       AND ai_queue_status IN ('queued','running')`
  ).run(inputHash, nowISO(), leadId);
  return result.changes;
}

export async function markLeadAiVerified(leadId: string, inputHash: string): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'verified',
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(inputHash, nowISO(), leadId);
  await updateLeadQualityScores(leadId);
  return result.changes;
}

export async function markLeadAiQueueError(leadId: string, message: string, maxAttempts: number): Promise<void> {
  const db = await getDb();
  const row = await db.prepare("SELECT ai_attempt_count FROM leads WHERE id = ?").get(leadId) as { ai_attempt_count: number } | undefined;
  const attempts = Math.max(0, Number(row?.ai_attempt_count ?? 0));
  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  const retryable = attempts < safeMaxAttempts;
  const retryDelayMinutes = Math.min(60, Math.max(5, 5 * 2 ** Math.max(attempts - 1, 0)));
  const nextRetry = retryable
    ? new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString()
    : null;

  await db.prepare(
    `UPDATE leads SET
      ai_queue_status = ?,
      ai_last_error = ?,
      ai_next_retry_at = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(retryable ? "queued" : "error", message.slice(0, 1000), nextRetry, nowISO(), leadId);
  await updateLeadQualityScores(leadId);
}

export async function getNextAiVerificationJob(maxAttempts = 3): Promise<Lead | null> {
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE ai_queue_status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO());

  const row = await db.prepare(
    `SELECT *
     FROM leads
     WHERE ai_queue_status = 'queued'
       AND (ai_next_retry_at IS NULL OR ai_next_retry_at <= ?)
       AND ai_attempt_count < ?
       AND COALESCE(is_excluded, 0) = 0
       AND status NOT IN ('closed_won','closed_lost')
       AND COALESCE(business_status, '') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
     ORDER BY
       sales_priority_score DESC,
       raw_opportunity_score DESC,
       score DESC,
       updated_at ASC
     LIMIT 1`
  ).get(nowISO(), Math.max(1, Math.floor(maxAttempts))) as Record<string, unknown> | undefined;

  return row ? parseLeadRow(row) : null;
}

export async function getAiQueueStats(): Promise<AiQueueStats> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT COALESCE(ai_queue_status, 'not_checked') as status, COUNT(*) as count
     FROM leads
     GROUP BY COALESCE(ai_queue_status, 'not_checked')`
  ).all() as Array<{ status: string; count: number }>;
  const stats: AiQueueStats = { notChecked: 0, queued: 0, running: 0, verified: 0, error: 0, total: 0 };
  for (const row of rows) {
    const count = Number(row.count) || 0;
    stats.total += count;
    const status = normalizeAiQueueStatus(row.status);
    if (status === "not_checked") stats.notChecked += count;
    else if (status === "queued") stats.queued += count;
    else if (status === "running") stats.running += count;
    else if (status === "verified") stats.verified += count;
    else if (status === "error") stats.error += count;
  }
  return stats;
}

export async function getAiVerificationCandidates(limit: number, businessType?: BusinessType | string | null): Promise<Lead[]>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const conditions = [
    "l.website_status IN ('none', 'social', 'basic')",
    noUsableAiWebsiteCondition("l"),
    "l.qualification_status IN ('qualified', 'needs_verification')",
    "l.status IN ('new', 'verified', 'contacted')",
    "l.score > 0",
    "COALESCE(l.is_excluded, 0) = 0",
  ];
  const params: unknown[] = [];
  if (businessType) {
    conditions.push("l.business_type = ?");
    params.push(businessType);
  }

  const rows = await db.prepare(
    `SELECT l.*
     FROM leads l
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE WHEN l.ai_checked_at IS NULL THEN 1 ELSE 0 END DESC,
       l.win_probability_score DESC,
       l.score DESC
     LIMIT ?`
  ).all(...params, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseLeadRow);
}

export async function applyAiFoundWebsite(leadId: string, websiteUrl: string): Promise<number>{
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads SET
      website_uri = ?,
      website_status = 'custom',
      website_verified_at = ?,
      qualification_status = 'disqualified',
      disqualification_reason = 'AI found existing website',
      score = 0,
      win_probability_score = 0,
      updated_at = ?
     WHERE id = ?`
  ).run(websiteUrl, now, now, leadId);
  await updateLeadQualityScores(leadId);
  return result.changes;
}

export async function updateLeadQualityScores(leadId: string, actorUserId?: string | null): Promise<void>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as Record<string, unknown> | undefined;
  if (!row) return;
  const lead = parseLeadRow(row);
  const normalizedPhoneStatus: PhoneVerificationStatus = lead.phone?.trim()
    ? lead.phone_verification_status === "no_phone" ? "unknown" : lead.phone_verification_status
    : "no_phone";
  const quality = computeLeadQuality({
    score: lead.score,
    websiteStatus: lead.website_status,
    businessType: lead.business_type,
    categories: lead.categories,
    rating: lead.rating,
    reviewCount: lead.review_count,
    phone: lead.phone,
    address: lead.address,
    mapsUri: lead.maps_uri,
    businessStatus: lead.business_status,
    isExcluded: lead.is_excluded,
    qualificationStatus: lead.qualification_status,
    status: lead.status,
    contactabilityScore: lead.contactability_score,
    estimatedDealValue: lead.estimated_deal_value,
    aiVerificationStatus: lead.ai_verification_status,
    aiConfidence: lead.ai_confidence,
    aiFoundWebsiteUrl: lead.ai_found_website_url,
    aiWebsiteViabilityStatus: lead.ai_website_viability_status,
    phoneVerificationStatus: normalizedPhoneStatus,
  });
  const winProbabilityScore = computeLeadWinProbability(lead);
  const rawOpportunityScore = computeRawOpportunityScore(lead);
  const verificationScore = computeVerificationScore(lead);
  const salesPriorityScore = computeSalesPriorityScore({
    lead,
    qualityBucket: quality.qualityBucket,
    leadQualityScore: quality.leadQualityScore,
    winProbabilityScore,
    rawOpportunityScore,
    verificationScore,
    phoneVerificationStatus: normalizedPhoneStatus,
  });
  await db.prepare(
    `UPDATE leads SET
      win_probability_score = ?,
      lead_quality_score = ?,
      quality_bucket = ?,
      easy_build_score = ?,
      cash_speed_score = ?,
      need_score = ?,
      quality_reason = ?,
      recommended_offer = ?,
      next_best_action = ?,
      phone_verification_status = ?,
      raw_opportunity_score = ?,
      verification_score = ?,
      sales_priority_score = ?,
      last_quality_scored_at = ?,
      quality_checked_by_user_id = COALESCE(?, quality_checked_by_user_id),
      updated_at = ?
     WHERE id = ?`
  ).run(
    winProbabilityScore,
    quality.leadQualityScore,
    quality.qualityBucket,
    quality.easyBuildScore,
    quality.cashSpeedScore,
    quality.needScore,
    quality.qualityReason,
    quality.recommendedOffer,
    quality.nextBestAction,
    normalizedPhoneStatus,
    rawOpportunityScore,
    verificationScore,
    salesPriorityScore,
    nowISO(),
    actorUserId ?? null,
    nowISO(),
    leadId,
  );
}

function computeLeadWinProbability(lead: Lead): number {
  return computeWinProbability({
    score: lead.score,
    websiteStatus: lead.website_status as WebsiteStatus,
    qualificationStatus: lead.qualification_status,
    isExcluded: lead.is_excluded,
    businessStatus: lead.business_status,
    contactabilityScore: lead.contactability_score,
    estimatedDealValue: lead.estimated_deal_value,
    firstContactedAt: lead.first_contacted_at,
    firstReplyAt: lead.first_reply_at,
    meetingBookedAt: lead.meeting_booked_at,
    status: lead.status,
    aiVerification: {
      status: lead.ai_verification_status,
      confidence: lead.ai_confidence,
      foundWebsiteUrl: lead.ai_found_website_url,
      websiteViabilityStatus: lead.ai_website_viability_status,
    },
  });
}

function computeRawOpportunityScore(lead: Lead): number {
  if (lead.is_excluded || lead.status === "closed_lost" || lead.business_status === "CLOSED_PERMANENTLY" || lead.business_status === "CLOSED_TEMPORARILY") {
    return 0;
  }
  return clampPercentage(Math.min(Math.max(lead.score, 0) / 35, 1) * 100);
}

function computeVerificationScore(lead: Lead): number {
  const confidence = Math.max(clamp01(lead.ai_confidence), 0.5);
  const viability = lead.ai_website_viability_status;
  const hasUsableAiWebsite = lead.ai_verification_status === "site_found" && viability === "usable" && Boolean(lead.ai_found_website_url);

  if (lead.is_excluded || lead.website_status === "custom" || hasUsableAiWebsite) return 0;
  if (lead.ai_verification_status === "no_site_found" || viability === "directory_only") {
    return clampPercentage(Math.max(55, confidence * 100));
  }
  if (lead.ai_verification_status === "weak_site_found" && isWeakWebsiteViability(viability)) {
    return clampPercentage(Math.max(60, confidence * 92));
  }
  if (lead.ai_verification_status === "weak_site_found") {
    return clampPercentage(Math.max(40, confidence * 70));
  }
  if (lead.ai_verification_status === "uncertain" || lead.ai_verification_status === "mismatch") return 25;
  if (lead.ai_verification_status === "error") return 15;
  if (lead.ai_verification_status === "site_found") return 10;
  return 5;
}

function computeSalesPriorityScore(input: {
  lead: Lead;
  qualityBucket: QualityBucket;
  leadQualityScore: number;
  winProbabilityScore: number;
  rawOpportunityScore: number;
  verificationScore: number;
  phoneVerificationStatus: PhoneVerificationStatus;
}): number {
  const { lead, qualityBucket, leadQualityScore, winProbabilityScore, rawOpportunityScore, verificationScore, phoneVerificationStatus } = input;
  if (lead.is_excluded || qualityBucket === "not_a_fit" || lead.status === "closed_lost") return 0;

  const contactability = phoneVerificationStatus === "works"
    ? 100
    : phoneVerificationStatus === "unknown" && lead.phone?.trim()
      ? 78
      : phoneVerificationStatus === "bad"
        ? 8
        : 16;
  const dealValue = clampPercentage(Math.min(Math.max(lead.estimated_deal_value / 6000, 0), 1) * 100);
  const freshness = computeSalesFreshnessScore(lead);
  const engagement = lead.meeting_booked_at
    ? 100
    : lead.first_reply_at
      ? 82
      : lead.first_contacted_at
        ? 48
        : 72;
  const bucketBoost = qualityBucket === "broken_site_opportunity"
    ? 8
    : qualityBucket === "ready_to_call"
      ? 6
      : qualityBucket === "needs_manual_review"
        ? -12
        : qualityBucket === "needs_ai_verify"
          ? -24
          : 0;

  return clampPercentage(
    leadQualityScore * 0.36 +
    winProbabilityScore * 0.24 +
    rawOpportunityScore * 0.12 +
    verificationScore * 0.14 +
    contactability * 0.07 +
    dealValue * 0.04 +
    freshness * 0.02 +
    engagement * 0.01 +
    bucketBoost,
  );
}

function computeSalesFreshnessScore(lead: Lead): number {
  const lastTouch = lead.last_contacted_at ?? lead.first_contacted_at ?? lead.discovered_at;
  const parsed = Date.parse(lastTouch);
  if (Number.isNaN(parsed)) return 45;
  const ageDays = (Date.now() - parsed) / (24 * 60 * 60 * 1000);
  if (ageDays <= 2) return 95;
  if (ageDays <= 7) return 80;
  if (ageDays <= 21) return 62;
  if (ageDays <= 60) return 42;
  return 24;
}

function isWeakWebsiteViability(status: WebsiteViabilityStatus | null): boolean {
  return status === "broken" || status === "parked" || status === "placeholder";
}

export async function recomputeAllLeadQualityScores(limit = 100000): Promise<number>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100000, Math.floor(limit)));
  const rows = await db.prepare("SELECT id FROM leads ORDER BY updated_at DESC LIMIT ?").all(safeLimit) as Array<{ id: string }>;
  for (const row of rows) {
    await updateLeadQualityScores(row.id);
  }
  return rows.length;
}

export async function updateLeadPhoneVerificationStatus(
  leadId: string,
  status: PhoneVerificationStatus,
  actorUserId?: string | null,
): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    "UPDATE leads SET phone_verification_status = ?, quality_checked_by_user_id = COALESCE(?, quality_checked_by_user_id), updated_at = ? WHERE id = ?"
  ).run(status, actorUserId ?? null, nowISO(), leadId);
  await updateLeadQualityScores(leadId, actorUserId);
  return result.changes;
}

export async function setLeadQualityBucket(
  leadId: string,
  bucket: QualityBucket,
  actorUserId?: string | null,
): Promise<number>{
  const db = await getDb();
  const nextAction = bucket === "ready_to_call"
    ? "Call and confirm the owner or decision maker."
    : bucket === "broken_site_opportunity"
      ? "Open the site evidence, then pitch a broken-site rescue."
      : bucket === "needs_manual_review"
        ? "Review website evidence and phone status."
        : null;
  const result = await db.prepare(
    `UPDATE leads SET
      quality_bucket = ?,
      next_best_action = COALESCE(?, next_best_action),
      quality_checked_by_user_id = COALESCE(?, quality_checked_by_user_id),
      updated_at = ?
     WHERE id = ?`
  ).run(bucket, nextAction, actorUserId ?? null, nowISO(), leadId);
  return result.changes;
}

export async function markLeadManualReview(leadId: string, reason: string): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      qualification_status = 'needs_verification',
      disqualification_reason = NULL,
      ai_recommendation = 'manual_review',
      ai_summary = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(reason, nowISO(), leadId);
  await updateLeadQualityScores(leadId);
  return result.changes;
}

export async function markLeadBrokenSiteOpportunity(leadId: string, reason: string, winProbabilityScore: number): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      qualification_status = CASE WHEN qualification_status = 'disqualified' THEN 'needs_verification' ELSE qualification_status END,
      disqualification_reason = NULL,
      is_excluded = 0,
      exclusion_reason = NULL,
      excluded_at = NULL,
      ai_recommendation = 'prioritize',
      ai_summary = ?,
      win_probability_score = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(reason, clampPercentage(winProbabilityScore), nowISO(), leadId);
  await updateLeadQualityScores(leadId);
  return result.changes;
}

export async function getAiWebsiteViabilityRepairLeads(limit = 50): Promise<Lead[]>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.prepare(
    `SELECT *
     FROM leads
     WHERE ai_verification_status = 'site_found'
       AND ai_found_website_url IS NOT NULL
       AND ai_found_website_url != ''
       AND COALESCE(ai_website_viability_status, '') != 'usable'
     ORDER BY ai_checked_at DESC
     LIMIT ?`
  ).all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

function buildQualityWhere(filters: QualityFilters = {}): { where: string; params: unknown[] } {
  const conditions = [
    "COALESCE(l.is_excluded, 0) = 0",
    "l.website_status IN ('none', 'social', 'basic')",
    noUsableAiWebsiteCondition("l"),
    "l.qualification_status IN ('qualified', 'needs_verification')",
    "l.quality_bucket != 'not_a_fit'",
  ];
  const params: unknown[] = [];

  if (filters.search) {
    conditions.push("(l.name LIKE ? OR l.phone LIKE ? OR l.address LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.qualityBucket) {
    conditions.push("l.quality_bucket = ?");
    params.push(filters.qualityBucket);
  }
  if (filters.businessType) {
    conditions.push("l.business_type = ?");
    params.push(filters.businessType);
  }
  if (filters.recommendedOffer) {
    conditions.push("l.recommended_offer = ?");
    params.push(filters.recommendedOffer);
  }
  if (filters.phoneVerificationStatus) {
    conditions.push("l.phone_verification_status = ?");
    params.push(filters.phoneVerificationStatus);
  }
  if (filters.aiVerificationStatus) {
    conditions.push("l.ai_verification_status = ?");
    params.push(filters.aiVerificationStatus);
  }
  if (filters.denverOnly) {
    conditions.push("(l.address LIKE '%Denver%' OR l.address LIKE '%CO 802%')");
  }

  return { where: `WHERE ${conditions.join(" AND ")}`, params };
}

export async function getQualitySummary(filters: Pick<QualityFilters, "denverOnly" | "businessType"> = {}): Promise<QualitySummary>{
  const db = await getDb();
  const { where, params } = buildQualityWhere(filters);
  const row = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'ready_to_call' THEN 1 ELSE 0 END), 0) as ready_to_call,
       COALESCE(SUM(CASE WHEN l.ai_verification_status = 'no_site_found' OR l.ai_website_viability_status = 'directory_only' THEN 1 ELSE 0 END), 0) as ai_verified_no_website,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'broken_site_opportunity' THEN 1 ELSE 0 END), 0) as broken_site_opportunities,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'needs_ai_verify' THEN 1 ELSE 0 END), 0) as needs_ai_verify,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'needs_manual_review' THEN 1 ELSE 0 END), 0) as needs_manual_review,
       COALESCE(AVG(l.lead_quality_score), 0) as average_quality_score,
       COALESCE(SUM(CASE WHEN l.quality_bucket IN ('ready_to_call','broken_site_opportunity') THEN l.estimated_deal_value ELSE 0 END), 0) as estimated_pipeline_value
     FROM leads l ${where}`
  ).get(...params) as Record<string, number>;
  const removedRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads l
     WHERE l.ai_verification_status = 'site_found'
       AND l.ai_website_viability_status = 'usable'
       AND COALESCE(l.ai_found_website_url, '') != ''`
  ).get() as { count: number };

  return {
    readyToCall: Number(row.ready_to_call) || 0,
    aiVerifiedNoWebsite: Number(row.ai_verified_no_website) || 0,
    brokenSiteOpportunities: Number(row.broken_site_opportunities) || 0,
    needsAiVerify: Number(row.needs_ai_verify) || 0,
    needsManualReview: Number(row.needs_manual_review) || 0,
    removedBecauseWebsiteFound: Number(removedRow.count) || 0,
    averageQualityScore: Math.round(Number(row.average_quality_score ?? 0)),
    estimatedPipelineValue: Math.round(Number(row.estimated_pipeline_value ?? 0)),
  };
}

export async function getQualityLeads(filters: QualityFilters = {}): Promise<{ leads: QualityLead[]; total: number }>{
  const db = await getDb();
  const { where, params } = buildQualityWhere(filters);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };
  const rows = await db.prepare(
    `SELECT l.*
     FROM leads l ${where}
     ORDER BY
       CASE l.quality_bucket
         WHEN 'ready_to_call' THEN 1
         WHEN 'broken_site_opportunity' THEN 2
         WHEN 'needs_ai_verify' THEN 3
         WHEN 'needs_manual_review' THEN 4
         ELSE 5
       END ASC,
       l.lead_quality_score DESC,
       l.cash_speed_score DESC,
       l.contactability_score DESC,
       COALESCE(l.ai_checked_at, l.discovered_at) DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  return {
    total: countRow.count,
    leads: rows.map((row) => {
      const lead = parseLeadRow(row);
      return {
        ...lead,
        city: extractCity(lead.address),
        demo_slug: null,
      } as QualityLead;
    }),
  };
}

export async function getQualityAiVerificationCandidates(input: {
  limit: number;
  businessType?: BusinessType | string | null;
  denverOnly?: boolean;
  ids?: string[];
}): Promise<Lead[]>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(input.limit)));
  const conditions = [
    "l.website_status IN ('none', 'social', 'basic')",
    noUsableAiWebsiteCondition("l"),
    "l.quality_bucket IN ('needs_ai_verify','needs_manual_review','broken_site_opportunity')",
    "l.qualification_status IN ('qualified', 'needs_verification')",
    "l.score > 0",
    "COALESCE(l.is_excluded, 0) = 0",
  ];
  const params: unknown[] = [];
  if (input.businessType) {
    conditions.push("l.business_type = ?");
    params.push(input.businessType);
  }
  if (input.denverOnly) {
    conditions.push("(l.address LIKE '%Denver%' OR l.address LIKE '%CO 802%')");
  }
  if (input.ids && input.ids.length > 0) {
    conditions.push(`l.id IN (${input.ids.map(() => "?").join(",")})`);
    params.push(...input.ids);
  }
  const rows = await db.prepare(
    `SELECT l.*
     FROM leads l
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE WHEN l.ai_checked_at IS NULL THEN 1 ELSE 0 END DESC,
       l.lead_quality_score DESC,
       l.score DESC
     LIMIT ?`
  ).all(...params, safeLimit) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

function parseLeadRow(row: Record<string, unknown>): Lead {
  return {
    ...row,
    categories: safeParseJson<string[]>(row.categories, []),
    has_opening_hours: (row.has_opening_hours as number) === 1,
    photo_count: (row.photo_count as number) ?? 0,
    is_excluded: ((row.is_excluded as number) ?? 0) === 1,
    exclusion_reason: (row.exclusion_reason as string | null) ?? null,
    excluded_at: (row.excluded_at as string | null) ?? null,
    selling_niche: (row.selling_niche as string | null) ?? null,
    business_type: ((row.business_type as BusinessType | null) ?? "local_services"),
    win_probability_score: (row.win_probability_score as number | null) ?? 0,
    lead_quality_score: (row.lead_quality_score as number | null) ?? 0,
    quality_bucket: ((row.quality_bucket as QualityBucket | null) ?? "needs_ai_verify"),
    easy_build_score: (row.easy_build_score as number | null) ?? 0,
    cash_speed_score: (row.cash_speed_score as number | null) ?? 0,
    need_score: (row.need_score as number | null) ?? 0,
    quality_reason: (row.quality_reason as string | null) ?? null,
    recommended_offer: ((row.recommended_offer as RecommendedOffer | null) ?? "starter_site"),
    next_best_action: (row.next_best_action as string | null) ?? null,
    phone_verification_status: ((row.phone_verification_status as PhoneVerificationStatus | null) ?? (row.phone ? "unknown" : "no_phone")),
    ai_verification_status: ((row.ai_verification_status as AiVerificationStatus | null) ?? "not_checked"),
    ai_confidence: (row.ai_confidence as number | null) ?? 0,
    ai_found_website_url: (row.ai_found_website_url as string | null) ?? null,
    ai_recommendation: (row.ai_recommendation as AiRecommendation | null) ?? null,
    ai_summary: (row.ai_summary as string | null) ?? null,
    ai_checked_at: (row.ai_checked_at as string | null) ?? null,
    ai_website_viability_status: (row.ai_website_viability_status as WebsiteViabilityStatus | null) ?? null,
    ai_website_health: safeParseJson<WebsiteHealthSnapshot | null>(row.ai_website_health, null),
    ai_queue_status: normalizeAiQueueStatus(row.ai_queue_status),
    ai_attempt_count: Number(row.ai_attempt_count ?? 0),
    ai_last_error: (row.ai_last_error as string | null) ?? null,
    ai_next_retry_at: (row.ai_next_retry_at as string | null) ?? null,
    ai_input_hash: (row.ai_input_hash as string | null) ?? null,
    raw_opportunity_score: Number(row.raw_opportunity_score ?? row.score ?? 0),
    verification_score: Number(row.verification_score ?? 0),
    sales_priority_score: Number(row.sales_priority_score ?? row.lead_quality_score ?? row.score ?? 0),
    pitch_outcome: (row.pitch_outcome as string | null) ?? null,
    objection_reason: (row.objection_reason as string | null) ?? null,
    decision_maker_reached: toBoolean(row.decision_maker_reached),
    quoted_amount: Number(row.quoted_amount ?? 0),
    close_value: Number(row.close_value ?? 0),
    demo_sent_at: (row.demo_sent_at as string | null) ?? null,
    assigned_to_user_id: (row.assigned_to_user_id as string | null) ?? null,
    qualification_status: ((row.qualification_status as QualificationStatus | null) ?? "needs_verification"),
    disqualification_reason: (row.disqualification_reason as string | null) ?? null,
    website_verified_at: (row.website_verified_at as string | null) ?? null,
    contactability_score: (row.contactability_score as number | null) ?? 0,
    estimated_deal_value: (row.estimated_deal_value as number | null) ?? 0,
    review_highlights: safeParseJson<string[] | null>(row.review_highlights, null),
    website_health: safeParseJson<Record<string, unknown> | null>(row.website_health, null),
    enrichment_status: (row.enrichment_status as string) ?? "pending",
    verification: safeParseJson<Record<string, boolean>>(row.verification, {}),
  } as unknown as Lead;
}

function extractCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] ?? null;
  return parts[0] ?? null;
}

function parseLeadNoteRow(row: Record<string, unknown>): LeadNote {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    author_user_id: String(row.author_user_id),
    author_email: row.author_email ? String(row.author_email) : null,
    body: String(row.body ?? ""),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

// ─── Dashboard Stats ───

export async function getRunGeographyProgress(runId: string): Promise<GeographyProgress>{
  const db = await getDb();
  const row = await db.prepare(
    `WITH zip_progress AS (
      SELECT
        z.state,
        z.county,
        cu.zip,
        COUNT(*) as total_units,
        SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END) as done_units
      FROM crawl_units cu
      INNER JOIN zip_codes z ON cu.zip = z.zip
      WHERE cu.crawl_run_id = ?
      GROUP BY z.state, z.county, cu.zip
    ),
    county_progress AS (
      SELECT
        state,
        county,
        COUNT(*) as zip_total,
        SUM(CASE WHEN done_units = total_units AND total_units > 0 THEN 1 ELSE 0 END) as zip_completed
      FROM zip_progress
      GROUP BY state, county
    )
    SELECT
      COALESCE((SELECT COUNT(*) FROM zip_progress), 0) as zipCodesSelected,
      COALESCE((SELECT SUM(CASE WHEN done_units = total_units AND total_units > 0 THEN 1 ELSE 0 END) FROM zip_progress), 0) as zipCodesCompleted,
      COALESCE((SELECT COUNT(*) FROM county_progress), 0) as countiesSelected,
      COALESCE((SELECT SUM(CASE WHEN zip_completed = zip_total AND zip_total > 0 THEN 1 ELSE 0 END) FROM county_progress), 0) as countiesCompleted`
  ).get(runId) as GeographyProgress | undefined;

  return row ?? {
    zipCodesSelected: 0,
    zipCodesCompleted: 0,
    countiesSelected: 0,
    countiesCompleted: 0,
  };
}

export async function getDashboardStats(): Promise<{
  runStatus: string;
  runId: string | null;
  leadsTotal: number;
  leadsToday: number;
  failedUnits: number;
  progress: { total: number; done: number; failed: number; pending: number; running: number } | null;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  countiesSelected: number;
  countiesCompleted: number;
  aiQueueStats: AiQueueStats;
}> {
  const db = await getDb();
  const activeRun = await getActiveCrawlRun();

  const leadsTotal = ((await db.prepare("SELECT COUNT(*) as c FROM leads").get()) as { c: number }).c;
  const today = new Date().toISOString().slice(0, 10);
  const leadsToday = ((await db.prepare("SELECT COUNT(*) as c FROM leads WHERE discovered_at >= ?").get(today)) as { c: number }).c;

  let failedUnits = 0;
  let progress = null;
  let geographyProgress: GeographyProgress = {
    zipCodesSelected: 0,
    zipCodesCompleted: 0,
    countiesSelected: 0,
    countiesCompleted: 0,
  };

  if (activeRun) {
    const prog = await getCrawlProgress(activeRun.id);
    progress = prog;
    failedUnits = prog.failed;
    geographyProgress = await getRunGeographyProgress(activeRun.id);
  }

  return {
    runStatus: activeRun?.status ?? "idle",
    runId: activeRun?.id ?? null,
    leadsTotal,
    leadsToday,
    failedUnits,
    progress,
    zipCodesSelected: geographyProgress.zipCodesSelected,
    zipCodesCompleted: geographyProgress.zipCodesCompleted,
    countiesSelected: geographyProgress.countiesSelected,
    countiesCompleted: geographyProgress.countiesCompleted,
    aiQueueStats: await getAiQueueStats(),
  };
}

// ─── Budget Queries ───

export async function getTodayApiCalls(): Promise<number>{
  const db = await getDb();
  const today = startOfToday();
  const usageRow = await db.prepare(
    `SELECT COUNT(*) as total
     FROM api_usage_events
     WHERE success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?`
  ).get(today) as { total: number };
  const usageTotal = Number(usageRow.total) || 0;
  if (usageTotal > 0) {
    return usageTotal;
  }
  const legacyRow = await db.prepare(
    "SELECT COALESCE(SUM(api_calls_used), 0) as total FROM crawl_runs WHERE created_at >= ?"
  ).get(today) as { total: number };
  return Number(legacyRow.total) || 0;
}

export async function getRunApiCalls(runId: string): Promise<number>{
  const db = await getDb();
  const usageRow = await db.prepare(
    `SELECT COUNT(*) as total
     FROM api_usage_events
     WHERE crawl_run_id = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0`
  ).get(runId) as { total: number } | undefined;
  const usageTotal = Number(usageRow?.total) || 0;
  if (usageTotal > 0) {
    return usageTotal;
  }
  const row = await db.prepare(
    "SELECT api_calls_used FROM crawl_runs WHERE id = ?"
  ).get(runId) as { api_calls_used: number } | undefined;
  return Number(row?.api_calls_used) || 0;
}

export async function getRunApiUsageSummary(runId: string): Promise<ApiUsageSummary>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT endpoint,
            COUNT(*) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN 1 ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE crawl_run_id = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0
     GROUP BY endpoint`
  ).all(runId) as Array<{
    endpoint: string;
    calls: number;
    cost: number;
    atmosphere_calls: number;
    atmosphere_cost: number;
  }>;

  let discoveryCalls = 0;
  let discoveryCost = 0;
  let enrichmentCalls = 0;
  let enrichmentCost = 0;
  let atmosphereCalls = 0;
  let atmosphereCost = 0;
  for (const row of rows) {
    const calls = Number(row.calls) || 0;
    const cost = Number(row.cost) || 0;
    const rowAtmosphereCalls = Number(row.atmosphere_calls) || 0;
    const rowAtmosphereCost = Number(row.atmosphere_cost) || 0;
    if (row.endpoint === API_ENDPOINT_TEXT_SEARCH) {
      discoveryCalls += calls;
      discoveryCost += cost;
    } else if (row.endpoint === API_ENDPOINT_PLACE_DETAILS) {
      enrichmentCalls += calls;
      enrichmentCost += cost;
      atmosphereCalls += rowAtmosphereCalls;
      atmosphereCost += rowAtmosphereCost;
    }
  }

  const totalCalls = discoveryCalls + enrichmentCalls;
  const totalCost = discoveryCost + enrichmentCost;
  return {
    totalCalls,
    totalCost: Math.round(totalCost * 100) / 100,
    discoveryCalls,
    discoveryCost: Math.round(discoveryCost * 100) / 100,
    enrichmentCalls,
    enrichmentCost: Math.round(enrichmentCost * 100) / 100,
    atmosphereCalls,
    atmosphereCost: Math.round(atmosphereCost * 100) / 100,
  };
}

export async function getMonthlyApiUsageSummary(): Promise<ApiUsageSummary>{
  const db = await getDb();
  const monthStart = startOfCurrentMonth();
  const rows = await db.prepare(
    `SELECT endpoint,
            COUNT(*) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN 1 ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?
     GROUP BY endpoint`
  ).all(monthStart) as Array<{
    endpoint: string;
    calls: number;
    cost: number;
    atmosphere_calls: number;
    atmosphere_cost: number;
  }>;

  let discoveryCalls = 0;
  let discoveryCost = 0;
  let enrichmentCalls = 0;
  let enrichmentCost = 0;
  let atmosphereCalls = 0;
  let atmosphereCost = 0;
  for (const row of rows) {
    const calls = Number(row.calls) || 0;
    const cost = Number(row.cost) || 0;
    const rowAtmosphereCalls = Number(row.atmosphere_calls) || 0;
    const rowAtmosphereCost = Number(row.atmosphere_cost) || 0;
    if (row.endpoint === API_ENDPOINT_TEXT_SEARCH) {
      discoveryCalls += calls;
      discoveryCost += cost;
    } else if (row.endpoint === API_ENDPOINT_PLACE_DETAILS) {
      enrichmentCalls += calls;
      enrichmentCost += cost;
      atmosphereCalls += rowAtmosphereCalls;
      atmosphereCost += rowAtmosphereCost;
    }
  }

  const totalCalls = discoveryCalls + enrichmentCalls;
  const totalCost = discoveryCost + enrichmentCost;
  return {
    totalCalls,
    totalCost: Math.round(totalCost * 100) / 100,
    discoveryCalls,
    discoveryCost: Math.round(discoveryCost * 100) / 100,
    enrichmentCalls,
    enrichmentCost: Math.round(enrichmentCost * 100) / 100,
    atmosphereCalls,
    atmosphereCost: Math.round(atmosphereCost * 100) / 100,
  };
}

export async function getMonthlyApiCost(): Promise<number>{
  return (await getMonthlyApiUsageSummary()).totalCost;
}

export async function isMonthlySpendLimitReached(limit: number): Promise<boolean>{
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return await getMonthlyApiCost() >= limit;
}

export async function getRunAtmosphereEnrichmentCalls(runId: string): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(
    `SELECT COUNT(*) as total
     FROM api_usage_events
     WHERE crawl_run_id = ?
       AND endpoint = ?
       AND sku = 'places_place_details_enterprise_plus_atmosphere'
       AND success = 1
       AND COALESCE(was_cached, 0) = 0`
  ).get(runId, API_ENDPOINT_PLACE_DETAILS) as { total: number };
  return row.total ?? 0;
}

export async function getRunEnrichmentCalls(runId: string): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(
    `SELECT COUNT(*) as total
     FROM api_usage_events
     WHERE crawl_run_id = ?
       AND endpoint = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0`
  ).get(runId, API_ENDPOINT_PLACE_DETAILS) as { total: number };
  return row.total ?? 0;
}

export async function getMonthlyBillableEventsForSku(sku: GooglePlacesSku): Promise<number> {
  const db = await getDb();
  const monthStart = startOfCurrentMonth();
  const row = await db.prepare(
    `SELECT COUNT(*) as total
     FROM api_usage_events
     WHERE sku = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?`
  ).get(sku, monthStart) as { total: number };
  return Number(row.total) || 0;
}

export async function getMonthlyFreeTierStatus(
  sku: GooglePlacesSku,
  units = 1,
): Promise<{ sku: GooglePlacesSku; current: number; requested: number; freeCap: number; wouldExceed: boolean }> {
  const requested = Math.max(0, Math.floor(units));
  const current = await getMonthlyBillableEventsForSku(sku);
  const freeCap = GOOGLE_PLACES_SKU_PRICING[sku].freeCap;

  return {
    sku,
    current,
    requested,
    freeCap,
    wouldExceed: freeCap > 0 && current + requested > freeCap,
  };
}

export async function logApiUsageEvent(input: ApiUsageEventInput): Promise<{
  id: string;
  estimatedCost: number;
  estimatedUnitPrice: number;
  billableUnits: number;
}> {
  const db = await getDb();
  const id = generateId();
  const success = input.success ?? true;
  const wasCached = input.was_cached ?? false;
  const billableUnits = Math.max(0, Math.floor(input.billable_units ?? 1));

  let estimatedCost = 0;
  let estimatedUnitPrice = 0;

  if (success && !wasCached && billableUnits > 0) {
    const priorEvents = await getMonthlyBillableEventsForSku(input.sku);
    const marginal = estimateMarginalSkuCost(input.sku, priorEvents, billableUnits);
    estimatedCost = marginal.estimatedCost;
    estimatedUnitPrice = marginal.estimatedUnitPrice;
  }

  await db.prepare(
    `INSERT INTO api_usage_events (
      id, crawl_run_id, crawl_unit_id, lead_id, endpoint, sku, field_mask,
      success, was_cached, billable_units, estimated_unit_price, estimated_cost, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.crawl_run_id ?? null,
    input.crawl_unit_id ?? null,
    input.lead_id ?? null,
    input.endpoint,
    input.sku,
    input.field_mask ?? null,
    success ? 1 : 0,
    wasCached ? 1 : 0,
    billableUnits,
    estimatedUnitPrice,
    estimatedCost,
    JSON.stringify(input.metadata ?? {}),
    nowISO(),
  );

  return { id, estimatedCost, estimatedUnitPrice, billableUnits };
}

export async function getRunLastError(runId: string): Promise<string | null>{
  const db = await getDb();
  const row = await db.prepare(
    "SELECT last_error FROM crawl_runs WHERE id = ?"
  ).get(runId) as { last_error: string | null } | undefined;
  return row?.last_error ?? null;
}

export async function setRunLastError(runId: string, error: string): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE crawl_runs SET last_error = ? WHERE id = ?").run(error, runId);
}

// ─── Audit Logs ───

export async function createAuditLog(action: string, entityType?: string, entityId?: string, metadata?: Record<string, unknown>): Promise<void>{
  const db = await getDb();
  const actor = getAuditActor();
  await db.prepare(
    `INSERT INTO audit_logs (
      id, action, entity_type, entity_id, actor_user_id, actor_email, actor_role, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId(),
    action,
    entityType ?? null,
    entityId ?? null,
    actor?.userId ?? null,
    actor?.email ?? null,
    actor?.role ?? null,
    JSON.stringify(metadata ?? {}),
    nowISO(),
  );
}

// ─── Bulk Lead Operations ───

export async function bulkUpdateLeadStatus(ids: string[], status: string): Promise<number>{
  const db = await getDb();
  const now = nowISO();
  const stmt = await db.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?");
  let count = 0;
  for (const id of ids) {
    const result = await stmt.run(status, now, id);
    count += result.changes;
  }
  return count;
}

// ─── Score Recomputation ───

export async function getAllLeadsForRecompute(): Promise<Array<{
  id: string; review_count: number | null; rating: number | null;
  categories: string; website_status: string; photo_count: number;
  has_opening_hours: number; business_status: string | null;
  website_health: string | null; address: string | null;
  contactability_score: number; estimated_deal_value: number;
}>>{
  const db = await getDb();
  return await db.prepare(
    `SELECT id, review_count, rating, categories, website_status, photo_count, has_opening_hours, business_status,
      website_health, address, contactability_score, estimated_deal_value
     FROM leads
     WHERE ${SCORE_ELIGIBLE_CONDITION}`
  ).all() as Array<{
    id: string; review_count: number | null; rating: number | null;
    categories: string; website_status: string; photo_count: number;
    has_opening_hours: number; business_status: string | null;
    website_health: string | null; address: string | null;
    contactability_score: number; estimated_deal_value: number;
  }>;
}

function parseAiLeadVerificationRow(row: Record<string, unknown>): AiLeadVerification {
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    model: assertAllowedOpenAIModel(row.model as string),
    status: ((row.status as AiVerificationStatus | null) ?? "uncertain"),
    confidence: (row.confidence as number | null) ?? 0,
    found_website_url: (row.found_website_url as string | null) ?? null,
    found_email: (row.found_email as string | null) ?? null,
    found_phone: (row.found_phone as string | null) ?? null,
    social_profiles: safeParseJson<string[]>(row.social_profiles as string | null, []),
    sources: safeParseJson<AiVerificationSource[]>(row.sources as string | null, []),
    recommendation: ((row.recommendation as AiRecommendation | null) ?? "manual_review"),
    reason: (row.reason as string | null) ?? "",
    summary: (row.summary as string | null) ?? "",
    website_viability_status: (row.website_viability_status as WebsiteViabilityStatus | null) ?? null,
    website_health_json: safeParseJson<WebsiteHealthSnapshot | null>(row.website_health_json as string | null, null),
    website_viability_reason: (row.website_viability_reason as string | null) ?? null,
    raw_json: safeParseJson<Record<string, unknown>>(row.raw_json as string | null, {}),
    input_hash: (row.input_hash as string | null) ?? null,
    usage_input_tokens: (row.usage_input_tokens as number | null) ?? 0,
    usage_output_tokens: (row.usage_output_tokens as number | null) ?? 0,
    estimated_cost: (row.estimated_cost as number | null) ?? 0,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export async function batchUpdateScores(updates: Array<{ id: string; score: number }>): Promise<void>{
  const db = await getDb();
  const now = nowISO();
  const stmt = await db.prepare("UPDATE leads SET score = ?, updated_at = ? WHERE id = ?");
  for (const { id, score } of updates) {
    await stmt.run(score, now, id);
    await updateLeadQualityScores(id);
  }
}

// ─── Enrichment ───

export async function getUnenrichedLeads(limit: number): Promise<Lead[]>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT * FROM leads
     WHERE enrichment_status = 'pending' AND score > 0 AND ${SCORE_ELIGIBLE_CONDITION}
     ORDER BY score DESC LIMIT ?`
  ).all(limit) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

export async function updateLeadEnrichment(id: string, data: {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  categories?: string[];
  rating?: number | null;
  review_count?: number | null;
  website_uri?: string | null;
  website_status?: WebsiteStatus;
  maps_uri?: string | null;
  business_status?: string | null;
  price_level?: string | null;
  photo_count?: number;
  has_opening_hours?: boolean;
  primary_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  review_highlights?: string[];
  editorial_summary?: string | null;
  website_health?: Record<string, unknown> | null;
  website_checked_at?: string | null;
  score?: number;
}): Promise<void>{
  const db = await getDb();
  const current = await db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  const categories = data.categories ?? (current ? safeParseJson<string[]>((current.categories as string | null) ?? "[]", []) : []);
  const websiteStatus = data.website_status ?? ((current?.website_status as WebsiteStatus | undefined) ?? "none");
  const primaryType = data.primary_type ?? (current?.primary_type as string | null | undefined);
  const businessType = classifyBusinessType({ primaryType, categories });
  const qualification = qualifyLead({
    categories,
    websiteStatus,
    businessStatus: data.business_status ?? (current?.business_status as string | null | undefined),
    phone: data.phone ?? (current?.phone as string | null | undefined),
    address: data.address ?? (current?.address as string | null | undefined),
    mapsUri: data.maps_uri ?? (current?.maps_uri as string | null | undefined),
    score: data.score ?? (current?.score as number | null | undefined),
  });
  const shouldExclude = qualification.qualificationStatus === "disqualified";

  await db.prepare(
    `UPDATE leads SET
      enrichment_status = 'enriched', enriched_at = ?,
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      categories = COALESCE(?, categories),
      rating = COALESCE(?, rating),
      review_count = COALESCE(?, review_count),
      website_uri = COALESCE(?, website_uri),
      website_status = COALESCE(?, website_status),
      maps_uri = COALESCE(?, maps_uri),
      business_status = COALESCE(?, business_status),
      price_level = COALESCE(?, price_level),
      photo_count = COALESCE(?, photo_count),
      has_opening_hours = COALESCE(?, has_opening_hours),
      primary_type = COALESCE(?, primary_type),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      selling_niche = ?,
      business_type = ?,
      qualification_status = ?,
      disqualification_reason = ?,
      contactability_score = ?,
      estimated_deal_value = ?,
      is_excluded = CASE WHEN ? = 1 THEN 1 ELSE is_excluded END,
      exclusion_reason = COALESCE(exclusion_reason, ?),
      excluded_at = CASE WHEN ? = 1 AND excluded_at IS NULL THEN ? ELSE excluded_at END,
      review_highlights = COALESCE(?, review_highlights),
      editorial_summary = COALESCE(?, editorial_summary),
      website_health = COALESCE(?, website_health),
      website_checked_at = COALESCE(?, website_checked_at),
      score = COALESCE(?, score),
      updated_at = ?
    WHERE id = ?`
  ).run(
    nowISO(),
    data.name ?? null,
    data.address ?? null,
    data.phone ?? null,
    data.categories ? JSON.stringify(data.categories) : null,
    data.rating ?? null,
    data.review_count ?? null,
    data.website_uri ?? null,
    data.website_status ?? null,
    data.maps_uri ?? null,
    data.business_status ?? null,
    data.price_level ?? null,
    data.photo_count ?? null,
    data.has_opening_hours != null ? (data.has_opening_hours ? 1 : 0) : null,
    data.primary_type ?? null,
    data.lat ?? null,
    data.lng ?? null,
    qualification.sellingNiche,
    businessType,
    qualification.qualificationStatus,
    qualification.disqualificationReason,
    qualification.contactabilityScore,
    qualification.estimatedDealValue,
    shouldExclude ? 1 : 0,
    shouldExclude ? qualification.disqualificationReason : null,
    shouldExclude ? 1 : 0,
    nowISO(),
    data.review_highlights ? JSON.stringify(data.review_highlights) : null,
    data.editorial_summary ?? null,
    data.website_health ? JSON.stringify(data.website_health) : null,
    data.website_checked_at ?? null,
    data.score ?? null,
    nowISO(), id,
  );
  await updateLeadQualityScores(id);
}

export async function getEnrichmentStats(): Promise<{ pending: number; enriched: number; total: number }> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT enrichment_status, COUNT(*) as count
     FROM leads
     WHERE score > 0 AND ${SCORE_ELIGIBLE_CONDITION}
     GROUP BY enrichment_status`
  ).all() as Array<{ enrichment_status: string; count: number }>;

  const stats = { pending: 0, enriched: 0, total: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.enrichment_status === "enriched") stats.enriched = row.count;
    else stats.pending += row.count;
  }
  return stats;
}

// ─── Place Cache ───

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeAiQueueStatus(value: unknown): AiQueueStatus {
  return value === "queued" || value === "running" || value === "verified" || value === "error"
    ? value
    : "not_checked";
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function getAiUsageCostSince(startDate: string): Promise<number> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT COALESCE(SUM(estimated_cost), 0) as cost
     FROM ai_usage_events
     WHERE success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?`
  ).get(startDate) as { cost: number };
  return roundCurrency(row.cost ?? 0);
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function computeCompletenessScore(input: PlaceMasterUpsertInput): number {
  const checks = [
    !!input.name,
    !!input.address,
    !!input.phone,
    !!input.website_uri,
    typeof input.rating === "number",
    typeof input.user_rating_count === "number",
    Array.isArray(input.categories) && input.categories.length > 0,
    typeof input.lat === "number" && typeof input.lng === "number",
    !!input.primary_type,
    !!input.business_status,
  ];
  const passed = checks.filter(Boolean).length;
  return clampPercentage((passed / checks.length) * 100);
}

function computeFreshnessScore(lastSeenAtISO: string): number {
  const seen = Date.parse(lastSeenAtISO);
  if (Number.isNaN(seen)) return 0;
  const ageDays = (Date.now() - seen) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 100;
  if (ageDays <= 30) return 80;
  if (ageDays <= 90) return 60;
  if (ageDays <= 180) return 40;
  return 20;
}

export async function getCachedPlaceResponse(
  placeId: string,
  maxAgeDays: number,
  requireAtmosphere = false,
): Promise<Record<string, unknown> | null>{
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return null;
  const db = await getDb();
  const row = await db.prepare(
    `SELECT raw_json, fetched_at
     FROM place_cache
     WHERE place_id = ?
       AND fetched_at >= datetime('now', '-' || ? || ' days')`
  ).get(placeId, Math.floor(maxAgeDays)) as { raw_json: string; fetched_at: string } | undefined;
  if (!row) return null;

  const parsed = safeParseJson<Record<string, unknown>>(row.raw_json, {});
  if (requireAtmosphere) {
    const hasReviews = Array.isArray(parsed.reviews) && parsed.reviews.length > 0;
    const hasEditorial = typeof (parsed.editorialSummary as { text?: string } | undefined)?.text === "string";
    if (!hasReviews && !hasEditorial) {
      return null;
    }
  }
  return parsed;
}

export async function cachePlaceResponse(placeId: string, rawJson: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `INSERT INTO place_cache (place_id, raw_json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET raw_json = excluded.raw_json, fetched_at = excluded.fetched_at`
  ).run(placeId, rawJson, nowISO());
}

export async function recordPlaceObservation(input: PlaceObservationInput): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `INSERT INTO place_observations (
      id, place_id, crawl_run_id, crawl_unit_id, lead_id,
      endpoint, sku, field_mask, raw_json, observed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId(),
    input.place_id,
    input.crawl_run_id ?? null,
    input.crawl_unit_id ?? null,
    input.lead_id ?? null,
    input.endpoint,
    input.sku,
    input.field_mask ?? null,
    input.raw_json,
    input.observed_at ?? nowISO(),
    nowISO(),
  );
}

export async function upsertPlaceMaster(input: PlaceMasterUpsertInput): Promise<void>{
  const db = await getDb();
  const now = nowISO();
  const completeness = computeCompletenessScore(input);
  const freshness = computeFreshnessScore(now);
  const verificationCoverage = clampPercentage(input.verification_coverage ?? 0);

  await db.prepare(
    `INSERT INTO places_master (
      place_id, name, address, phone, website_uri, maps_uri, categories,
      rating, user_rating_count, business_status, price_level,
      photo_count, has_opening_hours, primary_type, lat, lng,
      editorial_summary, review_highlights, website_health,
      first_seen_at, last_seen_at, last_details_at, last_enriched_at,
      completeness_score, freshness_score, verification_coverage,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(place_id) DO UPDATE SET
      name = COALESCE(excluded.name, places_master.name),
      address = COALESCE(excluded.address, places_master.address),
      phone = COALESCE(excluded.phone, places_master.phone),
      website_uri = COALESCE(excluded.website_uri, places_master.website_uri),
      maps_uri = COALESCE(excluded.maps_uri, places_master.maps_uri),
      categories = CASE WHEN excluded.categories != '[]' THEN excluded.categories ELSE places_master.categories END,
      rating = COALESCE(excluded.rating, places_master.rating),
      user_rating_count = COALESCE(excluded.user_rating_count, places_master.user_rating_count),
      business_status = COALESCE(excluded.business_status, places_master.business_status),
      price_level = COALESCE(excluded.price_level, places_master.price_level),
      photo_count = COALESCE(excluded.photo_count, places_master.photo_count),
      has_opening_hours = COALESCE(excluded.has_opening_hours, places_master.has_opening_hours),
      primary_type = COALESCE(excluded.primary_type, places_master.primary_type),
      lat = COALESCE(excluded.lat, places_master.lat),
      lng = COALESCE(excluded.lng, places_master.lng),
      editorial_summary = COALESCE(excluded.editorial_summary, places_master.editorial_summary),
      review_highlights = COALESCE(excluded.review_highlights, places_master.review_highlights),
      website_health = COALESCE(excluded.website_health, places_master.website_health),
      last_seen_at = excluded.last_seen_at,
      last_details_at = COALESCE(excluded.last_details_at, places_master.last_details_at),
      last_enriched_at = COALESCE(excluded.last_enriched_at, places_master.last_enriched_at),
      completeness_score = excluded.completeness_score,
      freshness_score = excluded.freshness_score,
      verification_coverage = CASE
        WHEN COALESCE(excluded.verification_coverage, 0) > COALESCE(places_master.verification_coverage, 0)
          THEN COALESCE(excluded.verification_coverage, 0)
        ELSE COALESCE(places_master.verification_coverage, 0)
      END,
      updated_at = excluded.updated_at`
  ).run(
    input.place_id,
    input.name ?? null,
    input.address ?? null,
    input.phone ?? null,
    input.website_uri ?? null,
    input.maps_uri ?? null,
    JSON.stringify(input.categories ?? []),
    input.rating ?? null,
    input.user_rating_count ?? null,
    input.business_status ?? null,
    input.price_level ?? null,
    input.photo_count ?? 0,
    input.has_opening_hours ? 1 : 0,
    input.primary_type ?? null,
    input.lat ?? null,
    input.lng ?? null,
    input.editorial_summary ?? null,
    input.review_highlights ? JSON.stringify(input.review_highlights) : null,
    input.website_health ? JSON.stringify(input.website_health) : null,
    now,
    now,
    input.last_details_at ?? null,
    input.last_enriched_at ?? null,
    completeness,
    freshness,
    verificationCoverage,
    now,
    now,
  );
}

export async function getCanonicalPlacesForExport(limit = 10000): Promise<Array<Record<string, unknown>>>{
  const db = await getDb();
  return await db.prepare(
    `SELECT
      pm.place_id,
      pm.name,
      pm.address,
      pm.phone,
      pm.website_uri,
      pm.maps_uri,
      pm.categories,
      pm.rating,
      pm.user_rating_count,
      pm.business_status,
      pm.price_level,
      pm.photo_count,
      pm.has_opening_hours,
      pm.primary_type,
      pm.lat,
      pm.lng,
      pm.editorial_summary,
      pm.review_highlights,
      pm.completeness_score,
      pm.freshness_score,
      pm.verification_coverage,
      pm.last_seen_at,
      l.score as lead_score,
      l.status as lead_status,
      l.is_excluded as lead_is_excluded
     FROM places_master pm
     LEFT JOIN leads l ON l.place_id = pm.place_id
     ORDER BY pm.freshness_score DESC, pm.completeness_score DESC
     LIMIT ?`
  ).all(limit) as Array<Record<string, unknown>>;
}

export async function backfillPlacesMasterFromLeads(limit = 10000): Promise<number>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
      place_id,
      name,
      address,
      phone,
      website_uri,
      maps_uri,
      categories,
      rating,
      review_count,
      business_status,
      price_level,
      photo_count,
      has_opening_hours,
      primary_type,
      lat,
      lng,
      editorial_summary,
      review_highlights,
      website_health,
      discovered_at,
      verification
     FROM leads
     ORDER BY discovered_at DESC
     LIMIT ?`
  ).all(limit) as Array<Record<string, unknown>>;

  for (const row of rows) {
    const verification = safeParseJson<Record<string, boolean>>((row.verification as string | null) ?? "{}", {});
    const verifiedCount = Object.values(verification).filter(Boolean).length;
    const coverage = Object.keys(verification).length > 0
      ? (verifiedCount / Object.keys(verification).length) * 100
      : 0;

    upsertPlaceMaster({
      place_id: row.place_id as string,
      name: (row.name as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      website_uri: (row.website_uri as string | null) ?? null,
      maps_uri: (row.maps_uri as string | null) ?? null,
      categories: safeParseJson<string[]>((row.categories as string | null) ?? "[]", []),
      rating: (row.rating as number | null) ?? null,
      user_rating_count: (row.review_count as number | null) ?? null,
      business_status: (row.business_status as string | null) ?? null,
      price_level: (row.price_level as string | null) ?? null,
      photo_count: (row.photo_count as number) ?? 0,
      has_opening_hours: ((row.has_opening_hours as number) ?? 0) === 1,
      primary_type: (row.primary_type as string | null) ?? null,
      lat: (row.lat as number | null) ?? null,
      lng: (row.lng as number | null) ?? null,
      editorial_summary: (row.editorial_summary as string | null) ?? null,
      review_highlights: safeParseJson<string[]>((row.review_highlights as string | null) ?? "[]", []),
      website_health: safeParseJson<Record<string, unknown> | null>((row.website_health as string | null) ?? "null", null),
      verification_coverage: coverage,
      last_details_at: (row.discovered_at as string | null) ?? null,
      last_enriched_at: (row.discovered_at as string | null) ?? null,
    });
  }

  return rows.length;
}

// ─── Refresh Stale Units ───

export async function refreshStaleUnits(runId: string, olderThanDays: number): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(`
    UPDATE crawl_units SET status = 'pending', started_at = NULL, last_error = NULL
    WHERE crawl_run_id = ? AND status = 'done'
    AND finished_at < datetime('now', '-' || ? || ' days')
  `).run(runId, olderThanDays);
  return result.changes;
}

// ─── Coverage Error Details ───

export async function getFailedUnitErrors(runId: string): Promise<Array<{ zip: string; category: string; last_error: string | null }>>{
  const db = await getDb();
  return await db.prepare(
    "SELECT zip, category, last_error FROM crawl_units WHERE crawl_run_id = ? AND status = 'failed' ORDER BY zip"
  ).all(runId) as Array<{ zip: string; category: string; last_error: string | null }>;
}

// ─── Outreach Events ───

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "demo";
}

function servicesForNiche(niche: string | null): string[] {
  const services: Record<string, string[]> = {
    dental: ["Preventive care", "Cosmetic dentistry", "Emergency appointments"],
    medical_spa: ["Consultations", "Skin treatments", "Membership offers"],
    legal: ["Free consultation", "Practice areas", "Case evaluation"],
    hvac: ["Emergency repair", "Maintenance plans", "New system installs"],
    home_services: ["Fast estimates", "Residential service", "Commercial service"],
    auto_services: ["Diagnostics", "Repairs", "Maintenance"],
    veterinary: ["Wellness visits", "Urgent care", "Dental care"],
    beauty: ["Appointments", "Color and styling", "Packages"],
    restaurant: ["Menu highlights", "Online orders", "Private events"],
  };
  return services[niche ?? ""] ?? ["Services", "Appointments", "Free estimate"];
}

function ctaForNiche(niche: string | null, hasPhone: boolean): { primaryCta: string; secondaryCta: string } {
  const bookingNiches = new Set(["dental", "medical_spa", "veterinary", "beauty", "fitness"]);
  const estimateNiches = new Set(["hvac", "home_services", "auto_services", "financial_services"]);
  if (!hasPhone && bookingNiches.has(niche ?? "")) return { primaryCta: "Book an Appointment", secondaryCta: "Get Directions" };
  if (!hasPhone && estimateNiches.has(niche ?? "")) return { primaryCta: "Request an Estimate", secondaryCta: "Get Directions" };
  if (bookingNiches.has(niche ?? "")) return { primaryCta: "Call to Book", secondaryCta: "Get Directions" };
  if (estimateNiches.has(niche ?? "")) return { primaryCta: "Call for an Estimate", secondaryCta: "Get Directions" };
  return { primaryCta: hasPhone ? "Call Now" : "Get Directions", secondaryCta: "Get Directions" };
}

function demoHeadlineForLead(lead: Lead): string {
  if (lead.recommended_offer === "broken_site_rescue") {
    return `A working, mobile-ready site for ${lead.name ?? "your business"}`;
  }
  if (lead.recommended_offer === "booking_ready_site") {
    return `A booking-ready website for ${lead.name ?? "your business"}`;
  }
  return `A cleaner, faster website for ${lead.name ?? "your business"}`;
}

function parseDemoRow(row: Record<string, unknown>): Demo {
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    slug: row.slug as string,
    template_id: (row.template_id as string | null) ?? "default",
    config_json: safeParseJson<Record<string, unknown>>((row.config_json as string | null) ?? "{}", {}),
    is_published: ((row.is_published as number) ?? 0) === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getDemoByLeadId(leadId: string): Promise<Demo | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM demos WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").get(leadId) as Record<string, unknown> | undefined;
  return row ? parseDemoRow(row) : null;
}

export async function createDemoForLead(leadId: string): Promise<Demo | null>{
  const db = await getDb();
  const existing = await getDemoByLeadId(leadId);
  if (existing) return existing;

  const lead = await getLeadById(leadId);
  if (!lead) return null;

  const slug = `${slugify(lead.name ?? "business")}-${generateId().slice(0, 8)}`;
  const now = nowISO();
  const cta = ctaForNiche(lead.selling_niche, Boolean(lead.phone?.trim()));
  const config = {
    headline: demoHeadlineForLead(lead),
    subheadline: "Built to help local customers call, book, and trust you faster.",
    services: servicesForNiche(lead.selling_niche),
    primaryCta: cta.primaryCta,
    secondaryCta: cta.secondaryCta,
  };

  await db.prepare(
    `INSERT INTO demos (id, lead_id, slug, template_id, config_json, is_published, created_at, updated_at)
     VALUES (?, ?, ?, 'local-service-v1', ?, 1, ?, ?)`
  ).run(generateId(), leadId, slug, JSON.stringify(config), now, now);

  return getDemoByLeadId(leadId);
}

export async function getPublishedDemoBySlug(slug: string): Promise<PublishedDemo | null>{
  const db = await getDb();
  const row = await db.prepare(
    `SELECT
      d.id as demo_id,
      d.lead_id as demo_lead_id,
      d.slug as demo_slug,
      d.template_id as demo_template_id,
      d.config_json as demo_config_json,
      d.is_published as demo_is_published,
      d.created_at as demo_created_at,
      d.updated_at as demo_updated_at,
      l.*
     FROM demos d
     INNER JOIN leads l ON l.id = d.lead_id
     WHERE d.slug = ? AND d.is_published = 1
     LIMIT 1`
  ).get(slug) as Record<string, unknown> | undefined;

  if (!row) return null;

  const demo = parseDemoRow({
    id: row.demo_id,
    lead_id: row.demo_lead_id,
    slug: row.demo_slug,
    template_id: row.demo_template_id,
    config_json: row.demo_config_json,
    is_published: row.demo_is_published,
    created_at: row.demo_created_at,
    updated_at: row.demo_updated_at,
  });

  return { demo, lead: parseLeadRow(row) };
}

export async function createOutreachEvent(leadId: string, channel: string, note: string | null): Promise<OutreachEvent>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();

  await db.prepare(
    "INSERT INTO outreach_events (id, lead_id, channel, note, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, leadId, channel, note, now);

  await db.prepare(
    "UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?"
  ).run(now, now, leadId);

  const firstContact = await db.prepare(
    "SELECT first_contacted_at FROM leads WHERE id = ?"
  ).get(leadId) as { first_contacted_at: string | null } | undefined;

  if (firstContact && !firstContact.first_contacted_at) {
    await db.prepare("UPDATE leads SET first_contacted_at = ? WHERE id = ?").run(now, leadId);
  }

  await updateLeadQualityScores(leadId);
  return { id, lead_id: leadId, channel, note, created_at: now };
}

export async function getOutreachEvents(leadId: string): Promise<OutreachEvent[]>{
  const db = await getDb();
  return await db.prepare(
    "SELECT * FROM outreach_events WHERE lead_id = ? ORDER BY created_at DESC"
  ).all(leadId) as OutreachEvent[];
}

export async function getOutreachEventCount(leadId: string): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(
    "SELECT COUNT(*) as c FROM outreach_events WHERE lead_id = ?"
  ).get(leadId) as { c: number };
  return row.c;
}

// ─── Lead Timestamp Updates ───

export async function updateLeadReminder(id: string, date: string | null): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE leads SET reminder_date = ?, updated_at = ? WHERE id = ?")
    .run(date, nowISO(), id);
  await updateLeadQualityScores(id);
}

export async function updateLeadTimestamp(id: string, field: string, value: string | null): Promise<void>{
  const db = await getDb();
  const allowed = ["first_contacted_at", "first_reply_at", "meeting_booked_at", "last_contacted_at"];
  if (!allowed.includes(field)) return;
  await db.prepare(`UPDATE leads SET ${field} = ?, updated_at = ? WHERE id = ?`)
    .run(value ?? nowISO(), nowISO(), id);
  await updateLeadQualityScores(id);
}

// ─── Now Queue ───

export async function getNowQueue(limit = 25): Promise<QueueLead[]>{
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const candidateLimit = Math.max(limit * 20, 200);

  const rows = await db.prepare(`
    WITH candidates AS (
      SELECT id
      FROM leads
      WHERE website_status IN ('none', 'social', 'basic')
        AND ${noUsableAiWebsiteCondition()}
        AND qualification_status IN ('qualified', 'needs_verification')
        AND status IN ('new', 'verified', 'contacted')
        AND quality_bucket IN ('ready_to_call','broken_site_opportunity')
        AND (
          ai_queue_status = 'verified'
          OR ai_verification_status IN ('no_site_found','weak_site_found')
          OR ai_website_viability_status IN ('directory_only','broken','parked','placeholder')
        )
        AND score > 0
        AND ${SCORE_ELIGIBLE_CONDITION}
      ORDER BY sales_priority_score DESC, lead_quality_score DESC, score DESC
      LIMIT ?
    ),
    ranked AS (
      SELECT
        l.id,
        l.name,
        l.phone,
        l.address,
        l.categories,
        l.score,
        l.website_status,
        l.rating,
        l.review_count,
        l.last_contacted_at,
        l.reminder_date,
        l.status,
        l.is_excluded,
        l.exclusion_reason,
        l.selling_niche,
        l.business_type,
        l.win_probability_score,
        l.lead_quality_score,
        l.quality_bucket,
        l.easy_build_score,
        l.cash_speed_score,
        l.need_score,
        l.quality_reason,
        l.recommended_offer,
        l.next_best_action,
        l.phone_verification_status,
        l.ai_verification_status,
        l.ai_confidence,
        l.ai_found_website_url,
        l.ai_recommendation,
        l.ai_checked_at,
        l.ai_website_viability_status,
        l.ai_queue_status,
        l.qualification_status,
        l.contactability_score,
        l.estimated_deal_value,
        l.raw_opportunity_score,
        l.verification_score,
        l.sales_priority_score,
        (
          SELECT d.slug
          FROM demos d
          WHERE d.lead_id = l.id AND d.is_published = 1
          ORDER BY d.created_at DESC
          LIMIT 1
        ) as demo_slug,
        CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? THEN 1 ELSE 0 END as has_urgent_reminder,
        CASE
          WHEN l.contactability_score > 0 THEN l.contactability_score
          WHEN l.phone IS NOT NULL AND l.phone != '' THEN 1.0
          ELSE 0.5
        END as contactability,
        CASE
          WHEN l.last_contacted_at IS NULL THEN 1.0
          WHEN julianday('now') - julianday(l.last_contacted_at) > 14 THEN 1.0
          WHEN julianday('now') - julianday(l.last_contacted_at) > 7 THEN 0.8
          WHEN julianday('now') - julianday(l.last_contacted_at) > 3 THEN 0.5
          ELSE 0.2
        END as freshness
      FROM leads l
      INNER JOIN candidates c ON c.id = l.id
    )
    SELECT *
    FROM ranked
    ORDER BY
      has_urgent_reminder DESC,
      sales_priority_score DESC,
      lead_quality_score DESC,
      win_probability_score DESC,
      score DESC
    LIMIT ?
  `).all(candidateLimit, today, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    categories: safeParseJson<string[]>(row.categories, []),
    score: (row.score as number) ?? 0,
    website_status: (row.website_status as string) ?? "none",
    rating: (row.rating as number | null) ?? null,
    review_count: (row.review_count as number | null) ?? null,
    last_contacted_at: (row.last_contacted_at as string | null) ?? null,
    reminder_date: (row.reminder_date as string | null) ?? null,
    status: (row.status as string) ?? "new",
    is_excluded: ((row.is_excluded as number) ?? 0) === 1,
    exclusion_reason: (row.exclusion_reason as string | null) ?? null,
    selling_niche: (row.selling_niche as string | null) ?? null,
    business_type: ((row.business_type as BusinessType | null) ?? "local_services"),
    win_probability_score: (row.win_probability_score as number | null) ?? 0,
    lead_quality_score: (row.lead_quality_score as number | null) ?? 0,
    quality_bucket: ((row.quality_bucket as QualityBucket | null) ?? "needs_ai_verify"),
    easy_build_score: (row.easy_build_score as number | null) ?? 0,
    cash_speed_score: (row.cash_speed_score as number | null) ?? 0,
    need_score: (row.need_score as number | null) ?? 0,
    quality_reason: (row.quality_reason as string | null) ?? null,
    recommended_offer: ((row.recommended_offer as RecommendedOffer | null) ?? "starter_site"),
    next_best_action: (row.next_best_action as string | null) ?? null,
    phone_verification_status: ((row.phone_verification_status as PhoneVerificationStatus | null) ?? (row.phone ? "unknown" : "no_phone")),
    ai_verification_status: ((row.ai_verification_status as AiVerificationStatus | null) ?? "not_checked"),
    ai_confidence: (row.ai_confidence as number | null) ?? 0,
    ai_found_website_url: (row.ai_found_website_url as string | null) ?? null,
    ai_recommendation: (row.ai_recommendation as AiRecommendation | null) ?? null,
    ai_checked_at: (row.ai_checked_at as string | null) ?? null,
    ai_website_viability_status: (row.ai_website_viability_status as WebsiteViabilityStatus | null) ?? null,
    ai_queue_status: normalizeAiQueueStatus(row.ai_queue_status),
    qualification_status: ((row.qualification_status as QualificationStatus | null) ?? "needs_verification"),
    contactability_score: (row.contactability_score as number | null) ?? 0,
    estimated_deal_value: (row.estimated_deal_value as number | null) ?? 0,
    raw_opportunity_score: Number(row.raw_opportunity_score ?? row.score ?? 0),
    verification_score: Number(row.verification_score ?? 0),
    sales_priority_score: Number(row.sales_priority_score ?? row.lead_quality_score ?? row.score ?? 0),
    demo_slug: (row.demo_slug as string | null) ?? null,
  }));
}

// ─── Dashboard Extended Stats ───

export async function getTodayFocusCount(): Promise<number>{
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE reminder_date IS NOT NULL AND reminder_date <= ?"
  ).get(today) as { c: number };
  return row.c;
}

export async function getNeedsFollowUpCount(): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE first_contacted_at IS NOT NULL
      AND first_reply_at IS NULL
      AND julianday('now') - julianday(last_contacted_at) > 3
      AND status IN ('contacted', 'preview_sent')
  `).get() as { c: number };
  return row.c;
}

// ─── Conversion Metrics ───

export async function getConversionMetrics(): Promise<ConversionMetrics>{
  const db = await getDb();

  const contacted = ((await db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE first_contacted_at IS NOT NULL"
  ).get()) as { c: number }).c;

  const replies = ((await db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE first_reply_at IS NOT NULL"
  ).get()) as { c: number }).c;

  const meetings = ((await db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE meeting_booked_at IS NOT NULL"
  ).get()) as { c: number }).c;

  let medianHours: number | null = null;
  if (contacted > 0) {
    const hours = await db.prepare(`
      SELECT (julianday(first_contacted_at) - julianday(discovered_at)) * 24.0 as hrs
      FROM leads
      WHERE first_contacted_at IS NOT NULL AND discovered_at IS NOT NULL
      ORDER BY hrs
    `).all() as { hrs: number }[];

    if (hours.length > 0) {
      const mid = Math.floor(hours.length / 2);
      medianHours = hours.length % 2 === 0
        ? Math.round(((hours[mid - 1].hrs + hours[mid].hrs) / 2) * 10) / 10
        : Math.round(hours[mid].hrs * 10) / 10;
    }
  }

  return {
    totalContacted: contacted,
    totalReplies: replies,
    totalMeetings: meetings,
    replyRate: contacted > 0 ? Math.round((replies / contacted) * 1000) / 10 : 0,
    meetingRate: contacted > 0 ? Math.round((meetings / contacted) * 1000) / 10 : 0,
    medianHoursToContact: medianHours,
  };
}

// ─── Statistics ───

export function resolveStatisticsRange(input: StatisticsRangeInput = {}): ResolvedStatisticsRange {
  const requested = input.range;
  const range: StatisticsRangeKey = requested === "today" || requested === "7d" || requested === "30d" || requested === "month" || requested === "custom"
    ? requested
    : "all";

  if (range === "all") {
    return { range, label: "All Time", from: null, to: null };
  }

  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);

  if (range === "custom") {
    const from = normalizeDateInput(input.from) ?? todayDate;
    const to = normalizeDateInput(input.to) ?? todayDate;
    return {
      range,
      label: `${from} to ${to}`,
      from,
      to: addDays(to, 1),
    };
  }

  if (range === "today") {
    return { range, label: "Today", from: todayDate, to: addDays(todayDate, 1) };
  }

  if (range === "7d") {
    return { range, label: "Last 7 Days", from: addDays(todayDate, -6), to: addDays(todayDate, 1) };
  }

  if (range === "30d") {
    return { range, label: "Last 30 Days", from: addDays(todayDate, -29), to: addDays(todayDate, 1) };
  }

  const monthStart = `${todayDate.slice(0, 7)}-01`;
  return { range: "month", label: "This Month", from: monthStart, to: addDays(todayDate, 1) };
}

export async function getStatisticsSummary(input: StatisticsRangeInput = {}): Promise<StatisticsSummary>{
  const db = await getDb();
  const range = resolveStatisticsRange(input);
  const leadWindow = dateWindow("l.discovered_at", range);
  const demoWindow = dateWindow("d.created_at", range);
  const outreachWindow = dateWindow("oe.created_at", range);
  const replyWindow = dateWindow("l.first_reply_at", range);
  const meetingWindow = dateWindow("l.meeting_booked_at", range);
  const statusWindow = dateWindow("l.updated_at", range);
  const apiWindow = dateWindow("a.created_at", range);
  const aiUsageWindow = dateWindow("ai.created_at", range);
  const aiVerificationWindow = dateWindow("av.created_at", range);
  const runWindow = dateWindow("cr.created_at", range);

  const totalDiscovered = await countRows(db, "leads l", leadWindow);
  const activeLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0");
  const qualifiedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.qualification_status = 'qualified'");
  const queueCandidates = await countRows(
    db,
    "leads l",
    leadWindow,
    `COALESCE(l.is_excluded, 0) = 0 AND l.website_status IN ('none','social','basic') AND ${noUsableAiWebsiteCondition("l")} AND l.qualification_status IN ('qualified','needs_verification') AND l.status IN ('new','verified','contacted') AND l.score > 0`,
  );
  const excludedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 1");
  const demosCreated = await countRows(db, "demos d", demoWindow);
  const contactedLeads = await countDistinctRows(db, "outreach_events oe", "oe.lead_id", outreachWindow);
  const replies = await countRows(db, "leads l", replyWindow, "l.first_reply_at IS NOT NULL");
  const meetings = await countRows(db, "leads l", meetingWindow, "l.meeting_booked_at IS NOT NULL");
  const closedWon = await countRows(db, "leads l", statusWindow, "l.status = 'closed_won'");
  const closedLost = await countRows(db, "leads l", statusWindow, "l.status = 'closed_lost'");

  const economicsRow = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.qualification_status IN ('qualified','needs_verification') THEN l.estimated_deal_value ELSE 0 END), 0) as pipeline_value,
            COALESCE(AVG(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.estimated_deal_value > 0 THEN l.estimated_deal_value END), 0) as average_deal_value
     FROM leads l ${whereFromWindow(leadWindow)}`
  ).get(...leadWindow.params) as { pipeline_value: number; average_deal_value: number };

  const apiRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as calls, COALESCE(SUM(a.estimated_cost), 0) as cost
     FROM api_usage_events a ${whereFromWindow(apiWindow, "a.success = 1 AND COALESCE(a.was_cached, 0) = 0")}`
  ).get(...apiWindow.params) as { calls: number; cost: number };

  const aiUsageRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as calls,
            COALESCE(SUM(ai.estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN COALESCE(ai.was_cached, 0) = 1 THEN 1 ELSE 0 END), 0) as cached
     FROM ai_usage_events ai ${whereFromWindow(aiUsageWindow, "ai.success = 1")}`
  ).get(...aiUsageWindow.params) as { calls: number; cost: number; cached: number };

  const aiVerificationRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as verifications,
            COALESCE(SUM(CASE WHEN av.status = 'site_found' AND COALESCE(av.website_viability_status, '') = 'usable' THEN 1 ELSE 0 END), 0) as usable_site_found,
            COALESCE(SUM(CASE WHEN av.status = 'weak_site_found' THEN 1 ELSE 0 END), 0) as weak_site_found,
            COALESCE(SUM(CASE WHEN av.status IN ('no_site_found','weak_site_found') THEN 1 ELSE 0 END), 0) as website_opportunity_found,
            COALESCE(SUM(CASE WHEN av.status IN ('uncertain','mismatch') THEN 1 ELSE 0 END), 0) as uncertain
     FROM ai_lead_verifications av ${whereFromWindow(aiVerificationWindow, "av.error IS NULL")}`
  ).get(...aiVerificationWindow.params) as {
    verifications: number;
    usable_site_found: number;
    weak_site_found: number;
    website_opportunity_found: number;
    uncertain: number;
  };
  const qualityCountsRow = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'ready_to_call' THEN 1 ELSE 0 END), 0) as ready_to_call,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'needs_ai_verify' THEN 1 ELSE 0 END), 0) as needs_ai_verify,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'needs_manual_review' THEN 1 ELSE 0 END), 0) as needs_manual_review,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'broken_site_opportunity' THEN 1 ELSE 0 END), 0) as broken_site_opportunities,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'not_a_fit' THEN 1 ELSE 0 END), 0) as not_fit,
       COALESCE(SUM(CASE WHEN l.ai_checked_at IS NOT NULL THEN 1 ELSE 0 END), 0) as ai_checked,
       COALESCE(SUM(CASE WHEN l.ai_verification_status = 'no_site_found' OR l.ai_website_viability_status = 'directory_only' THEN 1 ELSE 0 END), 0) as ai_no_site,
       COALESCE(SUM(CASE WHEN l.ai_verification_status = 'site_found' AND l.ai_website_viability_status = 'usable' THEN 1 ELSE 0 END), 0) as usable_site_found,
       COALESCE(SUM(CASE WHEN l.quality_bucket = 'broken_site_opportunity' OR l.ai_website_viability_status IN ('broken','parked','placeholder') THEN 1 ELSE 0 END), 0) as broken_site_found
     FROM leads l ${whereFromWindow(leadWindow)}`
  ).get(...leadWindow.params) as Record<string, number>;
  const qualityPipelineRows = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.quality_bucket, 'needs_ai_verify') as key,
            COUNT(*) as count,
            COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 THEN l.estimated_deal_value ELSE 0 END), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0")}
     GROUP BY COALESCE(l.quality_bucket, 'needs_ai_verify')
     ORDER BY value DESC, count DESC`,
    leadWindow.params,
    "bucket",
  );
  const topReadyByType = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.business_type, 'local_services') as key,
            COUNT(*) as count,
            COALESCE(SUM(l.estimated_deal_value), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.quality_bucket = 'ready_to_call'")}
     GROUP BY COALESCE(l.business_type, 'local_services')
     ORDER BY count DESC, value DESC
     LIMIT 8`,
    leadWindow.params,
    "businessType",
  );
  const topValueByType = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.business_type, 'local_services') as key,
            COUNT(*) as count,
            COALESCE(SUM(l.estimated_deal_value), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity')")}
     GROUP BY COALESCE(l.business_type, 'local_services')
     ORDER BY value DESC, count DESC
     LIMIT 8`,
    leadWindow.params,
    "businessType",
  );

  const businessTypes = await getStatisticsBusinessTypes(db, range);
  const verification = await getVerificationCoverage(db, leadWindow);
  const failedUnits = await countRows(
    db,
    "crawl_units cu INNER JOIN crawl_runs cr ON cr.id = cu.crawl_run_id",
    runWindow,
    "cu.status = 'failed'",
  );
  const enrichmentBacklog = await countRows(
    db,
    "leads l",
    { clause: "", params: [] },
    "COALESCE(l.is_excluded, 0) = 0 AND l.enrichment_status = 'pending' AND l.score > 0",
  );

  return {
    range,
    kpis: {
      totalDiscovered,
      activeLeads,
      qualifiedLeads,
      queueCandidates,
      excludedLeads,
      demosCreated,
      contactedLeads,
      replies,
      meetings,
      closedWon,
      closedLost,
    },
    economics: {
      pipelineValue: Math.round(economicsRow.pipeline_value ?? 0),
      averageDealValue: Math.round(economicsRow.average_deal_value ?? 0),
      apiCost: Math.round((apiRow.cost ?? 0) * 100) / 100,
      apiCalls: apiRow.calls ?? 0,
      costPerQualifiedLead: divideCurrency(apiRow.cost, qualifiedLeads),
      costPerContactedLead: divideCurrency(apiRow.cost, contactedLeads),
      costPerMeeting: divideCurrency(apiRow.cost, meetings),
    },
    ai: {
      cost: Math.round((aiUsageRow.cost ?? 0) * 100) / 100,
      calls: aiUsageRow.calls ?? 0,
      verifications: aiVerificationRow.verifications ?? 0,
      cachedResults: aiUsageRow.cached ?? 0,
      siteFound: aiVerificationRow.usable_site_found ?? 0,
      usableSiteFound: aiVerificationRow.usable_site_found ?? 0,
      weakSiteFound: aiVerificationRow.weak_site_found ?? 0,
      websiteOpportunityFound: aiVerificationRow.website_opportunity_found ?? 0,
      uncertain: aiVerificationRow.uncertain ?? 0,
      costPerVerification: divideCurrency(aiUsageRow.cost, aiVerificationRow.verifications),
    },
    quality: {
      readyToCall: Number(qualityCountsRow.ready_to_call ?? 0),
      needsAiVerify: Number(qualityCountsRow.needs_ai_verify ?? 0),
      needsManualReview: Number(qualityCountsRow.needs_manual_review ?? 0),
      brokenSiteOpportunities: Number(qualityCountsRow.broken_site_opportunities ?? 0),
      notFit: Number(qualityCountsRow.not_fit ?? 0),
      aiVerifiedNoSiteRate: percentage(qualityCountsRow.ai_no_site, qualityCountsRow.ai_checked),
      usableSiteFoundRate: percentage(qualityCountsRow.usable_site_found, qualityCountsRow.ai_checked),
      brokenSiteRate: percentage(qualityCountsRow.broken_site_found, qualityCountsRow.ai_checked),
      contactedToReplyRate: percentage(replies, contactedLeads),
      replyToMeetingRate: percentage(meetings, replies),
      meetingToCloseRate: percentage(closedWon, meetings),
      pipelineByBucket: qualityPipelineRows,
      topReadyByType,
      topValueByType,
    },
    businessTypes,
    dataQuality: {
      websiteStatus: await getLeadBreakdown(db, "website_status", leadWindow),
      qualificationStatus: await getLeadBreakdown(db, "qualification_status", leadWindow),
      enrichmentStatus: await getLeadBreakdown(db, "enrichment_status", leadWindow),
      exclusionReasons: await getExclusionReasonBreakdown(db, leadWindow),
      verificationAverage: verification.average,
      verificationCheckedLeads: verification.checkedLeads,
    },
    operations: {
      apiByEndpoint: await getApiBreakdown(db, "endpoint", apiWindow),
      apiBySku: await getApiBreakdown(db, "sku", apiWindow),
      crawlRunsByStatus: await getCrawlRunBreakdown(db, runWindow),
      failedUnits,
      enrichmentBacklog,
    },
  };
}

async function getStatisticsBusinessTypes(db: DbClient, range: ResolvedStatisticsRange): Promise<StatisticsBusinessTypeRow[]> {
  const leadWindow = dateWindow("l.discovered_at", range);
  const outreachWindow = dateWindow("oe.created_at", range);
  const demoWindow = dateWindow("d.created_at", range);
  const meetingWindow = dateWindow("l.meeting_booked_at", range);
  const statusWindow = dateWindow("l.updated_at", range);

  const baseRows = await db.prepare(
    `SELECT COALESCE(l.business_type, 'local_services') as business_type,
            COUNT(*) as total,
            SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.qualification_status = 'qualified' THEN 1 ELSE 0 END) as qualified,
            SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.qualification_status = 'needs_verification' THEN 1 ELSE 0 END) as needs_verification,
            SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 1 THEN 1 ELSE 0 END) as excluded,
            SUM(CASE WHEN l.website_status = 'none' THEN 1 ELSE 0 END) as no_website,
            SUM(CASE WHEN l.website_status = 'social' THEN 1 ELSE 0 END) as social_website,
            SUM(CASE WHEN l.website_status = 'basic' THEN 1 ELSE 0 END) as basic_website,
            SUM(CASE WHEN l.website_status = 'custom' THEN 1 ELSE 0 END) as custom_website,
            COALESCE(AVG(l.score), 0) as average_score,
            COALESCE(AVG(CASE WHEN l.estimated_deal_value > 0 THEN l.estimated_deal_value END), 0) as average_deal_value,
            COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.qualification_status IN ('qualified','needs_verification') THEN l.estimated_deal_value ELSE 0 END), 0) as pipeline_value
     FROM leads l ${whereFromWindow(leadWindow)}
     GROUP BY COALESCE(l.business_type, 'local_services')`
  ).all(...leadWindow.params) as Array<Record<string, unknown>>;

  const contacted = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(DISTINCT oe.lead_id) as count
     FROM outreach_events oe INNER JOIN leads l ON l.id = oe.lead_id ${whereFromWindow(outreachWindow)}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    outreachWindow.params,
  );
  const demos = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM demos d INNER JOIN leads l ON l.id = d.lead_id ${whereFromWindow(demoWindow)}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    demoWindow.params,
  );
  const meetings = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(meetingWindow, "l.meeting_booked_at IS NOT NULL")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    meetingWindow.params,
  );
  const won = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(statusWindow, "l.status = 'closed_won'")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    statusWindow.params,
  );
  const lost = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(statusWindow, "l.status = 'closed_lost'")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    statusWindow.params,
  );

  const baseByType = new Map(baseRows.map((row) => [String(row.business_type), row]));
  return BUSINESS_TYPE_OPTIONS.map((option) => {
    const row = baseByType.get(option.id);
    return {
      id: option.id,
      label: option.label,
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      qualified: Number(row?.qualified ?? 0),
      needsVerification: Number(row?.needs_verification ?? 0),
      excluded: Number(row?.excluded ?? 0),
      noWebsite: Number(row?.no_website ?? 0),
      socialWebsite: Number(row?.social_website ?? 0),
      basicWebsite: Number(row?.basic_website ?? 0),
      customWebsite: Number(row?.custom_website ?? 0),
      contacted: contacted.get(option.id) ?? 0,
      demos: demos.get(option.id) ?? 0,
      meetings: meetings.get(option.id) ?? 0,
      closedWon: won.get(option.id) ?? 0,
      closedLost: lost.get(option.id) ?? 0,
      averageScore: Math.round(Number(row?.average_score ?? 0) * 10) / 10,
      averageDealValue: Math.round(Number(row?.average_deal_value ?? 0)),
      pipelineValue: Math.round(Number(row?.pipeline_value ?? 0)),
    };
  }).sort((a, b) => b.qualified - a.qualified || b.active - a.active || b.total - a.total);
}

async function getLeadBreakdown(db: DbClient, column: "website_status" | "qualification_status" | "enrichment_status", window: SqlWindow): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT COALESCE(l.${column}, 'unknown') as key, COUNT(*) as count
     FROM leads l ${whereFromWindow(window)}
     GROUP BY COALESCE(l.${column}, 'unknown')
     ORDER BY count DESC`
  ).all(...window.params) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({
    key: row.key,
    label: row.key.replace(/_/g, " "),
    count: row.count,
  }));
}

async function getExclusionReasonBreakdown(db: DbClient, window: SqlWindow): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT COALESCE(NULLIF(TRIM(l.exclusion_reason), ''), 'No reason recorded') as key, COUNT(*) as count
     FROM leads l ${whereFromWindow(window, "COALESCE(l.is_excluded, 0) = 1")}
     GROUP BY COALESCE(NULLIF(TRIM(l.exclusion_reason), ''), 'No reason recorded')
     ORDER BY count DESC
     LIMIT 8`
  ).all(...window.params) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: row.key, label: row.key, count: row.count }));
}

async function getApiBreakdown(db: DbClient, column: "endpoint" | "sku", window: SqlWindow): Promise<Array<{ key: string; calls: number; cost: number }>> {
  const rows = await db.prepare(
    `SELECT a.${column} as key, COUNT(*) as calls, COALESCE(SUM(a.estimated_cost), 0) as cost
     FROM api_usage_events a ${whereFromWindow(window, "a.success = 1 AND COALESCE(a.was_cached, 0) = 0")}
     GROUP BY a.${column}
     ORDER BY cost DESC, calls DESC`
  ).all(...window.params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    key: String((row as Record<string, unknown>).key),
    calls: Number((row as Record<string, unknown>).calls ?? 0),
    cost: Math.round(Number((row as Record<string, unknown>).cost ?? 0) * 100) / 100,
  }));
}

async function getCrawlRunBreakdown(db: DbClient, window: SqlWindow): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT cr.status as key, COUNT(*) as count
     FROM crawl_runs cr ${whereFromWindow(window)}
     GROUP BY cr.status
     ORDER BY count DESC`
  ).all(...window.params) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: row.key, label: row.key.replace(/_/g, " "), count: row.count }));
}

async function getVerificationCoverage(db: DbClient, window: SqlWindow): Promise<{ average: number; checkedLeads: number }> {
  const rows = await db.prepare(
    `SELECT l.verification FROM leads l ${whereFromWindow(window)}`
  ).all(...window.params) as Array<{ verification: string | null }>;
  if (rows.length === 0) return { average: 0, checkedLeads: 0 };

  let totalCoverage = 0;
  let checkedLeads = 0;
  for (const row of rows) {
    const verification = safeParseJson<Record<string, boolean>>(row.verification, {});
    const values = Object.values(verification);
    if (values.length > 0) checkedLeads++;
    totalCoverage += values.length > 0 ? values.filter(Boolean).length / Math.max(values.length, 1) : 0;
  }
  return {
    average: Math.round((totalCoverage / rows.length) * 1000) / 10,
    checkedLeads,
  };
}

interface SqlWindow {
  clause: string;
  params: string[];
}

function dateWindow(column: string, range: ResolvedStatisticsRange): SqlWindow {
  if (!range.from || !range.to) return { clause: "", params: [] };
  return {
    clause: `${column} >= ? AND ${column} < ?`,
    params: [`${range.from} 00:00:00`, `${range.to} 00:00:00`],
  };
}

function whereFromWindow(window: SqlWindow, extra?: string): string {
  const conditions = [window.clause, extra].filter(Boolean);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

async function countRows(db: DbClient, from: string, window: SqlWindow, extra?: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) as count FROM ${from} ${whereFromWindow(window, extra)}`).get(...window.params) as { count: number };
  return row.count ?? 0;
}

async function countDistinctRows(db: DbClient, from: string, column: string, window: SqlWindow, extra?: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(DISTINCT ${column}) as count FROM ${from} ${whereFromWindow(window, extra)}`).get(...window.params) as { count: number };
  return row.count ?? 0;
}

async function getQualityValueRows(
  db: DbClient,
  query: string,
  params: string[],
  labelMode: "bucket" | "businessType",
): Promise<StatisticsQualityValueRow[]> {
  const rows = await db.prepare(query).all(...params) as Array<{ key: string; count: number; value: number }>;
  return rows.map((row) => ({
    key: row.key,
    label: labelMode === "businessType" ? businessTypeLabel(row.key) : row.key.replace(/_/g, " "),
    count: Number(row.count ?? 0),
    value: Math.round(Number(row.value ?? 0)),
  }));
}

async function countByBusinessType(db: DbClient, query: string, params: string[]): Promise<Map<string, number>> {
  const rows = await db.prepare(query).all(...params) as Array<{ business_type: string; count: number }>;
  return new Map(rows.map((row) => [row.business_type, row.count]));
}

function businessTypeLabel(id: string): string {
  return BUSINESS_TYPE_OPTIONS.find((option) => option.id === id)?.label ?? id.replace(/_/g, " ");
}

function divideCurrency(cost: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((cost / denominator) * 100) / 100;
}

function percentage(numerator: number | undefined | null, denominator: number | undefined | null): number {
  const denom = Number(denominator ?? 0);
  if (denom <= 0) return 0;
  return Math.round((Number(numerator ?? 0) / denom) * 1000) / 10;
}

function normalizeDateInput(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
