import { getDb, generateId, nowISO, withDbTransaction, type DbClient } from "./index";
import { seedZipCodes } from "./seed-zips";
import { computeScoreBandThresholds, type ScoreBandThresholds } from "@/lib/score-bands";
import { computeWinProbability } from "@/lib/scoring";
import {
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
import {
  getTenantContext,
  requireTenantContext,
  type TenantContext,
} from "@/lib/tenancy/context";
import { getWorkerTenantContext } from "@/lib/tenancy/worker-context";
import { resolveCanonicalAppUrl } from "@/lib/app-url";
import {
  SCHEDULER_WORKER_METADATA,
  getSchedulerWorkerMetadata,
  type SchedulerWorkerName,
} from "@/lib/scheduler/worker-metadata";
import {
  COUNTRY_LABELS,
  buildCellLabel,
  buildQueryLocationLabel,
  defaultCellTypeForCountry,
  normalizeCountryCode,
  normalizePostalCode,
  type CountryCode,
  type LocationCellType,
} from "@/lib/geography";
import type { AppRole } from "@/lib/permissions";
import { throwIfWorkerAborted } from "@/lib/worker-abort";
import { readPlaceCacheMetadata } from "@/lib/place-cache-contract";
import { isLeadExcluded } from "./lead-exclusion";
import { parseMinReviewsFilter, POSTGRES_INT4_MAX } from "@/lib/lead-filter-parsing";

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
  market_id: string | null;
  location_cell_id: string | null;
  country_code: CountryCode | null;
  admin_area1: string | null;
  admin_area2: string | null;
  locality: string | null;
  postal_code: string | null;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  excluded_at: string | null;
  archived_at: string | null;
  archived_by_user_id: string | null;
  archive_reason: string | null;
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
  ai_website_feedback_status: string | null;
  ai_corrected_website_url: string | null;
  ai_false_positive_reason: string | null;
  ai_reviewer_notes: string | null;
  ai_feedback_at: string | null;
  assigned_to_user_id: string | null;
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
  qualification_status: QualificationStatus;
  disqualification_reason: string | null;
  website_verified_at: string | null;
  contactability_score: number;
  estimated_deal_value: number;
  notes: string | null;
  reminder_date: string | null;
  enrichment_status: string;
  enrichment_attempt_count: number;
  enrichment_started_at: string | null;
  enrichment_finished_at: string | null;
  enrichment_next_retry_at: string | null;
  enrichment_last_error: string | null;
  enrichment_last_error_code: string | null;
  enrichment_max_attempts: number;
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
  assigned_to_user_id: string | null;
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
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
  assigned_to_user_id: string | null;
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
  demo_slug: string | null;
  open_website_request_id: string | null;
  open_quote_request_id: string | null;
  business_detail_status: LeadAiArtifactStatus | null;
  competitive_report_status: LeadAiArtifactStatus | null;
}

export type OutreachOutcome =
  | "not_reached"
  | "left_voicemail"
  | "contacted"
  | "decision_maker_reached"
  | "demo_sent"
  | "meeting_set"
  | "follow_up_needed"
  | "not_interested"
  | "quoted"
  | "closed_won"
  | "closed_lost";

export interface OutreachEventInput {
  leadId: string;
  channel: string;
  note?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  contactPersonName?: string | null;
  contactPersonRole?: string | null;
  decisionMakerReached?: boolean;
  outcome?: OutreachOutcome;
  objectionReason?: string | null;
  quotedAmount?: number;
  closeValue?: number;
  followUpAt?: string | null;
  nextStep?: string | null;
}

export interface OutreachEvent {
  id: string;
  lead_id: string;
  channel: string;
  actor_user_id: string | null;
  actor_email: string | null;
  contact_person_name: string | null;
  contact_person_role: string | null;
  decision_maker_reached: boolean;
  outcome: OutreachOutcome;
  objection_reason: string | null;
  quoted_amount: number;
  close_value: number;
  follow_up_at: string | null;
  next_step: string | null;
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

export type AdminRequestType = "website_request" | "quote_request";
export type AdminRequestStatus = "new" | "seen" | "in_progress" | "waiting_on_researcher" | "done" | "cancelled";
export type AdminRequestPriority = "urgent" | "normal" | "low";

export interface AdminRequestInput {
  leadId: string;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  assignedAdminUserId?: string | null;
  requestType: AdminRequestType;
  priority?: AdminRequestPriority;
  summary?: string | null;
  contactPersonName?: string | null;
  budgetHint?: string | null;
  dueAt?: string | null;
  nextStep?: string | null;
}

export interface AdminRequest {
  id: string;
  lead_id: string;
  created_by_user_id: string | null;
  created_by_email: string | null;
  assigned_admin_user_id: string | null;
  request_type: AdminRequestType;
  status: AdminRequestStatus;
  priority: AdminRequestPriority;
  summary: string | null;
  contact_person_name: string | null;
  budget_hint: string | null;
  due_at: string | null;
  next_step: string | null;
  seen_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_address: string | null;
  lead_website_status: string | null;
  lead_owner_user_id: string | null;
  lead_owner_email: string | null;
  lead_owner_display_name: string | null;
  creator_email: string | null;
  creator_display_name: string | null;
  creator_team_lead_user_id: string | null;
  creator_team_lead_email: string | null;
  creator_team_lead_display_name: string | null;
  creator_team_label: string | null;
}

export interface AdminFulfillmentSummary {
  openTotal: number;
  openWebsiteRequests: number;
  openQuoteRequests: number;
  waitingOnResearcher: number;
  overdueRequests: number;
  newRequests: number;
  latestRequests: AdminRequest[];
}

export interface Demo {
  id: string;
  lead_id: string;
  slug: string;
  template_id: string | null;
  config_json: Record<string, unknown>;
  is_published: boolean;
  published_at: string | null;
  published_by_user_id: string | null;
  unpublished_at: string | null;
  unpublished_by_user_id: string | null;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revoke_reason: string | null;
  view_count: number;
  last_viewed_at: string | null;
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
  status: "queued" | "running" | "paused" | "blocked" | "done" | "error" | "canceled" | string;
  categories: string[];
  market_id: string | null;
  selection_json: Record<string, unknown> | null;
  name: string | null;
  scope_label: string | null;
  created_by_user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  discovered_count: number;
  enriched_count: number;
  error_count: number;
  api_calls_used: number;
  last_error: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryItemSummary {
  id: string;
  name: string;
  scopeLabel: string;
  status: string;
  mode: string;
  discoveryMode: "coverage_probe" | "lead_harvest" | null;
  marketId: string | null;
  marketName: string | null;
  countryCode: CountryCode | null;
  categories: string[];
  discoveredCount: number;
  errorCount: number;
  apiCallsUsed: number;
  lastError: string | null;
  blockedReason: string | null;
  blockedAt: string | null;
  blockedErrorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
  retryWaitUnits: number;
  openUnits: number;
  runningUnits: number;
  canceledUnits: number;
  pagesFetched: number;
  rawPlacesSeen: number;
  newPlacesSeen: number;
  duplicatePlacesSeen: number;
}

export interface DiscoveryRunCandidate {
  placeId: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  websiteUri: string | null;
  mapsUri: string | null;
  categories: string[];
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  lat: number | null;
  lng: number | null;
  completenessScore: number;
  freshnessScore: number;
  verificationCoverage: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastObservedAt: string | null;
  observationCount: number;
  marketId: string | null;
  locationCellId: string | null;
  countryCode: CountryCode | null;
  queryLocationLabel: string | null;
  category: string | null;
  hasLead: boolean;
  leadId: string | null;
  leadStatus: string | null;
  leadIsExcluded: boolean;
  websiteStatusLabel: "No website" | "Website present";
  listingStatus: "Active lead" | "Excluded lead" | "Directory candidate";
}

export interface CrawlUnit {
  id: string;
  crawl_run_id: string;
  zip: string;
  market_id: string | null;
  location_cell_id: string | null;
  country_code: CountryCode | null;
  query_location_label: string | null;
  category: string;
  keyword: string | null;
  status: string;
  next_page_token: string | null;
  max_pages: number;
  pages_fetched: number;
  raw_places_seen: number;
  new_places_seen: number;
  duplicate_places_seen: number;
  budget_blocked_at: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  max_attempts: number;
  last_error_code: string | null;
  discovered_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  created_at: string;
  city: string | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CrawlProgress {
  total: number;
  done: number;
  failed: number;
  retryWait: number;
  running: number;
  pending: number;
  canceled: number;
}

export interface CrawlUnitPreview {
  id: string;
  status: string;
  zip: string;
  market_id: string | null;
  location_cell_id: string | null;
  country_code: CountryCode | null;
  query_location_label: string | null;
  city: string | null;
  county: string | null;
  category: string;
  attempt_count: number;
  discovered_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  next_page_token: string | null;
  max_pages: number;
  pages_fetched: number;
  raw_places_seen: number;
  new_places_seen: number;
  duplicate_places_seen: number;
  budget_blocked_at: string | null;
  next_retry_at: string | null;
  max_attempts: number;
  last_error_code: string | null;
  created_at: string;
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
  researcher_ai_daily_run_cap: number;
  researcher_ai_daily_budget_usd: number;
  researcher_ai_monthly_budget_usd: number;
  ai_cache_ttl_days: number;
  ai_manual_apply_required: boolean;
  ai_auto_verify_enabled: boolean;
  ai_verify_after_discovery: boolean;
  ai_reverify_after_enrichment: boolean;
  ai_verification_concurrency: number;
  ai_max_attempts: number;
  scheduler_ai_verification_enabled: boolean;
  scheduler_crawl_enabled: boolean;
  scheduler_enrichment_enabled: boolean;
  scheduler_artifact_enabled: boolean;
  scheduler_score_recompute_enabled: boolean;
  openai_api_key_configured: boolean;
  openai_api_key_source: "ui" | "env" | "none";
  google_places_api_key_configured: boolean;
  google_places_api_key_source: "ui" | "env" | "none";
  google_maps_browser_api_key_configured: boolean;
  google_maps_browser_api_key_source: "ui" | "env" | "none";
  google_text_search_monthly_cap: number;
  google_enterprise_monthly_cap: number;
  google_test_run_call_cap: number;
  google_auto_pagination_enabled: boolean;
  google_auto_pagination_min_new_candidates: number;
  google_auto_pagination_max_duplicate_rate: number;
  google_default_discovery_mode: "coverage_probe" | "lead_harvest";
  google_default_pagination_policy: "first_page_only" | "auto_yield_based" | "manual_extra_pages";
}

export interface LocationMarket {
  id: string;
  name: string;
  country_code: CountryCode;
  admin_area1: string | null;
  admin_area2: string | null;
  locality: string | null;
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
}

export interface LocationCell {
  id: string;
  market_id: string;
  market_name?: string | null;
  country_code: CountryCode;
  admin_area1: string | null;
  admin_area2: string | null;
  locality: string | null;
  postal_code: string | null;
  postal_code_normalized: string | null;
  cell_type: LocationCellType;
  cell_label: string;
  lat: number | null;
  lng: number | null;
  radius_meters: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserMarketAccess {
  user_id: string;
  market_id: string;
  market_name: string;
  country_code: CountryCode;
  admin_area1: string | null;
}

export interface PlannerMarketOption {
  id: string;
  name: string;
  country_code: CountryCode;
  admin_area1: string | null;
  locality: string | null;
  cellCount: number;
  activeCellCount: number;
}

export interface PlannerCellOption extends LocationCell {
  coverage: ZipCoverageStatus;
}

export interface MarketCoverageSummary {
  marketId: string;
  marketName: string;
  countryCode: CountryCode;
  countryLabel: string;
  adminArea1: string | null;
  totalCells: number;
  activeCells: number;
  discoveredCells: number;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
  openUnits: number;
  canceledUnits: number;
  leadsDiscovered: number;
  activeLeads: number;
  lastRunAt: string | null;
}

export interface LocationCellCoverage {
  cellId: string;
  marketId: string;
  marketName: string;
  countryCode: CountryCode;
  cellType: LocationCellType;
  cellLabel: string;
  postalCode: string | null;
  locality: string | null;
  adminArea1: string | null;
  adminArea2: string | null;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
  openUnits: number;
  canceledUnits: number;
  leadsDiscovered: number;
  activeLeads: number;
  lastRunAt: string | null;
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
  requested_by_user_id: string | null;
  request_source: string | null;
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
  requested_by_user_id?: string | null;
  request_source?: string | null;
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
  actor_user_id?: string | null;
  request_source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ActorAiUsageSummary {
  calls: number;
  cost: number;
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
  tenantId?: string;
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
  tenantId?: string;
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
  tenantId?: string;
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
  city?: string;
  zip?: string;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
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
  archived?: "active" | "archived" | "all";
  assigned?: "me" | "unassigned" | "any";
  assignedToUserId?: string;
  marketId?: string;
  countryCode?: CountryCode | string;
  locationCellId?: string;
  visibleToUserId?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface LeadMapPoint {
  id: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  website_status: string;
  business_type: BusinessType;
  rating: number | null;
  review_count: number | null;
  score: number;
  quality_bucket: QualityBucket;
  ai_verification_status: AiVerificationStatus;
  ai_checked_at: string | null;
  ai_website_viability_status: WebsiteViabilityStatus | null;
  ai_queue_status: AiQueueStatus;
  estimated_deal_value: number;
  assigned_to_user_id: string | null;
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
}

export type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";
export type SchedulerRunStatus = "running" | "processed" | "idle" | "disabled" | "budget_limit" | "error" | "interrupted";

export interface WorkerRun {
  id: string;
  worker_name: SchedulerWorkerName;
  status: SchedulerRunStatus;
  trigger_source: string;
  http_status: number | null;
  result_json: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface SchedulerWorkerHealth {
  workerName: SchedulerWorkerName;
  label: string;
  enabled: boolean;
  queueDepth: number;
  estimatedMinutesToDrain: number | null;
  lastRun: WorkerRun | null;
  errors24h: number;
  processed24h: number;
  progress: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    canceled: number;
  };
  warning: string | null;
}

export interface SchedulerHealth {
  workers: SchedulerWorkerHealth[];
  database: {
    staleClientReads: DbActivityWarning[];
  };
  auth: AuthRecoveryDiagnostics;
}

export interface LaunchReadinessItem {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  href: string;
}

export interface LaunchReadinessSummary {
  readyCount: number;
  totalCount: number;
  blockers: number;
  items: LaunchReadinessItem[];
}

export interface AuthRecoveryDiagnostics {
  appUrlConfigured: boolean;
  supabaseUrlConfigured: boolean;
  callbackUrl: string | null;
  warnings: string[];
}

export interface DbActivityWarning {
  pid: number;
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  ageSeconds: number;
  query: string;
}

export interface SchedulerStatusCounts {
  total: number;
  missing: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface SchedulerLeadBacklogSummary {
  total: number;
  active: number;
  excluded: number;
  readyToCall: number;
  brokenSiteOpportunities: number;
  needsAiVerify: number;
  needsManualReview: number;
  notFit: number;
  usableSiteFound: number;
  noSiteVerified: number;
  websiteStatus: Array<{ key: string; count: number }>;
  qualityBuckets: Array<{ key: string; count: number }>;
}

export interface SchedulerArtifactBacklogSummary {
  businessDetail: SchedulerStatusCounts;
  competitiveReport: SchedulerStatusCounts;
}

export interface SchedulerApiUsageWindow {
  calls: number;
  cost: number;
  discoveryCalls: number;
  discoveryCost: number;
  enrichmentCalls: number;
  enrichmentCost: number;
  atmosphereCalls: number;
  atmosphereCost: number;
}

export interface SchedulerOperationsSummary {
  health: SchedulerHealth;
  history: WorkerRun[];
  activeDiscovery: {
    runId: string | null;
    status: string;
    progress: CrawlProgress | null;
    geography: GeographyProgress | null;
    usage: SchedulerApiUsageWindow;
    lastError: string | null;
  };
  backlogs: {
    leads: SchedulerLeadBacklogSummary;
    aiQueue: AiQueueStats;
    enrichment: SchedulerStatusCounts;
    artifacts: SchedulerArtifactBacklogSummary;
    scores: SchedulerStatusCounts;
  };
  costs: {
    googleToday: SchedulerApiUsageWindow;
    googleMonth: SchedulerApiUsageWindow;
    googleActiveRun: SchedulerApiUsageWindow;
  };
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

export type LeadAiArtifactType = "business_detail" | "competitive_report";
export type LeadAiArtifactStatus = "queued" | "running" | "complete" | "error";

export interface LeadAiArtifact {
  id: string;
  lead_id: string;
  artifact_type: LeadAiArtifactType;
  status: LeadAiArtifactStatus;
  model: string;
  input_hash: string;
  prompt_version: string;
  content_json: Record<string, unknown>;
  sources_json: AiVerificationSource[];
  confidence: number;
  usage_input_tokens: number;
  usage_output_tokens: number;
  estimated_cost: number;
  requested_by_user_id: string | null;
  request_source: string | null;
  error: string | null;
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface LeadAiArtifactInput {
  lead_id: string;
  artifact_type: LeadAiArtifactType;
  model: string;
  input_hash: string;
  prompt_version: string;
  content_json?: Record<string, unknown>;
  sources_json?: AiVerificationSource[];
  confidence?: number;
  usage_input_tokens?: number;
  usage_output_tokens?: number;
  estimated_cost?: number;
  requested_by_user_id?: string | null;
  request_source?: string | null;
  error?: string | null;
}

export interface LeadAiArtifactBadges {
  business_detail_status: LeadAiArtifactStatus | null;
  competitive_report_status: LeadAiArtifactStatus | null;
}

export interface LeadAiFeedbackInput {
  status: "correct" | "incorrect" | "uncertain";
  correctedWebsiteUrl?: string | null;
  falsePositiveReason?: string | null;
  reviewerNotes?: string | null;
}

export type AiFeedbackKind = "verification" | "pitch";
export type AiFeedbackVerdict = "correct" | "incorrect" | "uncertain" | "useful" | "not_useful";

export interface AiFeedbackEvent {
  id: string;
  lead_id: string;
  verification_id: string | null;
  artifact_id: string | null;
  actor_user_id: string | null;
  feedback_kind: AiFeedbackKind;
  verdict: AiFeedbackVerdict;
  corrected_website_url: string | null;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface AiFeedbackEventInput {
  lead_id: string;
  verification_id?: string | null;
  artifact_id?: string | null;
  actor_user_id?: string | null;
  feedback_kind: AiFeedbackKind;
  verdict: AiFeedbackVerdict;
  corrected_website_url?: string | null;
  reason?: string | null;
  metadata_json?: Record<string, unknown>;
}

export interface AiFeedbackEvaluationSummary {
  total: number;
  verificationCorrect: number;
  verificationIncorrect: number;
  verificationUncertain: number;
  pitchUseful: number;
  pitchNotUseful: number;
}

export type ManualWebsiteCorrectionResolution =
  | "official_website_found"
  | "weak_or_basic_site"
  | "candidate_website_needs_review"
  | "social_or_directory_only"
  | "remove_website";

export interface ManualWebsiteCorrectionInput {
  websiteUrl: string | null;
  websiteStatus: WebsiteStatus;
  resolution: ManualWebsiteCorrectionResolution;
  notes?: string | null;
  actorUserId?: string | null;
}

export interface LeadFactsInput {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: WebsiteStatus | null;
  businessType?: string | null;
  primaryType?: string | null;
  status?: string | null;
  notes?: string | null;
  actorUserId?: string | null;
}

export interface QualityLead extends QueueLead {
  city: string | null;
  market_id: string | null;
  location_cell_id: string | null;
  country_code: CountryCode | null;
  locality: string | null;
  postal_code: string | null;
  enrichment_status: string;
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

export interface ResearcherWorkbenchSummary {
  myClaimed: number;
  dueToday: number;
  contactedThisWeek: number;
  bestUnclaimed: number;
}

export interface ResearcherWorkbench {
  nextAction: QueueLead | null;
  myLeads: QueueLead[];
  unclaimedLeads: QueueLead[];
  summary: ResearcherWorkbenchSummary;
}

export interface TeamBoardMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_team_lead: boolean;
  team_lead_user_id: string | null;
  team_lead_email: string | null;
  team_lead_display_name: string | null;
  team_label: string | null;
  claimed_active: number;
  due_today: number;
  stale_claimed: number;
  activity_today: number;
  contacts_today: number;
  calls_today: number;
  decision_makers_today: number;
  followups_set_today: number;
  contacts_7d: number;
  meetings: number;
  closed_won: number;
  closed_lost: number;
  website_requests_open: number;
  quote_requests_open: number;
  fulfillment_open: number;
}

export interface TeamBoardActivity {
  id: string;
  activity_type: "outreach" | "note" | "admin_request" | "audit";
  action: string;
  lead_id: string | null;
  lead_name: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_display_name: string | null;
  channel: string;
  outcome: string;
  summary: string | null;
  contact_person_name: string | null;
  contact_person_role: string | null;
  decision_maker_reached: boolean;
  objection_reason: string | null;
  quoted_amount: number;
  close_value: number;
  follow_up_at: string | null;
  next_step: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TeamBoardSummary {
  members: TeamBoardMember[];
  unassignedReady: number;
  overdueFollowUps: number;
  todayActivity: TeamBoardActivity[];
  latestActivity: TeamBoardActivity[];
}

export interface QualityFilters {
  search?: string;
  qualityBucket?: QualityBucket | string;
  businessType?: BusinessType | string;
  recommendedOffer?: RecommendedOffer | string;
  phoneVerificationStatus?: PhoneVerificationStatus | string;
  aiVerificationStatus?: AiVerificationStatus | string;
  enrichmentStatus?: string;
  countryCode?: CountryCode | string;
  marketId?: string;
  locationCellId?: string;
  city?: string;
  zip?: string;
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
  canceled: number;
  remaining: number;
  leadsFound: number;
  apiCalls: number;
  lastRunAt: string | null;
}

export type ZipScrapeStatus = "not_started" | "partial" | "complete";

export interface LeadMapZipCoverage {
  zip: string;
  city: string;
  state: string;
  county: string;
  lat: number;
  lng: number;
  leadCount: number;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
  remainingUnits: number;
  discoveredCount: number;
  lastRunAt: string | null;
  completionRatio: number;
  scrapeStatus: ZipScrapeStatus;
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
  canceled: number;
  remaining: number;
  zipCount: number;
}

export interface StateCoverageProgress {
  state: string;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  remaining: number;
  countyCount: number;
  zipCount: number;
}

export interface GeographyProgress {
  activeZipCount: number;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
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
  valueProof: {
    qualifiedNoSiteLeads: number;
    contactableLeads: number;
    costPerQualifiedLead: number | null;
    demosPublished: number;
    demoViews: number;
    demoToMeetingRate: number;
    meetings: number;
    wins: number;
    losses: number;
    blockedOrFailureRate: number;
    blockedRuns: number;
    failedUnits: number;
    totalUnits: number;
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
      if (shouldRunRuntimePostgresRepairs()) {
        await ensureRuntimePostgresRepairs();
      }
      if (shouldSeedZipCodesAtRuntime()) {
        await seedZipCodes();
      }
      if (shouldRunRuntimeGeographyBackfill()) {
        await ensureGeographyBackfill();
      }
    })();
  }
  const pending = dbReadyPromise;
  try {
    await pending;
  } catch (error) {
    if (dbReadyPromise === pending) {
      dbReadyPromise = null;
    }
    throw error;
  }
}

function shouldRunRuntimePostgresRepairs(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim()) && process.env.NOSITE_RUNTIME_POSTGRES_REPAIR === "1";
}

function shouldSeedZipCodesAtRuntime(): boolean {
  return !process.env.DATABASE_URL?.trim() || process.env.NOSITE_RUNTIME_ZIP_SEED === "1";
}

export function shouldRunRuntimeGeographyBackfillForEnv(databaseUrl?: string, runtimeBackfillFlag?: string): boolean {
  return !databaseUrl?.trim() || runtimeBackfillFlag === "1";
}

function shouldRunRuntimeGeographyBackfill(): boolean {
  return shouldRunRuntimeGeographyBackfillForEnv(
    process.env.DATABASE_URL,
    process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL,
  );
}

async function ensureRuntimePostgresRepairs(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  const db = await getDb();
  const statements = [
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0",
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS last_error text",
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS next_retry_at timestamptz",
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3",
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS request_source text",
    "ALTER TABLE ai_lead_verifications ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE ai_lead_verifications ADD COLUMN IF NOT EXISTS request_source text",
    "ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS request_source text",
    "ALTER TABLE settings ADD COLUMN IF NOT EXISTS researcher_ai_daily_run_cap integer NOT NULL DEFAULT 10",
    "ALTER TABLE settings ADD COLUMN IF NOT EXISTS researcher_ai_daily_budget_usd double precision NOT NULL DEFAULT 2.0",
    "ALTER TABLE settings ADD COLUMN IF NOT EXISTS researcher_ai_monthly_budget_usd double precision NOT NULL DEFAULT 25.0",
    "ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS blocked_reason text",
    "ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS blocked_at timestamptz",
    "ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS blocked_error_code text",
    "ALTER TABLE crawl_units ADD COLUMN IF NOT EXISTS next_retry_at timestamptz",
    "ALTER TABLE crawl_units ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3",
    "ALTER TABLE crawl_units ADD COLUMN IF NOT EXISTS last_error_code text",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS actor_email text",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS contact_person_name text",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS contact_person_role text",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS decision_maker_reached integer NOT NULL DEFAULT 0",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'contacted'",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS objection_reason text",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS quoted_amount double precision NOT NULL DEFAULT 0",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS close_value double precision NOT NULL DEFAULT 0",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS follow_up_at timestamptz",
    "ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS next_step text",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email text",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role app_role",
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_team_lead integer NOT NULL DEFAULT 0 CHECK (is_team_lead IN (0, 1))",
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS team_lead_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS team_label text",
    `CREATE TABLE IF NOT EXISTS lead_notes (
      id text PRIMARY KEY,
      lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )`,
    `CREATE TABLE IF NOT EXISTS admin_requests (
      id text PRIMARY KEY,
      lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_by_email text,
      assigned_admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      request_type text NOT NULL CHECK (request_type IN ('website_request','quote_request')),
      status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','in_progress','waiting_on_researcher','done','cancelled')),
      priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),
      summary text,
      contact_person_name text,
      budget_hint text,
      due_at timestamptz,
      next_step text,
      seen_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS ai_feedback_events (
      id text PRIMARY KEY,
      lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      verification_id text REFERENCES ai_lead_verifications(id) ON DELETE SET NULL,
      artifact_id text REFERENCES lead_ai_artifacts(id) ON DELETE SET NULL,
      actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      feedback_kind text NOT NULL CHECK (feedback_kind IN ('verification','pitch')),
      verdict text NOT NULL CHECK (verdict IN ('correct','incorrect','uncertain','useful','not_useful')),
      corrected_website_url text,
      reason text,
      metadata_json text NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user ON leads(assigned_to_user_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_outreach_events_actor_created ON outreach_events(actor_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_actor_created ON ai_usage_events(actor_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_lead_created ON ai_feedback_events(lead_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_actor_created ON ai_feedback_events(actor_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_kind_verdict ON ai_feedback_events(feedback_kind, verdict, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_lead_notes_author_created ON lead_notes(author_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_app_users_team_lead ON app_users(team_lead_user_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_admin_requests_status_type_created ON admin_requests(status, request_type, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_admin_requests_lead_created ON admin_requests(lead_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_admin_requests_creator_created ON admin_requests(created_by_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned_created ON admin_requests(assigned_admin_user_id, created_at DESC)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_open_unique ON admin_requests(lead_id, request_type) WHERE status IN ('new','seen','in_progress','waiting_on_researcher')",
    "ALTER TABLE IF EXISTS lead_notes ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE IF EXISTS admin_requests ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE IF EXISTS ai_feedback_events ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE lead_notes, admin_requests, ai_feedback_events FROM anon, authenticated",
    "CREATE INDEX IF NOT EXISTS idx_leads_score_recompute_stale ON leads(updated_at DESC, last_quality_scored_at)",
  ];

  for (const statement of statements) {
    try {
      await db.exec(statement);
    } catch (error) {
      console.error("Runtime Postgres schema repair failed", error);
      throw error;
    }
  }
}

export async function repairAiWebsiteFindingConsistency(limit = 500, signal?: AbortSignal): Promise<number> {
  throwIfWorkerAborted(signal);
  const { tenantId } = requireTenantWideScoreContext();
  const db = await getDb();
  throwIfWorkerAborted(signal);
  const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 500;
  const safeLimit = Math.max(1, Math.min(1000, normalizedLimit));
  const rows = await db.prepare(
    `SELECT id
     FROM leads
     WHERE tenant_id = ? AND ((
       ai_verification_status = 'site_found'
       AND ai_website_viability_status = 'usable'
       AND COALESCE(ai_found_website_url, '') != ''
       AND (
         website_status != 'custom'
         OR COALESCE(website_uri, '') != ai_found_website_url
         OR qualification_status != 'disqualified'
         OR quality_bucket != 'not_a_fit'
         OR score != 0
         OR lead_quality_score != 0
         OR raw_opportunity_score != 0
         OR verification_score != 0
         OR sales_priority_score != 0
       )
     ) OR (
       ai_verification_status = 'weak_site_found'
       AND ai_website_viability_status IN ('broken', 'parked', 'placeholder')
       AND COALESCE(ai_found_website_url, '') != ''
       AND website_status != 'custom'
       AND (
         website_status != 'basic'
         OR COALESCE(website_uri, '') != ai_found_website_url
         OR quality_bucket = 'needs_ai_verify'
       )
     ))
     ORDER BY updated_at ASC
     LIMIT ?`
  ).all(tenantId, safeLimit) as Array<{ id: string }>;
  throwIfWorkerAborted(signal);

  if (rows.length === 0) return 0;

  const timestamp = nowISO();
  const update = await db.prepare(
    `UPDATE leads SET
       website_uri = CASE
         WHEN (ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable')
           OR (ai_verification_status = 'weak_site_found' AND ai_website_viability_status IN ('broken', 'parked', 'placeholder'))
         THEN ai_found_website_url
         ELSE website_uri
       END,
       website_status = CASE
         WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 'custom'
         WHEN ai_verification_status = 'weak_site_found'
           AND ai_website_viability_status IN ('broken', 'parked', 'placeholder')
           AND website_status != 'custom' THEN 'basic'
         ELSE website_status
       END,
       qualification_status = CASE
         WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 'disqualified'
         ELSE qualification_status
       END,
       disqualification_reason = CASE
         WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 'AI found existing usable website'
         ELSE disqualification_reason
       END,
       score = CASE
         WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 0
         ELSE score
       END,
       win_probability_score = CASE
         WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 0
         ELSE win_probability_score
       END,
       updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  );

  let repaired = 0;
  for (const row of rows) {
    throwIfWorkerAborted(signal);
    const result = await update.run(timestamp, tenantId, row.id);
    if (result.changes === 0) continue;
    throwIfWorkerAborted(signal);
    await updateLeadQualityScores(row.id);
    repaired += 1;
    throwIfWorkerAborted(signal);
  }

  return repaired;
}

// ─── Settings ───

function parseSettingsRow(row: Record<string, unknown>): Settings {
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
    researcher_ai_daily_run_cap: Math.max(1, Math.floor((row.researcher_ai_daily_run_cap as number) ?? 10)),
    researcher_ai_daily_budget_usd: Math.max(0.01, Number((row.researcher_ai_daily_budget_usd as number) ?? 2.0)),
    researcher_ai_monthly_budget_usd: Math.max(0.01, Number((row.researcher_ai_monthly_budget_usd as number) ?? 25.0)),
    ai_cache_ttl_days: (row.ai_cache_ttl_days as number) ?? 30,
    ai_manual_apply_required: ((row.ai_manual_apply_required as number) ?? 1) === 1,
    ai_auto_verify_enabled: ((row.ai_auto_verify_enabled as number) ?? 1) === 1,
    ai_verify_after_discovery: ((row.ai_verify_after_discovery as number) ?? 1) === 1,
    ai_reverify_after_enrichment: ((row.ai_reverify_after_enrichment as number) ?? 1) === 1,
    ai_verification_concurrency: Math.max(1, Math.min(5, Math.floor((row.ai_verification_concurrency as number) ?? 1))),
    ai_max_attempts: Math.max(1, Math.min(10, Math.floor((row.ai_max_attempts as number) ?? 3))),
    scheduler_ai_verification_enabled: ((row.scheduler_ai_verification_enabled as number) ?? 1) === 1,
    scheduler_crawl_enabled: ((row.scheduler_crawl_enabled as number) ?? 1) === 1,
    scheduler_enrichment_enabled: ((row.scheduler_enrichment_enabled as number) ?? 1) === 1,
    scheduler_artifact_enabled: ((row.scheduler_artifact_enabled as number) ?? 1) === 1,
    scheduler_score_recompute_enabled: ((row.scheduler_score_recompute_enabled as number) ?? 1) === 1,
    openai_api_key_configured: !!row.openai_api_key_encrypted || !!process.env.OPENAI_API_KEY,
    openai_api_key_source: row.openai_api_key_encrypted ? "ui" : process.env.OPENAI_API_KEY ? "env" : "none",
    google_places_api_key_configured: !!row.google_places_api_key_encrypted || !!process.env.GOOGLE_PLACES_API_KEY,
    google_places_api_key_source: row.google_places_api_key_encrypted ? "ui" : process.env.GOOGLE_PLACES_API_KEY ? "env" : "none",
    google_maps_browser_api_key_configured: !!row.google_maps_browser_api_key_encrypted || !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
    google_maps_browser_api_key_source: row.google_maps_browser_api_key_encrypted ? "ui" : process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ? "env" : "none",
    google_text_search_monthly_cap: Math.max(1, Math.floor((row.google_text_search_monthly_cap as number) ?? 4900)),
    google_enterprise_monthly_cap: Math.max(1, Math.floor((row.google_enterprise_monthly_cap as number) ?? 900)),
    google_test_run_call_cap: Math.max(1, Math.floor((row.google_test_run_call_cap as number) ?? 50)),
    google_auto_pagination_enabled: ((row.google_auto_pagination_enabled as number) ?? 1) === 1,
    google_auto_pagination_min_new_candidates: Math.max(1, Math.floor((row.google_auto_pagination_min_new_candidates as number) ?? 6)),
    google_auto_pagination_max_duplicate_rate: Math.max(0, Math.min(1, Number((row.google_auto_pagination_max_duplicate_rate as number) ?? 0.6))),
    google_default_discovery_mode: row.google_default_discovery_mode === "lead_harvest" ? "lead_harvest" : "coverage_probe",
    google_default_pagination_policy:
      row.google_default_pagination_policy === "first_page_only"
        ? "first_page_only"
        : row.google_default_pagination_policy === "manual_extra_pages"
          ? "manual_extra_pages"
          : "auto_yield_based",
  };
}

export async function getTenantScoreRecomputeSettings(): Promise<Settings> {
  const { tenantId } = requireTenantWideScoreContext();
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM settings WHERE tenant_id = ?").get(tenantId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Tenant score settings are unavailable");
  return parseSettingsRow(row);
}

export async function getSettings(): Promise<Settings>{
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) throw new Error("Conflicting settings tenant contexts.");
  const isExactScoreRecomputeWorker = workerContext?.workerName === "score_recompute" &&
    workerContext.action === "score_recompute:recompute";
  if (isExactScoreRecomputeWorker) {
    return getTenantScoreRecomputeSettings();
  }
  if (workerContext?.workerName === "score_recompute" || workerContext?.action === "score_recompute:recompute") {
    throw new Error("Exact score recompute worker context is required.");
  }
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, unknown> | undefined;
  if (!row) throw new Error("Settings are unavailable");
  return parseSettingsRow(row);
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
  if (settings.search_radius_km !== undefined) {
    updates.push("search_radius_km = ?");
    values.push(settings.search_radius_km);
  }
  if (settings.enrichment_enabled !== undefined) {
    updates.push("enrichment_enabled = ?");
    values.push(settings.enrichment_enabled ? 1 : 0);
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
  if (settings.ai_enabled !== undefined) {
    updates.push("ai_enabled = ?");
    values.push(settings.ai_enabled ? 1 : 0);
  }
  if (settings.ai_model !== undefined) {
    updates.push("ai_model = ?");
    values.push(assertAllowedOpenAIModel(settings.ai_model));
  }
  if (settings.ai_batch_limit !== undefined) {
    updates.push("ai_batch_limit = ?");
    values.push(Math.max(1, Math.min(100, Math.floor(settings.ai_batch_limit))));
  }
  if (settings.researcher_ai_daily_run_cap !== undefined) {
    updates.push("researcher_ai_daily_run_cap = ?");
    values.push(Math.max(1, Math.min(100, Math.floor(settings.researcher_ai_daily_run_cap))));
  }
  if (settings.researcher_ai_daily_budget_usd !== undefined) {
    updates.push("researcher_ai_daily_budget_usd = ?");
    values.push(Math.max(0.01, settings.researcher_ai_daily_budget_usd));
  }
  if (settings.researcher_ai_monthly_budget_usd !== undefined) {
    updates.push("researcher_ai_monthly_budget_usd = ?");
    values.push(Math.max(0.01, settings.researcher_ai_monthly_budget_usd));
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
  if (settings.scheduler_ai_verification_enabled !== undefined) {
    updates.push("scheduler_ai_verification_enabled = ?");
    values.push(settings.scheduler_ai_verification_enabled ? 1 : 0);
  }
  if (settings.scheduler_crawl_enabled !== undefined) {
    updates.push("scheduler_crawl_enabled = ?");
    values.push(settings.scheduler_crawl_enabled ? 1 : 0);
  }
  if (settings.scheduler_enrichment_enabled !== undefined) {
    updates.push("scheduler_enrichment_enabled = ?");
    values.push(settings.scheduler_enrichment_enabled ? 1 : 0);
  }
  if (settings.scheduler_artifact_enabled !== undefined) {
    updates.push("scheduler_artifact_enabled = ?");
    values.push(settings.scheduler_artifact_enabled ? 1 : 0);
  }
  if (settings.scheduler_score_recompute_enabled !== undefined) {
    updates.push("scheduler_score_recompute_enabled = ?");
    values.push(settings.scheduler_score_recompute_enabled ? 1 : 0);
  }
  if (settings.google_auto_pagination_enabled !== undefined) {
    updates.push("google_auto_pagination_enabled = ?");
    values.push(settings.google_auto_pagination_enabled ? 1 : 0);
  }
  if (settings.google_auto_pagination_min_new_candidates !== undefined) {
    updates.push("google_auto_pagination_min_new_candidates = ?");
    values.push(Math.max(1, Math.floor(settings.google_auto_pagination_min_new_candidates)));
  }
  if (settings.google_auto_pagination_max_duplicate_rate !== undefined) {
    updates.push("google_auto_pagination_max_duplicate_rate = ?");
    values.push(Math.max(0, Math.min(1, settings.google_auto_pagination_max_duplicate_rate)));
  }
  if (settings.google_test_run_call_cap !== undefined) {
    updates.push("google_test_run_call_cap = ?");
    values.push(Math.max(1, Math.floor(settings.google_test_run_call_cap)));
  }
  if (settings.google_text_search_monthly_cap !== undefined) {
    updates.push("google_text_search_monthly_cap = ?");
    values.push(Math.max(1, Math.floor(settings.google_text_search_monthly_cap)));
  }
  if (settings.google_enterprise_monthly_cap !== undefined) {
    updates.push("google_enterprise_monthly_cap = ?");
    values.push(Math.max(1, Math.floor(settings.google_enterprise_monthly_cap)));
  }
  if (settings.google_default_discovery_mode !== undefined) {
    updates.push("google_default_discovery_mode = ?");
    values.push(settings.google_default_discovery_mode === "lead_harvest" ? "lead_harvest" : "coverage_probe");
  }
  if (settings.google_default_pagination_policy !== undefined) {
    updates.push("google_default_pagination_policy = ?");
    values.push(
      settings.google_default_pagination_policy === "first_page_only" || settings.google_default_pagination_policy === "manual_extra_pages"
        ? settings.google_default_pagination_policy
        : "auto_yield_based",
    );
  }
  if (
    "openai_api_key_configured" in settings ||
    "openai_api_key_source" in settings ||
    "google_places_api_key_configured" in settings ||
    "google_places_api_key_source" in settings ||
    "google_maps_browser_api_key_configured" in settings ||
    "google_maps_browser_api_key_source" in settings
  ) {
    // API keys are managed through dedicated secret actions, never by the generic settings save.
  }

  if (updates.length === 0) return;

  updates.push("updated_at = ?");
  values.push(nowISO());

  await db.prepare(`UPDATE settings SET ${updates.join(", ")} WHERE id = 1`).run(...values);
}

export function isSchedulerWorkerEnabled(settings: Settings, workerName: SchedulerWorkerName): boolean {
  if (workerName === "ai_verification") return settings.scheduler_ai_verification_enabled;
  if (workerName === "crawl") return settings.scheduler_crawl_enabled;
  if (workerName === "enrichment") return settings.scheduler_enrichment_enabled;
  if (workerName === "artifact") return settings.scheduler_artifact_enabled;
  return settings.scheduler_score_recompute_enabled;
}

const STALE_WORKER_RUN_ERROR = "Worker run interrupted or timed out before completion.";

export async function startWorkerRun(workerName: SchedulerWorkerName, triggerSource: string): Promise<WorkerRun> {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO worker_runs (id, worker_name, status, trigger_source, started_at, created_at)
     VALUES (?, ?, 'running', ?, ?, ?)`
  ).run(id, workerName, triggerSource, now, now);
  const run = await getWorkerRunById(id);
  if (!run) throw new Error("Unable to create worker run.");
  return run;
}

export async function completeWorkerRun(
  id: string,
  status: SchedulerRunStatus,
  result: Record<string, unknown>,
  httpStatus = 200,
  error?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.prepare(
    `UPDATE worker_runs
     SET status = ?, http_status = ?, result_json = ?, error = ?, completed_at = ?
     WHERE id = ?`
  ).run(status, httpStatus, JSON.stringify(result), error ?? null, nowISO(), id);
}

export async function markStaleWorkerRunsInterrupted(ttlMinutes = 15, batchSize = 25): Promise<number> {
  const db = await getDb();
  const safeTtlMinutes = Math.max(1, Math.min(24 * 60, Math.floor(ttlMinutes)));
  const safeBatchSize = Math.max(1, Math.min(100, Math.floor(batchSize)));
  const cutoff = new Date(Date.now() - safeTtlMinutes * 60 * 1000).toISOString();
  const completedAt = nowISO();
  const resultJson = JSON.stringify({ status: "interrupted", error: STALE_WORKER_RUN_ERROR, ttlMinutes: safeTtlMinutes });

  if (process.env.DATABASE_URL?.trim()) {
    const result = await db.prepare(
      `WITH stale AS (
         SELECT id
         FROM worker_runs
         WHERE status = 'running'
           AND started_at < ?
         ORDER BY started_at ASC
         LIMIT ?
         FOR UPDATE SKIP LOCKED
       )
       UPDATE worker_runs
       SET status = 'interrupted',
           http_status = COALESCE(http_status, 599),
           result_json = ?,
           error = COALESCE(error, ?),
           completed_at = ?
       WHERE id IN (SELECT id FROM stale)`
    ).run(cutoff, safeBatchSize, resultJson, STALE_WORKER_RUN_ERROR, completedAt);
    return result.changes;
  }

  const result = await db.prepare(
    `UPDATE worker_runs
     SET status = 'interrupted',
         http_status = COALESCE(http_status, 599),
         result_json = ?,
         error = COALESCE(error, ?),
         completed_at = ?
     WHERE status = 'running'
       AND started_at < ?
       AND id IN (
         SELECT id
         FROM worker_runs
         WHERE status = 'running'
           AND started_at < ?
         ORDER BY started_at ASC
         LIMIT ?
       )`
  ).run(resultJson, STALE_WORKER_RUN_ERROR, completedAt, cutoff, cutoff, safeBatchSize);
  return result.changes;
}

export async function getWorkerRunById(id: string): Promise<WorkerRun | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM worker_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseWorkerRunRow(row) : null;
}

export async function getSchedulerHealth(): Promise<SchedulerHealth> {
  try {
    return await getSchedulerHealthInternal();
  } catch (err) {
    console.error("Failed to build scheduler health", err);
    const message = err instanceof Error ? err.message : "Scheduler health is temporarily unavailable.";
    return buildSchedulerHealthFallback(message);
  }
}

async function getSchedulerHealthInternal(): Promise<SchedulerHealth> {
  await markStaleWorkerRunsInterrupted();
  const settings = await getSettings();
  const aiQueue = await getAiQueueStats();
  const staleClientReads = await getStaleClientReadQueries(60);
  const db = await getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const activeRun = await getActiveCrawlRun();
  const crawlProgress = activeRun ? await getCrawlProgress(activeRun.id) : null;
  const enrichmentStatusRows = await db.prepare(
    `SELECT enrichment_status as status, COUNT(*) as count
     FROM leads
     WHERE score > 0 AND COALESCE(is_excluded, 0) = 0 AND archived_at IS NULL
     GROUP BY enrichment_status`
  ).all() as Array<{ status: string; count: number }>;
  const artifactStatusRows = await db.prepare(
    `SELECT status, COUNT(*) as count
     FROM lead_ai_artifacts
     GROUP BY status`
  ).all() as Array<{ status: string; count: number }>;
  const enrichmentRow = await db.prepare(
    "SELECT COUNT(*) as count FROM leads WHERE enrichment_status = 'pending' AND score > 0 AND COALESCE(is_excluded, 0) = 0 AND archived_at IS NULL"
  ).get() as { count: number };
  const artifactRow = await db.prepare(
    "SELECT COUNT(*) as count FROM lead_ai_artifacts WHERE status IN ('queued','running')"
  ).get() as { count: number };
  const staleScoreRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
     WHERE archived_at IS NULL
       AND (last_quality_scored_at IS NULL OR julianday(updated_at) > julianday(last_quality_scored_at))`
  ).get() as { count: number };
  const workers: Array<{ workerName: SchedulerWorkerName; label: string; queueDepth: number; cadenceMinutes: number }> =
    SCHEDULER_WORKER_METADATA.map((worker) => ({
      workerName: worker.workerName,
      label: worker.label,
      cadenceMinutes: worker.cadenceMinutes,
      queueDepth:
        worker.workerName === "ai_verification" ? aiQueue.queued + aiQueue.running :
        worker.workerName === "crawl" ? (crawlProgress ? crawlProgress.pending + crawlProgress.running : 0) :
        worker.workerName === "enrichment" ? Number(enrichmentRow.count ?? 0) :
        worker.workerName === "artifact" ? Number(artifactRow.count ?? 0) :
        Number(staleScoreRow.count ?? 0),
    }));
  const progressByWorker: Record<SchedulerWorkerName, SchedulerWorkerHealth["progress"]> = {
    ai_verification: {
      total: aiQueue.total,
      pending: aiQueue.queued,
      running: aiQueue.running,
      completed: aiQueue.verified,
      failed: aiQueue.error,
      canceled: 0,
    },
    crawl: {
      total: crawlProgress?.total ?? 0,
      pending: crawlProgress?.pending ?? 0,
      running: crawlProgress?.running ?? 0,
      completed: crawlProgress?.done ?? 0,
      failed: crawlProgress?.failed ?? 0,
      canceled: crawlProgress?.canceled ?? 0,
    },
    enrichment: {
      total: sumStatusCounts(enrichmentStatusRows),
      pending: getStatusCount(enrichmentStatusRows, "pending"),
      running: 0,
      completed: getStatusCount(enrichmentStatusRows, "enriched") + getStatusCount(enrichmentStatusRows, "skipped"),
      failed: 0,
      canceled: 0,
    },
    artifact: {
      total: sumStatusCounts(artifactStatusRows),
      pending: getStatusCount(artifactStatusRows, "queued"),
      running: getStatusCount(artifactStatusRows, "running"),
      completed: getStatusCount(artifactStatusRows, "complete"),
      failed: getStatusCount(artifactStatusRows, "error"),
      canceled: 0,
    },
    score_recompute: {
      total: Number(staleScoreRow.count ?? 0),
      pending: Number(staleScoreRow.count ?? 0),
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
    },
  };

  const healthWorkers: SchedulerWorkerHealth[] = [];
  for (const worker of workers) {
    const [lastRun, errorRow, processedRow] = await Promise.all([
      getLatestWorkerRun(worker.workerName),
      db.prepare(
        `SELECT COUNT(*) as count
         FROM worker_runs
         WHERE worker_name = ? AND status IN ('error','budget_limit','interrupted') AND started_at >= datetime(?)`
      ).get(worker.workerName, since24h) as Promise<{ count: number }>,
      db.prepare(
        `SELECT COUNT(*) as count
         FROM worker_runs
         WHERE worker_name = ? AND status = 'processed' AND started_at >= datetime(?)`
      ).get(worker.workerName, since24h) as Promise<{ count: number }>,
    ]);
    const enabled = isSchedulerWorkerEnabled(settings, worker.workerName);
    const warning = buildSchedulerWarning(worker.workerName, enabled, lastRun, Number(errorRow.count ?? 0), settings);
    healthWorkers.push({
      ...worker,
      enabled,
      estimatedMinutesToDrain: worker.queueDepth > 0 ? worker.queueDepth * worker.cadenceMinutes : null,
      lastRun,
      errors24h: Number(errorRow.count ?? 0),
      processed24h: Number(processedRow.count ?? 0),
      progress: progressByWorker[worker.workerName],
      warning,
    });
  }

  return {
    workers: healthWorkers,
    database: {
      staleClientReads,
    },
    auth: buildAuthRecoveryDiagnostics(),
  };
}

export function buildSchedulerHealthFallback(error: string): SchedulerHealth {
  return {
    workers: SCHEDULER_WORKER_METADATA.map((worker) => ({
      workerName: worker.workerName,
      label: worker.label,
      enabled: false,
      queueDepth: 0,
      estimatedMinutesToDrain: null,
      lastRun: null,
      errors24h: 0,
      processed24h: 0,
      progress: {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        canceled: 0,
      },
      warning: `Scheduler health unavailable: ${error}`,
    })),
    database: {
      staleClientReads: [],
    },
    auth: buildAuthRecoveryDiagnostics(),
  };
}

function buildAuthRecoveryDiagnostics(): AuthRecoveryDiagnostics {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
  const appUrl = resolveCanonicalAppUrl(null);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const warnings: string[] = [];

  if (!configuredAppUrl) {
    warnings.push("NEXT_PUBLIC_APP_URL is missing. Auth emails will fall back to https://www.nosite.xyz.");
  } else if (configuredAppUrl !== appUrl) {
    warnings.push(`NEXT_PUBLIC_APP_URL is ${configuredAppUrl}; auth email fallback is ${appUrl}.`);
  }
  if (!supabaseUrl) {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL is missing. Supabase Auth cannot validate sessions.");
  }

  return {
    appUrlConfigured: Boolean(configuredAppUrl),
    supabaseUrlConfigured: Boolean(supabaseUrl),
    callbackUrl: `${appUrl}/auth/callback`,
    warnings,
  };
}

export async function getStaleClientReadQueries(thresholdSeconds = 60): Promise<DbActivityWarning[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  const safeThreshold = Math.max(1, Math.min(3600, Math.floor(thresholdSeconds)));
  try {
    const db = await getDb();
    const rows = await db.prepare(
      `SELECT
         pid,
         state,
         wait_event_type as "waitEventType",
         wait_event as "waitEvent",
         EXTRACT(EPOCH FROM (now() - query_start)) as "ageSeconds",
         LEFT(query, 500) as query
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND state = 'active'
         AND wait_event = 'ClientRead'
         AND query_start IS NOT NULL
         AND query_start < now() - (?::int * interval '1 second')
       ORDER BY query_start ASC
       LIMIT 20`
    ).all(safeThreshold) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      pid: Number(row.pid ?? 0),
      state: String(row.state ?? "active"),
      waitEventType: (row.waitEventType as string | null) ?? (row.wait_event_type as string | null) ?? null,
      waitEvent: (row.waitEvent as string | null) ?? (row.wait_event as string | null) ?? null,
      ageSeconds: Number(row.ageSeconds ?? row.age_seconds ?? 0),
      query: String(row.query ?? ""),
    }));
  } catch (error) {
    console.error("Failed to inspect pg_stat_activity", error);
    return [];
  }
}

async function getLatestWorkerRun(workerName: SchedulerWorkerName): Promise<WorkerRun | null> {
  const db = await getDb();
  const row = await db.prepare(
    "SELECT * FROM worker_runs WHERE worker_name = ? ORDER BY started_at DESC LIMIT 1"
  ).get(workerName) as Record<string, unknown> | undefined;
  return row ? parseWorkerRunRow(row) : null;
}

export async function getWorkerRunHistory(limit = 50, workerName?: SchedulerWorkerName): Promise<WorkerRun[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const metadata = workerName ? getSchedulerWorkerMetadata(workerName) : null;
  const rows = metadata
    ? await db.prepare(
        `SELECT *
         FROM worker_runs
         WHERE worker_name = ?
         ORDER BY started_at DESC
         LIMIT ?`
      ).all(metadata.workerName, safeLimit) as Array<Record<string, unknown>>
    : await db.prepare(
        `SELECT *
         FROM worker_runs
         ORDER BY started_at DESC
         LIMIT ?`
      ).all(safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseWorkerRunRow);
}

function parseWorkerRunRow(row: Record<string, unknown>): WorkerRun {
  return {
    id: String(row.id),
    worker_name: normalizeSchedulerWorkerName(row.worker_name),
    status: normalizeSchedulerRunStatus(row.status),
    trigger_source: String(row.trigger_source ?? "unknown"),
    http_status: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
    result_json: safeParseJson<Record<string, unknown>>(row.result_json, {}),
    error: (row.error as string | null) ?? null,
    started_at: String(row.started_at),
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function normalizeSchedulerWorkerName(value: unknown): SchedulerWorkerName {
  if (value === "crawl" || value === "enrichment" || value === "artifact" || value === "score_recompute") return value;
  return "ai_verification";
}

function normalizeSchedulerRunStatus(value: unknown): SchedulerRunStatus {
  if (value === "processed" || value === "idle" || value === "disabled" || value === "budget_limit" || value === "interrupted" || value === "error") return value;
  return "running";
}

function buildSchedulerWarning(
  workerName: SchedulerWorkerName,
  enabled: boolean,
  lastRun: WorkerRun | null,
  errors24h: number,
  settings: Settings,
): string | null {
  if (!enabled) return "Paused in Scheduler Settings. Supabase Cron may still call this endpoint, but the worker skips work until you click Resume.";
  if (workerName === "ai_verification" && !settings.ai_enabled) return "AI is disabled in Settings.";
  if ((workerName === "ai_verification" || workerName === "artifact") && !settings.openai_api_key_configured) return "OpenAI API key is missing.";
  if ((workerName === "crawl" || workerName === "enrichment") && !settings.google_places_api_key_configured) return "Google Places API key is missing.";
  if (!lastRun) return "No worker run recorded yet.";
  if (lastRun.status === "error" || lastRun.status === "budget_limit" || lastRun.status === "interrupted") {
    if (lastRun.error?.includes("Worker exceeded internal timeout")) return "Last worker hit the internal timeout before Vercel could kill the function.";
    if (/statement timeout/i.test(lastRun.error ?? "")) return "Last worker hit the database statement timeout.";
    return lastRun.error ?? "Last worker run failed.";
  }
  if (errors24h > 0) return `${errors24h} worker errors in the last 24 hours.`;
  return null;
}

function getStatusCount(rows: Array<{ status: string; count: number }>, status: string): number {
  return Number(rows.find((row) => row.status === status)?.count ?? 0);
}

function sumStatusCounts(rows: Array<{ status: string; count: number }>): number {
  return rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
}

export async function getSchedulerOperationsSummary(): Promise<SchedulerOperationsSummary> {
  try {
    return await getSchedulerOperationsSummaryInternal();
  } catch (err) {
    console.error("Failed to build scheduler operations summary", err);
    const message = err instanceof Error ? err.message : "Scheduler operations are temporarily unavailable.";
    return buildSchedulerOperationsFallback(message);
  }
}

async function getSchedulerOperationsSummaryInternal(): Promise<SchedulerOperationsSummary> {
  const [health, history, dashboardStats] = await Promise.all([
    getSchedulerHealth(),
    getWorkerRunHistory(50),
    getDashboardStats(),
  ]);
  const activeRun = await getActiveCrawlRun();
  const activeRunUsage = activeRun ? await getPlatformRunApiUsageSummary(activeRun.id) : emptyApiUsageSummary();
  const activeRunLastError = activeRun ? await getPlatformRunLastError(activeRun.id) : null;
  const [todayUsage, monthUsage, leadBacklog, enrichmentBacklog, artifactBacklog, scoreBacklog] = await Promise.all([
    getApiUsageSummarySince(startOfToday()),
    getPlatformMonthlyApiUsageSummary(),
    getSchedulerLeadBacklogSummary(),
    getSchedulerEnrichmentBacklogSummary(),
    getSchedulerArtifactBacklogSummary(),
    getSchedulerScoreBacklogSummary(),
  ]);

  return {
    health,
    history,
    activeDiscovery: {
      runId: activeRun?.id ?? null,
      status: activeRun?.status ?? "idle",
      progress: dashboardStats.progress,
      geography: activeRun ? {
        activeZipCount: dashboardStats.activeZipCount,
        zipCodesSelected: dashboardStats.zipCodesSelected,
        zipCodesCompleted: dashboardStats.zipCodesCompleted,
        zipCodesStarted: dashboardStats.zipCodesStarted,
        zipCodesNotStarted: dashboardStats.zipCodesNotStarted,
        zipCodesCanceled: dashboardStats.zipCodesCanceled,
        zipCodesNotSelected: dashboardStats.zipCodesNotSelected,
        countiesSelected: dashboardStats.countiesSelected,
        countiesCompleted: dashboardStats.countiesCompleted,
      } : null,
      usage: toSchedulerApiUsageWindow(activeRunUsage),
      lastError: activeRunLastError,
    },
    backlogs: {
      leads: leadBacklog,
      aiQueue: dashboardStats.aiQueueStats,
      enrichment: enrichmentBacklog,
      artifacts: artifactBacklog,
      scores: scoreBacklog,
    },
    costs: {
      googleToday: toSchedulerApiUsageWindow(todayUsage),
      googleMonth: toSchedulerApiUsageWindow(monthUsage),
      googleActiveRun: toSchedulerApiUsageWindow(activeRunUsage),
    },
  };
}

export function buildSchedulerOperationsFallback(error: string): SchedulerOperationsSummary {
  const health = buildSchedulerHealthFallback(error);
  const emptyUsage = toSchedulerApiUsageWindow(emptyApiUsageSummary());
  const emptyCounts = emptySchedulerStatusCounts();
  return {
    health,
    history: [],
    activeDiscovery: {
      runId: null,
      status: "unavailable",
      progress: null,
      geography: null,
      usage: emptyUsage,
      lastError: error,
    },
    backlogs: {
      leads: {
        total: 0,
        active: 0,
        excluded: 0,
        readyToCall: 0,
        brokenSiteOpportunities: 0,
        needsAiVerify: 0,
        needsManualReview: 0,
        notFit: 0,
        usableSiteFound: 0,
        noSiteVerified: 0,
        websiteStatus: [],
        qualityBuckets: [],
      },
      aiQueue: { notChecked: 0, queued: 0, running: 0, verified: 0, error: 0, total: 0 },
      enrichment: emptyCounts,
      artifacts: {
        businessDetail: emptyCounts,
        competitiveReport: emptyCounts,
      },
      scores: emptyCounts,
    },
    costs: {
      googleToday: emptyUsage,
      googleMonth: emptyUsage,
      googleActiveRun: emptyUsage,
    },
  };
}

async function getSchedulerLeadBacklogSummary(): Promise<SchedulerLeadBacklogSummary> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT
       COUNT(*) as total,
       COALESCE(SUM(CASE WHEN COALESCE(is_excluded, 0) = 0 THEN 1 ELSE 0 END), 0) as active,
       COALESCE(SUM(CASE WHEN COALESCE(is_excluded, 0) = 1 THEN 1 ELSE 0 END), 0) as excluded,
       COALESCE(SUM(CASE WHEN quality_bucket = 'ready_to_call' THEN 1 ELSE 0 END), 0) as ready_to_call,
       COALESCE(SUM(CASE WHEN quality_bucket = 'broken_site_opportunity' THEN 1 ELSE 0 END), 0) as broken_site_opportunities,
       COALESCE(SUM(CASE WHEN quality_bucket = 'needs_ai_verify' THEN 1 ELSE 0 END), 0) as needs_ai_verify,
       COALESCE(SUM(CASE WHEN quality_bucket = 'needs_manual_review' THEN 1 ELSE 0 END), 0) as needs_manual_review,
       COALESCE(SUM(CASE WHEN quality_bucket = 'not_a_fit' THEN 1 ELSE 0 END), 0) as not_fit,
       COALESCE(SUM(CASE WHEN ai_verification_status = 'site_found' AND ai_website_viability_status = 'usable' THEN 1 ELSE 0 END), 0) as usable_site_found,
       COALESCE(SUM(CASE WHEN ai_verification_status = 'no_site_found' OR ai_website_viability_status = 'directory_only' THEN 1 ELSE 0 END), 0) as no_site_verified
     FROM leads
     WHERE archived_at IS NULL`
  ).get() as Record<string, number>;
  const [websiteStatus, qualityBuckets] = await Promise.all([
    getSchedulerBreakdown("website_status"),
    getSchedulerBreakdown("quality_bucket"),
  ]);

  return {
    total: Number(row.total ?? 0),
    active: Number(row.active ?? 0),
    excluded: Number(row.excluded ?? 0),
    readyToCall: Number(row.ready_to_call ?? 0),
    brokenSiteOpportunities: Number(row.broken_site_opportunities ?? 0),
    needsAiVerify: Number(row.needs_ai_verify ?? 0),
    needsManualReview: Number(row.needs_manual_review ?? 0),
    notFit: Number(row.not_fit ?? 0),
    usableSiteFound: Number(row.usable_site_found ?? 0),
    noSiteVerified: Number(row.no_site_verified ?? 0),
    websiteStatus,
    qualityBuckets,
  };
}

async function getSchedulerEnrichmentBacklogSummary(): Promise<SchedulerStatusCounts> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT enrichment_status as status, COUNT(*) as count
     FROM leads
     WHERE score > 0 AND COALESCE(is_excluded, 0) = 0 AND archived_at IS NULL
     GROUP BY enrichment_status`
  ).all() as Array<{ status: string; count: number }>;

  const pending = getStatusCount(rows, "pending");
  const completed = getStatusCount(rows, "enriched") + getStatusCount(rows, "skipped");
  return {
    total: sumStatusCounts(rows),
    missing: 0,
    pending,
    running: 0,
    completed,
    failed: 0,
  };
}

async function getSchedulerArtifactBacklogSummary(): Promise<SchedulerArtifactBacklogSummary> {
  const [businessDetail, competitiveReport] = await Promise.all([
    getSchedulerArtifactTypeBacklog("business_detail"),
    getSchedulerArtifactTypeBacklog("competitive_report"),
  ]);
  return { businessDetail, competitiveReport };
}

async function getSchedulerArtifactTypeBacklog(type: LeadAiArtifactType): Promise<SchedulerStatusCounts> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT status, COUNT(*) as count
     FROM lead_ai_artifacts
     WHERE artifact_type = ?
     GROUP BY status`
  ).all(type) as Array<{ status: string; count: number }>;
  const missingRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads l
     WHERE COALESCE(l.is_excluded, 0) = 0
       AND l.archived_at IS NULL
       AND l.status NOT IN ('closed_won','closed_lost')
       AND NOT EXISTS (
         SELECT 1
         FROM lead_ai_artifacts a
         WHERE a.lead_id = l.id AND a.artifact_type = ?
       )`
  ).get(type) as { count: number };

  return {
    total: sumStatusCounts(rows) + Number(missingRow.count ?? 0),
    missing: Number(missingRow.count ?? 0),
    pending: getStatusCount(rows, "queued"),
    running: getStatusCount(rows, "running"),
    completed: getStatusCount(rows, "complete"),
    failed: getStatusCount(rows, "error"),
  };
}

async function getSchedulerScoreBacklogSummary(): Promise<SchedulerStatusCounts> {
  const db = await getDb();
  const staleRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
     WHERE archived_at IS NULL
       AND (last_quality_scored_at IS NULL OR julianday(updated_at) > julianday(last_quality_scored_at))`
  ).get() as { count: number };
  const freshRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
     WHERE archived_at IS NULL
       AND last_quality_scored_at IS NOT NULL AND julianday(updated_at) <= julianday(last_quality_scored_at)`
  ).get() as { count: number };

  return {
    total: Number(staleRow.count ?? 0) + Number(freshRow.count ?? 0),
    missing: 0,
    pending: Number(staleRow.count ?? 0),
    running: 0,
    completed: Number(freshRow.count ?? 0),
    failed: 0,
  };
}

async function getSchedulerBreakdown(column: "website_status" | "quality_bucket"): Promise<Array<{ key: string; count: number }>> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT COALESCE(${column}, 'unknown') as key, COUNT(*) as count
     FROM leads
     WHERE archived_at IS NULL
     GROUP BY COALESCE(${column}, 'unknown')
     ORDER BY count DESC, key ASC`
  ).all() as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: String(row.key), count: Number(row.count) || 0 }));
}

async function getApiUsageSummarySince(since: string): Promise<ApiUsageSummary> {
  const db = await getDb();
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
  ).all(since) as Array<{
    endpoint: string;
    calls: number;
    cost: number;
    atmosphere_calls: number;
    atmosphere_cost: number;
  }>;

  return summarizeApiUsageRows(rows);
}

function summarizeApiUsageRows(rows: Array<{
  endpoint: string;
  calls: number;
  cost: number;
  atmosphere_calls: number;
  atmosphere_cost: number;
}>): ApiUsageSummary {
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

  const totalCost = discoveryCost + enrichmentCost;
  return {
    totalCalls: discoveryCalls + enrichmentCalls,
    totalCost: roundCurrency(totalCost),
    discoveryCalls,
    discoveryCost: roundCurrency(discoveryCost),
    enrichmentCalls,
    enrichmentCost: roundCurrency(enrichmentCost),
    atmosphereCalls,
    atmosphereCost: roundCurrency(atmosphereCost),
  };
}

function emptyApiUsageSummary(): ApiUsageSummary {
  return {
    totalCalls: 0,
    totalCost: 0,
    discoveryCalls: 0,
    discoveryCost: 0,
    enrichmentCalls: 0,
    enrichmentCost: 0,
    atmosphereCalls: 0,
    atmosphereCost: 0,
  };
}

function emptySchedulerStatusCounts(): SchedulerStatusCounts {
  return {
    total: 0,
    missing: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };
}

function toSchedulerApiUsageWindow(summary: ApiUsageSummary): SchedulerApiUsageWindow {
  return {
    calls: summary.totalCalls,
    cost: summary.totalCost,
    discoveryCalls: summary.discoveryCalls,
    discoveryCost: summary.discoveryCost,
    enrichmentCalls: summary.enrichmentCalls,
    enrichmentCost: summary.enrichmentCost,
    atmosphereCalls: summary.atmosphereCalls,
    atmosphereCost: summary.atmosphereCost,
  };
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

export async function setStoredGoogleMapsBrowserApiKey(apiKey: string): Promise<void>{
  const db = await getDb();
  await ensureGoogleMapsBrowserApiKeyColumn(db);
  await db.prepare("UPDATE settings SET google_maps_browser_api_key_encrypted = ?, updated_at = ? WHERE id = 1")
    .run(encryptSecret(apiKey), nowISO());
}

export async function clearStoredGoogleMapsBrowserApiKey(): Promise<void>{
  const db = await getDb();
  await ensureGoogleMapsBrowserApiKeyColumn(db);
  await db.prepare("UPDATE settings SET google_maps_browser_api_key_encrypted = NULL, updated_at = ? WHERE id = 1")
    .run(nowISO());
}

export async function getConfiguredGoogleMapsBrowserApiKey(): Promise<string>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, unknown> | undefined;
  const encrypted = row?.google_maps_browser_api_key_encrypted;
  if (typeof encrypted === "string" && encrypted) {
    return decryptSecret(encrypted);
  }
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "").trim();
}

async function ensureGoogleMapsBrowserApiKeyColumn(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  try {
    await db.prepare("ALTER TABLE settings ADD COLUMN google_maps_browser_api_key_encrypted TEXT").run();
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

function isDuplicateColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("duplicate column") || message.includes("already exists");
}

// ─── Zip Codes ───

export const COLORADO_MARKET_ID = "market-colorado";

const STARTER_MARKETS = [
  { id: "market-london-ca", name: "London, Ontario", countryCode: "CA", adminArea1: "ON", locality: "London" },
  { id: "market-toronto", name: "Toronto", countryCode: "CA", adminArea1: "ON", locality: "Toronto" },
  { id: "market-vancouver", name: "Vancouver", countryCode: "CA", adminArea1: "BC", locality: "Vancouver" },
  { id: "market-london-gb", name: "London", countryCode: "GB", adminArea1: "England", locality: "London" },
] as const;

const STARTER_LOCATION_CELLS = [
  { id: "cell-ca-london-on-n6h", marketId: "market-london-ca", countryCode: "CA", adminArea1: "ON", locality: "London", postalCode: "N6H", cellType: "postal_fsa", label: "London, ON N6H", lat: 42.984, lng: -81.292, radiusMeters: 3000 },
  { id: "cell-ca-toronto-m5v", marketId: "market-toronto", countryCode: "CA", adminArea1: "ON", locality: "Toronto", postalCode: "M5V", cellType: "postal_fsa", label: "Toronto, ON M5V", lat: 43.644, lng: -79.389, radiusMeters: 3000 },
  { id: "cell-ca-toronto-m4w", marketId: "market-toronto", countryCode: "CA", adminArea1: "ON", locality: "Toronto", postalCode: "M4W", cellType: "postal_fsa", label: "Toronto, ON M4W", lat: 43.679, lng: -79.384, radiusMeters: 3000 },
  { id: "cell-ca-toronto-m6j", marketId: "market-toronto", countryCode: "CA", adminArea1: "ON", locality: "Toronto", postalCode: "M6J", cellType: "postal_fsa", label: "Toronto, ON M6J", lat: 43.647, lng: -79.419, radiusMeters: 3000 },
  { id: "cell-ca-vancouver-v6b", marketId: "market-vancouver", countryCode: "CA", adminArea1: "BC", locality: "Vancouver", postalCode: "V6B", cellType: "postal_fsa", label: "Vancouver, BC V6B", lat: 49.279, lng: -123.114, radiusMeters: 3000 },
  { id: "cell-ca-vancouver-v5k", marketId: "market-vancouver", countryCode: "CA", adminArea1: "BC", locality: "Vancouver", postalCode: "V5K", cellType: "postal_fsa", label: "Vancouver, BC V5K", lat: 49.281, lng: -123.041, radiusMeters: 3000 },
  { id: "cell-ca-vancouver-v6e", marketId: "market-vancouver", countryCode: "CA", adminArea1: "BC", locality: "Vancouver", postalCode: "V6E", cellType: "postal_fsa", label: "Vancouver, BC V6E", lat: 49.287, lng: -123.126, radiusMeters: 3000 },
  { id: "cell-gb-london-sw1a", marketId: "market-london-gb", countryCode: "GB", adminArea1: "England", locality: "London", postalCode: "SW1A", cellType: "postcode_outward", label: "London SW1A", lat: 51.501, lng: -0.142, radiusMeters: 2500 },
  { id: "cell-gb-london-ec1", marketId: "market-london-gb", countryCode: "GB", adminArea1: "England", locality: "London", postalCode: "EC1", cellType: "postcode_outward", label: "London EC1", lat: 51.523, lng: -0.101, radiusMeters: 2500 },
  { id: "cell-gb-london-nw9", marketId: "market-london-gb", countryCode: "GB", adminArea1: "England", locality: "London", postalCode: "NW9", cellType: "postcode_outward", label: "London NW9", lat: 51.586, lng: -0.257, radiusMeters: 2500 },
  { id: "cell-gb-london-w1", marketId: "market-london-gb", countryCode: "GB", adminArea1: "England", locality: "London", postalCode: "W1", cellType: "postcode_outward", label: "London W1", lat: 51.514, lng: -0.143, radiusMeters: 2500 },
] as const;

export async function ensureGeographyBackfill(): Promise<void> {
  const db = await getDb();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO location_markets (id, name, country_code, admin_area1, status, created_at, updated_at)
     VALUES (?, 'Colorado', 'US', 'CO', 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       country_code = excluded.country_code,
       admin_area1 = excluded.admin_area1,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).run(COLORADO_MARKET_ID, now, now);

  const insertMarket = db.prepare(
    `INSERT INTO location_markets (id, name, country_code, admin_area1, locality, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       country_code = excluded.country_code,
       admin_area1 = excluded.admin_area1,
       locality = excluded.locality,
       status = excluded.status,
       updated_at = excluded.updated_at`
  );
  for (const market of STARTER_MARKETS) {
    await insertMarket.run(market.id, market.name, market.countryCode, market.adminArea1, market.locality, now, now);
  }

  const insertStarterCell = db.prepare(
    `INSERT INTO location_cells (
       id, market_id, country_code, admin_area1, locality,
       postal_code, postal_code_normalized, cell_type, cell_label, lat, lng, radius_meters, is_active, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       country_code = excluded.country_code,
       admin_area1 = excluded.admin_area1,
       locality = excluded.locality,
       postal_code = excluded.postal_code,
       postal_code_normalized = excluded.postal_code_normalized,
       cell_type = excluded.cell_type,
       cell_label = excluded.cell_label,
       lat = excluded.lat,
       lng = excluded.lng,
       radius_meters = excluded.radius_meters,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`
  );
  for (const cell of STARTER_LOCATION_CELLS) {
    await insertStarterCell.run(
      cell.id,
      cell.marketId,
      cell.countryCode,
      cell.adminArea1,
      cell.locality,
      cell.postalCode,
      normalizePostalCode(cell.countryCode, cell.postalCode),
      cell.cellType,
      cell.label,
      cell.lat,
      cell.lng,
      cell.radiusMeters,
      now,
      now,
    );
  }

  const zips = await db.prepare(
    "SELECT zip, city, state, county, lat, lng, is_active FROM zip_codes WHERE is_active = 1"
  ).all<ZipCode>();
  const insertCell = db.prepare(
    `INSERT INTO location_cells (
       id, market_id, country_code, admin_area1, admin_area2, locality,
       postal_code, postal_code_normalized, cell_type, cell_label, lat, lng, is_active, created_at, updated_at
     ) VALUES (?, ?, 'US', ?, ?, ?, ?, ?, 'zip', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       admin_area2 = excluded.admin_area2,
       locality = excluded.locality,
       lat = excluded.lat,
       lng = excluded.lng,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`
  );
  for (const zip of zips) {
    await insertCell.run(
      coloradoCellId(zip.zip),
      COLORADO_MARKET_ID,
      zip.state,
      zip.county,
      zip.city,
      zip.zip,
      zip.zip,
      `${zip.city} ${zip.state} ${zip.zip}`,
      zip.lat,
      zip.lng,
      zip.is_active,
      now,
      now,
    );
  }

  await db.prepare(
    `UPDATE leads
     SET country_code = COALESCE(country_code, 'US'),
         admin_area1 = COALESCE(admin_area1, 'CO'),
         market_id = COALESCE(market_id, ?)
     WHERE market_id IS NULL OR country_code IS NULL`
  ).run(COLORADO_MARKET_ID);
  await db.prepare(
    `UPDATE leads
     SET postal_code = COALESCE(postal_code, (
           SELECT z.zip FROM zip_codes z WHERE leads.address LIKE '%' || z.zip || '%' LIMIT 1
         )),
         location_cell_id = COALESCE(location_cell_id, (
           SELECT 'cell-us-co-' || z.zip FROM zip_codes z WHERE leads.address LIKE '%' || z.zip || '%' LIMIT 1
         )),
         locality = COALESCE(locality, (
           SELECT z.city FROM zip_codes z WHERE leads.address LIKE '%' || z.zip || '%' LIMIT 1
         )),
         admin_area2 = COALESCE(admin_area2, (
           SELECT z.county FROM zip_codes z WHERE leads.address LIKE '%' || z.zip || '%' LIMIT 1
         ))
     WHERE market_id = ?`
  ).run(COLORADO_MARKET_ID);
  await db.prepare(
    `UPDATE crawl_units
     SET market_id = COALESCE(market_id, ?),
         location_cell_id = COALESCE(location_cell_id, 'cell-us-co-' || zip),
         country_code = COALESCE(country_code, 'US'),
         query_location_label = COALESCE(query_location_label, (
           SELECT z.city || ', ' || z.state || ' ' || z.zip || ', United States'
           FROM zip_codes z
           WHERE z.zip = crawl_units.zip
           LIMIT 1
         ))
     WHERE market_id IS NULL OR location_cell_id IS NULL OR country_code IS NULL OR query_location_label IS NULL`
  ).run(COLORADO_MARKET_ID);
  await db.prepare(
    `UPDATE crawl_runs
     SET market_id = COALESCE(market_id, ?),
         selection_json = COALESCE(selection_json, ?)
     WHERE market_id IS NULL`
  ).run(COLORADO_MARKET_ID, JSON.stringify({ countryCode: "US", marketId: COLORADO_MARKET_ID, source: "legacy_colorado" }));
  await db.prepare(
    `INSERT INTO user_market_access (user_id, market_id, created_by_user_id)
     SELECT user_id, ?, NULL
     FROM app_users
     WHERE role = 'researcher' AND status = 'active'
     ON CONFLICT(user_id, market_id) DO NOTHING`
  ).run(COLORADO_MARKET_ID);
}

export async function listLocationMarkets(includeArchived = false): Promise<LocationMarket[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT *
     FROM location_markets
     ${includeArchived ? "" : "WHERE status <> 'archived'"}
     ORDER BY country_code, name`
  ).all<Record<string, unknown>>();
  return rows.map(parseLocationMarketRow);
}

export async function getPlannerMarkets(): Promise<PlannerMarketOption[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
       m.id,
       m.name,
       m.country_code,
       m.admin_area1,
       m.locality,
       COUNT(c.id) as cellCount,
       COALESCE(SUM(CASE WHEN c.is_active = 1 THEN 1 ELSE 0 END), 0) as activeCellCount
     FROM location_markets m
     LEFT JOIN location_cells c ON c.market_id = m.id
     WHERE m.status = 'active'
     GROUP BY m.id, m.name, m.country_code, m.admin_area1, m.locality
     ORDER BY m.country_code, m.name`
  ).all<Record<string, unknown>>();
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    country_code: normalizeCountryCode(row.country_code),
    admin_area1: row.admin_area1 ? String(row.admin_area1) : null,
    locality: row.locality ? String(row.locality) : null,
    cellCount: Number(row.cellCount ?? row.cellcount ?? 0),
    activeCellCount: Number(row.activeCellCount ?? row.activecellcount ?? 0),
  }));
}

export async function getLocationCells(marketId: string): Promise<LocationCell[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT c.*, m.name as market_name
     FROM location_cells c
     LEFT JOIN location_markets m ON m.id = c.market_id
     WHERE c.market_id = ?
     ORDER BY c.country_code, c.cell_type, c.cell_label`
  ).all<Record<string, unknown>>(marketId);
  return rows.map(parseLocationCellRow);
}

export async function getPlannerCells(marketId: string, categories: readonly string[] = []): Promise<PlannerCellOption[]> {
  const cells = await getLocationCells(marketId);
  return Promise.all(cells.filter((cell) => cell.is_active === 1).map(async (cell) => ({
    ...cell,
    coverage: await getCellCoverageStatus(cell.id, categories),
  })));
}

export async function getCellCoverageStatus(cellId: string, categories?: readonly string[]): Promise<ZipCoverageStatus> {
  const db = await getDb();
  const normalizedCategories = Array.from(new Set((categories ?? []).map((category) => category.trim()).filter(Boolean)));
  if (normalizedCategories.length === 0) {
    const row = await db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM crawl_units
       WHERE location_cell_id = ?`
    ).get(cellId) as { total: number | null; done: number | null; failed: number | null };
    const total = Number(row.total ?? 0);
    const done = Number(row.done ?? 0);
    const failed = Number(row.failed ?? 0);
    return { zip: cellId, total, done, failed, remaining: Math.max(total - done - failed, 0), completed: total > 0 && done === total };
  }
  const placeholders = normalizedCategories.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT category,
       MAX(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as has_done,
       MAX(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as has_failed
     FROM crawl_units
     WHERE location_cell_id = ? AND category IN (${placeholders})
     GROUP BY category`
  ).all(cellId, ...normalizedCategories) as Array<{ category: string; has_done: number; has_failed: number }>;
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  let done = 0;
  let failed = 0;
  for (const category of normalizedCategories) {
    const row = byCategory.get(category);
    if (row?.has_done) done++;
    else if (row?.has_failed) failed++;
  }
  return { zip: cellId, total: normalizedCategories.length, done, failed, remaining: Math.max(normalizedCategories.length - done - failed, 0), completed: normalizedCategories.length > 0 && done === normalizedCategories.length };
}

export async function replaceUserMarketAccess(userId: string, marketIds: string[], actorUserId?: string | null): Promise<UserMarketAccess[]> {
  const db = await getDb();
  const uniqueMarketIds = Array.from(new Set(marketIds.map((id) => id.trim()).filter(Boolean)));

  if (uniqueMarketIds.length > 0) {
    const placeholders = uniqueMarketIds.map(() => "?").join(", ");
    const rows = await db.prepare(`SELECT id FROM location_markets WHERE id IN (${placeholders})`)
      .all<{ id: string }>(...uniqueMarketIds);
    const validIds = new Set(rows.map((row) => row.id));
    const missingIds = uniqueMarketIds.filter((id) => !validIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Unknown market id${missingIds.length === 1 ? "" : "s"}: ${missingIds.join(", ")}`);
    }
  }

  return withDbTransaction(async () => {
    const txDb = await getDb();
    await txDb.prepare("DELETE FROM user_market_access WHERE user_id = ?").run(userId);
    const insert = txDb.prepare(
      "INSERT INTO user_market_access (user_id, market_id, created_by_user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, market_id) DO NOTHING"
    );
    const now = nowISO();
    for (const marketId of uniqueMarketIds) {
      await insert.run(userId, marketId, actorUserId ?? null, now);
    }
    return listUserMarketAccess(userId);
  });
}

export async function listUserMarketAccess(userId: string): Promise<UserMarketAccess[]> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return [];
  const accessByUser = await listUserMarketAccessForUsers([trimmedUserId]);
  return accessByUser[trimmedUserId] ?? [];
}

export async function listUserMarketAccessForUsers(userIds: string[]): Promise<Record<string, UserMarketAccess[]>> {
  const db = await getDb();
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  const accessByUser: Record<string, UserMarketAccess[]> = Object.fromEntries(uniqueUserIds.map((id) => [id, []]));
  if (uniqueUserIds.length === 0) return accessByUser;

  const placeholders = uniqueUserIds.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT uma.user_id, uma.market_id, m.name as market_name, m.country_code, m.admin_area1
     FROM user_market_access uma
     INNER JOIN location_markets m ON m.id = uma.market_id
     WHERE uma.user_id IN (${placeholders})
     ORDER BY uma.user_id, m.country_code, m.name`
  ).all<Record<string, unknown>>(...uniqueUserIds);

  for (const row of rows) {
    const access: UserMarketAccess = {
      user_id: String(row.user_id),
      market_id: String(row.market_id),
      market_name: String(row.market_name),
      country_code: normalizeCountryCode(row.country_code),
      admin_area1: row.admin_area1 ? String(row.admin_area1) : null,
    };
    if (!accessByUser[access.user_id]) accessByUser[access.user_id] = [];
    accessByUser[access.user_id].push(access);
  }

  return accessByUser;
}

export async function userCanAccessMarket(userId: string, marketId: string | null | undefined): Promise<boolean> {
  if (!marketId) return false;
  const db = await getDb();
  const row = await db.prepare(
    "SELECT 1 FROM user_market_access WHERE user_id = ? AND market_id = ? LIMIT 1"
  ).get(userId, marketId);
  return Boolean(row);
}

export async function getMarketCoverageSummary(
  runId?: string,
  scope?: CrawlRunScope,
): Promise<MarketCoverageSummary[]> {
  const db = await getDb();
  const runFilter = runId ? "AND cu.crawl_run_id = ?" : "";
  const scopeRunFilter = scope
    ? `AND EXISTS (
         SELECT 1 FROM crawl_runs cr
         WHERE cr.id = cu.crawl_run_id
           AND cr.tenant_id = ?
           AND (? IS NULL OR cr.workspace_id = ?)
       )`
    : "";
  const leadScopeFilter = scope
    ? "AND l.tenant_id = ? AND (? IS NULL OR l.workspace_id = ?)"
    : "";
  const args = [
    ...(scope ? [scope.tenantId, scope.workspaceId, scope.workspaceId] : []),
    ...(runId ? [runId] : []),
    ...(scope ? [scope.tenantId, scope.workspaceId, scope.workspaceId] : []),
  ];
  const rows = await db.prepare(
    `SELECT
       m.id as marketId,
       m.name as marketName,
       m.country_code as countryCode,
       m.admin_area1 as adminArea1,
       COUNT(DISTINCT c.id) as totalCells,
       COALESCE(SUM(CASE WHEN c.is_active = 1 THEN 1 ELSE 0 END), 0) as activeCells,
       COUNT(DISTINCT CASE WHEN cu.status = 'done' THEN c.id END) as discoveredCells,
       COUNT(cu.id) as totalUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) as doneUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) as failedUnits,
       COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) as openUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) as canceledUnits,
       COALESCE(SUM(cu.discovered_count), 0) as leadsDiscovered,
       COALESCE((SELECT COUNT(*) FROM leads l WHERE l.market_id = m.id ${leadScopeFilter}), 0) as activeLeads,
       MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
     FROM location_markets m
     LEFT JOIN location_cells c ON c.market_id = m.id
     LEFT JOIN crawl_units cu ON cu.location_cell_id = c.id ${runFilter} ${scopeRunFilter}
     WHERE m.status <> 'archived'
     GROUP BY m.id, m.name, m.country_code, m.admin_area1
     ORDER BY m.country_code, m.name`
  ).all(...args) as Array<Record<string, unknown>>;
  return rows.map(normalizeMarketCoverageSummary);
}

export async function getLocationCellCoverage(
  runId?: string,
  scope?: CrawlRunScope,
): Promise<LocationCellCoverage[]> {
  const db = await getDb();
  const runFilter = runId ? "AND cu.crawl_run_id = ?" : "";
  const scopeRunFilter = scope
    ? `AND EXISTS (
         SELECT 1 FROM crawl_runs cr
         WHERE cr.id = cu.crawl_run_id
           AND cr.tenant_id = ?
           AND (? IS NULL OR cr.workspace_id = ?)
       )`
    : "";
  const leadScopeFilter = scope
    ? "AND l.tenant_id = ? AND (? IS NULL OR l.workspace_id = ?)"
    : "";
  const args = [
    ...(scope ? [scope.tenantId, scope.workspaceId, scope.workspaceId] : []),
    ...(runId ? [runId] : []),
    ...(scope ? [scope.tenantId, scope.workspaceId, scope.workspaceId] : []),
  ];
  const rows = await db.prepare(
    `SELECT
       c.id as cellId,
       c.market_id as marketId,
       m.name as marketName,
       c.country_code as countryCode,
       c.cell_type as cellType,
       c.cell_label as cellLabel,
       c.postal_code as postalCode,
       c.locality,
       c.admin_area1 as adminArea1,
       c.admin_area2 as adminArea2,
       COUNT(cu.id) as totalUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END), 0) as doneUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) as failedUnits,
       COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) as openUnits,
       COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) as canceledUnits,
       COALESCE(SUM(cu.discovered_count), 0) as leadsDiscovered,
       COALESCE((SELECT COUNT(*) FROM leads l WHERE l.location_cell_id = c.id ${leadScopeFilter}), 0) as activeLeads,
       MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
     FROM location_cells c
     INNER JOIN location_markets m ON m.id = c.market_id
     LEFT JOIN crawl_units cu ON cu.location_cell_id = c.id ${runFilter} ${scopeRunFilter}
     WHERE c.is_active = 1
     GROUP BY c.id, c.market_id, m.name, m.country_code, c.country_code, c.cell_type, c.cell_label, c.postal_code, c.locality, c.admin_area1, c.admin_area2
     ORDER BY m.country_code, m.name, c.cell_type, c.cell_label`
  ).all(...args) as Array<Record<string, unknown>>;
  return rows.map(normalizeLocationCellCoverage);
}

function coloradoCellId(zip: string): string {
  return `cell-us-co-${zip}`;
}

function parseLocationMarketRow(row: Record<string, unknown>): LocationMarket {
  return {
    id: String(row.id),
    name: String(row.name),
    country_code: normalizeCountryCode(row.country_code),
    admin_area1: row.admin_area1 ? String(row.admin_area1) : null,
    admin_area2: row.admin_area2 ? String(row.admin_area2) : null,
    locality: row.locality ? String(row.locality) : null,
    status: row.status === "paused" || row.status === "archived" ? row.status : "active",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function parseLocationCellRow(row: Record<string, unknown>): LocationCell {
  const countryCode = normalizeCountryCode(row.country_code);
  const cellType = normalizeLocationCellType(row.cell_type, countryCode);
  return {
    id: String(row.id),
    market_id: String(row.market_id),
    market_name: row.market_name ? String(row.market_name) : null,
    country_code: countryCode,
    admin_area1: row.admin_area1 ? String(row.admin_area1) : null,
    admin_area2: row.admin_area2 ? String(row.admin_area2) : null,
    locality: row.locality ? String(row.locality) : null,
    postal_code: row.postal_code ? String(row.postal_code) : null,
    postal_code_normalized: row.postal_code_normalized ? String(row.postal_code_normalized) : null,
    cell_type: cellType,
    cell_label: String(row.cell_label ?? buildCellLabel({ countryCode, cellType })),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    radius_meters: row.radius_meters == null ? null : Number(row.radius_meters),
    is_active: Number(row.is_active ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeLocationCellType(value: unknown, countryCode: CountryCode): LocationCellType {
  const normalized = String(value ?? "").trim();
  const allowed: LocationCellType[] = [
    "zip",
    "postal_fsa",
    "postcode_area",
    "postcode_outward",
    "city",
    "county",
    "province",
    "region",
    "custom_market",
  ];
  return allowed.includes(normalized as LocationCellType)
    ? normalized as LocationCellType
    : defaultCellTypeForCountry(countryCode);
}

function normalizeMarketCoverageSummary(row: Record<string, unknown>): MarketCoverageSummary {
  const countryCode = normalizeCountryCode(row.countryCode ?? row.countrycode);
  return {
    marketId: String(row.marketId ?? row.marketid),
    marketName: String(row.marketName ?? row.marketname),
    countryCode,
    countryLabel: COUNTRY_LABELS[countryCode],
    adminArea1: (row.adminArea1 ?? row.adminarea1) ? String(row.adminArea1 ?? row.adminarea1) : null,
    totalCells: Number(row.totalCells ?? row.totalcells ?? 0),
    activeCells: Number(row.activeCells ?? row.activecells ?? 0),
    discoveredCells: Number(row.discoveredCells ?? row.discoveredcells ?? 0),
    totalUnits: Number(row.totalUnits ?? row.totalunits ?? 0),
    doneUnits: Number(row.doneUnits ?? row.doneunits ?? 0),
    failedUnits: Number(row.failedUnits ?? row.failedunits ?? 0),
    openUnits: Number(row.openUnits ?? row.openunits ?? 0),
    canceledUnits: Number(row.canceledUnits ?? row.canceledunits ?? 0),
    leadsDiscovered: Number(row.leadsDiscovered ?? row.leadsdiscovered ?? 0),
    activeLeads: Number(row.activeLeads ?? row.activeleads ?? 0),
    lastRunAt: (row.lastRunAt ?? row.lastrunat) ? String(row.lastRunAt ?? row.lastrunat) : null,
  };
}

function normalizeLocationCellCoverage(row: Record<string, unknown>): LocationCellCoverage {
  const countryCode = normalizeCountryCode(row.countryCode ?? row.countrycode);
  return {
    cellId: String(row.cellId ?? row.cellid),
    marketId: String(row.marketId ?? row.marketid),
    marketName: String(row.marketName ?? row.marketname),
    countryCode,
    cellType: normalizeLocationCellType(row.cellType ?? row.celltype, countryCode),
    cellLabel: String(row.cellLabel ?? row.celllabel),
    postalCode: (row.postalCode ?? row.postalcode) ? String(row.postalCode ?? row.postalcode) : null,
    locality: row.locality ? String(row.locality) : null,
    adminArea1: (row.adminArea1 ?? row.adminarea1) ? String(row.adminArea1 ?? row.adminarea1) : null,
    adminArea2: (row.adminArea2 ?? row.adminarea2) ? String(row.adminArea2 ?? row.adminarea2) : null,
    totalUnits: Number(row.totalUnits ?? row.totalunits ?? 0),
    doneUnits: Number(row.doneUnits ?? row.doneunits ?? 0),
    failedUnits: Number(row.failedUnits ?? row.failedunits ?? 0),
    openUnits: Number(row.openUnits ?? row.openunits ?? 0),
    canceledUnits: Number(row.canceledUnits ?? row.canceledunits ?? 0),
    leadsDiscovered: Number(row.leadsDiscovered ?? row.leadsdiscovered ?? 0),
    activeLeads: Number(row.activeLeads ?? row.activeleads ?? 0),
    lastRunAt: (row.lastRunAt ?? row.lastrunat) ? String(row.lastRunAt ?? row.lastrunat) : null,
  };
}

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

export async function createCrawlRun(
  categories: string[],
  options: {
    tenantId: string;
    workspaceId: string | null;
    marketId?: string | null;
    selection?: Record<string, unknown> | null;
    name?: string | null;
    scopeLabel?: string | null;
    createdByUserId?: string | null;
  },
): Promise<CrawlRun>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();

  await db.prepare(
    `INSERT INTO crawl_runs (
       id, tenant_id, workspace_id, mode, status, categories, market_id, selection_json, name, scope_label,
       created_by_user_id, started_at, created_at, updated_at
     )
     VALUES (?, ?, ?, 'coverage', 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    options.tenantId,
    options.workspaceId,
    JSON.stringify(categories),
    options.marketId ?? null,
    options.selection ? JSON.stringify(options.selection) : null,
    normalizeNullableText(options.name),
    normalizeNullableText(options.scopeLabel),
    normalizeNullableText(options.createdByUserId),
    now,
    now,
    now,
  );

  return (await getCrawlRun(id))!;
}

function parseCrawlRunRow(row: Record<string, unknown>): CrawlRun {
  return {
    ...row,
    categories: safeParseJson<string[]>(row.categories, []),
    selection_json: safeParseJson<Record<string, unknown> | null>(row.selection_json, null),
    name: (row.name as string | null) ?? null,
    scope_label: (row.scope_label as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    started_at: normalizeNullableDateText(row.started_at),
    ended_at: normalizeNullableDateText(row.ended_at),
    blocked_reason: (row.blocked_reason as string | null) ?? null,
    blocked_at: normalizeNullableDateText(row.blocked_at),
    blocked_error_code: (row.blocked_error_code as string | null) ?? null,
    created_at: normalizeDateText(row.created_at),
    updated_at: normalizeDateText(row.updated_at),
  } as unknown as CrawlRun;
}

export interface CrawlRunScope {
  tenantId: string;
  workspaceId: string | null;
}

export async function getCrawlRun(id: string, scope?: CrawlRunScope): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = scope
    ? await db.prepare(
      `SELECT * FROM crawl_runs
       WHERE id = ?
         AND tenant_id = ?
         AND (? IS NULL OR workspace_id = ?)`,
    ).get(id, scope.tenantId, scope.workspaceId, scope.workspaceId) as Record<string, unknown> | undefined
    : await db.prepare("SELECT * FROM crawl_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getProcessingCrawlRun(scope?: CrawlRunScope): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = scope
    ? await db.prepare(
      `SELECT * FROM crawl_runs
       WHERE tenant_id = ?
         AND ((? IS NULL AND workspace_id IS NULL) OR workspace_id = ?)
         AND status IN ('running', 'queued')
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get(scope.tenantId, scope.workspaceId, scope.workspaceId) as Record<string, unknown> | undefined
    : await db.prepare("SELECT * FROM crawl_runs WHERE status IN ('running', 'queued') ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getActiveCrawlRun(scope?: CrawlRunScope): Promise<CrawlRun | null>{
  return getDefaultVisibleCrawlRun(scope);
}

export async function getDefaultVisibleCrawlRun(scope?: CrawlRunScope): Promise<CrawlRun | null>{
  const processing = await getProcessingCrawlRun(scope);
  if (processing) return processing;
  return getLatestCrawlRun(scope);
}

export async function getSelectedOrDefaultVisibleCrawlRun(
  runId?: string | null,
  scope?: CrawlRunScope,
): Promise<CrawlRun | null>{
  const cleanRunId = normalizeNullableText(runId);
  if (cleanRunId) return getCrawlRun(cleanRunId, scope);
  return getDefaultVisibleCrawlRun(scope);
}

export async function getLatestPausedCrawlRun(scope?: CrawlRunScope): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = scope
    ? await db.prepare(
      `SELECT * FROM crawl_runs
       WHERE tenant_id = ?
         AND (? IS NULL OR workspace_id = ?)
         AND status = 'paused'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get(scope.tenantId, scope.workspaceId, scope.workspaceId) as Record<string, unknown> | undefined
    : await db.prepare("SELECT * FROM crawl_runs WHERE status = 'paused' ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getLatestCrawlRun(scope?: CrawlRunScope): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = scope
    ? await db.prepare(
      `SELECT * FROM crawl_runs
       WHERE tenant_id = ?
         AND (? IS NULL OR workspace_id = ?)
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get(scope.tenantId, scope.workspaceId, scope.workspaceId) as Record<string, unknown> | undefined
    : await db.prepare("SELECT * FROM crawl_runs ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function listDiscoveryItems(limit = 12, scope?: CrawlRunScope): Promise<DiscoveryItemSummary[]> {
  const db = await getDb();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const scopeFilter = scope
    ? "WHERE tenant_id = ? AND (? IS NULL OR workspace_id = ?)"
    : "";
  const scopeArgs = scope ? [scope.tenantId, scope.workspaceId, scope.workspaceId] : [];
  const rows = await db.prepare(
    `WITH latest_runs AS (
       SELECT *
       FROM crawl_runs
       ${scopeFilter}
       ORDER BY created_at DESC
       LIMIT ?
     ),
     unit_counts AS (
       SELECT
         crawl_run_id,
         COUNT(*) as total_units,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_units,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_units,
         SUM(CASE WHEN status = 'retry_wait' THEN 1 ELSE 0 END) as retry_wait_units,
         SUM(CASE WHEN status IN ('pending','retry_wait') THEN 1 ELSE 0 END) as open_units,
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_units,
         SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_units,
         SUM(COALESCE(pages_fetched, 0)) as pages_fetched,
         SUM(COALESCE(raw_places_seen, 0)) as raw_places_seen,
         SUM(COALESCE(new_places_seen, 0)) as new_places_seen,
         SUM(COALESCE(duplicate_places_seen, 0)) as duplicate_places_seen
       FROM crawl_units
       WHERE crawl_run_id IN (SELECT id FROM latest_runs)
       GROUP BY crawl_run_id
     )
     SELECT
       cr.id,
       cr.mode,
       cr.status,
       cr.categories,
       cr.selection_json,
       cr.market_id,
       cr.name,
       cr.scope_label,
       cr.discovered_count,
       cr.error_count,
       cr.api_calls_used,
       cr.last_error,
       cr.blocked_reason,
       cr.blocked_at,
       cr.blocked_error_code,
       cr.created_at,
       cr.started_at,
       cr.ended_at,
       lm.name as market_name,
       lm.country_code,
       COALESCE(uc.total_units, 0) as total_units,
       COALESCE(uc.done_units, 0) as done_units,
       COALESCE(uc.failed_units, 0) as failed_units,
       COALESCE(uc.retry_wait_units, 0) as retry_wait_units,
       COALESCE(uc.open_units, 0) as open_units,
       COALESCE(uc.running_units, 0) as running_units,
       COALESCE(uc.canceled_units, 0) as canceled_units,
       COALESCE(uc.pages_fetched, 0) as pages_fetched,
       COALESCE(uc.raw_places_seen, 0) as raw_places_seen,
       COALESCE(uc.new_places_seen, 0) as new_places_seen,
       COALESCE(uc.duplicate_places_seen, 0) as duplicate_places_seen
     FROM latest_runs cr
     LEFT JOIN location_markets lm ON lm.id = cr.market_id
     LEFT JOIN unit_counts uc ON uc.crawl_run_id = cr.id
     ORDER BY cr.created_at DESC
     `
  ).all(...scopeArgs, boundedLimit) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const categories = safeParseJson<string[]>(row.categories, []);
    const selection = safeParseJson<Record<string, unknown> | null>(row.selection_json, null);
    const createdAt = normalizeDateText(row.created_at);
    const marketName = (row.market_name as string | null) ?? null;
    const countryCode = (row.country_code as CountryCode | null) ?? null;
    return {
      id: row.id as string,
      name: normalizeNullableText(row.name as string | null) ?? buildDiscoveryItemName(marketName, createdAt),
      scopeLabel: normalizeNullableText(row.scope_label as string | null) ?? buildDiscoveryScopeLabel(marketName, countryCode),
      status: row.status as string,
      mode: row.mode as string,
      discoveryMode: normalizeDiscoveryModeFromSelection(selection),
      marketId: (row.market_id as string | null) ?? null,
      marketName,
      countryCode,
      categories,
      discoveredCount: Number(row.discovered_count) || 0,
      errorCount: Number(row.error_count) || 0,
      apiCallsUsed: Number(row.api_calls_used) || 0,
      lastError: (row.last_error as string | null) ?? null,
      blockedReason: (row.blocked_reason as string | null) ?? null,
      blockedAt: normalizeNullableDateText(row.blocked_at),
      blockedErrorCode: (row.blocked_error_code as string | null) ?? null,
      createdAt,
      startedAt: normalizeNullableDateText(row.started_at),
      endedAt: normalizeNullableDateText(row.ended_at),
      totalUnits: Number(row.total_units) || 0,
      doneUnits: Number(row.done_units) || 0,
      failedUnits: Number(row.failed_units) || 0,
      retryWaitUnits: Number(row.retry_wait_units) || 0,
      openUnits: Number(row.open_units) || 0,
      runningUnits: Number(row.running_units) || 0,
      canceledUnits: Number(row.canceled_units) || 0,
      pagesFetched: Number(row.pages_fetched) || 0,
      rawPlacesSeen: Number(row.raw_places_seen) || 0,
      newPlacesSeen: Number(row.new_places_seen) || 0,
      duplicatePlacesSeen: Number(row.duplicate_places_seen) || 0,
    };
  });
}

function normalizeDiscoveryModeFromSelection(selection: Record<string, unknown> | null): "coverage_probe" | "lead_harvest" | null {
  const value = selection?.discoveryMode;
  return value === "coverage_probe" || value === "lead_harvest" ? value : null;
}

function buildDiscoveryItemName(marketName: string | null, createdAt: string): string {
  const date = createdAt ? createdAt.slice(0, 10) : "unscheduled";
  return `${marketName ?? "Discovery"} discovery - ${date}`;
}

function buildDiscoveryScopeLabel(marketName: string | null, countryCode: CountryCode | null): string {
  return [marketName, countryCode].filter(Boolean).join(" / ") || "Unscoped discovery";
}

export async function updateCrawlRunStatus(id: string, status: string): Promise<void>{
  const db = await getDb();
  const now = nowISO();
  if (status === "running" || status === "queued") {
    await db.prepare(
      `UPDATE crawl_runs
       SET status = ?,
           ended_at = NULL,
           blocked_reason = NULL,
           blocked_at = NULL,
           blocked_error_code = NULL,
           last_error = NULL,
           updated_at = ?
       WHERE id = ?`
    ).run(status, now, id);
    return;
  }

  const endedAt = status === "done" || status === "error" || status === "canceled" ? now : null;
  await db.prepare(
    "UPDATE crawl_runs SET status = ?, ended_at = COALESCE(?, ended_at), updated_at = ? WHERE id = ?"
  ).run(status, endedAt, now, id);
}

export async function blockCrawlRun(id: string, reason: string, errorCode: string | null = null): Promise<void> {
  const db = await getDb();
  const now = nowISO();
  await db.prepare(
    `UPDATE crawl_runs
     SET status = 'blocked',
         blocked_reason = ?,
         blocked_at = ?,
         blocked_error_code = ?,
         last_error = ?,
         ended_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(reason, now, errorCode, reason, now, now, id);
}

export async function cancelCrawlRun(runId: string, reason = "Stopped by user"): Promise<{ canceledUnits: number }> {
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE crawl_units
     SET status = 'canceled',
         finished_at = ?,
         last_error = COALESCE(last_error, ?)
     WHERE crawl_run_id = ?
       AND status IN ('pending','running','retry_wait')`
  ).run(now, reason, runId);

  await db.prepare(
    `UPDATE crawl_runs
     SET status = 'canceled',
         ended_at = ?,
         last_error = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(now, reason, now, runId);

  return { canceledUnits: result.changes };
}

export async function incrementCrawlRunCounters(id: string, discovered: number, errors: number, apiCalls: number): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE crawl_runs SET discovered_count = discovered_count + ?, error_count = error_count + ?, api_calls_used = api_calls_used + ? WHERE id = ?`
  ).run(discovered, errors, apiCalls, id);
}

// ─── Crawl Units ───

export async function createCrawlUnits(runId: string, categories: string[], options: { maxPages?: number } = {}): Promise<number>{
  const db = await getDb();
  const zips = await getActiveZipCodes();
  const maxPages = Math.max(1, Math.min(3, Math.floor(options.maxPages ?? 1)));

  const insert = await db.prepare(
    `INSERT INTO crawl_units (
      id, crawl_run_id, zip, market_id, location_cell_id, country_code, query_location_label,
      category, status, max_pages, created_at
    ) VALUES (?, ?, ?, ?, ?, 'US', ?, ?, 'pending', ?, ?)`
  );

  const now = nowISO();
  let count = 0;
  for (const zip of zips) {
    for (const category of categories) {
      await insert.run(
        generateId(),
        runId,
        zip.zip,
        COLORADO_MARKET_ID,
        coloradoCellId(zip.zip),
        buildQueryLocationLabel({
          countryCode: "US",
          adminArea1: zip.state,
          locality: zip.city,
          postalCode: zip.zip,
          cellType: "zip",
        }),
        category,
        maxPages,
        now,
      );
      count++;
    }
  }

  return count;
}

export async function createCrawlUnitsForSelection(runId: string, categories: string[], zipCodes: string[], options: { maxPages?: number } = {}): Promise<number>{
  const db = await getDb();
  const maxPages = Math.max(1, Math.min(3, Math.floor(options.maxPages ?? 1)));
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
    `SELECT zip, city, state, county, lat, lng, is_active
     FROM zip_codes
     WHERE is_active = 1 AND zip IN (${placeholders})
     ORDER BY zip`
  ).all(...normalizedZipCodes) as ZipCode[];

  if (activeZips.length === 0) {
    return 0;
  }

  const insert = await db.prepare(
    `INSERT INTO crawl_units (
      id, crawl_run_id, zip, market_id, location_cell_id, country_code, query_location_label,
      category, status, max_pages, created_at
    ) VALUES (?, ?, ?, ?, ?, 'US', ?, ?, 'pending', ?, ?)`
  );

  const now = nowISO();
  let count = 0;
  for (const zip of activeZips) {
    for (const category of normalizedCategories) {
      await insert.run(
        generateId(),
        runId,
        zip.zip,
        COLORADO_MARKET_ID,
        coloradoCellId(zip.zip),
        buildQueryLocationLabel({
          countryCode: "US",
          adminArea1: zip.state,
          locality: zip.city,
          postalCode: zip.zip,
          cellType: "zip",
        }),
        category,
        maxPages,
        now,
      );
      count++;
    }
  }

  return count;
}

export async function createCrawlUnitsForCells(runId: string, categories: string[], cellIds: string[], options: { maxPages?: number } = {}): Promise<number>{
  const db = await getDb();
  const maxPages = Math.max(1, Math.min(3, Math.floor(options.maxPages ?? 1)));
  const normalizedCategories = Array.from(new Set(categories.map((category) => category.trim()).filter(Boolean)));
  const normalizedCellIds = Array.from(new Set(cellIds.map((id) => id.trim()).filter(Boolean)));
  if (normalizedCategories.length === 0 || normalizedCellIds.length === 0) return 0;

  const placeholders = normalizedCellIds.map(() => "?").join(", ");
  const cells = await db.prepare(
    `SELECT c.*, m.name as market_name
     FROM location_cells c
     INNER JOIN location_markets m ON m.id = c.market_id
     WHERE c.is_active = 1 AND c.id IN (${placeholders})
     ORDER BY m.country_code, m.name, c.cell_label`
  ).all(...normalizedCellIds) as Array<Record<string, unknown>>;
  const normalizedCells = cells.map(parseLocationCellRow);
  if (normalizedCells.length === 0) return 0;

  const insert = await db.prepare(
    `INSERT INTO crawl_units (
      id, crawl_run_id, zip, market_id, location_cell_id, country_code, query_location_label,
      category, status, max_pages, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  );
  const now = nowISO();
  let count = 0;
  for (const cell of normalizedCells) {
    const zipCompat = cell.postal_code_normalized ?? cell.postal_code ?? cell.id;
    const queryLocationLabel = buildQueryLocationLabel({
      countryCode: cell.country_code,
      adminArea1: cell.admin_area1,
      adminArea2: cell.admin_area2,
      locality: cell.locality,
      postalCode: cell.postal_code_normalized ?? cell.postal_code,
      cellType: cell.cell_type,
    });
    for (const category of normalizedCategories) {
      await insert.run(
        generateId(),
        runId,
        zipCompat,
        cell.market_id,
        cell.id,
        cell.country_code,
        queryLocationLabel,
        category,
        maxPages,
        now,
      );
      count++;
    }
  }
  return count;
}

export async function getNextPendingUnit(runId: string): Promise<CrawlUnit | null>{
  const db = await getDb();
  const now = nowISO();

  await db.prepare(
    `UPDATE crawl_units SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ? AND status = 'running'
     AND started_at < datetime('now', '-5 minutes')`
  ).run(runId);
  await db.prepare(
    `UPDATE crawl_units
     SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ?
       AND status = 'retry_wait'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)`
  ).run(runId, now);

  const row = await db.prepare(
    `SELECT cu.*,
       COALESCE(c.locality, z.city) as city,
       COALESCE(c.admin_area2, z.county) as county,
       COALESCE(c.lat, z.lat) as lat,
       COALESCE(c.lng, z.lng) as lng
     FROM crawl_units cu
     LEFT JOIN location_cells c ON c.id = cu.location_cell_id
     LEFT JOIN zip_codes z ON cu.zip = z.zip
     WHERE cu.crawl_run_id = ? AND cu.status = 'pending'
     ORDER BY
       CASE
         WHEN COALESCE(c.admin_area2, z.county) = 'Denver' THEN 0
         WHEN COALESCE(c.locality, z.city) = 'Denver' THEN 1
         ELSE 2
       END,
       COALESCE(c.cell_label, cu.zip) ASC,
       cu.zip ASC,
       cu.category ASC,
       cu.created_at ASC
     LIMIT 1`
  ).get(runId) as CrawlUnit | undefined;

  return row ?? null;
}

export async function leaseNextCrawlUnit(runId: string): Promise<CrawlUnit | null> {
  const db = await getDb();
  const now = nowISO();
  await db.prepare(
    `UPDATE crawl_units SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ? AND status = 'running'
       AND started_at < datetime('now', '-5 minutes')`
  ).run(runId);
  await db.prepare(
    `UPDATE crawl_units
     SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ?
       AND status = 'retry_wait'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)`
  ).run(runId, now);

  const leased = await db.prepare(
    `UPDATE crawl_units
     SET status = 'running',
         started_at = ?,
         attempt_count = attempt_count + 1
     WHERE id = (
       SELECT cu.id
       FROM crawl_units cu
       LEFT JOIN location_cells c ON c.id = cu.location_cell_id
       LEFT JOIN zip_codes z ON cu.zip = z.zip
       WHERE cu.crawl_run_id = ? AND cu.status = 'pending'
       ORDER BY
         CASE
           WHEN COALESCE(c.admin_area2, z.county) = 'Denver' THEN 0
           WHEN COALESCE(c.locality, z.city) = 'Denver' THEN 1
           ELSE 2
         END,
         COALESCE(c.cell_label, cu.zip) ASC,
         cu.zip ASC,
         cu.category ASC,
         cu.created_at ASC
       LIMIT 1
     )
       AND status = 'pending'
     RETURNING id`
  ).get<{ id: string }>(now, runId);

  if (!leased) return null;

  const row = await db.prepare(
    `SELECT cu.*,
       COALESCE(c.locality, z.city) as city,
       COALESCE(c.admin_area2, z.county) as county,
       COALESCE(c.lat, z.lat) as lat,
       COALESCE(c.lng, z.lng) as lng
     FROM crawl_units cu
     LEFT JOIN location_cells c ON c.id = cu.location_cell_id
     LEFT JOIN zip_codes z ON cu.zip = z.zip
     WHERE cu.id = ?`
  ).get(leased.id) as CrawlUnit | undefined;

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
    `UPDATE crawl_units
     SET status = 'done',
         finished_at = ?,
         discovered_count = ?,
         next_retry_at = NULL,
         last_error_code = NULL
     WHERE id = ? AND status <> 'canceled'`
  ).run(nowISO(), discoveredCount, unitId);
}

export async function markUnitFailed(unitId: string, error: string, errorCode: string | null = null): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE crawl_units
     SET status = 'failed',
         finished_at = ?,
         last_error = ?,
         last_error_code = ?,
         next_retry_at = NULL
     WHERE id = ? AND status <> 'canceled'`
  ).run(nowISO(), error, errorCode, unitId);
}

export async function markUnitRetryWait(
  unitId: string,
  error: string,
  nextRetryAt: string,
  errorCode: string | null = null,
): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE crawl_units
     SET status = 'retry_wait',
         started_at = NULL,
         finished_at = ?,
         last_error = ?,
         last_error_code = ?,
         next_retry_at = ?
     WHERE id = ? AND status <> 'canceled'`
  ).run(nowISO(), error, errorCode, nextRetryAt, unitId);
}

export async function updateUnitPageToken(unitId: string, token: string | null): Promise<void>{
  const db = await getDb();
  await db.prepare("UPDATE crawl_units SET next_page_token = ? WHERE id = ?").run(token, unitId);
}

export async function recordUnitPageFetch(
  unitId: string,
  token: string | null,
  rawPlaces: number,
  newPlaces: number,
  duplicatePlaces: number,
): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE crawl_units
     SET next_page_token = ?,
         pages_fetched = pages_fetched + 1,
         raw_places_seen = raw_places_seen + ?,
         new_places_seen = new_places_seen + ?,
         duplicate_places_seen = duplicate_places_seen + ?
     WHERE id = ?`
  ).run(
    token,
    Math.max(0, Math.floor(rawPlaces)),
    Math.max(0, Math.floor(newPlaces)),
    Math.max(0, Math.floor(duplicatePlaces)),
    unitId,
  );
}

export async function retryFailedUnits(runId: string): Promise<number>{
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE crawl_units
     SET status = 'pending',
         started_at = NULL,
         finished_at = NULL,
         next_retry_at = NULL,
         last_error = NULL,
         last_error_code = NULL
     WHERE crawl_run_id = ?
       AND status IN ('failed','retry_wait')`
  ).run(runId);
  return result.changes;
}

export async function getCrawlRunRemainingSearchCalls(
  runId: string,
  mode: "open" | "failed" | "open_or_failed" = "open_or_failed",
): Promise<number> {
  const db = await getDb();
  const statusSql = mode === "open"
    ? "status IN ('pending','running','retry_wait')"
    : mode === "failed"
      ? "status = 'failed'"
      : "status IN ('pending','running','retry_wait','failed')";
  const row = await db.prepare(
    `SELECT COALESCE(SUM(
       CASE
         WHEN COALESCE(max_pages, 1) > COALESCE(pages_fetched, 0)
           THEN COALESCE(max_pages, 1) - COALESCE(pages_fetched, 0)
         ELSE 0
       END
     ), 0) as calls
     FROM crawl_units
     WHERE crawl_run_id = ?
       AND ${statusSql}`
  ).get(runId) as { calls: number } | undefined;
  return Number(row?.calls ?? 0);
}

export async function getCrawlProgress(runId: string): Promise<CrawlProgress> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT status, COUNT(*) as count FROM crawl_units WHERE crawl_run_id = ? GROUP BY status`
  ).all(runId) as { status: string; count: number }[];

  const counts = { total: 0, done: 0, failed: 0, retryWait: 0, running: 0, pending: 0, canceled: 0 };
  for (const row of rows) {
    const count = Number(row.count) || 0;
    counts.total += count;
    if (row.status === "done") counts.done = count;
    else if (row.status === "failed") counts.failed = count;
    else if (row.status === "retry_wait") {
      counts.retryWait = count;
      counts.pending += count;
    }
    else if (row.status === "running") counts.running = count;
    else if (row.status === "canceled") counts.canceled = count;
    else if (row.status === "pending") counts.pending += count;
  }
  return counts;
}

export async function getCrawlUnitPreview(runId: string, limit = 80): Promise<CrawlUnitPreview[]> {
  const db = await getDb();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  const rows = await db.prepare(
    `SELECT
       cu.id,
       cu.status,
       cu.zip,
       cu.market_id,
       cu.location_cell_id,
       cu.country_code,
       cu.query_location_label,
       COALESCE(c.locality, z.city) as city,
       COALESCE(c.admin_area2, z.county) as county,
       cu.category,
       cu.attempt_count,
       cu.discovered_count,
       cu.started_at,
       cu.finished_at,
       cu.last_error,
       cu.next_page_token,
       cu.max_pages,
       cu.pages_fetched,
       cu.raw_places_seen,
       cu.new_places_seen,
       cu.duplicate_places_seen,
       cu.budget_blocked_at,
       cu.next_retry_at,
       cu.max_attempts,
       cu.last_error_code,
       cu.created_at
     FROM crawl_units cu
     LEFT JOIN location_cells c ON c.id = cu.location_cell_id
     LEFT JOIN zip_codes z ON cu.zip = z.zip
     WHERE cu.crawl_run_id = ?
     ORDER BY
       CASE cu.status
         WHEN 'running' THEN 0
         WHEN 'pending' THEN 1
         WHEN 'retry_wait' THEN 2
         WHEN 'failed' THEN 3
         WHEN 'canceled' THEN 4
         WHEN 'done' THEN 5
         ELSE 6
       END,
       COALESCE(cu.started_at, cu.finished_at, cu.created_at) DESC,
       cu.zip ASC,
       cu.category ASC
     LIMIT ?`
  ).all(runId, boundedLimit) as CrawlUnitPreview[];

  return rows.map((row) => ({
    ...row,
    attempt_count: Number(row.attempt_count) || 0,
    max_attempts: Number(row.max_attempts) || 3,
    next_retry_at: normalizeNullableDateText(row.next_retry_at),
    discovered_count: Number(row.discovered_count) || 0,
  }));
}

export async function getDiscoveryRunCandidates(runId: string, limit = 100): Promise<DiscoveryRunCandidate[]> {
  const db = await getDb();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  const rows = await db.prepare(
    `WITH run_observations AS (
       SELECT
         po.place_id,
         MAX(po.observed_at) as last_observed_at,
         COUNT(*) as observation_count,
         MAX(cu.market_id) as market_id,
         MAX(cu.location_cell_id) as location_cell_id,
         MAX(cu.country_code) as country_code,
         MAX(cu.query_location_label) as query_location_label,
         MAX(cu.category) as category
       FROM place_observations po
       LEFT JOIN crawl_units cu ON cu.id = po.crawl_unit_id
       WHERE po.crawl_run_id = ?
       GROUP BY po.place_id
     )
     SELECT
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
       pm.primary_type,
       pm.lat,
       pm.lng,
       pm.completeness_score,
       pm.freshness_score,
       pm.verification_coverage,
       pm.first_seen_at,
       pm.last_seen_at,
       ro.last_observed_at,
       ro.observation_count,
       ro.market_id,
       ro.location_cell_id,
       ro.country_code,
       ro.query_location_label,
       ro.category,
       l.id as lead_id,
       l.status as lead_status,
       l.is_excluded as lead_is_excluded
     FROM run_observations ro
     INNER JOIN places_master pm ON pm.place_id = ro.place_id
     LEFT JOIN leads l ON l.place_id = pm.place_id
     ORDER BY
       CASE WHEN l.id IS NULL THEN 0 ELSE 1 END,
       CASE WHEN pm.website_uri IS NULL OR pm.website_uri = '' THEN 0 ELSE 1 END,
       pm.user_rating_count DESC,
       pm.rating DESC,
       pm.name ASC
     LIMIT ?`
  ).all(runId, boundedLimit) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const hasLead = Boolean(row.lead_id);
    const leadIsExcluded = hasLead ? isLeadExcluded(row.lead_is_excluded) : false;
    return {
      placeId: row.place_id as string,
      name: normalizeNullableText(row.name as string | null),
      address: normalizeNullableText(row.address as string | null),
      phone: normalizeNullableText(row.phone as string | null),
      websiteUri: normalizeNullableText(row.website_uri as string | null),
      mapsUri: normalizeNullableText(row.maps_uri as string | null),
      categories: safeParseJson<string[]>(row.categories, []),
      rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
      userRatingCount: row.user_rating_count === null || row.user_rating_count === undefined ? null : Number(row.user_rating_count),
      businessStatus: normalizeNullableText(row.business_status as string | null),
      primaryType: normalizeNullableText(row.primary_type as string | null),
      lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
      lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
      completenessScore: Number(row.completeness_score) || 0,
      freshnessScore: Number(row.freshness_score) || 0,
      verificationCoverage: Number(row.verification_coverage) || 0,
      firstSeenAt: normalizeDateText(row.first_seen_at),
      lastSeenAt: normalizeDateText(row.last_seen_at),
      lastObservedAt: normalizeNullableDateText(row.last_observed_at),
      observationCount: Number(row.observation_count) || 0,
      marketId: normalizeNullableText(row.market_id as string | null),
      locationCellId: normalizeNullableText(row.location_cell_id as string | null),
      countryCode: (row.country_code as CountryCode | null) ?? null,
      queryLocationLabel: normalizeNullableText(row.query_location_label as string | null),
      category: normalizeNullableText(row.category as string | null),
      hasLead,
      leadId: normalizeNullableText(row.lead_id as string | null),
      leadStatus: normalizeNullableText(row.lead_status as string | null),
      leadIsExcluded,
      websiteStatusLabel: normalizeNullableText(row.website_uri as string | null) ? "Website present" : "No website",
      listingStatus: hasLead ? (leadIsExcluded ? "Excluded lead" : "Active lead") : "Directory candidate",
    };
  });
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
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) AS INTEGER) as canceled,
        CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining,
        CAST(COALESCE(SUM(cu.discovered_count), 0) AS INTEGER) as leadsFound,
        CAST(COALESCE(SUM(cu.attempt_count), 0) AS INTEGER) as apiCalls,
        MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
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
        CAST(COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) AS INTEGER) as canceled,
        CAST(COALESCE(SUM(CASE WHEN cu.status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END), 0) AS INTEGER) as remaining,
        CAST(COALESCE(SUM(cu.discovered_count), 0) AS INTEGER) as leadsFound,
        CAST(COALESCE(SUM(cu.attempt_count), 0) AS INTEGER) as apiCalls,
        MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
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

export async function getLeadMapZipCoverage(): Promise<LeadMapZipCoverage[]> {
  const { tenantId, workspaceId } = requireTenantContext();
  if (workspaceId !== null) throw new Error("Tenant-wide context is required");
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
       c.id,
       c.postal_code_normalized,
       c.postal_code,
       c.cell_label,
       c.locality,
       c.admin_area1,
       c.admin_area2,
       c.lat,
       c.lng
     FROM location_cells c
     WHERE c.is_active = 1
       AND c.lat IS NOT NULL
       AND c.lng IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM leads tenant_lead
         WHERE tenant_lead.tenant_id = ?
           AND tenant_lead.location_cell_id = c.id
       )
     ORDER BY c.country_code, c.postal_code_normalized, c.cell_label`
  ).all(tenantId) as Array<{
    id: string;
    postal_code_normalized: string | null;
    postal_code: string | null;
    cell_label: string;
    locality: string | null;
    admin_area1: string | null;
    admin_area2: string | null;
    lat: number;
    lng: number;
  }>;

  return rows.map((row) => ({
    zip: row.postal_code_normalized ?? row.postal_code ?? row.cell_label ?? row.id,
    city: row.locality ?? row.cell_label,
    state: row.admin_area1 ?? "",
    county: row.admin_area2 ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    leadCount: 0,
    totalUnits: 0,
    doneUnits: 0,
    failedUnits: 0,
    remainingUnits: 0,
    discoveredCount: 0,
    lastRunAt: null,
    completionRatio: 0,
    scrapeStatus: "not_started",
  }));
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
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) AS INTEGER) as canceled,
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
      CAST(COALESCE(SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END), 0) AS INTEGER) as canceled,
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
  const raw = row as ZipProgress & {
    leadsfound?: number;
    leads_found?: number;
    apicalls?: number;
    api_calls?: number;
    lastrunat?: string | null;
    last_run_at?: string | null;
  };
  return {
    ...row,
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    canceled: Number(row.canceled) || 0,
    remaining: Number(row.remaining) || 0,
    leadsFound: Number(row.leadsFound ?? raw.leadsfound ?? raw.leads_found) || 0,
    apiCalls: Number(row.apiCalls ?? raw.apicalls ?? raw.api_calls) || 0,
    lastRunAt: row.lastRunAt ?? raw.lastrunat ?? raw.last_run_at ?? null,
  };
}

function normalizeCountyCoverageProgress(row: CountyCoverageProgress): CountyCoverageProgress {
  const raw = row as CountyCoverageProgress & { zipcount?: number };
  return {
    ...row,
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    canceled: Number(row.canceled) || 0,
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
    canceled: Number(row.canceled) || 0,
    remaining: Number(row.remaining) || 0,
    countyCount: Number(row.countyCount ?? raw.countycount) || 0,
    zipCount: Number(row.zipCount ?? raw.zipcount) || 0,
  };
}

// ─── Leads ───

export interface UpsertLeadResult {
  id: string;
  created: boolean;
}

function requireLeadWriteTenantId(explicitTenantId?: string): string {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) {
    throw new Error("Conflicting lead tenant contexts.");
  }
  if (workerContext && (
    workerContext.workerName !== "crawl" ||
    workerContext.action !== "crawl:process" ||
    workerContext.workspaceId !== null
  )) {
    throw new Error("Exact crawl worker context is required.");
  }
  const tenantId = memberContext?.tenantId ?? workerContext?.tenantId ?? requireTenantContext().tenantId;
  if (explicitTenantId !== undefined && explicitTenantId !== tenantId) {
    throw new Error("Lead tenant does not match the active tenant context.");
  }
  return tenantId;
}

function requireGooglePlacesCacheTenantId(): string {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) {
    throw new Error("Conflicting place cache tenant contexts.");
  }
  if (workerContext) {
    const hasExactWorkerAuthority = workerContext.workspaceId === null && (
      (workerContext.workerName === "crawl" && workerContext.action === "crawl:process") ||
      (workerContext.workerName === "enrichment" && workerContext.action === "enrichment:process")
    );
    if (!hasExactWorkerAuthority) {
      throw new Error("Exact crawl or enrichment worker context is required.");
    }
  }
  return memberContext?.tenantId ?? workerContext?.tenantId ?? requireTenantContext().tenantId;
}

function requireExactEnrichmentWorkerTenantId(leasedTenantId?: string): string {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) throw new Error("Conflicting enrichment tenant contexts.");
  if (
    memberContext ||
    !workerContext ||
    workerContext.workerName !== "enrichment" ||
    workerContext.action !== "enrichment:process" ||
    workerContext.workspaceId !== null
  ) {
    throw new Error("Exact enrichment worker context is required.");
  }
  if (leasedTenantId !== undefined && leasedTenantId !== workerContext.tenantId) {
    throw new Error("Enrichment tenant does not match the active worker context.");
  }
  return workerContext.tenantId;
}

export async function upsertLead(data: {
  tenantId?: string;
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
    market_id?: string | null;
    location_cell_id?: string | null;
    country_code?: CountryCode | string | null;
    admin_area1?: string | null;
    admin_area2?: string | null;
    locality?: string | null;
    postal_code?: string | null;
  selling_niche?: string | null;
  business_type?: BusinessType | null;
  qualification_status?: QualificationStatus;
  disqualification_reason?: string | null;
  website_verified_at?: string | null;
  contactability_score?: number;
  estimated_deal_value?: number;
  is_excluded?: boolean;
  exclusion_reason?: string | null;
}): Promise<UpsertLeadResult>{
  const tenantId = requireLeadWriteTenantId(data.tenantId);
  return withDbTransaction(async () => {
    const db = await getDb();
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
    const id = generateId();
    const now = nowISO();
    const categoriesJson = JSON.stringify(categories);
    const normalizedCountry = data.country_code ? normalizeCountryCode(data.country_code) : null;
    const sellingNiche = data.selling_niche ?? qualification.sellingNiche;
    const contactabilityScore = data.contactability_score ?? qualification.contactabilityScore;
    const estimatedDealValue = data.estimated_deal_value ?? qualification.estimatedDealValue;

    const inserted = await db.prepare(
    `INSERT INTO leads (tenant_id, id, place_id, name, address, phone, categories, rating, review_count,
      website_uri, website_status, maps_uri, business_status, price_level,
      photo_count, has_opening_hours, primary_type, lat, lng,
      market_id, location_cell_id, country_code, admin_area1, admin_area2, locality, postal_code,
      score, selling_niche, business_type, qualification_status, disqualification_reason, website_verified_at,
      contactability_score, estimated_deal_value, is_excluded, exclusion_reason, excluded_at,
      discovered_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      + " ON CONFLICT(tenant_id, place_id) DO NOTHING RETURNING id"
  ).get<{ id: string }>(
    tenantId, id, data.place_id, data.name ?? null, data.address ?? null, data.phone ?? null,
    categoriesJson, data.rating ?? null, data.review_count ?? null,
    data.website_uri ?? null, websiteStatus,
    data.maps_uri ?? null, data.business_status ?? null,
    data.price_level ?? null, data.photo_count ?? 0,
    data.has_opening_hours ? 1 : 0, data.primary_type ?? null,
    data.lat ?? null, data.lng ?? null,
    data.market_id ?? null,
    data.location_cell_id ?? null,
    normalizedCountry,
    data.admin_area1 ?? null,
    data.admin_area2 ?? null,
    data.locality ?? null,
    data.postal_code ?? null,
    data.score ?? 0,
    sellingNiche,
    businessType,
    qualificationStatus,
    disqualificationReason,
    data.website_verified_at ?? null,
    contactabilityScore,
    estimatedDealValue,
    shouldExclude ? 1 : 0,
    exclusionReason,
    shouldExclude ? now : null,
    now, now, now,
  );

  if (inserted?.id) {
    await updateLeadQualityScoresForTenant(tenantId, inserted.id);
    return { id: inserted.id, created: true };
  }

  const updated = await db.prepare(
    `UPDATE leads SET
      name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone),
      categories = COALESCE(?, categories), rating = COALESCE(?, rating), review_count = COALESCE(?, review_count),
      website_uri = COALESCE(?, website_uri), website_status = COALESCE(?, website_status),
      maps_uri = COALESCE(?, maps_uri), business_status = COALESCE(?, business_status),
      price_level = COALESCE(?, price_level), photo_count = COALESCE(?, photo_count),
      has_opening_hours = COALESCE(?, has_opening_hours), primary_type = COALESCE(?, primary_type),
      lat = COALESCE(?, lat), lng = COALESCE(?, lng),
      market_id = COALESCE(?, market_id),
      location_cell_id = COALESCE(?, location_cell_id),
      country_code = COALESCE(?, country_code),
      admin_area1 = COALESCE(?, admin_area1),
      admin_area2 = COALESCE(?, admin_area2),
      locality = COALESCE(?, locality),
      postal_code = COALESCE(?, postal_code),
      score = COALESCE(?, score),
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
     WHERE tenant_id = ? AND place_id = ?
     RETURNING id`
  ).get<{ id: string }>(
    data.name ?? null, data.address ?? null, data.phone ?? null,
    data.categories ? categoriesJson : null,
    data.rating ?? null, data.review_count ?? null,
    data.website_uri ?? null, data.website_status ?? null,
    data.maps_uri ?? null, data.business_status ?? null,
    data.price_level ?? null, data.photo_count ?? null,
    data.has_opening_hours != null ? (data.has_opening_hours ? 1 : 0) : null,
    data.primary_type ?? null, data.lat ?? null, data.lng ?? null,
    data.market_id ?? null,
    data.location_cell_id ?? null,
    normalizedCountry,
    data.admin_area1 ?? null,
    data.admin_area2 ?? null,
    data.locality ?? null,
    data.postal_code ?? null,
    data.score ?? null,
    sellingNiche,
    businessType,
    qualificationStatus,
    disqualificationReason,
    data.website_verified_at ?? null,
    contactabilityScore,
    estimatedDealValue,
    shouldExclude ? 1 : 0,
    exclusionReason,
    shouldExclude ? 1 : 0,
    now,
    now,
    tenantId,
    data.place_id,
  );
  if (!updated) throw new Error(`Failed to upsert lead for place_id ${data.place_id}.`);
  await updateLeadQualityScoresForTenant(tenantId, updated.id);
  return { id: updated.id, created: false };
  });
}

export interface ManualLeadInput {
  tenantId: string;
  name: string;
  businessType: BusinessType | string;
  phone?: string | null;
  address?: string | null;
  mapsUri?: string | null;
  source?: string | null;
  contactPersonName?: string | null;
  websiteStatus?: WebsiteStatus | string;
  notes?: string | null;
}

export async function createManualLead(input: ManualLeadInput): Promise<Lead> {
  const websiteStatus = normalizeWebsiteStatus(input.websiteStatus);
  const notes = composeManualLeadNotes(input);
  const { id } = await upsertLead({
    tenantId: input.tenantId,
    place_id: `manual:${generateId()}`,
    name: input.name,
    address: input.address ?? null,
    phone: input.phone ?? null,
    categories: [],
    website_status: websiteStatus,
    maps_uri: input.mapsUri ?? null,
    score: 0,
    business_type: input.businessType as BusinessType,
    qualification_status: "needs_verification",
    is_excluded: false,
  });
  const db = await getDb();
  await db.prepare(
    `UPDATE leads
     SET status = 'new',
         quality_bucket = 'needs_ai_verify',
         enrichment_status = 'pending',
         ai_verification_status = 'not_checked',
         ai_queue_status = CASE WHEN website_status = 'none' THEN 'queued' ELSE ai_queue_status END,
         notes = ?,
         archived_at = NULL,
         archived_by_user_id = NULL,
         archive_reason = NULL,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(notes, nowISO(), input.tenantId, id);
  const lead = await getLeadById(id);
  if (!lead) throw new Error("Manual lead was created but could not be loaded.");
  return lead;
}

function composeManualLeadNotes(input: ManualLeadInput): string | null {
  const source = input.source?.trim();
  const contactPersonName = input.contactPersonName?.trim();
  const notes = input.notes?.trim();
  const parts = [
    source ? `Source: ${source}` : null,
    contactPersonName ? `Contact person: ${contactPersonName}` : null,
    notes || null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("\n\n") : null;
}

function normalizeWebsiteStatus(value: unknown): WebsiteStatus {
  return value === "social" || value === "basic" || value === "custom" ? value : "none";
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
  "estimated_deal_value",
  "rating",
  "review_count",
  "name",
  "created_at",
];
const SCORE_ELIGIBLE_CONDITION = "COALESCE(is_excluded, 0) = 0 AND archived_at IS NULL";
const NO_WEBSITE_OPPORTUNITY_STATUSES = new Set(["none", "social", "basic"]);
const EXCLUDED_STATUS_FILTER = "excluded";
export const API_ENDPOINT_TEXT_SEARCH = "places.searchText";
export const API_ENDPOINT_PLACE_DETAILS = "places.placeDetails";

function noUsableAiWebsiteCondition(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return `NOT (${prefix}ai_verification_status = 'site_found' AND ${prefix}ai_website_viability_status = 'usable' AND COALESCE(${prefix}ai_found_website_url, '') != '')`;
}

function leadWebsiteNeedRankExpression(alias = "l"): string {
  const prefix = `${alias}.`;
  return `CASE
    WHEN ${prefix}website_status = 'none'
      AND (${prefix}ai_verification_status IN ('no_site_found','not_checked') OR ${prefix}ai_website_viability_status IS NULL OR ${prefix}ai_website_viability_status IN ('directory_only','not_found')) THEN 5
    WHEN ${prefix}ai_website_viability_status IN ('broken','parked','placeholder')
      OR ${prefix}quality_bucket = 'broken_site_opportunity' THEN 4
    WHEN ${prefix}website_status = 'social'
      OR ${prefix}ai_website_viability_status = 'directory_only' THEN 3
    WHEN ${prefix}ai_verification_status = 'weak_site_found'
      OR ${prefix}website_status = 'basic' THEN 2
    WHEN ${prefix}website_status IN ('none','social','basic') THEN 1
    ELSE 0
  END`;
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

  if (filters.archived === "archived") {
    conditions.push("l.archived_at IS NOT NULL");
  } else if (filters.archived !== "all") {
    conditions.push("l.archived_at IS NULL");
  }

  if (filters.status === EXCLUDED_STATUS_FILTER) {
    conditions.push("COALESCE(l.is_excluded, 0) = 1");
  } else {
    if (!filters.includeExcluded) {
      conditions.push("COALESCE(l.is_excluded, 0) = 0");
    }
    if (filters.status) {
      conditions.push("l.status = ?");
      params.push(filters.status);
    }
  }

  if (filters.search) {
    conditions.push("(LOWER(COALESCE(l.name, '')) LIKE ? OR LOWER(COALESCE(l.phone, '')) LIKE ? OR LOWER(COALESCE(l.address, '')) LIKE ? OR LOWER(COALESCE(l.notes, '')) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    params.push(term, term, term, term);
  }
  if (filters.websiteStatus) {
    conditions.push("l.website_status = ?");
    params.push(filters.websiteStatus);
    if (NO_WEBSITE_OPPORTUNITY_STATUSES.has(filters.websiteStatus)) {
      conditions.push(noUsableAiWebsiteCondition("l"));
    }
  }
  if (filters.enrichment) {
    conditions.push("l.enrichment_status = ?");
    params.push(filters.enrichment);
  }
  if (filters.city) {
    conditions.push("l.address LIKE ?");
    params.push(`%${filters.city}%`);
  }
  if (filters.zip) {
    conditions.push("(l.postal_code = ? OR l.address LIKE ?)");
    params.push(filters.zip, `%${filters.zip}%`);
  }
  if (filters.marketId) {
    conditions.push("l.market_id = ?");
    params.push(filters.marketId);
  }
  if (filters.countryCode) {
    conditions.push("l.country_code = ?");
    params.push(normalizeCountryCode(filters.countryCode));
  }
  if (filters.locationCellId) {
    conditions.push("l.location_cell_id = ?");
    params.push(filters.locationCellId);
  }
  if (filters.visibleToUserId) {
    conditions.push("l.market_id IN (SELECT market_id FROM user_market_access WHERE user_id = ?)");
    params.push(filters.visibleToUserId);
  }
  if (filters.minLat != null) {
    conditions.push("l.lat IS NOT NULL AND l.lat >= ?");
    params.push(filters.minLat);
  }
  if (filters.maxLat != null) {
    conditions.push("l.lat IS NOT NULL AND l.lat <= ?");
    params.push(filters.maxLat);
  }
  if (filters.minLng != null) {
    conditions.push("l.lng IS NOT NULL AND l.lng >= ?");
    params.push(filters.minLng);
  }
  if (filters.maxLng != null) {
    conditions.push("l.lng IS NOT NULL AND l.lng <= ?");
    params.push(filters.maxLng);
  }
  const minReviews = parseMinReviewsFilter(filters.minReviews);
  if (minReviews != null && minReviews > POSTGRES_INT4_MAX) {
    conditions.push("1 = 0");
  } else if (minReviews != null && minReviews > 0) {
    conditions.push("l.review_count >= ?");
    params.push(minReviews);
  }
  if (filters.minRating != null && filters.minRating > 0) {
    conditions.push("l.rating >= ?");
    params.push(filters.minRating);
  }
  if (filters.minScore != null && filters.minScore > 0) {
    conditions.push("l.score >= ?");
    params.push(filters.minScore);
  }
  if (filters.category) {
    conditions.push("l.primary_type = ?");
    params.push(filters.category);
  }
  if (filters.businessType) {
    conditions.push("l.business_type = ?");
    params.push(filters.businessType);
  }
  if (filters.sellingNiche) {
    conditions.push("l.selling_niche = ?");
    params.push(filters.sellingNiche);
  }
  if (filters.qualificationStatus) {
    conditions.push("l.qualification_status = ?");
    params.push(filters.qualificationStatus);
  }
  if (filters.qualityBucket) {
    conditions.push("l.quality_bucket = ?");
    params.push(filters.qualityBucket);
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
  if (filters.assigned === "unassigned") {
    conditions.push(leadUnassignedCondition("l.assigned_to_user_id"));
  } else if (filters.assignedToUserId) {
    conditions.push("l.assigned_to_user_id = ?");
    params.push(filters.assignedToUserId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function requireTenantWideLeadReadContext(): { tenantId: string } {
  const { tenantId, workspaceId } = requireTenantContext();
  if (workspaceId !== null) throw new Error("Tenant-wide context is required");
  return { tenantId };
}

function requireTenantWideScoreContext(): { tenantId: string } {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) throw new Error("Conflicting score tenant contexts.");
  if (
    workerContext &&
    (workerContext.workerName !== "score_recompute" || workerContext.action !== "score_recompute:recompute")
  ) {
    throw new Error("Exact score recompute worker context is required.");
  }
  const context = memberContext ?? workerContext ?? requireTenantContext();
  if (context.workspaceId !== null) throw new Error("Tenant-wide context is required");
  return { tenantId: context.tenantId };
}

type AiTenantWorkerName = "ai_verification" | "artifact" | "crawl" | "enrichment";

const EXACT_AI_TENANT_WORKER_ACTIONS: Record<AiTenantWorkerName, string> = {
  ai_verification: "ai_verification:process",
  artifact: "artifact:process",
  crawl: "crawl:process",
  enrichment: "enrichment:process",
};

function requireAiTenantId(
  explicitTenantId?: string,
  allowedWorkers: readonly AiTenantWorkerName[] = ["ai_verification"],
): string {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  if (memberContext && workerContext) throw new Error("Conflicting AI tenant contexts.");

  if (memberContext) {
    if (memberContext.workspaceId !== null) throw new Error("Tenant-wide AI context is required.");
    if (explicitTenantId !== undefined && explicitTenantId !== memberContext.tenantId) {
      throw new Error("AI tenant does not match the active tenant context.");
    }
    return memberContext.tenantId;
  }

  const workerName = workerContext?.workerName as AiTenantWorkerName | undefined;
  if (
    !workerContext ||
    workerContext.workspaceId !== null ||
    !workerName ||
    !allowedWorkers.includes(workerName) ||
    EXACT_AI_TENANT_WORKER_ACTIONS[workerName] !== workerContext.action
  ) {
    throw new Error("Exact AI worker context is required.");
  }
  if (explicitTenantId !== undefined && explicitTenantId !== workerContext.tenantId) {
    throw new Error("AI tenant does not match the active worker context.");
  }
  return workerContext.tenantId;
}

function bindLeadTenantScope(
  where: string,
  params: unknown[],
  tenantId: string,
): { where: string; params: unknown[] } {
  return {
    where: where ? `${where} AND l.tenant_id = ?` : "WHERE l.tenant_id = ?",
    params: [...params, tenantId],
  };
}

const TENANT_BOUND_ASSIGNEE_JOIN = `LEFT JOIN app_users au
       ON au.user_id = l.assigned_to_user_id
      AND EXISTS (
        SELECT 1
        FROM tenant_memberships tenant_membership
        WHERE tenant_membership.tenant_id = l.tenant_id
          AND tenant_membership.auth_identity_id = au.user_id
          AND tenant_membership.status = 'active'
      )`;

function leadUnassignedCondition(column: string): string {
  return `(${column} IS NULL OR CAST(${column} AS TEXT) = '')`;
}

function resolveLeadSort(filters: LeadFilters): { orderBySql: string } {
  const sortBy = filters.sortBy || "score";
  const sortDir = filters.sortDir || "desc";
  const safeSortDir = sortDir === "asc" ? "ASC" : "DESC";
  if (sortBy === "opportunity" || sortBy === "website_need") {
    return {
      orderBySql: [
        `${leadWebsiteNeedRankExpression("l")} ${safeSortDir}`,
        "l.lead_quality_score DESC",
        "l.sales_priority_score DESC",
        "l.win_probability_score DESC",
        "l.score DESC",
        "l.review_count DESC",
      ].join(", "),
    };
  }
  const safeSortBy = LEAD_ALLOWED_SORT.includes(sortBy) ? sortBy : "score";
  return { orderBySql: `l.${safeSortBy} ${safeSortDir}` };
}

function fastLeadMapOrderBySql(filters: LeadFilters): string {
  const sortBy = filters.sortBy || "opportunity";
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  if (sortBy === "opportunity" || sortBy === "website_need") {
    return [
      `${leadWebsiteNeedRankExpression("l")} ${sortDir}`,
      "l.sales_priority_score DESC",
      "l.lead_quality_score DESC",
      "l.raw_opportunity_score DESC",
      "l.score DESC",
      "l.review_count DESC",
    ].join(", ");
  }
  const safeSortBy = LEAD_ALLOWED_SORT.includes(sortBy) ? sortBy : "score";
  return `l.${safeSortBy} ${sortDir}`;
}

export async function getLeads(filters: LeadFilters = {}): Promise<{ leads: Lead[]; total: number }> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const filter = buildLeadFilterWhere(filters);
  const { where, params } = bindLeadTenantScope(filter.where, filter.params, tenantId);
  const { orderBySql } = resolveLeadSort(filters);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };

  const leads = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     ${TENANT_BOUND_ASSIGNEE_JOIN}
     ${where}
     ORDER BY ${orderBySql}
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  return {
    total: countRow.count,
    leads: leads.map(parseLeadRow),
  };
}

export async function getLeadMapPoints(
  filters: Omit<LeadFilters, "page" | "pageSize"> = {},
  limit = 600,
  options: { includeTotal?: boolean; fastOrder?: boolean } = {},
): Promise<{ points: LeadMapPoint[]; totalMapped: number }> {
  const { tenantId, workspaceId } = requireTenantContext();
  if (workspaceId !== null) throw new Error("Tenant-wide context is required");
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { orderBySql } = resolveLeadSort(filters);
  const mapOrderBySql = options.fastOrder ? fastLeadMapOrderBySql(filters) : orderBySql;
  const coordinateCondition = "l.lat IS NOT NULL AND l.lng IS NOT NULL";
  const mapWhere = where ? `${where} AND ${coordinateCondition}` : `WHERE ${coordinateCondition}`;
  const scopedMapWhere = `${mapWhere} AND l.tenant_id = ?`;
  const scopedParams = [...params, tenantId];
  const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));

  const countRow = options.includeTotal === false
    ? null
    : await db.prepare(`SELECT COUNT(*) as count FROM leads l ${scopedMapWhere}`).get(...scopedParams) as { count: number };
  const rows = await db.prepare(
    `SELECT
       l.id,
       l.name,
       l.address,
       l.lat,
       l.lng,
       l.website_status,
       l.business_type,
       l.rating,
       l.review_count,
       l.score,
       l.quality_bucket,
       l.ai_verification_status,
       l.ai_checked_at,
       l.ai_website_viability_status,
       l.ai_queue_status,
       l.estimated_deal_value,
       l.assigned_to_user_id,
       au.email as assigned_user_email,
       au.display_name as assigned_user_display_name
     FROM leads l
     LEFT JOIN app_users au
       ON au.user_id = l.assigned_to_user_id
      AND EXISTS (
        SELECT 1
        FROM tenant_memberships tenant_membership
        WHERE tenant_membership.tenant_id = l.tenant_id
          AND tenant_membership.auth_identity_id = au.user_id
          AND tenant_membership.status = 'active'
      )
     ${scopedMapWhere}
     ORDER BY ${mapOrderBySql}
     LIMIT ?`
  ).all(...scopedParams, safeLimit) as Array<Record<string, unknown>>;

  return {
    totalMapped: countRow ? Number(countRow.count ?? 0) : rows.length,
    points: rows.map((row) => ({
      id: row.id as string,
      name: (row.name as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      lat: Number(row.lat),
      lng: Number(row.lng),
      website_status: (row.website_status as string) ?? "none",
      business_type: ((row.business_type as BusinessType | null) ?? "local_services"),
      rating: (row.rating as number | null) ?? null,
      review_count: (row.review_count as number | null) ?? null,
      score: Number(row.score ?? 0),
      quality_bucket: ((row.quality_bucket as QualityBucket | null) ?? "needs_ai_verify"),
      ai_verification_status: ((row.ai_verification_status as AiVerificationStatus | null) ?? "not_checked"),
      ai_checked_at: (row.ai_checked_at as string | null) ?? null,
      ai_website_viability_status: (row.ai_website_viability_status as WebsiteViabilityStatus | null) ?? null,
      ai_queue_status: normalizeAiQueueStatus(row.ai_queue_status),
      estimated_deal_value: Number(row.estimated_deal_value ?? 0),
      assigned_to_user_id: (row.assigned_to_user_id as string | null) ?? null,
      assigned_user_email: (row.assigned_user_email as string | null) ?? null,
      assigned_user_display_name: (row.assigned_user_display_name as string | null) ?? null,
    })),
  };
}

export async function getLeadsForExport(filters: LeadFilters = {}, limit = 50000): Promise<Lead[]>{
  const { tenantId } = requireTenantContext();
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { orderBySql } = resolveLeadSort(filters);
  const safeLimit = Math.min(100000, Math.max(1, Math.floor(limit)));
  const scopedWhere = where ? `${where} AND l.tenant_id = ?` : "WHERE l.tenant_id = ?";

  const rows = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     ${TENANT_BOUND_ASSIGNEE_JOIN}
     ${scopedWhere}
     ORDER BY ${orderBySql}
     LIMIT ?`
  ).all(...params, tenantId, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseLeadRow);
}

export async function getBusinessTypeCounts(filters: LeadFilters = {}): Promise<BusinessTypeCount[]>{
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const filter = buildLeadFilterWhere({ ...filters, businessType: undefined, page: undefined, pageSize: undefined });
  const { where, params } = bindLeadTenantScope(filter.where, filter.params, tenantId);
  const rows = await db.prepare(
    `SELECT COALESCE(l.business_type, 'local_services') as business_type,
            COUNT(*) as total,
            SUM(CASE WHEN COALESCE(is_excluded, 0) = 0 AND archived_at IS NULL THEN 1 ELSE 0 END) as active
     FROM leads l
     ${where}
     GROUP BY COALESCE(l.business_type, 'local_services')`
  ).all(...params) as Array<{ business_type: string; total: number; active: number }>;

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
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const filter = buildLeadFilterWhere(filters);
  const { where, params } = bindLeadTenantScope(filter.where, filter.params, tenantId);
  const { orderBySql } = resolveLeadSort(filters);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 100));
  const offset = (page - 1) * pageSize;

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };

  const rows = await db.prepare(
    `SELECT l.id, l.name, l.phone, l.rating, l.review_count, l.website_status, l.score, l.status, l.is_excluded, l.exclusion_reason,
      l.enrichment_status, l.primary_type, l.selling_niche, l.business_type, l.win_probability_score,
      l.lead_quality_score, l.quality_bucket, l.easy_build_score, l.cash_speed_score, l.need_score,
      l.quality_reason, l.recommended_offer, l.next_best_action, l.phone_verification_status,
      l.ai_verification_status, l.ai_confidence, l.ai_found_website_url, l.ai_recommendation, l.ai_summary, l.ai_checked_at,
      l.ai_website_viability_status, l.ai_website_health, l.ai_queue_status,
      l.raw_opportunity_score, l.verification_score, l.sales_priority_score, l.qualification_status,
      l.assigned_to_user_id, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     ${TENANT_BOUND_ASSIGNEE_JOIN}
     ${where}
     ORDER BY ${orderBySql}
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
    is_excluded: isLeadExcluded(row.is_excluded),
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
    assigned_to_user_id: (row.assigned_to_user_id as string | null) ?? null,
    assigned_user_email: (row.assigned_user_email as string | null) ?? null,
    assigned_user_display_name: (row.assigned_user_display_name as string | null) ?? null,
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
  const row = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
     WHERE l.id = ?`
  ).get(id) as Record<string, unknown> | undefined;
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

export async function lockTenantLeadForMutation(id: string): Promise<Lead | null> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const result = await db.prepare(
    "UPDATE leads SET updated_at = updated_at WHERE tenant_id = ? AND id = ?",
  ).run(tenantId, id);
  if (result.changes === 0) return null;
  return getLeadById(id);
}

export async function updateLeadFacts(id: string, input: LeadFactsInput): Promise<Lead | null> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const current = await getLeadById(id);
  if (!current) {
    return null;
  }

  const db = await getDb();
  const now = nowISO();
  const leadUpdates: string[] = [];
  const leadValues: unknown[] = [];
  const placeUpdates: string[] = [];
  const placeValues: unknown[] = [];

  const setLead = (column: string, value: unknown) => {
    leadUpdates.push(`${column} = ?`);
    leadValues.push(value);
  };

  const setPlace = (column: string, value: unknown) => {
    placeUpdates.push(`${column} = ?`);
    placeValues.push(value);
  };

  if (input.name !== undefined) {
    setLead("name", input.name);
    setPlace("name", input.name);
  }
  if (input.phone !== undefined) {
    setLead("phone", input.phone);
    setPlace("phone", input.phone);
  }
  if (input.address !== undefined) {
    setLead("address", input.address);
    setPlace("address", input.address);
  }
  if (input.primaryType !== undefined) {
    setLead("primary_type", input.primaryType);
    setPlace("primary_type", input.primaryType);
  }
  if (input.businessType !== undefined) {
    setLead("business_type", input.businessType);
  }
  if (input.status !== undefined) {
    setLead("status", input.status);
  }
  if (input.notes !== undefined) {
    setLead("notes", input.notes);
  }
  if (input.websiteUrl !== undefined) {
    const nextWebsiteStatus = input.websiteStatus ?? (input.websiteUrl ? "custom" : "none");
    setLead("website_uri", input.websiteUrl);
    setLead("website_status", nextWebsiteStatus);
    setLead("website_verified_at", input.websiteUrl ? now : null);
    setPlace("website_uri", input.websiteUrl);
  }

  if (leadUpdates.length === 0) {
    return current;
  }

  setLead("updated_at", now);

  const updated = await db.prepare(
    `UPDATE leads SET ${leadUpdates.join(", ")} WHERE tenant_id = ? AND id = ?`,
  ).run(...leadValues, tenantId, id);
  if (updated.changes === 0) return null;

  if (current.place_id && placeUpdates.length > 0) {
    placeUpdates.push("updated_at = ?");
    placeValues.push(now, tenantId, current.place_id);
    await db
      .prepare(`UPDATE places_master SET ${placeUpdates.join(", ")} WHERE tenant_id = ? AND place_id = ?`)
      .run(...placeValues);
  }

  await updateLeadQualityScores(id, input.actorUserId ?? null);
  return getLeadById(id);
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

export async function claimLeadForUser(
  leadId: string,
  userId: string,
  options: { preserveAdminSemantics?: boolean } = {},
): Promise<number> {
  const db = await getDb();
  if (options.preserveAdminSemantics) {
    const result = await db.prepare(
      `UPDATE leads
       SET assigned_to_user_id = ?, updated_at = ?
       WHERE id = ?
         AND (${leadUnassignedCondition("assigned_to_user_id")} OR assigned_to_user_id = ?)`
    ).run(userId, nowISO(), leadId, userId);
    return result.changes;
  }

  const result = await db.prepare(
    `UPDATE leads
     SET assigned_to_user_id = ?, updated_at = ?
     WHERE id = ?
       AND archived_at IS NULL
       AND COALESCE(is_excluded, 0) = 0
       AND ${leadUnassignedCondition("assigned_to_user_id")}`
  ).run(userId, nowISO(), leadId);
  return result.changes;
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

export async function archiveLead(id: string, userId: string, reason: string): Promise<number> {
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET archived_at = ?,
         archived_by_user_id = ?,
         archive_reason = ?,
         updated_at = ?
     WHERE id = ?
       AND archived_at IS NULL`
  ).run(now, userId, reason, now, id);
  return result.changes;
}

export async function restoreArchivedLead(id: string): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads
     SET archived_at = NULL,
         archived_by_user_id = NULL,
         archive_reason = NULL,
         updated_at = ?
     WHERE id = ?
       AND archived_at IS NOT NULL`
  ).run(nowISO(), id);
  if (result.changes > 0) await updateLeadQualityScores(id);
  return result.changes;
}

export async function bulkArchiveLeads(ids: string[], userId: string, reason: string): Promise<number> {
  const safeIds = uniqueIds(ids);
  if (safeIds.length === 0) return 0;
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET archived_at = ?,
         archived_by_user_id = ?,
         archive_reason = ?,
         updated_at = ?
     WHERE id IN (${safeIds.map(() => "?").join(",")})
       AND archived_at IS NULL`
  ).run(now, userId, reason, now, ...safeIds);
  return result.changes;
}

export async function bulkRestoreArchivedLeads(ids: string[]): Promise<number> {
  const safeIds = uniqueIds(ids);
  if (safeIds.length === 0) return 0;
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads
     SET archived_at = NULL,
         archived_by_user_id = NULL,
         archive_reason = NULL,
         updated_at = ?
     WHERE id IN (${safeIds.map(() => "?").join(",")})
       AND archived_at IS NOT NULL`
  ).run(nowISO(), ...safeIds);
  return result.changes;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 500);
}

// ─── AI Verification ───

export async function getLatestAiVerification(leadId: string): Promise<AiLeadVerification | null>{
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const row = await db.prepare(
    "SELECT * FROM ai_lead_verifications WHERE tenant_id = ? AND lead_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(tenantId, leadId) as Record<string, unknown> | undefined;
  return row ? parseAiLeadVerificationRow(row) : null;
}

export async function getAiVerificationById(id: string): Promise<AiLeadVerification | null>{
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM ai_lead_verifications WHERE tenant_id = ? AND id = ?")
    .get(tenantId, id) as Record<string, unknown> | undefined;
  return row ? parseAiLeadVerificationRow(row) : null;
}

export async function createAiLeadVerification(input: AiLeadVerificationInput): Promise<AiLeadVerification>{
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const lead = await db.prepare("SELECT 1 FROM leads WHERE tenant_id = ? AND id = ?")
    .get(tenantId, input.lead_id);
  if (!lead) throw new Error("Lead is unavailable.");
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO ai_lead_verifications (
      tenant_id, id, lead_id, model, status, confidence, found_website_url, found_email, found_phone,
      social_profiles, sources, recommendation, reason, summary, raw_json, input_hash,
      website_viability_status, website_health_json, website_viability_reason,
      usage_input_tokens, usage_output_tokens, estimated_cost, error,
      requested_by_user_id, request_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
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
    input.requested_by_user_id ?? null,
    input.request_source ?? null,
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
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const ownedVerification = await db.prepare(
    "SELECT 1 FROM ai_lead_verifications WHERE tenant_id = ? AND id = ? AND lead_id = ?",
  ).get(tenantId, verification.id, leadId);
  if (!ownedVerification) throw new Error("AI verification is unavailable.");
  const foundWebsiteUrl = verification.found_website_url?.trim() || null;
  const hasUsableWebsite = verification.status === "site_found" && verification.website_viability_status === "usable" && Boolean(foundWebsiteUrl);
  const hasWeakWebsiteOpportunity = verification.status === "weak_site_found" && isWeakWebsiteViability(verification.website_viability_status) && Boolean(foundWebsiteUrl);
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
      website_uri = CASE
        WHEN ? = 1 OR ? = 1 THEN ?
        ELSE website_uri
      END,
      website_status = CASE
        WHEN ? = 1 THEN 'custom'
        WHEN ? = 1 AND website_status != 'custom' THEN 'basic'
        ELSE website_status
      END,
      qualification_status = CASE
        WHEN ? = 1 THEN 'disqualified'
        ELSE qualification_status
      END,
      disqualification_reason = CASE
        WHEN ? = 1 THEN 'AI found existing usable website'
        ELSE disqualification_reason
      END,
      score = CASE
        WHEN ? = 1 THEN 0
        ELSE score
      END,
      win_probability_score = ?,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(
    verification.status,
    clamp01(verification.confidence),
    foundWebsiteUrl,
    verification.recommendation,
    verification.summary,
    verification.created_at,
    verification.website_viability_status,
    verification.website_health_json ? JSON.stringify(verification.website_health_json) : null,
    hasUsableWebsite ? 1 : 0,
    hasWeakWebsiteOpportunity ? 1 : 0,
    foundWebsiteUrl,
    hasUsableWebsite ? 1 : 0,
    hasWeakWebsiteOpportunity ? 1 : 0,
    hasUsableWebsite ? 1 : 0,
    hasUsableWebsite ? 1 : 0,
    hasUsableWebsite ? 1 : 0,
    clampPercentage(winProbabilityScore),
    nowISO(),
    tenantId,
    leadId,
  );
  await updateLeadQualityScoresForTenant(tenantId, leadId);
}

export async function getLeadForAiQueue(leadId: string): Promise<Lead | null> {
  const tenantId = requireAiTenantId(undefined, ["ai_verification", "crawl", "enrichment"]);
  const db = await getDb();
  const row = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
     WHERE l.tenant_id = ? AND l.id = ?`,
  ).get(tenantId, leadId) as Record<string, unknown> | undefined;
  return row ? parseLeadRow(row) : null;
}

export async function markLeadAiError(leadId: string, message: string): Promise<void>{
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_verification_status = 'error',
      ai_summary = ?,
      ai_checked_at = ?,
      ai_website_viability_status = NULL,
      ai_website_health = NULL,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(message, nowISO(), nowISO(), tenantId, leadId);
  if (result.changes > 0) await updateLeadQualityScoresForTenant(tenantId, leadId);
}

export async function logAiUsageEvent(input: AiUsageEventInput): Promise<void>{
  const tenantId = requireAiTenantId(undefined, ["ai_verification", "artifact"]);
  const db = await getDb();
  if (input.lead_id) {
    const lead = await db.prepare("SELECT 1 FROM leads WHERE tenant_id = ? AND id = ?")
      .get(tenantId, input.lead_id);
    if (!lead) throw new Error("Lead is unavailable.");
  }
  if (input.verification_id) {
    const verification = await db.prepare(
      "SELECT 1 FROM ai_lead_verifications WHERE tenant_id = ? AND id = ?",
    ).get(tenantId, input.verification_id);
    if (!verification) throw new Error("AI verification is unavailable.");
  }
  const inputTokens = Math.max(0, Math.floor(input.input_tokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(input.output_tokens ?? 0));
  await db.prepare(
    `INSERT INTO ai_usage_events (
      tenant_id, id, lead_id, verification_id, model, endpoint, success, was_cached,
      input_tokens, output_tokens, total_tokens, estimated_cost, metadata,
      actor_user_id, request_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
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
    input.actor_user_id ?? null,
    input.request_source ?? null,
    nowISO(),
  );
}

export async function getAiUsageForActor(
  actorUserId: string,
  sinceIso: string,
  requestSources: string[] = ["researcher_ai_check", "researcher_pitch_pack"],
): Promise<ActorAiUsageSummary> {
  const tenantId = requireAiTenantId(undefined, ["ai_verification", "artifact"]);
  const db = await getDb();
  const sources = requestSources.map((source) => source.trim()).filter(Boolean);
  if (!actorUserId || sources.length === 0) return { calls: 0, cost: 0 };
  const placeholders = sources.map(() => "?").join(",");
  const params = [tenantId, actorUserId, ...sources, sinceIso];
  const events = await db.prepare(
    `SELECT id, verification_id, estimated_cost, was_cached, metadata
     FROM ai_usage_events
     WHERE tenant_id = ?
       AND actor_user_id = ?
       AND request_source IN (${placeholders})
       AND created_at >= ?`
  ).all(...params) as Array<{
    id: string;
    verification_id: string | null;
    estimated_cost: number;
    was_cached: number | boolean;
    metadata: unknown;
  }>;
  const verifications = await db.prepare(
    `SELECT id, estimated_cost
     FROM ai_lead_verifications
     WHERE tenant_id = ?
       AND requested_by_user_id = ?
       AND request_source IN (${placeholders})
       AND created_at >= ?
       AND estimated_cost > 0`
  ).all(...params) as Array<{ id: string; estimated_cost: number }>;
  const artifacts = await db.prepare(
    `SELECT id, estimated_cost, attempt_count
     FROM lead_ai_artifacts
     WHERE tenant_id = ?
       AND requested_by_user_id = ?
       AND request_source IN (${placeholders})
       AND updated_at >= ?
       AND estimated_cost > 0`
  ).all(...params) as Array<{ id: string; estimated_cost: number; attempt_count: number }>;

  const operationUsage = new Map<string, { calls: number; cost: number }>();
  let standaloneCalls = 0;
  let standaloneCost = 0;
  for (const event of events) {
    const metadata = safeParseJson<Record<string, unknown>>(event.metadata, {});
    const artifactId = typeof metadata.artifactId === "string"
      ? metadata.artifactId
      : typeof metadata.artifact_id === "string"
        ? metadata.artifact_id
        : null;
    const operationKey = !toBoolean(event.was_cached)
      ? event.verification_id
        ? `verification:${event.verification_id}`
        : artifactId
          ? `artifact:${artifactId}`
          : null
      : null;
    const cost = Math.max(0, Number(event.estimated_cost ?? 0));
    if (operationKey) {
      const current = operationUsage.get(operationKey) ?? { calls: 0, cost: 0 };
      operationUsage.set(operationKey, {
        calls: current.calls + 1,
        cost: current.cost + cost,
      });
    } else {
      standaloneCalls += 1;
      standaloneCost += cost;
    }
  }

  for (const verification of verifications) {
    const key = `verification:${verification.id}`;
    const current = operationUsage.get(key) ?? { calls: 0, cost: 0 };
    operationUsage.set(key, {
      calls: Math.max(1, current.calls),
      cost: Math.max(current.cost, Number(verification.estimated_cost ?? 0)),
    });
  }
  for (const artifact of artifacts) {
    const key = `artifact:${artifact.id}`;
    const current = operationUsage.get(key) ?? { calls: 0, cost: 0 };
    // Artifact rows are the durable, cumulative fallback when an attempt event is lost.
    // An artifact updated in the active window is conservatively charged in full because
    // the current schema has no per-attempt canonical timestamps.
    operationUsage.set(key, {
      calls: Math.max(current.calls, Math.max(1, Number(artifact.attempt_count) || 0)),
      cost: Math.max(current.cost, Number(artifact.estimated_cost ?? 0)),
    });
  }

  return {
    calls: standaloneCalls + Array.from(operationUsage.values()).reduce((sum, usage) => sum + usage.calls, 0),
    cost: roundCurrency(standaloneCost + Array.from(operationUsage.values()).reduce((sum, usage) => sum + usage.cost, 0)),
  };
}

export async function createAiFeedbackEvent(input: AiFeedbackEventInput): Promise<AiFeedbackEvent> {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO ai_feedback_events (
      id, lead_id, verification_id, artifact_id, actor_user_id, feedback_kind, verdict,
      corrected_website_url, reason, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.lead_id,
    input.verification_id ?? null,
    input.artifact_id ?? null,
    input.actor_user_id ?? null,
    normalizeAiFeedbackKind(input.feedback_kind),
    normalizeAiFeedbackVerdict(input.verdict),
    input.corrected_website_url?.trim() || null,
    input.reason?.trim().slice(0, 1000) || null,
    JSON.stringify(input.metadata_json ?? {}),
    now,
  );
  const event = await getAiFeedbackEventById(id);
  if (!event) throw new Error("Unable to load created AI feedback event.");
  return event;
}

export async function getAiFeedbackEventsForLead(leadId: string): Promise<AiFeedbackEvent[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT *
     FROM ai_feedback_events
     WHERE lead_id = ?
     ORDER BY created_at DESC`
  ).all(leadId) as Array<Record<string, unknown>>;
  return rows.map(parseAiFeedbackEventRow);
}

export async function getAiFeedbackEvaluationSummary(): Promise<AiFeedbackEvaluationSummary> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT
       COUNT(*) as total,
       COALESCE(SUM(CASE WHEN feedback_kind = 'verification' AND verdict = 'correct' THEN 1 ELSE 0 END), 0) as verificationCorrect,
       COALESCE(SUM(CASE WHEN feedback_kind = 'verification' AND verdict = 'incorrect' THEN 1 ELSE 0 END), 0) as verificationIncorrect,
       COALESCE(SUM(CASE WHEN feedback_kind = 'verification' AND verdict = 'uncertain' THEN 1 ELSE 0 END), 0) as verificationUncertain,
       COALESCE(SUM(CASE WHEN feedback_kind = 'pitch' AND verdict = 'useful' THEN 1 ELSE 0 END), 0) as pitchUseful,
       COALESCE(SUM(CASE WHEN feedback_kind = 'pitch' AND verdict = 'not_useful' THEN 1 ELSE 0 END), 0) as pitchNotUseful
     FROM ai_feedback_events`
  ).get() as Record<string, unknown> | undefined;
  return {
    total: Number(row?.total ?? 0),
    verificationCorrect: Number(row?.verificationCorrect ?? 0),
    verificationIncorrect: Number(row?.verificationIncorrect ?? 0),
    verificationUncertain: Number(row?.verificationUncertain ?? 0),
    pitchUseful: Number(row?.pitchUseful ?? 0),
    pitchNotUseful: Number(row?.pitchNotUseful ?? 0),
  };
}

async function getAiFeedbackEventById(id: string): Promise<AiFeedbackEvent | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM ai_feedback_events WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseAiFeedbackEventRow(row) : null;
}

// ─── Lead AI Artifacts ───

export async function getLeadAiArtifacts(leadId: string): Promise<LeadAiArtifact[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT *
     FROM lead_ai_artifacts
     WHERE lead_id = ?
     ORDER BY created_at DESC`
  ).all(leadId) as Array<Record<string, unknown>>;
  return rows.map(parseLeadAiArtifactRow);
}

export async function getLatestLeadAiArtifact(
  leadId: string,
  artifactType: LeadAiArtifactType,
): Promise<LeadAiArtifact | null> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT *
     FROM lead_ai_artifacts
     WHERE lead_id = ? AND artifact_type = ?
     ORDER BY created_at DESC
     LIMIT 1`
  ).get(leadId, artifactType) as Record<string, unknown> | undefined;
  return row ? parseLeadAiArtifactRow(row) : null;
}

export async function createLeadAiArtifactJob(input: LeadAiArtifactInput): Promise<LeadAiArtifact> {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO lead_ai_artifacts (
      id, lead_id, artifact_type, status, model, input_hash, prompt_version,
      content_json, sources_json, confidence, usage_input_tokens, usage_output_tokens,
      estimated_cost, error, requested_by_user_id, request_source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.lead_id,
    input.artifact_type,
    "queued",
    assertAllowedOpenAIModel(input.model),
    input.input_hash,
    input.prompt_version,
    JSON.stringify(input.content_json ?? {}),
    JSON.stringify(input.sources_json ?? []),
    clamp01(input.confidence ?? 0),
    Math.max(0, Math.floor(input.usage_input_tokens ?? 0)),
    Math.max(0, Math.floor(input.usage_output_tokens ?? 0)),
    roundCurrency(input.estimated_cost ?? 0),
    input.error ?? null,
    input.requested_by_user_id ?? null,
    input.request_source ?? null,
    now,
    now,
  );
  const artifact = await getLeadAiArtifactById(id);
  if (!artifact) throw new Error("Unable to load created lead AI artifact.");
  return artifact;
}

export async function getLeadAiArtifactById(id: string): Promise<LeadAiArtifact | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM lead_ai_artifacts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseLeadAiArtifactRow(row) : null;
}

export async function getNextLeadAiArtifactJob(): Promise<LeadAiArtifact | null> {
  const db = await getDb();
  await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'queued', updated_at = ?
     WHERE status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO());

  const row = await db.prepare(
    `SELECT *
     FROM lead_ai_artifacts
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1`
  ).get() as Record<string, unknown> | undefined;
  return row ? parseLeadAiArtifactRow(row) : null;
}

export async function leaseNextLeadAiArtifactJob(maxAttempts = 3): Promise<LeadAiArtifact | null> {
  const db = await getDb();
  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'queued',
         next_retry_at = NULL,
         updated_at = ?
     WHERE status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO());

  const now = nowISO();
  const row = await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error = NULL,
         last_error = NULL,
         next_retry_at = NULL,
         max_attempts = CASE WHEN max_attempts < ? THEN ? ELSE max_attempts END,
         updated_at = ?
     WHERE id = (
       SELECT id
       FROM lead_ai_artifacts
       WHERE status = 'queued'
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
         AND attempt_count < max_attempts
       ORDER BY created_at ASC
       LIMIT 1
     )
       AND status = 'queued'
     RETURNING *`
  ).get(safeMaxAttempts, safeMaxAttempts, now, now) as Record<string, unknown> | undefined;

  return row ? parseLeadAiArtifactRow(row) : null;
}

export async function leaseLeadAiArtifactJobById(id: string, maxAttempts = 3): Promise<LeadAiArtifact | null> {
  const db = await getDb();
  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  const now = nowISO();
  const row = await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error = NULL,
         last_error = NULL,
         next_retry_at = NULL,
         max_attempts = CASE WHEN max_attempts < ? THEN ? ELSE max_attempts END,
         updated_at = ?
     WHERE id = ?
       AND status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND attempt_count < max_attempts
     RETURNING *`
  ).get(safeMaxAttempts, safeMaxAttempts, now, id, now) as Record<string, unknown> | undefined;

  return row ? parseLeadAiArtifactRow(row) : null;
}

export async function markLeadAiArtifactRunning(id: string): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error = NULL,
         last_error = NULL,
         next_retry_at = NULL,
         updated_at = ?
     WHERE id = ? AND status = 'queued'`
  ).run(nowISO(), id);
  return result.changes;
}

export async function markLeadAiArtifactComplete(
  id: string,
  input: {
    content_json: Record<string, unknown>;
    sources_json: AiVerificationSource[];
    confidence: number;
    usage_input_tokens: number;
    usage_output_tokens: number;
    estimated_cost: number;
  },
): Promise<void> {
  const db = await getDb();
  await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'complete',
         content_json = ?,
         sources_json = ?,
         confidence = ?,
         usage_input_tokens = usage_input_tokens + ?,
         usage_output_tokens = usage_output_tokens + ?,
         estimated_cost = estimated_cost + ?,
         error = NULL,
         last_error = NULL,
         next_retry_at = NULL,
         updated_at = ?
     WHERE id = ? AND status = 'running'`
  ).run(
    JSON.stringify(input.content_json),
    JSON.stringify(input.sources_json),
    clamp01(input.confidence),
    Math.max(0, Math.floor(input.usage_input_tokens)),
    Math.max(0, Math.floor(input.usage_output_tokens)),
    roundCurrency(input.estimated_cost),
    nowISO(),
    id,
  );
}

export async function markLeadAiArtifactError(id: string, message: string): Promise<void> {
  const db = await getDb();
  await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = 'error',
         error = ?,
         last_error = ?,
         next_retry_at = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(message.slice(0, 1000), message.slice(0, 1000), nowISO(), id);
}

export async function markLeadAiArtifactRetry(
  id: string,
  message: string,
  maxAttempts = 3,
  usage: { input_tokens: number; output_tokens: number; estimated_cost: number } = {
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost: 0,
  },
): Promise<{ status: "queued" | "error" | "complete"; nextRetryAt: string | null; attemptCount: number; maxAttempts: number }> {
  const db = await getDb();
  const inputTokens = Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(usage.output_tokens) || 0));
  const estimatedCost = roundCurrency(Math.max(0, Number(usage.estimated_cost) || 0));
  const row = await db.prepare(
    "SELECT status, attempt_count, max_attempts FROM lead_ai_artifacts WHERE id = ?"
  ).get<{ status: string; attempt_count: number; max_attempts: number }>(id);
  const currentAttempts = Math.max(0, Number(row?.attempt_count ?? 0));
  const safeMaxAttempts = Math.max(1, Math.floor(Number(row?.max_attempts ?? maxAttempts) || maxAttempts));
  if (row?.status === "complete") {
    if (inputTokens > 0 || outputTokens > 0 || estimatedCost > 0) {
      await db.prepare(
        `UPDATE lead_ai_artifacts
         SET usage_input_tokens = usage_input_tokens + ?,
             usage_output_tokens = usage_output_tokens + ?,
             estimated_cost = estimated_cost + ?,
             updated_at = ?
         WHERE id = ? AND status = 'complete'`
      ).run(inputTokens, outputTokens, estimatedCost, nowISO(), id);
    }
    return { status: "complete", nextRetryAt: null, attemptCount: currentAttempts, maxAttempts: safeMaxAttempts };
  }
  const retryable = currentAttempts < safeMaxAttempts;
  const retryDelayMinutes = Math.min(120, Math.max(5, 5 * 2 ** Math.max(currentAttempts - 1, 0)));
  const nextRetry = retryable
    ? new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString()
    : null;
  const status: "queued" | "error" = retryable ? "queued" : "error";

  const transition = await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = ?,
         error = CASE WHEN ? = 'error' THEN ? ELSE NULL END,
         last_error = ?,
         next_retry_at = ?,
         max_attempts = ?,
         usage_input_tokens = usage_input_tokens + ?,
         usage_output_tokens = usage_output_tokens + ?,
         estimated_cost = estimated_cost + ?,
         updated_at = ?
     WHERE id = ? AND status IN ('queued', 'running')`
  ).run(
    status,
    status,
    message.slice(0, 1000),
    message.slice(0, 1000),
    nextRetry,
    safeMaxAttempts,
    inputTokens,
    outputTokens,
    estimatedCost,
    nowISO(),
    id,
  );

  if (transition.changes === 0) {
    const current = await db.prepare(
      "SELECT status FROM lead_ai_artifacts WHERE id = ?"
    ).get<{ status: string }>(id);
    if (current?.status === "complete") {
      if (inputTokens > 0 || outputTokens > 0 || estimatedCost > 0) {
        await db.prepare(
          `UPDATE lead_ai_artifacts
           SET usage_input_tokens = usage_input_tokens + ?,
               usage_output_tokens = usage_output_tokens + ?,
               estimated_cost = estimated_cost + ?,
               updated_at = ?
           WHERE id = ? AND status = 'complete'`
        ).run(inputTokens, outputTokens, estimatedCost, nowISO(), id);
      }
      return { status: "complete", nextRetryAt: null, attemptCount: currentAttempts, maxAttempts: safeMaxAttempts };
    }
  }

  return { status, nextRetryAt: nextRetry, attemptCount: currentAttempts, maxAttempts: safeMaxAttempts };
}

export async function markLeadAiQueued(leadId: string, inputHash: string, resetAttempts = false): Promise<number> {
  const tenantId = requireAiTenantId(undefined, ["ai_verification", "crawl", "enrichment"]);
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_attempt_count = CASE WHEN ? = 1 THEN 0 ELSE ai_attempt_count END,
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(resetAttempts ? 1 : 0, inputHash, nowISO(), tenantId, leadId);
  return result.changes;
}

export async function markLeadAiRunning(leadId: string, inputHash: string): Promise<number> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'running',
      ai_attempt_count = ai_attempt_count + 1,
      ai_last_error = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?
       AND ai_queue_status = 'queued'`
  ).run(inputHash, nowISO(), tenantId, leadId);
  return result.changes;
}

export async function markLeadAiVerified(leadId: string, inputHash: string): Promise<number> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'verified',
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      ai_input_hash = ?,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(inputHash, nowISO(), tenantId, leadId);
  return result.changes;
}

export async function markLeadAiQueueError(leadId: string, message: string, maxAttempts: number): Promise<void> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const row = await db.prepare("SELECT ai_attempt_count FROM leads WHERE tenant_id = ? AND id = ?")
    .get(tenantId, leadId) as { ai_attempt_count: number } | undefined;
  if (!row) return;
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
     WHERE tenant_id = ? AND id = ?`
  ).run(retryable ? "queued" : "error", message.slice(0, 1000), nextRetry, nowISO(), tenantId, leadId);
  await updateLeadQualityScoresForTenant(tenantId, leadId);
}

export async function getNextAiVerificationJob(maxAttempts = 3): Promise<Lead | null> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE tenant_id = ?
       AND ai_queue_status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO(), tenantId);

  const row = await db.prepare(
    `SELECT *
     FROM leads
     WHERE tenant_id = ?
       AND ai_queue_status = 'queued'
       AND (ai_next_retry_at IS NULL OR ai_next_retry_at <= ?)
       AND ai_attempt_count < ?
       AND COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL
       AND status NOT IN ('closed_won','closed_lost')
       AND COALESCE(business_status, '') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
     ORDER BY
       sales_priority_score DESC,
       raw_opportunity_score DESC,
       score DESC,
       updated_at ASC
     LIMIT 1`
  ).get(tenantId, nowISO(), Math.max(1, Math.floor(maxAttempts))) as Record<string, unknown> | undefined;

  return row ? parseLeadRow(row) : null;
}

export async function leaseNextAiVerificationJob(maxAttempts = 3): Promise<Lead | null> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE tenant_id = ?
       AND ai_queue_status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO(), tenantId);

  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  const now = nowISO();
  const row = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'running',
      ai_attempt_count = ai_attempt_count + 1,
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE tenant_id = ?
       AND id = (
       SELECT id
       FROM leads
       WHERE tenant_id = ?
         AND ai_queue_status = 'queued'
         AND (ai_next_retry_at IS NULL OR ai_next_retry_at <= ?)
         AND ai_attempt_count < ?
         AND COALESCE(is_excluded, 0) = 0
         AND archived_at IS NULL
         AND status NOT IN ('closed_won','closed_lost')
         AND COALESCE(business_status, '') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
       ORDER BY
         sales_priority_score DESC,
         raw_opportunity_score DESC,
         score DESC,
         updated_at ASC
       LIMIT 1
     )
       AND ai_queue_status = 'queued'
     RETURNING *`
  ).get(now, tenantId, tenantId, now, safeMaxAttempts) as Record<string, unknown> | undefined;

  if (!row) return null;
  if (row.tenant_id !== tenantId) throw new Error("Leased AI tenant does not match the active worker context.");
  return parseLeadRow(row);
}

export async function getAiVerificationBackfillCandidates(limit: number, tenantId: string): Promise<Lead[]> {
  tenantId = requireAiTenantId(tenantId, ["ai_verification"]);
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT *
     FROM leads
     WHERE tenant_id = ?
       AND ai_queue_status NOT IN ('queued','running')
       AND COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL
       AND status NOT IN ('closed_won','closed_lost')
       AND COALESCE(business_status, '') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
     ORDER BY sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at ASC
     LIMIT ?`
  ).all(tenantId, Math.max(1, Math.floor(limit))) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

export async function getAiQueueStats(): Promise<AiQueueStats> {
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT COALESCE(ai_queue_status, 'not_checked') as status, COUNT(*) as count
     FROM leads
     WHERE tenant_id = ? AND archived_at IS NULL
     GROUP BY COALESCE(ai_queue_status, 'not_checked')`
  ).all(tenantId) as Array<{ status: string; count: number }>;
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

export async function getAiVerificationCandidates(
  limit: number,
  tenantId: string,
  businessType?: BusinessType | string | null,
): Promise<Lead[]>{
  tenantId = requireAiTenantId(tenantId);
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const conditions = [
    "l.website_status IN ('none', 'social', 'basic')",
    noUsableAiWebsiteCondition("l"),
    "l.qualification_status IN ('qualified', 'needs_verification')",
    "l.status IN ('new', 'verified', 'contacted')",
    "l.score > 0",
    "COALESCE(l.is_excluded, 0) = 0",
    "l.archived_at IS NULL",
  ];
  conditions.unshift("l.tenant_id = ?");
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
  ).all(tenantId, ...params, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseLeadRow);
}

export async function applyAiFoundWebsite(leadId: string, websiteUrl: string): Promise<number>{
  const tenantId = requireAiTenantId();
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
     WHERE tenant_id = ? AND id = ?`
  ).run(websiteUrl, now, now, tenantId, leadId);
  if (result.changes > 0) await updateLeadQualityScoresForTenant(tenantId, leadId);
  return result.changes;
}

export async function applyManualWebsiteCorrection(
  leadId: string,
  input: ManualWebsiteCorrectionInput,
): Promise<Lead | null> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const current = await getLeadById(leadId);
  if (!current) {
    return null;
  }

  const db = await getDb();
  const now = nowISO();
  const notes = input.notes?.trim() || null;
  const correctionReason = notes ?? "Manual website correction";
  const websiteUrl = input.resolution === "remove_website" ? null : input.websiteUrl;
  const baseValues = [
    websiteUrl,
    input.resolution === "remove_website" ? "none" : input.websiteStatus,
    input.resolution === "remove_website" ? null : now,
    input.resolution === "remove_website" ? null : websiteUrl,
    correctionReason,
    notes,
    now,
  ];
  let changes = 0;

  if (input.resolution === "official_website_found") {
    const result = await db.prepare(
      `UPDATE leads SET
        website_uri = ?,
        website_status = ?,
        website_verified_at = ?,
        ai_website_feedback_status = 'incorrect',
        ai_corrected_website_url = ?,
        ai_false_positive_reason = ?,
        ai_reviewer_notes = ?,
        ai_feedback_at = ?,
        is_excluded = 1,
        exclusion_reason = 'Manual correction: official website found',
        excluded_at = COALESCE(excluded_at, ?),
        qualification_status = 'disqualified',
        disqualification_reason = 'Manual correction: official website found',
        quality_bucket = 'not_a_fit',
        ai_recommendation = 'exclude',
        score = 0,
        win_probability_score = 0,
        updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(...baseValues, now, now, tenantId, leadId);
    changes = result.changes;
  } else if (input.resolution === "weak_or_basic_site") {
    const result = await db.prepare(
      `UPDATE leads SET
        website_uri = ?,
        website_status = 'basic',
        website_verified_at = ?,
        ai_website_feedback_status = 'incorrect',
        ai_corrected_website_url = ?,
        ai_false_positive_reason = ?,
        ai_reviewer_notes = ?,
        ai_feedback_at = ?,
        is_excluded = 0,
        exclusion_reason = NULL,
        excluded_at = NULL,
        qualification_status = CASE WHEN qualification_status = 'disqualified' THEN 'needs_verification' ELSE qualification_status END,
        disqualification_reason = NULL,
        quality_bucket = 'broken_site_opportunity',
        ai_recommendation = 'prioritize',
        updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(websiteUrl, now, websiteUrl, correctionReason, notes, now, now, tenantId, leadId);
    changes = result.changes;
  } else if (input.resolution === "candidate_website_needs_review") {
    const result = await db.prepare(
      `UPDATE leads SET
        website_uri = ?,
        website_status = ?,
        website_verified_at = ?,
        ai_website_feedback_status = 'uncertain',
        ai_corrected_website_url = ?,
        ai_false_positive_reason = ?,
        ai_reviewer_notes = ?,
        ai_feedback_at = ?,
        is_excluded = 0,
        exclusion_reason = NULL,
        excluded_at = NULL,
        qualification_status = CASE WHEN qualification_status = 'disqualified' THEN 'needs_verification' ELSE qualification_status END,
        disqualification_reason = NULL,
        quality_bucket = 'needs_manual_review',
        ai_recommendation = 'manual_review',
        updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(...baseValues, now, tenantId, leadId);
    changes = result.changes;
  } else if (input.resolution === "social_or_directory_only") {
    const result = await db.prepare(
      `UPDATE leads SET
        website_uri = ?,
        website_status = ?,
        website_verified_at = ?,
        ai_website_feedback_status = 'correct',
        ai_corrected_website_url = ?,
        ai_false_positive_reason = ?,
        ai_reviewer_notes = ?,
        ai_feedback_at = ?,
        is_excluded = 0,
        exclusion_reason = NULL,
        excluded_at = NULL,
        qualification_status = CASE WHEN qualification_status = 'disqualified' THEN 'needs_verification' ELSE qualification_status END,
        disqualification_reason = NULL,
        quality_bucket = 'needs_manual_review',
        ai_recommendation = 'manual_review',
        updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(...baseValues, now, tenantId, leadId);
    changes = result.changes;
  } else {
    const result = await db.prepare(
      `UPDATE leads SET
        website_uri = NULL,
        website_status = 'none',
        website_verified_at = NULL,
        ai_website_feedback_status = 'incorrect',
        ai_corrected_website_url = NULL,
        ai_false_positive_reason = ?,
        ai_reviewer_notes = ?,
        ai_feedback_at = ?,
        is_excluded = 0,
        exclusion_reason = NULL,
        excluded_at = NULL,
        qualification_status = CASE WHEN qualification_status = 'disqualified' THEN 'needs_verification' ELSE qualification_status END,
        disqualification_reason = NULL,
        quality_bucket = 'needs_ai_verify',
        ai_recommendation = 'manual_review',
        updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(correctionReason, notes, now, now, tenantId, leadId);
    changes = result.changes;
  }

  if (changes === 0) return null;

  if (current.place_id) {
    await db
      .prepare("UPDATE places_master SET website_uri = ?, updated_at = ? WHERE tenant_id = ? AND place_id = ?")
      .run(websiteUrl, now, tenantId, current.place_id);
  }

  await updateLeadQualityScores(leadId, input.actorUserId ?? null);
  return getLeadById(leadId);
}

export async function updateLeadQualityScores(leadId: string, actorUserId?: string | null): Promise<number>{
  const { tenantId } = requireTenantWideScoreContext();
  return updateLeadQualityScoresForTenant(tenantId, leadId, actorUserId);
}

async function updateLeadQualityScoresForTenant(
  tenantId: string,
  leadId: string,
  actorUserId?: string | null,
): Promise<number> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM leads WHERE tenant_id = ? AND id = ?").get(tenantId, leadId) as Record<string, unknown> | undefined;
  if (!row) return 0;
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
    aiWebsiteFeedbackStatus: lead.ai_website_feedback_status,
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
  const result = await db.prepare(
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
     WHERE tenant_id = ? AND id = ?`
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
    tenantId,
    leadId,
  );
  return result.changes;
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

export async function recomputeAllLeadQualityScores(limit = 100000, signal?: AbortSignal): Promise<number>{
  throwIfWorkerAborted(signal);
  const { tenantId } = requireTenantWideScoreContext();
  const db = await getDb();
  throwIfWorkerAborted(signal);
  const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 100000;
  const safeLimit = Math.max(1, Math.min(100000, normalizedLimit));
  const rows = await db.prepare(
    `SELECT id
     FROM leads
     WHERE tenant_id = ?
       AND archived_at IS NULL
       AND (last_quality_scored_at IS NULL
        OR julianday(updated_at) > julianday(last_quality_scored_at))
     ORDER BY updated_at DESC
     LIMIT ?`
  ).all(tenantId, safeLimit) as Array<{ id: string }>;
  throwIfWorkerAborted(signal);
  let recomputed = 0;
  for (const row of rows) {
    throwIfWorkerAborted(signal);
    if (await updateLeadQualityScores(row.id) > 0) recomputed += 1;
    throwIfWorkerAborted(signal);
  }
  return recomputed;
}

export async function updateLeadPhoneVerificationStatus(
  leadId: string,
  status: PhoneVerificationStatus,
  actorUserId?: string | null,
): Promise<number>{
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const result = await db.prepare(
    "UPDATE leads SET phone_verification_status = ?, quality_checked_by_user_id = COALESCE(?, quality_checked_by_user_id), updated_at = ? WHERE tenant_id = ? AND id = ?"
  ).run(status, actorUserId ?? null, nowISO(), tenantId, leadId);
  if (result.changes > 0) await updateLeadQualityScores(leadId, actorUserId);
  return result.changes;
}

export async function setLeadQualityBucket(
  leadId: string,
  bucket: QualityBucket,
  actorUserId?: string | null,
): Promise<number>{
  const { tenantId } = requireTenantWideLeadReadContext();
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
     WHERE tenant_id = ? AND id = ?`
  ).run(bucket, nextAction, actorUserId ?? null, nowISO(), tenantId, leadId);
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

export async function updateLeadAiFeedback(
  leadId: string,
  input: LeadAiFeedbackInput,
  actorUserId?: string | null,
): Promise<number> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const status = input.status === "correct" || input.status === "incorrect" || input.status === "uncertain"
    ? input.status
    : "uncertain";
  const notes = input.reviewerNotes?.trim().slice(0, 1000) || null;
  const correctedWebsiteUrl = input.correctedWebsiteUrl?.trim().slice(0, 500) || null;
  const falsePositiveReason = input.falsePositiveReason?.trim().slice(0, 500) || null;
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads SET
      ai_website_feedback_status = ?,
      ai_corrected_website_url = ?,
      ai_false_positive_reason = ?,
      ai_reviewer_notes = ?,
      ai_feedback_at = ?,
      quality_checked_by_user_id = COALESCE(?, quality_checked_by_user_id),
      quality_bucket = CASE
        WHEN ? = 'incorrect' THEN 'needs_manual_review'
        ELSE quality_bucket
      END,
      ai_recommendation = CASE
        WHEN ? = 'incorrect' THEN 'manual_review'
        ELSE ai_recommendation
      END,
      updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(
    status,
    correctedWebsiteUrl,
    falsePositiveReason,
    notes,
    now,
    actorUserId ?? null,
    status,
    status,
    now,
    tenantId,
    leadId,
  );
  if (result.changes > 0) await updateLeadQualityScores(leadId, actorUserId);
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
  const tenantId = requireAiTenantId();
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.prepare(
    `SELECT *
     FROM leads
     WHERE tenant_id = ?
       AND ai_verification_status = 'site_found'
       AND ai_found_website_url IS NOT NULL
       AND ai_found_website_url != ''
       AND COALESCE(ai_website_viability_status, '') != 'usable'
     ORDER BY ai_checked_at DESC
     LIMIT ?`
  ).all(tenantId, safeLimit) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

function buildQualityWhere(filters: QualityFilters = {}): { where: string; params: unknown[] } {
  const conditions = [
    "COALESCE(l.is_excluded, 0) = 0",
    "l.archived_at IS NULL",
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
  if (filters.enrichmentStatus) {
    conditions.push("l.enrichment_status = ?");
    params.push(filters.enrichmentStatus);
  }
  appendQualityLocationConditions(conditions, params, filters);
  if (filters.denverOnly) {
    conditions.push("(l.market_id = 'market-colorado' OR l.address LIKE '%Denver%' OR l.address LIKE '%CO 802%')");
  }

  return { where: `WHERE ${conditions.join(" AND ")}`, params };
}

function appendQualityLocationConditions(conditions: string[], params: unknown[], filters: Pick<QualityFilters, "countryCode" | "marketId" | "locationCellId" | "city" | "zip">): void {
  if (filters.countryCode) {
    conditions.push("l.country_code = ?");
    params.push(normalizeCountryCode(filters.countryCode));
  }
  if (filters.marketId) {
    conditions.push("l.market_id = ?");
    params.push(filters.marketId);
  }
  if (filters.locationCellId) {
    conditions.push("l.location_cell_id = ?");
    params.push(filters.locationCellId);
  }
  if (filters.city) {
    conditions.push("(l.locality LIKE ? OR l.address LIKE ?)");
    const term = `%${filters.city}%`;
    params.push(term, term);
  }
  if (filters.zip) {
    conditions.push("(UPPER(l.postal_code) LIKE ? OR UPPER(l.address) LIKE ?)");
    const term = String(filters.zip).trim().toUpperCase();
    params.push(`${term}%`, `%${term}%`);
  }
}

function buildQualityRemovedWebsiteWhere(filters: QualityFilters = {}): { where: string; params: unknown[] } {
  const conditions = [
    "l.ai_verification_status = 'site_found'",
    "l.ai_website_viability_status = 'usable'",
    "COALESCE(l.ai_found_website_url, '') != ''",
    "COALESCE(l.is_excluded, 0) = 0",
    "l.archived_at IS NULL",
  ];
  const params: unknown[] = [];

  if (filters.search) {
    conditions.push("(l.name LIKE ? OR l.phone LIKE ? OR l.address LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term);
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
  if (filters.enrichmentStatus) {
    conditions.push("l.enrichment_status = ?");
    params.push(filters.enrichmentStatus);
  }
  appendQualityLocationConditions(conditions, params, filters);
  if (filters.denverOnly) {
    conditions.push("(l.market_id = 'market-colorado' OR l.address LIKE '%Denver%' OR l.address LIKE '%CO 802%')");
  }

  return { where: `WHERE ${conditions.join(" AND ")}`, params };
}

export async function getQualitySummary(filters: QualityFilters = {}): Promise<QualitySummary>{
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const qualityFilter = buildQualityWhere(filters);
  const { where, params } = bindLeadTenantScope(qualityFilter.where, qualityFilter.params, tenantId);
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
  const removedWebsiteFilter = buildQualityRemovedWebsiteWhere(filters);
  const removedWebsiteWhere = bindLeadTenantScope(
    removedWebsiteFilter.where,
    removedWebsiteFilter.params,
    tenantId,
  );
  const removedRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads l
     ${removedWebsiteWhere.where}`
  ).get(...removedWebsiteWhere.params) as { count: number };

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
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const filter = buildQualityWhere(filters);
  const { where, params } = bindLeadTenantScope(filter.where, filter.params, tenantId);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };
  const rows = await db.prepare(
    `SELECT
       l.id,
       l.place_id,
       l.name,
       l.address,
       l.phone,
       l.market_id,
       l.location_cell_id,
       l.country_code,
       l.admin_area1,
       l.admin_area2,
       l.locality,
       l.postal_code,
       l.website_uri,
       l.website_status,
       l.categories,
       l.business_type,
       l.status,
       l.score,
       l.is_excluded,
       l.archived_at,
       l.quality_bucket,
       l.lead_quality_score,
       l.easy_build_score,
       l.cash_speed_score,
       l.contactability_score,
       l.estimated_deal_value,
       l.recommended_offer,
       l.next_best_action,
       l.quality_reason,
       l.phone_verification_status,
       l.ai_verification_status,
       l.ai_checked_at,
       l.ai_queue_status,
       l.ai_website_viability_status,
       l.ai_confidence,
       l.ai_found_website_url,
       l.qualification_status,
       l.enrichment_status,
       l.discovered_at,
       l.updated_at,
       l.assigned_to_user_id,
       au.email as assigned_user_email,
       au.display_name as assigned_user_display_name,
       (
         SELECT a.status
         FROM lead_ai_artifacts a
         WHERE a.tenant_id = l.tenant_id
           AND a.lead_id = l.id
           AND a.artifact_type = 'business_detail'
         ORDER BY a.created_at DESC
         LIMIT 1
       ) as business_detail_status,
       (
         SELECT a.status
         FROM lead_ai_artifacts a
         WHERE a.tenant_id = l.tenant_id
           AND a.lead_id = l.id
           AND a.artifact_type = 'competitive_report'
         ORDER BY a.created_at DESC
         LIMIT 1
       ) as competitive_report_status
     FROM leads l
     ${TENANT_BOUND_ASSIGNEE_JOIN}
     ${where}
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
        open_website_request_id: null,
        open_quote_request_id: null,
        business_detail_status: normalizeNullableLeadAiArtifactStatus(row.business_detail_status),
        competitive_report_status: normalizeNullableLeadAiArtifactStatus(row.competitive_report_status),
      } as QualityLead;
    }),
  };
}

export async function getQualityAiVerificationCandidates(input: {
  tenantId: string;
  limit: number;
  businessType?: BusinessType | string | null;
  denverOnly?: boolean;
  ids?: string[];
  recommendedOffer?: RecommendedOffer | string | null;
  phoneVerificationStatus?: PhoneVerificationStatus | string | null;
  aiVerificationStatus?: AiVerificationStatus | string | null;
  enrichmentStatus?: string | null;
  qualityBucket?: QualityBucket | string | null;
  countryCode?: CountryCode | string | null;
  marketId?: string | null;
  locationCellId?: string | null;
  city?: string | null;
  zip?: string | null;
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
    "l.archived_at IS NULL",
  ];
  conditions.unshift("l.tenant_id = ?");
  const params: unknown[] = [input.tenantId];
  if (input.businessType) {
    conditions.push("l.business_type = ?");
    params.push(input.businessType);
  }
  if (input.recommendedOffer) {
    conditions.push("l.recommended_offer = ?");
    params.push(input.recommendedOffer);
  }
  if (input.qualityBucket) {
    conditions.push("l.quality_bucket = ?");
    params.push(input.qualityBucket);
  }
  if (input.phoneVerificationStatus) {
    conditions.push("l.phone_verification_status = ?");
    params.push(input.phoneVerificationStatus);
  }
  if (input.aiVerificationStatus) {
    conditions.push("l.ai_verification_status = ?");
    params.push(input.aiVerificationStatus);
  }
  if (input.enrichmentStatus) {
    conditions.push("l.enrichment_status = ?");
    params.push(input.enrichmentStatus);
  }
  appendQualityLocationConditions(conditions, params, {
    countryCode: input.countryCode ?? undefined,
    marketId: input.marketId ?? undefined,
    locationCellId: input.locationCellId ?? undefined,
    city: input.city ?? undefined,
    zip: input.zip ?? undefined,
  });
  if (input.denverOnly) {
    conditions.push("(l.market_id = 'market-colorado' OR l.address LIKE '%Denver%' OR l.address LIKE '%CO 802%')");
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

export async function getQualityActionCandidateIds(
  filters: QualityFilters & { tenantId: string; limit: number; ids?: string[] },
): Promise<string[]>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(filters.limit)));
  const { where, params } = buildQualityWhere(filters);
  const idConditions: string[] = ["l.tenant_id = ?"];
  const idParams: unknown[] = [filters.tenantId];
  if (filters.ids && filters.ids.length > 0) {
    idConditions.push(`l.id IN (${filters.ids.map(() => "?").join(",")})`);
    idParams.push(...filters.ids);
  }
  const rows = await db.prepare(
    `SELECT l.id
     FROM leads l
     ${where}${idConditions.length > 0 ? ` AND ${idConditions.join(" AND ")}` : ""}
     ORDER BY
       CASE l.quality_bucket
         WHEN 'ready_to_call' THEN 1
         WHEN 'broken_site_opportunity' THEN 2
         WHEN 'needs_ai_verify' THEN 3
         WHEN 'needs_manual_review' THEN 4
         ELSE 5
       END ASC,
       l.lead_quality_score DESC,
       l.score DESC,
       COALESCE(l.ai_checked_at, l.discovered_at) DESC
     LIMIT ?`
  ).all(...params, ...idParams, safeLimit) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export async function queueLeadsForEnrichment(ids: string[], tenantId: string): Promise<number>{
  const db = await getDb();
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean).slice(0, 100);
  if (uniqueIds.length === 0) return 0;
  const placeholders = uniqueIds.map(() => "?").join(",");
  const result = await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'pending',
         enriched_at = NULL,
         updated_at = ?
     WHERE tenant_id = ?
       AND id IN (${placeholders})
       AND COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL`
  ).run(nowISO(), tenantId, ...uniqueIds);
  return Number(result.changes ?? 0);
}

function parseLeadRow(row: Record<string, unknown>): Lead {
  return {
    ...row,
    categories: safeParseJson<string[]>(row.categories, []),
    has_opening_hours: (row.has_opening_hours as number) === 1,
    photo_count: (row.photo_count as number) ?? 0,
    is_excluded: isLeadExcluded(row.is_excluded),
    market_id: (row.market_id as string | null) ?? null,
    location_cell_id: (row.location_cell_id as string | null) ?? null,
    country_code: row.country_code ? normalizeCountryCode(row.country_code) : null,
    admin_area1: (row.admin_area1 as string | null) ?? null,
    admin_area2: (row.admin_area2 as string | null) ?? null,
    locality: (row.locality as string | null) ?? null,
    postal_code: (row.postal_code as string | null) ?? null,
    exclusion_reason: (row.exclusion_reason as string | null) ?? null,
    excluded_at: (row.excluded_at as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
    archived_by_user_id: (row.archived_by_user_id as string | null) ?? null,
    archive_reason: (row.archive_reason as string | null) ?? null,
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
    ai_website_feedback_status: (row.ai_website_feedback_status as string | null) ?? null,
    ai_corrected_website_url: (row.ai_corrected_website_url as string | null) ?? null,
    ai_false_positive_reason: (row.ai_false_positive_reason as string | null) ?? null,
    ai_reviewer_notes: (row.ai_reviewer_notes as string | null) ?? null,
    ai_feedback_at: (row.ai_feedback_at as string | null) ?? null,
    assigned_to_user_id: (row.assigned_to_user_id as string | null) ?? null,
    assigned_user_email: (row.assigned_user_email as string | null) ?? null,
    assigned_user_display_name: (row.assigned_user_display_name as string | null) ?? null,
    qualification_status: ((row.qualification_status as QualificationStatus | null) ?? "needs_verification"),
    disqualification_reason: (row.disqualification_reason as string | null) ?? null,
    website_verified_at: (row.website_verified_at as string | null) ?? null,
    contactability_score: (row.contactability_score as number | null) ?? 0,
    estimated_deal_value: (row.estimated_deal_value as number | null) ?? 0,
    review_highlights: safeParseJson<string[] | null>(row.review_highlights, null),
    website_health: safeParseJson<Record<string, unknown> | null>(row.website_health, null),
    enrichment_status: (row.enrichment_status as string) ?? "pending",
    enrichment_attempt_count: Number(row.enrichment_attempt_count ?? 0),
    enrichment_started_at: (row.enrichment_started_at as string | null) ?? null,
    enrichment_finished_at: (row.enrichment_finished_at as string | null) ?? null,
    enrichment_next_retry_at: (row.enrichment_next_retry_at as string | null) ?? null,
    enrichment_last_error: (row.enrichment_last_error as string | null) ?? null,
    enrichment_last_error_code: (row.enrichment_last_error_code as string | null) ?? null,
    enrichment_max_attempts: Number(row.enrichment_max_attempts ?? 3),
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

function parseOutreachEventRow(row: Record<string, unknown>): OutreachEvent {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    channel: String(row.channel),
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    actor_email: (row.actor_email as string | null) ?? null,
    contact_person_name: (row.contact_person_name as string | null) ?? null,
    contact_person_role: (row.contact_person_role as string | null) ?? null,
    decision_maker_reached: toBoolean(row.decision_maker_reached),
    outcome: normalizeOutreachOutcome(row.outcome),
    objection_reason: (row.objection_reason as string | null) ?? null,
    quoted_amount: Number(row.quoted_amount ?? 0),
    close_value: Number(row.close_value ?? 0),
    follow_up_at: (row.follow_up_at as string | null) ?? null,
    next_step: (row.next_step as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function parseAdminRequestRow(row: Record<string, unknown>): AdminRequest {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    created_by_user_id: row.created_by_user_id ? String(row.created_by_user_id) : null,
    created_by_email: row.created_by_email ? String(row.created_by_email) : null,
    assigned_admin_user_id: row.assigned_admin_user_id ? String(row.assigned_admin_user_id) : null,
    request_type: normalizeAdminRequestType(row.request_type),
    status: normalizeAdminRequestStatus(row.status),
    priority: normalizeAdminRequestPriority(row.priority),
    summary: row.summary ? String(row.summary) : null,
    contact_person_name: row.contact_person_name ? String(row.contact_person_name) : null,
    budget_hint: row.budget_hint ? String(row.budget_hint) : null,
    due_at: row.due_at ? String(row.due_at) : null,
    next_step: row.next_step ? String(row.next_step) : null,
    seen_at: row.seen_at ? String(row.seen_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    lead_name: row.lead_name ? String(row.lead_name) : null,
    lead_phone: row.lead_phone ? String(row.lead_phone) : null,
    lead_address: row.lead_address ? String(row.lead_address) : null,
    lead_website_status: row.lead_website_status ? String(row.lead_website_status) : null,
    lead_owner_user_id: row.lead_owner_user_id ? String(row.lead_owner_user_id) : null,
    lead_owner_email: row.lead_owner_email ? String(row.lead_owner_email) : null,
    lead_owner_display_name: row.lead_owner_display_name ? String(row.lead_owner_display_name) : null,
    creator_email: row.creator_email ? String(row.creator_email) : null,
    creator_display_name: row.creator_display_name ? String(row.creator_display_name) : null,
    creator_team_lead_user_id: row.creator_team_lead_user_id ? String(row.creator_team_lead_user_id) : null,
    creator_team_lead_email: row.creator_team_lead_email ? String(row.creator_team_lead_email) : null,
    creator_team_lead_display_name: row.creator_team_lead_display_name ? String(row.creator_team_lead_display_name) : null,
    creator_team_label: row.creator_team_label ? String(row.creator_team_label) : null,
  };
}

function normalizeOutreachOutcome(value: unknown): OutreachOutcome {
  const outcomes = new Set<OutreachOutcome>([
    "not_reached",
    "left_voicemail",
    "contacted",
    "decision_maker_reached",
    "demo_sent",
    "meeting_set",
    "follow_up_needed",
    "not_interested",
    "quoted",
    "closed_won",
    "closed_lost",
  ]);
  return outcomes.has(value as OutreachOutcome) ? value as OutreachOutcome : "contacted";
}

function normalizeAdminRequestType(value: unknown): AdminRequestType {
  return value === "quote_request" ? "quote_request" : "website_request";
}

function normalizeAdminRequestStatus(value: unknown): AdminRequestStatus {
  const statuses = new Set<AdminRequestStatus>(["new", "seen", "in_progress", "waiting_on_researcher", "done", "cancelled"]);
  return statuses.has(value as AdminRequestStatus) ? value as AdminRequestStatus : "new";
}

function normalizeAdminRequestPriority(value: unknown): AdminRequestPriority {
  const priorities = new Set<AdminRequestPriority>(["urgent", "normal", "low"]);
  return priorities.has(value as AdminRequestPriority) ? value as AdminRequestPriority : "normal";
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  return clean.length > 0 ? clean : null;
}

function normalizeDateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeNullableDateText(value: unknown): string | null {
  const normalized = normalizeDateText(value);
  return normalized.length > 0 ? normalized : null;
}

// ─── Dashboard Stats ───

export async function getRunGeographyProgress(runId: string): Promise<GeographyProgress>{
  const db = await getDb();
  const row = await db.prepare(
    `WITH active_zips AS (
      SELECT COUNT(*) as active_zip_count
      FROM zip_codes
      WHERE is_active = 1
    ),
    zip_progress AS (
      SELECT
        z.state,
        z.county,
        cu.zip,
        COUNT(*) as total_units,
        SUM(CASE WHEN cu.status = 'done' THEN 1 ELSE 0 END) as done_units,
        SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END) as failed_units,
        SUM(CASE WHEN cu.status = 'running' THEN 1 ELSE 0 END) as running_units,
        SUM(CASE WHEN cu.status IN ('pending','retry_wait') THEN 1 ELSE 0 END) as pending_units,
        SUM(CASE WHEN cu.status = 'canceled' THEN 1 ELSE 0 END) as canceled_units
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
      COALESCE((SELECT active_zip_count FROM active_zips), 0) as "activeZipCount",
      COALESCE((SELECT COUNT(*) FROM zip_progress), 0) as "zipCodesSelected",
      COALESCE((SELECT SUM(CASE WHEN done_units = total_units AND total_units > 0 THEN 1 ELSE 0 END) FROM zip_progress), 0) as "zipCodesCompleted",
      COALESCE((SELECT SUM(CASE WHEN done_units > 0 OR failed_units > 0 OR running_units > 0 OR canceled_units > 0 THEN 1 ELSE 0 END) FROM zip_progress), 0) as "zipCodesStarted",
      COALESCE((SELECT SUM(CASE WHEN done_units = 0 AND failed_units = 0 AND running_units = 0 AND canceled_units = 0 THEN 1 ELSE 0 END) FROM zip_progress), 0) as "zipCodesNotStarted",
      COALESCE((SELECT SUM(CASE WHEN canceled_units > 0 AND done_units = 0 AND failed_units = 0 THEN 1 ELSE 0 END) FROM zip_progress), 0) as "zipCodesCanceled",
      CASE
        WHEN COALESCE((SELECT active_zip_count FROM active_zips), 0) - COALESCE((SELECT COUNT(*) FROM zip_progress), 0) > 0
        THEN COALESCE((SELECT active_zip_count FROM active_zips), 0) - COALESCE((SELECT COUNT(*) FROM zip_progress), 0)
        ELSE 0
      END as "zipCodesNotSelected",
      COALESCE((SELECT COUNT(*) FROM county_progress), 0) as "countiesSelected",
      COALESCE((SELECT SUM(CASE WHEN zip_completed = zip_total AND zip_total > 0 THEN 1 ELSE 0 END) FROM county_progress), 0) as "countiesCompleted"`
  ).get(runId) as GeographyProgress | undefined;

  if (row) {
    return {
      activeZipCount: Number(row.activeZipCount) || 0,
      zipCodesSelected: Number(row.zipCodesSelected) || 0,
      zipCodesCompleted: Number(row.zipCodesCompleted) || 0,
      zipCodesStarted: Number(row.zipCodesStarted) || 0,
      zipCodesNotStarted: Number(row.zipCodesNotStarted) || 0,
      zipCodesCanceled: Number(row.zipCodesCanceled) || 0,
      zipCodesNotSelected: Number(row.zipCodesNotSelected) || 0,
      countiesSelected: Number(row.countiesSelected) || 0,
      countiesCompleted: Number(row.countiesCompleted) || 0,
    };
  }

  return {
    activeZipCount: 0,
    zipCodesSelected: 0,
    zipCodesCompleted: 0,
    zipCodesStarted: 0,
    zipCodesNotStarted: 0,
    zipCodesCanceled: 0,
    zipCodesNotSelected: 0,
    countiesSelected: 0,
    countiesCompleted: 0,
  };
}

export async function getDashboardStats(): Promise<{
  runStatus: string;
  runId: string | null;
  processingRunStatus: string;
  processingRunId: string | null;
  discoveryItems: DiscoveryItemSummary[];
  leadsTotal: number;
  leadsToday: number;
  failedUnits: number;
  progress: CrawlProgress | null;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
  activeZipCount: number;
  countiesSelected: number;
  countiesCompleted: number;
  aiQueueStats: AiQueueStats;
}> {
  const db = await getDb();
  const [visibleRun, processingRun, discoveryItems] = await Promise.all([
    getDefaultVisibleCrawlRun(),
    getProcessingCrawlRun(),
    Promise.resolve([] as DiscoveryItemSummary[]),
  ]);

  const leadsTotal = ((await db.prepare("SELECT COUNT(*) as c FROM leads").get()) as { c: number }).c;
  const today = new Date().toISOString().slice(0, 10);
  const leadsToday = ((await db.prepare("SELECT COUNT(*) as c FROM leads WHERE discovered_at >= ?").get(today)) as { c: number }).c;

  let failedUnits = 0;
  let progress = null;
  let geographyProgress: GeographyProgress = {
    activeZipCount: 0,
    zipCodesSelected: 0,
    zipCodesCompleted: 0,
    zipCodesStarted: 0,
    zipCodesNotStarted: 0,
    zipCodesCanceled: 0,
    zipCodesNotSelected: 0,
    countiesSelected: 0,
    countiesCompleted: 0,
  };

  if (visibleRun) {
    const prog = await getCrawlProgress(visibleRun.id);
    progress = prog;
    failedUnits = prog.failed;
    geographyProgress = await getRunGeographyProgress(visibleRun.id);
  }

  return {
    runStatus: visibleRun?.status ?? "idle",
    runId: visibleRun?.id ?? null,
    processingRunStatus: processingRun?.status ?? "idle",
    processingRunId: processingRun?.id ?? null,
    discoveryItems,
    leadsTotal,
    leadsToday,
    failedUnits,
    progress,
    activeZipCount: geographyProgress.activeZipCount,
    zipCodesSelected: geographyProgress.zipCodesSelected,
    zipCodesCompleted: geographyProgress.zipCodesCompleted,
    zipCodesStarted: geographyProgress.zipCodesStarted,
    zipCodesNotStarted: geographyProgress.zipCodesNotStarted,
    zipCodesCanceled: geographyProgress.zipCodesCanceled,
    zipCodesNotSelected: geographyProgress.zipCodesNotSelected,
    countiesSelected: geographyProgress.countiesSelected,
    countiesCompleted: geographyProgress.countiesCompleted,
    aiQueueStats: await getAiQueueStats(),
  };
}

export async function getLaunchReadinessSummary(): Promise<LaunchReadinessSummary> {
  const db = await getDb();
  const [settings, schedulerHealth] = await Promise.all([
    getSettings(),
    getSchedulerHealth(),
  ]);
  const counts = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND status = 'active') as active_admins,
       (SELECT COUNT(*) FROM app_users WHERE role = 'researcher' AND status = 'active') as active_researchers,
       (SELECT COUNT(*) FROM location_markets WHERE status = 'active') as active_markets,
       (SELECT COUNT(*) FROM location_cells WHERE COALESCE(is_active, 1) = 1) as active_cells,
       (SELECT COUNT(*) FROM crawl_runs WHERE CAST(selection_json AS TEXT) LIKE '%coverage_probe%' AND status IN ('done','running','paused','error','blocked')) as coverage_runs,
       (SELECT COUNT(*) FROM crawl_runs WHERE CAST(selection_json AS TEXT) LIKE '%lead_harvest%' AND status IN ('done','running','paused','error','blocked')) as harvest_runs,
       (SELECT COUNT(*) FROM leads) as total_leads,
       (SELECT COUNT(*) FROM leads WHERE quality_bucket <> 'needs_ai_verify' OR ai_verification_status <> 'not_checked') as reviewed_leads,
       (SELECT COUNT(*) FROM demos) as demos_created,
       (SELECT COUNT(*) FROM demos WHERE is_published = 1 AND revoked_at IS NULL) as demos_published`
  ).get<Record<string, unknown>>() ?? {};

  const activeAdmins = Number(counts.active_admins ?? 0);
  const activeResearchers = Number(counts.active_researchers ?? 0);
  const activeMarkets = Number(counts.active_markets ?? 0);
  const activeCells = Number(counts.active_cells ?? 0);
  const coverageRuns = Number(counts.coverage_runs ?? 0);
  const harvestRuns = Number(counts.harvest_runs ?? 0);
  const totalLeads = Number(counts.total_leads ?? 0);
  const reviewedLeads = Number(counts.reviewed_leads ?? 0);
  const demosCreated = Number(counts.demos_created ?? 0);
  const demosPublished = Number(counts.demos_published ?? 0);
  const enabledWorkers = schedulerHealth.workers.filter((worker) => worker.enabled);
  const workerWarnings = schedulerHealth.workers.filter((worker) => worker.enabled && worker.warning);
  const googleReady = settings.google_places_api_key_configured;
  const openAiReady = !settings.ai_enabled || settings.openai_api_key_configured;

  const items: LaunchReadinessItem[] = [
    {
      key: "auth_env",
      label: "Admin access",
      ready: activeAdmins > 0,
      detail: activeAdmins > 0 ? `${activeAdmins} active admin account${activeAdmins === 1 ? "" : "s"}` : "No active admin account is visible.",
      href: "/users",
    },
    {
      key: "api_keys",
      label: "API keys",
      ready: googleReady && openAiReady,
      detail: googleReady
        ? openAiReady
          ? "Google Places is configured; OpenAI state matches AI settings."
          : "OpenAI is enabled but no OpenAI API key is configured."
        : "Google Places API key is missing.",
      href: "/settings",
    },
    {
      key: "market_cells",
      label: "Market and cells",
      ready: activeMarkets > 0 && activeCells > 0,
      detail: `${activeMarkets} active market${activeMarkets === 1 ? "" : "s"} and ${activeCells} active cell${activeCells === 1 ? "" : "s"}.`,
      href: "/coverage",
    },
    {
      key: "coverage_probe",
      label: "Coverage probe",
      ready: coverageRuns > 0,
      detail: coverageRuns > 0 ? `${coverageRuns} coverage probe run${coverageRuns === 1 ? "" : "s"} recorded.` : "No coverage probe run recorded yet.",
      href: "/coverage",
    },
    {
      key: "lead_harvest",
      label: "Lead harvest",
      ready: harvestRuns > 0 || totalLeads > 0,
      detail: harvestRuns > 0 ? `${harvestRuns} lead harvest run${harvestRuns === 1 ? "" : "s"} recorded.` : `${totalLeads} leads currently in inventory.`,
      href: "/leads",
    },
    {
      key: "quality_review",
      label: "Quality review",
      ready: reviewedLeads > 0,
      detail: reviewedLeads > 0 ? `${reviewedLeads} lead${reviewedLeads === 1 ? "" : "s"} have quality or AI review signal.` : "No reviewed lead quality signal yet.",
      href: "/quality",
    },
    {
      key: "researcher_access",
      label: "Researcher access",
      ready: activeResearchers > 0,
      detail: activeResearchers > 0 ? `${activeResearchers} active researcher account${activeResearchers === 1 ? "" : "s"}.` : "No active researcher account is visible.",
      href: "/users",
    },
    {
      key: "demo_created",
      label: "Demo draft",
      ready: demosCreated > 0,
      detail: demosCreated > 0 ? `${demosCreated} demo draft${demosCreated === 1 ? "" : "s"} created.` : "No demo draft has been created.",
      href: "/leads",
    },
    {
      key: "demo_published",
      label: "Demo published",
      ready: demosPublished > 0,
      detail: demosPublished > 0 ? `${demosPublished} published demo${demosPublished === 1 ? "" : "s"} available.` : "No non-revoked published demo is available.",
      href: "/leads",
    },
    {
      key: "worker_scheduler",
      label: "Worker scheduler",
      ready: enabledWorkers.length > 0 && workerWarnings.length === 0,
      detail: `${enabledWorkers.length} worker${enabledWorkers.length === 1 ? "" : "s"} enabled; ${workerWarnings.length} active warning${workerWarnings.length === 1 ? "" : "s"}.`,
      href: "/scheduler",
    },
  ];
  const readyCount = items.filter((item) => item.ready).length;
  return {
    readyCount,
    totalCount: items.length,
    blockers: items.length - readyCount,
    items,
  };
}

// ─── Budget Queries ───

const GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID = "google_places_legacy";

export async function getTodayApiCalls(): Promise<number>{
  const db = await getDb();
  const today = startOfToday();
  const usageRow = await db.prepare(
    `SELECT COALESCE(SUM(billable_units), 0) as total
     FROM api_usage_events
     WHERE COALESCE(was_cached, 0) = 0
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
    `SELECT COALESCE(SUM(billable_units), 0) as total
     FROM api_usage_events
     WHERE crawl_run_id = ?
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

export async function getRunApiUsageSummary(runId: string, scope: CrawlRunScope): Promise<ApiUsageSummary>{
  return getRunApiUsageSummaryInternal(runId, scope);
}

export async function getPlatformRunApiUsageSummary(runId: string): Promise<ApiUsageSummary> {
  return getRunApiUsageSummaryInternal(runId, null);
}

async function getRunApiUsageSummaryInternal(runId: string, scope: CrawlRunScope | null): Promise<ApiUsageSummary>{
  const db = await getDb();
  const rows = scope ? await db.prepare(
    `SELECT endpoint,
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE tenant_id = ?
       AND crawl_run_id = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0
     GROUP BY endpoint`
  ).all(scope.tenantId, runId) as Array<{
    endpoint: string;
    calls: number;
    cost: number;
    atmosphere_calls: number;
    atmosphere_cost: number;
  }> : await db.prepare(
    `SELECT endpoint,
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE crawl_run_id = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0
     GROUP BY endpoint`,
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

export async function getMonthlyApiUsageSummary(scope: CrawlRunScope): Promise<ApiUsageSummary>{
  return getMonthlyApiUsageSummaryInternal(scope);
}

export async function getPlatformMonthlyApiUsageSummary(): Promise<ApiUsageSummary> {
  return getMonthlyApiUsageSummaryInternal(null);
}

async function getMonthlyApiUsageSummaryInternal(scope: CrawlRunScope | null): Promise<ApiUsageSummary>{
  const db = await getDb();
  const monthStart = startOfCurrentMonth();
  const rows = scope ? await db.prepare(
    `SELECT endpoint,
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE tenant_id = ?
       AND success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?
     GROUP BY endpoint`
  ).all(scope.tenantId, monthStart) as Array<{
    endpoint: string;
    calls: number;
    cost: number;
    atmosphere_calls: number;
    atmosphere_cost: number;
  }> : await db.prepare(
    `SELECT endpoint,
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN estimated_cost ELSE 0 END), 0) as atmosphere_cost
     FROM api_usage_events
     WHERE success = 1
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?
     GROUP BY endpoint`,
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

export async function getMonthlyBillableEventsForSku(sku: GooglePlacesSku, tenantId = requireTenantContext().tenantId): Promise<number> {
  const db = await getDb();
  const monthStart = startOfCurrentMonth();
  const row = await db.prepare(
    `SELECT COALESCE(SUM(billable_units), 0) as total
     FROM api_usage_events
     WHERE tenant_id = ?
       AND source_card_id = ?
       AND sku = ?
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?`
  ).get(tenantId, GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID, sku, monthStart) as { total: number };
  return Number(row.total) || 0;
}

export async function logApiUsageEvent(input: ApiUsageEventInput): Promise<{
  id: string;
  estimatedCost: number;
  estimatedUnitPrice: number;
  billableUnits: number;
}> {
  const tenantId = input.tenantId ?? requireTenantContext().tenantId;
  const db = await getDb();
  const id = generateId();
  const success = input.success ?? true;
  const wasCached = input.was_cached ?? false;
  const billableUnits = Math.max(0, Math.floor(input.billable_units ?? 1));

  let estimatedCost = 0;
  let estimatedUnitPrice = 0;

  if (success && !wasCached && billableUnits > 0) {
    const priorEvents = await getMonthlyBillableEventsForSku(input.sku, tenantId);
    const marginal = estimateMarginalSkuCost(input.sku, priorEvents, billableUnits);
    estimatedCost = marginal.estimatedCost;
    estimatedUnitPrice = marginal.estimatedUnitPrice;
  }

  await db.prepare(
    `INSERT INTO api_usage_events (
      tenant_id, source_card_id, id, crawl_run_id, crawl_unit_id, lead_id, endpoint, sku, field_mask,
      success, was_cached, billable_units, estimated_unit_price, estimated_cost, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
    GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID,
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

export async function getRunLastError(runId: string, scope: CrawlRunScope): Promise<string | null>{
  const db = await getDb();
  const row = await db.prepare(
    `SELECT last_error FROM crawl_runs
     WHERE id = ? AND tenant_id = ?
       AND ((? IS NULL AND workspace_id IS NULL) OR workspace_id = ?)`,
  ).get(runId, scope.tenantId, scope.workspaceId, scope.workspaceId) as { last_error: string | null } | undefined;
  return row?.last_error ?? null;
}

export async function getPlatformRunLastError(runId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT last_error FROM crawl_runs WHERE id = ?")
    .get(runId) as { last_error: string | null } | undefined;
  return row?.last_error ?? null;
}

// ─── Audit Logs ───

export type AuditScopeKind = "tenant" | "platform" | "legacy_unscoped";
export type AuditActorLayer = "member" | "support" | "worker" | "agent" | "system";
export type TenantAuditActorLayer = "member";
export type PlatformAuditActorLayer = Exclude<AuditActorLayer, TenantAuditActorLayer>;

export interface LegacyAuditLogOptions {
  actor?: { userId?: string | null; email?: string | null; role?: AppRole | null } | null;
  /** Compatibility-only selector-shaped values are never authority. */
  tenantId?: unknown;
  workspaceId?: unknown;
  correlationId?: unknown;
  actorLaunchRole?: unknown;
  actorLayer?: unknown;
}

export interface PlatformAuditLogOptions {
  scope: "platform";
  actor: {
    authIdentityId?: string | null;
    layer: PlatformAuditActorLayer;
    legacyRole?: AppRole | null;
  };
  /** Optional because D-001 makes correlation mandatory for tenant actions, not platform-global events. */
  correlationId?: string | null;
}

export class AuditInputError extends Error {
  constructor() {
    super("The audit input is invalid");
    this.name = "AuditInputError";
  }
}

const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const AUDIT_ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]{0,63}$/;
const AUDIT_ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const AUDIT_CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const AUDIT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIT_ACTOR_LAYERS = new Set<AuditActorLayer>(["member", "support", "worker", "agent", "system"]);

function assertAuditText(value: string | undefined, pattern: RegExp, nullable: boolean): void {
  if (value === undefined || value === null) {
    if (nullable) return;
    throw new AuditInputError();
  }
  if (!pattern.test(value)) throw new AuditInputError();
}

function assertTenantContextShape(context: TenantContext): void {
  if (
    !AUDIT_UUID_PATTERN.test(context.tenantId) ||
    (context.workspaceId !== null && !AUDIT_UUID_PATTERN.test(context.workspaceId)) ||
    !AUDIT_UUID_PATTERN.test(context.membershipId) ||
    !AUDIT_UUID_PATTERN.test(context.roleBindingId) ||
    !AUDIT_UUID_PATTERN.test(context.actorAuthIdentityId) ||
    !AUDIT_CORRELATION_PATTERN.test(context.correlationId)
  ) {
    throw new AuditInputError();
  }
}

function assertSafeAuditMetadataValue(value: unknown, depth: number, seen: Set<object>): void {
  if (depth > 5) throw new AuditInputError();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AuditInputError();
    return;
  }
  if (typeof value === "string") {
    if (value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) throw new AuditInputError();
    return;
  }
  if (typeof value !== "object" || seen.has(value)) throw new AuditInputError();
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 64) throw new AuditInputError();
    for (const item of value) assertSafeAuditMetadataValue(item, depth + 1, seen);
  } else {
    const entries = Object.entries(value);
    if (entries.length > 64) throw new AuditInputError();
    for (const [key, item] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)) {
        throw new AuditInputError();
      }
      assertSafeAuditMetadataValue(item, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function serializeTenantAuditMetadata(metadata: Record<string, unknown> | undefined): string {
  const value = metadata ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AuditInputError();
  assertSafeAuditMetadataValue(value, 0, new Set());
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string" || serialized.length > 16_384) throw new AuditInputError();
    return serialized;
  } catch {
    throw new AuditInputError();
  }
}

function assertAuditArguments(action: string, entityType: string | undefined, entityId: string | undefined): void {
  assertAuditText(action, AUDIT_ACTION_PATTERN, false);
  assertAuditText(entityType, AUDIT_ENTITY_TYPE_PATTERN, true);
  assertAuditText(entityId, AUDIT_ENTITY_ID_PATTERN, true);
}

async function insertAuditLog(row: {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata: string;
  createdAt: string;
  scopeKind: AuditScopeKind;
  tenantId?: string | null;
  workspaceId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: AppRole | null;
  correlationId?: string | null;
  actorAuthIdentityId?: string | null;
  actorMembershipId?: string | null;
  actorLaunchRole?: TenantContext["role"] | null;
  actorRoleBindingId?: string | null;
  actorLayer?: AuditActorLayer | null;
}): Promise<void> {
  const db = await getDb();
  await db.prepare(
    `INSERT INTO audit_logs (
      id, action, entity_type, entity_id, actor_user_id, actor_email, actor_role, metadata, created_at,
      scope_kind, tenant_id, workspace_id, correlation_id, actor_auth_identity_id, actor_membership_id,
      actor_launch_role, actor_role_binding_id, actor_layer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId(),
    row.action,
    row.entityType ?? null,
    row.entityId ?? null,
    row.actorUserId ?? null,
    row.actorEmail ?? null,
    row.actorRole ?? null,
    row.metadata,
    row.createdAt,
    row.scopeKind,
    row.tenantId ?? null,
    row.workspaceId ?? null,
    row.correlationId ?? null,
    row.actorAuthIdentityId ?? null,
    row.actorMembershipId ?? null,
    row.actorLaunchRole ?? null,
    row.actorRoleBindingId ?? null,
    row.actorLayer ?? null,
  );
}

export async function createTenantAuditLog(
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const context = requireTenantContext();
  assertTenantContextShape(context);
  assertAuditArguments(action, entityType, entityId);
  await insertAuditLog({
    action,
    entityType,
    entityId,
    metadata: serializeTenantAuditMetadata(metadata),
    createdAt: nowISO(),
    scopeKind: "tenant",
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorUserId: context.actorAuthIdentityId,
    actorEmail: null,
    actorRole: null,
    correlationId: context.correlationId,
    actorAuthIdentityId: context.actorAuthIdentityId,
    actorMembershipId: context.membershipId,
    actorLaunchRole: context.role,
    actorRoleBindingId: context.roleBindingId,
    actorLayer: "member",
  });
}

export async function createPlatformAuditLog(
  action: string,
  entityType: string | undefined,
  entityId: string | undefined,
  metadata: Record<string, unknown> | undefined,
  options: PlatformAuditLogOptions,
): Promise<void> {
  if (!options || options.scope !== "platform" || !options.actor || !AUDIT_ACTOR_LAYERS.has(options.actor.layer)) {
    throw new AuditInputError();
  }
  if (options.correlationId !== undefined && options.correlationId !== null) {
    assertAuditText(options.correlationId, AUDIT_CORRELATION_PATTERN, false);
  }
  if (options.actor.authIdentityId !== undefined && options.actor.authIdentityId !== null && !AUDIT_UUID_PATTERN.test(options.actor.authIdentityId)) {
    throw new AuditInputError();
  }
  assertAuditArguments(action, entityType, entityId);
  await insertAuditLog({
    action,
    entityType,
    entityId,
    metadata: serializeTenantAuditMetadata(metadata),
    createdAt: nowISO(),
    scopeKind: "platform",
    correlationId: options.correlationId ?? null,
    actorAuthIdentityId: options.actor.authIdentityId ?? null,
    actorLayer: options.actor.layer,
    actorRole: options.actor.legacyRole ?? null,
  });
}

export async function createAuditLog(
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  options: LegacyAuditLogOptions = {},
): Promise<void>{
  const context = getTenantContext();
  if (context) {
    await createTenantAuditLog(action, entityType, entityId, metadata);
    return;
  }

  const contextActor = getAuditActor();
  const actor = options.actor === undefined ? contextActor : options.actor;
  await insertAuditLog({
    action,
    entityType,
    entityId,
    metadata: JSON.stringify(metadata ?? {}),
    createdAt: nowISO(),
    scopeKind: "legacy_unscoped",
    actorUserId: actor?.userId ?? null,
    actorEmail: actor?.email ?? null,
    actorRole: actor?.role ?? null,
  });
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
  const { tenantId } = requireTenantWideScoreContext();
  const db = await getDb();
  return await db.prepare(
    `SELECT id, review_count, rating, categories, website_status, photo_count, has_opening_hours, business_status,
      website_health, address, contactability_score, estimated_deal_value
     FROM leads
     WHERE tenant_id = ? AND ${SCORE_ELIGIBLE_CONDITION}`
  ).all(tenantId) as Array<{
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
    requested_by_user_id: (row.requested_by_user_id as string | null) ?? null,
    request_source: (row.request_source as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

function parseLeadAiArtifactRow(row: Record<string, unknown>): LeadAiArtifact {
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    artifact_type: normalizeLeadAiArtifactType(row.artifact_type),
    status: normalizeLeadAiArtifactStatus(row.status),
    model: assertAllowedOpenAIModel(row.model as string),
    input_hash: String(row.input_hash ?? ""),
    prompt_version: String(row.prompt_version ?? ""),
    content_json: safeParseJson<Record<string, unknown>>(row.content_json, {}),
    sources_json: safeParseJson<AiVerificationSource[]>(row.sources_json, []),
    confidence: Number(row.confidence ?? 0),
    usage_input_tokens: Number(row.usage_input_tokens ?? 0),
    usage_output_tokens: Number(row.usage_output_tokens ?? 0),
    estimated_cost: Number(row.estimated_cost ?? 0),
    requested_by_user_id: (row.requested_by_user_id as string | null) ?? null,
    request_source: (row.request_source as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    last_error: (row.last_error as string | null) ?? null,
    next_retry_at: (row.next_retry_at as string | null) ?? null,
    max_attempts: Number(row.max_attempts ?? 3),
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? (row.created_at as string),
  };
}

function parseAiFeedbackEventRow(row: Record<string, unknown>): AiFeedbackEvent {
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    verification_id: (row.verification_id as string | null) ?? null,
    artifact_id: (row.artifact_id as string | null) ?? null,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    feedback_kind: normalizeAiFeedbackKind(row.feedback_kind),
    verdict: normalizeAiFeedbackVerdict(row.verdict),
    corrected_website_url: (row.corrected_website_url as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    metadata_json: safeParseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    created_at: row.created_at as string,
  };
}

function normalizeLeadAiArtifactType(value: unknown): LeadAiArtifactType {
  return value === "competitive_report" ? "competitive_report" : "business_detail";
}

function normalizeLeadAiArtifactStatus(value: unknown): LeadAiArtifactStatus {
  if (value === "running" || value === "complete" || value === "error") return value;
  return "queued";
}

function normalizeNullableLeadAiArtifactStatus(value: unknown): LeadAiArtifactStatus | null {
  if (value == null || value === "") return null;
  return normalizeLeadAiArtifactStatus(value);
}

function normalizeAiFeedbackKind(value: unknown): AiFeedbackKind {
  return value === "pitch" ? "pitch" : "verification";
}

function normalizeAiFeedbackVerdict(value: unknown): AiFeedbackVerdict {
  if (value === "correct" || value === "incorrect" || value === "uncertain" || value === "useful" || value === "not_useful") return value;
  return "uncertain";
}

export async function batchUpdateScores(updates: Array<{ id: string; score: number }>): Promise<number>{
  const { tenantId } = requireTenantWideScoreContext();
  const db = await getDb();
  const now = nowISO();
  const stmt = await db.prepare("UPDATE leads SET score = ?, updated_at = ? WHERE tenant_id = ? AND id = ?");
  let count = 0;
  for (const { id, score } of updates) {
    const result = await stmt.run(score, now, tenantId, id);
    if (result.changes === 0) continue;
    await updateLeadQualityScores(id);
    count += 1;
  }
  return count;
}

// ─── Enrichment ───

export interface EnrichmentLeaseToken {
  tenantId: string;
  leadId: string;
  startedAt: string;
  attemptCount: number;
}

export type EnrichmentLeasedLead = Lead & {
  tenant_id: string;
  enrichment_lease: EnrichmentLeaseToken;
};

export async function getUnenrichedLeads(limit: number): Promise<Lead[]>{
  const tenantId = requireExactEnrichmentWorkerTenantId();
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT * FROM leads
     WHERE tenant_id = ?
       AND enrichment_status = 'pending'
       AND score > 0
       AND enrichment_attempt_count < enrichment_max_attempts
       AND ${SCORE_ELIGIBLE_CONDITION}
     ORDER BY score DESC LIMIT ?`
  ).all(tenantId, limit) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

export async function leaseNextLeadForEnrichment(
  staleAfterMinutes = 10,
): Promise<EnrichmentLeasedLead | null>{
  const tenantId = requireExactEnrichmentWorkerTenantId();
  const db = await getDb();
  const now = nowISO();
  const staleBefore = new Date(Date.now() - Math.max(1, staleAfterMinutes) * 60_000).toISOString();

  await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'pending',
         enrichment_started_at = NULL,
         enrichment_finished_at = ?,
         updated_at = ?
     WHERE tenant_id = ?
       AND enrichment_status = 'running'
       AND (enrichment_started_at IS NULL OR enrichment_started_at <= ?)
       AND enrichment_attempt_count < enrichment_max_attempts`
  ).run(now, now, tenantId, staleBefore);

  await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'error',
         enrichment_finished_at = ?,
         enrichment_next_retry_at = NULL,
         enrichment_last_error = COALESCE(enrichment_last_error, 'Max enrichment attempts exhausted.'),
         enrichment_last_error_code = COALESCE(enrichment_last_error_code, 'max_attempts_exhausted'),
         updated_at = ?
     WHERE tenant_id = ?
       AND enrichment_status IN ('pending','running','retry_wait')
       AND enrichment_attempt_count >= enrichment_max_attempts`
  ).run(now, now, tenantId);

  await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'pending',
         enrichment_next_retry_at = NULL,
         updated_at = ?
     WHERE tenant_id = ?
       AND enrichment_status = 'retry_wait'
       AND enrichment_attempt_count < enrichment_max_attempts
       AND (enrichment_next_retry_at IS NULL OR enrichment_next_retry_at <= ?)`
  ).run(now, tenantId, now);

  const row = await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'running',
         enrichment_attempt_count = enrichment_attempt_count + 1,
         enrichment_started_at = ?,
         enrichment_finished_at = NULL,
         enrichment_next_retry_at = NULL,
         enrichment_last_error = NULL,
         enrichment_last_error_code = NULL,
         updated_at = ?
     WHERE tenant_id = ?
       AND id = (
       SELECT id
       FROM leads
       WHERE tenant_id = ?
         AND enrichment_status = 'pending'
         AND enrichment_attempt_count < enrichment_max_attempts
         AND score > 0
         AND ${SCORE_ELIGIBLE_CONDITION}
       ORDER BY score DESC, updated_at ASC
       LIMIT 1
     )
       AND enrichment_status = 'pending'
     RETURNING *`
  ).get(now, now, tenantId, tenantId) as Record<string, unknown> | undefined;

  if (!row) return null;
  if (row.tenant_id !== tenantId) throw new Error("Leased enrichment tenant does not match the active worker context.");
  const lead = parseLeadRow(row);
  if (!lead.enrichment_started_at) throw new Error("Enrichment lease is missing its start fence.");
  return {
    ...lead,
    tenant_id: tenantId,
    enrichment_lease: {
      tenantId,
      leadId: lead.id,
      startedAt: lead.enrichment_started_at,
      attemptCount: lead.enrichment_attempt_count,
    },
  };
}

export async function markLeadEnrichmentFailed(
  lease: EnrichmentLeaseToken,
  error: string,
  errorCode: string,
  options: { nextRetryAt?: string | null; terminal?: boolean } = {},
): Promise<boolean>{
  const tenantId = requireExactEnrichmentWorkerTenantId(lease.tenantId);
  const db = await getDb();
  const row = await db.prepare(
    `SELECT enrichment_attempt_count, enrichment_max_attempts
     FROM leads
     WHERE tenant_id = ? AND id = ?
       AND enrichment_status = 'running'
       AND enrichment_started_at = ?
       AND enrichment_attempt_count = ?`
  ).get(tenantId, lease.leadId, lease.startedAt, lease.attemptCount) as { enrichment_attempt_count: number; enrichment_max_attempts: number } | undefined;
  if (!row) return false;
  const attempts = Number(row?.enrichment_attempt_count ?? 0);
  const maxAttempts = Math.max(1, Number(row?.enrichment_max_attempts ?? 3) || 3);
  const terminal = options.terminal || attempts >= maxAttempts;
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET enrichment_status = ?,
         enrichment_started_at = NULL,
         enrichment_finished_at = ?,
         enrichment_next_retry_at = ?,
         enrichment_last_error = ?,
         enrichment_last_error_code = ?,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?
       AND enrichment_status = 'running'
       AND enrichment_started_at = ?
       AND enrichment_attempt_count = ?`
  ).run(
    terminal ? "error" : "retry_wait",
    now,
    terminal ? null : options.nextRetryAt ?? now,
    error.slice(0, 1000),
    errorCode,
    now,
    tenantId,
    lease.leadId,
    lease.startedAt,
    lease.attemptCount,
  );
  return result.changes > 0;
}

export async function updateLeadEnrichment(lease: EnrichmentLeaseToken, data: {
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
}): Promise<boolean>{
  const tenantId = requireExactEnrichmentWorkerTenantId(lease.tenantId);
  const db = await getDb();
  const current = await db.prepare(
    `SELECT * FROM leads
     WHERE tenant_id = ? AND id = ?
       AND enrichment_status = 'running'
       AND enrichment_started_at = ?
       AND enrichment_attempt_count = ?`,
  ).get(tenantId, lease.leadId, lease.startedAt, lease.attemptCount) as Record<string, unknown> | undefined;
  if (!current) return false;
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

  const result = await db.prepare(
    `UPDATE leads SET
      enrichment_status = 'enriched',
      enriched_at = ?,
      enrichment_finished_at = ?,
      enrichment_started_at = NULL,
      enrichment_next_retry_at = NULL,
      enrichment_last_error = NULL,
      enrichment_last_error_code = NULL,
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
    WHERE tenant_id = ? AND id = ?
      AND enrichment_status = 'running'
      AND enrichment_started_at = ?
      AND enrichment_attempt_count = ?`
  ).run(
    nowISO(),
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
    nowISO(), tenantId, lease.leadId, lease.startedAt, lease.attemptCount,
  );
  if (result.changes === 0) return false;
  await updateLeadQualityScoresForTenant(tenantId, lease.leadId);
  return true;
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
  const tenantId = requireGooglePlacesCacheTenantId();
  const db = await getDb();
  const row = await db.prepare(
    `SELECT raw_json, fetched_at
     FROM place_cache
     WHERE tenant_id = ?
       AND source_card_id = ?
       AND place_id = ?
       AND fetched_at >= datetime('now', '-' || ? || ' days')`
  ).get(tenantId, GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID, placeId, Math.floor(maxAgeDays)) as { raw_json: string; fetched_at: string } | undefined;
  if (!row) return null;

  const parsed = safeParseJson<Record<string, unknown>>(row.raw_json, {});
  // Raw Google reviews are never part of the runtime cache contract. Older rows
  // are treated as Stage A until the explicit derived-intelligence metadata exists.
  delete parsed.reviews;
  if (requireAtmosphere) {
    const metadata = readPlaceCacheMetadata(parsed);
    if (metadata?.detailsStage !== "stage-b" || !metadata.reviewInsights) {
      return null;
    }
  }
  return parsed;
}

export async function cachePlaceResponse(placeId: string, rawJson: string): Promise<void>{
  const tenantId = requireGooglePlacesCacheTenantId();
  const db = await getDb();
  await db.prepare(
    `INSERT INTO place_cache (tenant_id, source_card_id, place_id, raw_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, source_card_id, place_id) DO UPDATE
       SET raw_json = excluded.raw_json, fetched_at = excluded.fetched_at`
  ).run(tenantId, GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID, placeId, rawJson, nowISO());
}

export async function recordPlaceObservation(input: PlaceObservationInput): Promise<void>{
  const tenantId = input.tenantId ?? requireTenantContext().tenantId;
  const db = await getDb();
  await db.prepare(
    `INSERT INTO place_observations (
      tenant_id, source_card_id, id, place_id, crawl_run_id, crawl_unit_id, lead_id,
      endpoint, sku, field_mask, raw_json, observed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
    GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID,
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

export async function placeMasterExists(placeId: string, explicitTenantId?: string): Promise<boolean>{
  const tenantId = requireLeadWriteTenantId(explicitTenantId);
  const db = await getDb();
  const row = await db.prepare(
    `SELECT 1 as exists_flag
     FROM places_master
     WHERE tenant_id = ? AND source_card_id = ? AND place_id = ?
     LIMIT 1`,
  ).get(tenantId, GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID, placeId) as { exists_flag: number } | undefined;
  return !!row;
}

export async function upsertPlaceMaster(input: PlaceMasterUpsertInput): Promise<void>{
  const tenantId = input.tenantId ?? requireTenantContext().tenantId;
  const db = await getDb();
  const now = nowISO();
  const completeness = computeCompletenessScore(input);
  const freshness = computeFreshnessScore(now);
  const verificationCoverage = clampPercentage(input.verification_coverage ?? 0);

  await db.prepare(
    `INSERT INTO places_master (
      tenant_id, source_card_id, place_id, name, address, phone, website_uri, maps_uri, categories,
      rating, user_rating_count, business_status, price_level,
      photo_count, has_opening_hours, primary_type, lat, lng,
      editorial_summary, review_highlights, website_health,
      first_seen_at, last_seen_at, last_details_at, last_enriched_at,
      completeness_score, freshness_score, verification_coverage,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, source_card_id, place_id) DO UPDATE SET
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
    tenantId,
    GOOGLE_PLACES_LEGACY_SOURCE_CARD_ID,
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
  const { tenantId } = requireTenantContext();
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
     LEFT JOIN leads l ON l.tenant_id = pm.tenant_id AND l.place_id = pm.place_id
     WHERE pm.tenant_id = ?
     ORDER BY pm.freshness_score DESC, pm.completeness_score DESC
     LIMIT ?`
  ).all(tenantId, limit) as Array<Record<string, unknown>>;
}

export async function backfillPlacesMasterFromLeads(limit = 10000): Promise<number>{
  const { tenantId } = requireTenantContext();
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT
      tenant_id,
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
     WHERE tenant_id = ?
     ORDER BY discovered_at DESC
     LIMIT ?`
  ).all(tenantId, limit) as Array<Record<string, unknown>>;

  for (const row of rows) {
    const verification = safeParseJson<Record<string, boolean>>((row.verification as string | null) ?? "{}", {});
    const verifiedCount = Object.values(verification).filter(Boolean).length;
    const coverage = Object.keys(verification).length > 0
      ? (verifiedCount / Object.keys(verification).length) * 100
      : 0;

    await upsertPlaceMaster({
      tenantId: row.tenant_id as string,
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

async function buildDemoConfigForLead(lead: Lead): Promise<Record<string, unknown>> {
  const cta = ctaForNiche(lead.selling_niche, Boolean(lead.phone?.trim()));
  const businessDetail = await getLatestLeadAiArtifact(lead.id, "business_detail");
  const detail = businessDetail?.status === "complete" ? businessDetail.content_json : {};
  const detailServices = Array.isArray(detail.services) ? detail.services.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
  const trustSignals = Array.isArray(detail.trust_signals) ? detail.trust_signals.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
  const businessSummary = typeof detail.business_summary === "string" ? detail.business_summary : null;
  const ctaStrategy = typeof detail.cta_strategy === "string" ? detail.cta_strategy : null;
  return {
    headline: demoHeadlineForLead(lead),
    subheadline: businessSummary ?? "Built to help local customers call, book, and trust you faster.",
    services: detailServices.length > 0 ? detailServices : servicesForNiche(lead.selling_niche),
    trustSignals,
    primaryCta: cta.primaryCta,
    secondaryCta: cta.secondaryCta,
    ctaStrategy,
    phone: lead.phone,
    mapsUri: lead.maps_uri,
    websiteGap: lead.ai_summary ?? lead.quality_reason,
  };
}

function parseDemoRow(row: Record<string, unknown>): Demo {
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    slug: row.slug as string,
    template_id: (row.template_id as string | null) ?? "default",
    config_json: safeParseJson<Record<string, unknown>>((row.config_json as string | null) ?? "{}", {}),
    is_published: ((row.is_published as number) ?? 0) === 1,
    published_at: (row.published_at as string | null) ?? null,
    published_by_user_id: (row.published_by_user_id as string | null) ?? null,
    unpublished_at: (row.unpublished_at as string | null) ?? null,
    unpublished_by_user_id: (row.unpublished_by_user_id as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
    revoked_by_user_id: (row.revoked_by_user_id as string | null) ?? null,
    revoke_reason: (row.revoke_reason as string | null) ?? null,
    view_count: Number(row.view_count ?? 0),
    last_viewed_at: (row.last_viewed_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getDemoByLeadId(leadId: string): Promise<Demo | null> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const row = (await db.prepare(
    "SELECT * FROM demos WHERE tenant_id = ? AND lead_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(tenantId, leadId)) as
    | Record<string, unknown>
    | undefined;
  return row ? parseDemoRow(row) : null;
}

async function getCurrentDemoByLeadId(tenantId: string, leadId: string): Promise<Demo | null> {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT * FROM demos
     WHERE tenant_id = ? AND lead_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  ).get<Record<string, unknown>>(tenantId, leadId);
  return row ? parseDemoRow(row) : null;
}

async function lockLeadForDemoTransition(db: DbClient, tenantId: string, leadId: string): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE leads SET updated_at = updated_at WHERE tenant_id = ? AND id = ?",
  ).run(tenantId, leadId);
  return result.changes > 0;
}

export async function createDemoForLead(leadId: string): Promise<Demo | null>{
  const { tenantId } = requireTenantWideLeadReadContext();
  return withDbTransaction(async () => {
    const db = await getDb();
    if (!await lockLeadForDemoTransition(db, tenantId, leadId)) return null;
    const existing = await getCurrentDemoByLeadId(tenantId, leadId);
    const lead = await getLeadById(leadId);
    if (!lead) return null;
    if (existing?.is_published) return existing;

    const config = await buildDemoConfigForLead(lead);
    const now = nowISO();
    if (existing) {
      const refreshed = await db.prepare(
        `UPDATE demos
         SET config_json = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL AND is_published = 0`,
      ).run(JSON.stringify(config), now, tenantId, existing.id);
      if (refreshed.changes === 0) return getCurrentDemoByLeadId(tenantId, leadId);
      await createAuditLog("demo_refreshed", "demo", existing.id, { leadId });
      return getCurrentDemoByLeadId(tenantId, leadId);
    }

    const slug = `${slugify(lead.name ?? "business")}-${generateId().slice(0, 8)}`;
    await db.prepare(
      `INSERT INTO demos (tenant_id, id, lead_id, slug, template_id, config_json, is_published, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'local-service-v1', ?, 0, ?, ?)`,
    ).run(tenantId, generateId(), leadId, slug, JSON.stringify(config), now, now);
    const demo = await getCurrentDemoByLeadId(tenantId, leadId);
    if (demo) await createAuditLog("demo_created", "demo", demo.id, { leadId, slug: demo.slug, published: false });
    return demo;
  });
}

export async function publishDemoForLead(leadId: string, actorUserId: string | null = null): Promise<Demo | null>{
  const { tenantId } = requireTenantWideLeadReadContext();
  if (!await getCurrentDemoByLeadId(tenantId, leadId) && !await createDemoForLead(leadId)) return null;
  return withDbTransaction(async () => {
    const db = await getDb();
    if (!await lockLeadForDemoTransition(db, tenantId, leadId)) return null;
    const demo = await getCurrentDemoByLeadId(tenantId, leadId);
    if (!demo) return null;
    if (demo.is_published) return demo;
    const now = nowISO();
    const published = await db.prepare(
      `UPDATE demos
       SET is_published = 1,
           published_at = COALESCE(published_at, ?),
           published_by_user_id = COALESCE(published_by_user_id, ?),
           unpublished_at = NULL,
           unpublished_by_user_id = NULL,
           updated_at = ?
       WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL AND is_published = 0`,
    ).run(now, actorUserId, now, tenantId, demo.id);
    if (published.changes === 0) return getCurrentDemoByLeadId(tenantId, leadId);
    await db.prepare(
      "UPDATE leads SET demo_sent_at = COALESCE(demo_sent_at, ?), updated_at = ? WHERE tenant_id = ? AND id = ?",
    ).run(now, now, tenantId, leadId);
    await createAuditLog("demo_published", "demo", demo.id, { leadId, actorUserId });
    return getCurrentDemoByLeadId(tenantId, leadId);
  });
}

export async function unpublishDemoForLead(leadId: string, actorUserId: string | null = null): Promise<Demo | null>{
  const { tenantId } = requireTenantWideLeadReadContext();
  return withDbTransaction(async () => {
    const db = await getDb();
    if (!await lockLeadForDemoTransition(db, tenantId, leadId)) return null;
    const demo = await getCurrentDemoByLeadId(tenantId, leadId);
    if (!demo) return null;
    if (!demo.is_published) return demo;
    const now = nowISO();
    const unpublished = await db.prepare(
      `UPDATE demos
       SET is_published = 0,
           unpublished_at = ?,
           unpublished_by_user_id = ?,
           updated_at = ?
       WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL AND is_published = 1`,
    ).run(now, actorUserId, now, tenantId, demo.id);
    if (unpublished.changes === 0) return getCurrentDemoByLeadId(tenantId, leadId);
    await createAuditLog("demo_unpublished", "demo", demo.id, { leadId, actorUserId });
    return getCurrentDemoByLeadId(tenantId, leadId);
  });
}

export async function revokeDemoForLead(leadId: string, actorUserId: string | null = null, reason: string | null = null): Promise<Demo | null>{
  const { tenantId } = requireTenantWideLeadReadContext();
  return withDbTransaction(async () => {
    const db = await getDb();
    if (!await lockLeadForDemoTransition(db, tenantId, leadId)) return null;
    const demo = await getCurrentDemoByLeadId(tenantId, leadId);
    if (!demo) return getDemoByLeadId(leadId);
    const now = nowISO();
    const revoked = await db.prepare(
      `UPDATE demos
       SET is_published = 0,
           revoked_at = ?,
           revoked_by_user_id = COALESCE(revoked_by_user_id, ?),
           revoke_reason = COALESCE(revoke_reason, ?),
           updated_at = ?
       WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL`,
    ).run(now, actorUserId, reason, now, tenantId, demo.id);
    if (revoked.changes === 0) return getDemoByLeadId(leadId);
    await createAuditLog("demo_revoked", "demo", demo.id, { leadId, actorUserId, reason });
    return getDemoByLeadId(leadId);
  });
}

export async function recordDemoView(demoId: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    `UPDATE demos
     SET view_count = view_count + 1,
         last_viewed_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(nowISO(), nowISO(), demoId);
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
      d.published_at as demo_published_at,
      d.published_by_user_id as demo_published_by_user_id,
      d.unpublished_at as demo_unpublished_at,
      d.unpublished_by_user_id as demo_unpublished_by_user_id,
      d.revoked_at as demo_revoked_at,
      d.revoked_by_user_id as demo_revoked_by_user_id,
      d.revoke_reason as demo_revoke_reason,
      d.view_count as demo_view_count,
      d.last_viewed_at as demo_last_viewed_at,
      d.created_at as demo_created_at,
      d.updated_at as demo_updated_at,
      l.*
     FROM demos d
     INNER JOIN leads l ON l.id = d.lead_id
     WHERE d.slug = ? AND d.is_published = 1 AND d.revoked_at IS NULL
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
    published_at: row.demo_published_at,
    published_by_user_id: row.demo_published_by_user_id,
    unpublished_at: row.demo_unpublished_at,
    unpublished_by_user_id: row.demo_unpublished_by_user_id,
    revoked_at: row.demo_revoked_at,
    revoked_by_user_id: row.demo_revoked_by_user_id,
    revoke_reason: row.demo_revoke_reason,
    view_count: row.demo_view_count,
    last_viewed_at: row.demo_last_viewed_at,
    created_at: row.demo_created_at,
    updated_at: row.demo_updated_at,
  });

  return { demo, lead: parseLeadRow(row) };
}

export async function createOutreachEvent(input: OutreachEventInput): Promise<OutreachEvent>{
  const id = generateId();
  const now = nowISO();
  const outcome = input.outcome ?? "contacted";
  const decisionMakerReached = Boolean(input.decisionMakerReached || outcome === "decision_maker_reached" || outcome === "meeting_set" || outcome === "quoted" || outcome === "closed_won");
  const quotedAmount = Math.max(0, Number(input.quotedAmount ?? 0) || 0);
  const closeValue = Math.max(0, Number(input.closeValue ?? 0) || 0);

  return withDbTransaction(async () => {
    const db = await getDb();
    await db.prepare(
      `INSERT INTO outreach_events (
        id, lead_id, channel, actor_user_id, actor_email,
        contact_person_name, contact_person_role, decision_maker_reached,
        outcome, objection_reason, quoted_amount, close_value,
        follow_up_at, next_step, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.leadId,
      input.channel,
      input.actorUserId ?? null,
      input.actorEmail ?? null,
      input.contactPersonName ?? null,
      input.contactPersonRole ?? null,
      decisionMakerReached ? 1 : 0,
      outcome,
      input.objectionReason ?? null,
      quotedAmount,
      closeValue,
      input.followUpAt ?? null,
      input.nextStep ?? null,
      input.note ?? null,
      now,
    );

    await db.prepare(
      `UPDATE leads SET
        last_contacted_at = ?,
        first_contacted_at = COALESCE(first_contacted_at, ?),
        first_reply_at = CASE
          WHEN ? = 1 OR ? IN ('decision_maker_reached','meeting_set','quoted','closed_won') THEN COALESCE(first_reply_at, ?)
          ELSE first_reply_at
        END,
        meeting_booked_at = CASE WHEN ? = 'meeting_set' THEN COALESCE(meeting_booked_at, ?) ELSE meeting_booked_at END,
        demo_sent_at = CASE WHEN ? = 'demo_sent' THEN COALESCE(demo_sent_at, ?) ELSE demo_sent_at END,
        reminder_date = COALESCE(?, reminder_date),
        status = CASE
          WHEN status IN ('closed_won','closed_lost') THEN status
          WHEN ? = 'demo_sent' THEN 'preview_sent'
          WHEN ? = 'meeting_set' THEN 'meeting_set'
          WHEN ? = 'closed_won' THEN 'closed_won'
          WHEN ? = 'closed_lost' THEN 'closed_lost'
          ELSE 'contacted'
        END,
        pitch_outcome = ?,
        objection_reason = COALESCE(?, objection_reason),
        decision_maker_reached = CASE WHEN ? = 1 THEN 1 ELSE decision_maker_reached END,
        quoted_amount = CASE WHEN ? > 0 THEN ? ELSE quoted_amount END,
        close_value = CASE WHEN ? > 0 THEN ? ELSE close_value END,
        updated_at = ?
       WHERE id = ?`
    ).run(
      now,
      now,
      decisionMakerReached ? 1 : 0,
      outcome,
      now,
      outcome,
      now,
      outcome,
      now,
      input.followUpAt ?? null,
      outcome,
      outcome,
      outcome,
      outcome,
      outcome,
      input.objectionReason ?? null,
      decisionMakerReached ? 1 : 0,
      quotedAmount,
      quotedAmount,
      closeValue,
      closeValue,
      now,
      input.leadId,
    );

    await updateLeadQualityScores(input.leadId);
    const event = await db.prepare("SELECT * FROM outreach_events WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!event) throw new Error("Unable to create outreach event");
    return parseOutreachEventRow(event);
  });
}

export async function getOutreachEvents(leadId: string): Promise<OutreachEvent[]>{
  const db = await getDb();
  const rows = await db.prepare(
    "SELECT * FROM outreach_events WHERE lead_id = ? ORDER BY created_at DESC"
  ).all<Record<string, unknown>>(leadId);
  return rows.map(parseOutreachEventRow);
}

export async function getOutreachEventCount(leadId: string): Promise<number>{
  const db = await getDb();
  const row = await db.prepare(
    "SELECT COUNT(*) as c FROM outreach_events WHERE lead_id = ?"
  ).get(leadId) as { c: number };
  return row.c;
}

// ─── Admin Fulfillment Requests ───

const OPEN_ADMIN_REQUEST_STATUS_SQL = "'new','seen','in_progress','waiting_on_researcher'";

function adminRequestSelectSql(): string {
  return `SELECT
      ar.*,
      l.name as lead_name,
      l.phone as lead_phone,
      l.address as lead_address,
      l.website_status as lead_website_status,
      l.assigned_to_user_id as lead_owner_user_id,
      owner.email as lead_owner_email,
      owner.display_name as lead_owner_display_name,
      creator.email as creator_email,
      creator.display_name as creator_display_name,
      team_lead.user_id as creator_team_lead_user_id,
      team_lead.email as creator_team_lead_email,
      team_lead.display_name as creator_team_lead_display_name,
      creator.team_label as creator_team_label
    FROM admin_requests ar
    LEFT JOIN leads l ON l.tenant_id = ar.tenant_id AND l.id = ar.lead_id
    LEFT JOIN app_users owner
      ON owner.user_id = l.assigned_to_user_id
     AND EXISTS (
       SELECT 1
       FROM tenant_memberships owner_membership
       WHERE owner_membership.tenant_id = ar.tenant_id
         AND owner_membership.auth_identity_id = owner.user_id
         AND owner_membership.status = 'active'
     )
    LEFT JOIN app_users creator
      ON creator.user_id = ar.created_by_user_id
     AND EXISTS (
       SELECT 1
       FROM tenant_memberships creator_membership
       WHERE creator_membership.tenant_id = ar.tenant_id
         AND creator_membership.auth_identity_id = creator.user_id
         AND creator_membership.status = 'active'
     )
    LEFT JOIN app_users team_lead
      ON team_lead.user_id = COALESCE(creator.team_lead_user_id, CASE WHEN creator.is_team_lead = 1 THEN creator.user_id ELSE NULL END)
     AND EXISTS (
       SELECT 1
       FROM tenant_memberships team_lead_membership
       WHERE team_lead_membership.tenant_id = ar.tenant_id
         AND team_lead_membership.auth_identity_id = team_lead.user_id
         AND team_lead_membership.status = 'active'
     )`;
}

function requireTenantWideAdminRequestContext(): { tenantId: string } {
  const { tenantId, workspaceId } = requireTenantContext();
  if (workspaceId !== null) throw new Error("Tenant-wide context is required");
  return { tenantId };
}

export async function getOpenAdminRequestForLead(leadId: string, requestType: AdminRequestType): Promise<AdminRequest | null> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const row = await db.prepare(
    `${adminRequestSelectSql()}
     WHERE ar.tenant_id = ? AND ar.lead_id = ? AND ar.request_type = ? AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
     ORDER BY ar.created_at DESC
     LIMIT 1`
  ).get<Record<string, unknown>>(tenantId, leadId, requestType);
  return row ? parseAdminRequestRow(row) : null;
}

export async function createAdminRequest(input: AdminRequestInput): Promise<{ request: AdminRequest; alreadyExists: boolean }> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const lead = await db.prepare(
    "SELECT id FROM leads WHERE tenant_id = ? AND id = ? LIMIT 1"
  ).get<{ id: string }>(tenantId, input.leadId);
  if (!lead) throw new Error("Unable to create admin request");

  const existing = await getOpenAdminRequestForLead(input.leadId, input.requestType);
  if (existing) return { request: existing, alreadyExists: true };

  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO admin_requests (
      id, tenant_id, workspace_id, lead_id, created_by_user_id, created_by_email, assigned_admin_user_id,
      request_type, status, priority, summary, contact_person_name, budget_hint,
      due_at, next_step, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    input.leadId,
    input.createdByUserId ?? null,
    input.createdByEmail ?? null,
    input.assignedAdminUserId ?? null,
    input.requestType,
    input.priority ?? "normal",
    normalizeNullableText(input.summary),
    normalizeNullableText(input.contactPersonName),
    normalizeNullableText(input.budgetHint),
    normalizeNullableText(input.dueAt),
    normalizeNullableText(input.nextStep),
    now,
    now,
  );

  const request = await getAdminRequestById(id);
  if (!request) throw new Error("Unable to create admin request");
  return { request, alreadyExists: false };
}

export async function getAdminRequestById(id: string): Promise<AdminRequest | null> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const row = await db.prepare(
    `${adminRequestSelectSql()} WHERE ar.tenant_id = ? AND ar.id = ? LIMIT 1`
  ).get<Record<string, unknown>>(tenantId, id);
  return row ? parseAdminRequestRow(row) : null;
}

export async function updateAdminRequestStatus(id: string, status: AdminRequestStatus): Promise<AdminRequest | null> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const now = nowISO();
  await db.prepare(
    `UPDATE admin_requests
     SET status = ?,
         seen_at = CASE
           WHEN seen_at IS NULL AND ? IN ('seen','in_progress','waiting_on_researcher','done','cancelled') THEN ?
           ELSE seen_at
         END,
         completed_at = CASE WHEN ? IN ('done','cancelled') THEN ? ELSE NULL END,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(status, status, now, status, now, now, tenantId, id);
  return getAdminRequestById(id);
}

export async function getAdminRequests(filters: {
  leadId?: string;
  status?: AdminRequestStatus | "open" | "all";
  requestType?: AdminRequestType;
  limit?: number;
} = {}): Promise<AdminRequest[]> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const conditions: string[] = ["ar.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (filters.leadId) {
    conditions.push("ar.lead_id = ?");
    params.push(filters.leadId);
  }
  if (filters.requestType) {
    conditions.push("ar.request_type = ?");
    params.push(filters.requestType);
  }
  if (filters.status === "open" || !filters.status) {
    conditions.push(`ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})`);
  } else if (filters.status !== "all") {
    conditions.push("ar.status = ?");
    params.push(filters.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const rows = await db.prepare(
    `${adminRequestSelectSql()}
     ${where}
     ORDER BY
       CASE ar.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
       CASE ar.status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END,
       ar.created_at DESC
     LIMIT ?`
  ).all<Record<string, unknown>>(...params, limit);
  return rows.map(parseAdminRequestRow);
}

export async function getAdminFulfillmentSummary(): Promise<AdminFulfillmentSummary> {
  const { tenantId } = requireTenantWideAdminRequestContext();
  const db = await getDb();
  const now = nowISO();
  const row = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL}) THEN 1 ELSE 0 END), 0) as open_total,
       COALESCE(SUM(CASE WHEN status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL}) AND request_type = 'website_request' THEN 1 ELSE 0 END), 0) as website_open,
       COALESCE(SUM(CASE WHEN status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL}) AND request_type = 'quote_request' THEN 1 ELSE 0 END), 0) as quote_open,
       COALESCE(SUM(CASE WHEN status = 'waiting_on_researcher' THEN 1 ELSE 0 END), 0) as waiting_on_researcher,
       COALESCE(SUM(CASE WHEN status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL}) AND due_at IS NOT NULL AND due_at <= ? THEN 1 ELSE 0 END), 0) as overdue,
       COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0) as new_requests
     FROM admin_requests
     WHERE tenant_id = ?`
  ).get<Record<string, unknown>>(now, tenantId);
  const latestRequests = await getAdminRequests({ status: "open", limit: 6 });
  return {
    openTotal: Number(row?.open_total ?? 0),
    openWebsiteRequests: Number(row?.website_open ?? 0),
    openQuoteRequests: Number(row?.quote_open ?? 0),
    waitingOnResearcher: Number(row?.waiting_on_researcher ?? 0),
    overdueRequests: Number(row?.overdue ?? 0),
    newRequests: Number(row?.new_requests ?? 0),
    latestRequests,
  };
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

export async function markLeadRepliedIfUnset(id: string): Promise<number> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET first_reply_at = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ? AND first_reply_at IS NULL`,
  ).run(now, now, tenantId, id);
  if (result.changes > 0) await updateLeadQualityScores(id);
  return result.changes;
}

export async function markLeadMeetingBookedIfUnset(id: string): Promise<number> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const now = nowISO();
  const result = await db.prepare(
    `UPDATE leads
     SET meeting_booked_at = ?,
         status = CASE WHEN status IN ('closed_won', 'closed_lost') THEN status ELSE 'meeting_set' END,
         updated_at = ?
     WHERE tenant_id = ? AND id = ? AND meeting_booked_at IS NULL`,
  ).run(now, now, tenantId, id);
  if (result.changes > 0) await updateLeadQualityScores(id);
  return result.changes;
}

// ─── Now Queue ───

export async function getNowQueue(
  limit = 25,
  options: { assignedToUserId?: string; unassignedOnly?: boolean; visibleToUserId?: string; includeAllAssignedActive?: boolean } = {},
): Promise<QueueLead[]>{
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const candidateLimit = Math.max(limit * 20, 200);
  const includeAllAssignedActive = Boolean(options.assignedToUserId && options.includeAllAssignedActive);
  const assignmentConditions: string[] = [];
  const assignmentParams: unknown[] = [];
  if (options.assignedToUserId) {
    assignmentConditions.push(`l.assigned_to_user_id = ?
      AND EXISTS (
        SELECT 1 FROM tenant_memberships assigned_member
        WHERE assigned_member.tenant_id = l.tenant_id
          AND assigned_member.auth_identity_id = l.assigned_to_user_id
          AND assigned_member.status = 'active'
      )`);
    assignmentParams.push(options.assignedToUserId);
  }
  if (options.unassignedOnly) {
    assignmentConditions.push(leadUnassignedCondition("l.assigned_to_user_id"));
  }
  if (options.visibleToUserId) {
    assignmentConditions.push(`l.market_id IN (
      SELECT uma.market_id FROM user_market_access uma
      WHERE uma.tenant_id = ? AND uma.user_id = ?
    )`);
    assignmentParams.push(tenantId, options.visibleToUserId);
  }
  const assignmentWhere = assignmentConditions.length > 0 ? `AND ${assignmentConditions.join(" AND ")}` : "";
  const candidateWhere = includeAllAssignedActive
    ? `status NOT IN ('closed_won','closed_lost')
        AND ${SCORE_ELIGIBLE_CONDITION}
        ${assignmentWhere}`
    : `website_status IN ('none', 'social', 'basic')
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
        ${assignmentWhere}`;

  const rows = await db.prepare(`
    WITH candidates AS (
      SELECT id
      FROM leads l
      WHERE ${candidateWhere}
        AND l.tenant_id = ?
      ORDER BY ${leadWebsiteNeedRankExpression("l")} DESC, sales_priority_score DESC, lead_quality_score DESC, score DESC
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
        l.assigned_to_user_id,
        au.email as assigned_user_email,
        au.display_name as assigned_user_display_name,
        (
          SELECT a.status
          FROM lead_ai_artifacts a
          WHERE a.tenant_id = l.tenant_id
            AND a.lead_id = l.id AND a.artifact_type = 'business_detail'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) as business_detail_status,
        (
          SELECT a.status
          FROM lead_ai_artifacts a
          WHERE a.tenant_id = l.tenant_id
            AND a.lead_id = l.id AND a.artifact_type = 'competitive_report'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) as competitive_report_status,
        (
          SELECT d.slug
          FROM demos d
          WHERE d.tenant_id = l.tenant_id
            AND d.lead_id = l.id AND d.is_published = 1
          ORDER BY d.created_at DESC
          LIMIT 1
        ) as demo_slug,
        (
          SELECT ar.id
          FROM admin_requests ar
          WHERE ar.tenant_id = l.tenant_id
            AND ar.lead_id = l.id
            AND ar.request_type = 'website_request'
            AND ar.status IN ('new','seen','in_progress','waiting_on_researcher')
          ORDER BY ar.created_at DESC
          LIMIT 1
        ) as open_website_request_id,
        (
          SELECT ar.id
          FROM admin_requests ar
          WHERE ar.tenant_id = l.tenant_id
            AND ar.lead_id = l.id
            AND ar.request_type = 'quote_request'
            AND ar.status IN ('new','seen','in_progress','waiting_on_researcher')
          ORDER BY ar.created_at DESC
          LIMIT 1
        ) as open_quote_request_id,
        CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? THEN 1 ELSE 0 END as has_urgent_reminder,
        ${leadWebsiteNeedRankExpression("l")} as website_need_rank,
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
      ${TENANT_BOUND_ASSIGNEE_JOIN}
      INNER JOIN candidates c ON c.id = l.id
    )
    SELECT *
    FROM ranked
    ORDER BY
      has_urgent_reminder DESC,
      website_need_rank DESC,
      sales_priority_score DESC,
      lead_quality_score DESC,
      win_probability_score DESC,
      score DESC
    LIMIT ?
  `).all(...assignmentParams, tenantId, candidateLimit, today, limit) as Array<Record<string, unknown>>;

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
    is_excluded: isLeadExcluded(row.is_excluded),
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
    assigned_to_user_id: (row.assigned_to_user_id as string | null) ?? null,
    assigned_user_email: (row.assigned_user_email as string | null) ?? null,
    assigned_user_display_name: (row.assigned_user_display_name as string | null) ?? null,
    demo_slug: (row.demo_slug as string | null) ?? null,
    open_website_request_id: (row.open_website_request_id as string | null) ?? null,
    open_quote_request_id: (row.open_quote_request_id as string | null) ?? null,
    business_detail_status: normalizeNullableLeadAiArtifactStatus(row.business_detail_status),
    competitive_report_status: normalizeNullableLeadAiArtifactStatus(row.competitive_report_status),
  }));
}

export async function getResearcherWorkbench(userId: string, options: { viewerRole?: string } = {}): Promise<ResearcherWorkbench> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const visibleToUserId = options.viewerRole === "admin" ? undefined : userId;
  const activeMembership = await db.prepare(
    `SELECT 1 FROM tenant_memberships
     WHERE tenant_id = ? AND auth_identity_id = ? AND status = 'active'
     LIMIT 1`,
  ).get(tenantId, userId);
  if (!activeMembership) {
    return {
      nextAction: null,
      myLeads: [],
      unclaimedLeads: [],
      summary: { myClaimed: 0, dueToday: 0, contactedThisWeek: 0, bestUnclaimed: 0 },
    };
  }
  const [myLeads, unclaimedLeads] = await Promise.all([
    getNowQueue(25, { assignedToUserId: userId, visibleToUserId, includeAllAssignedActive: true }),
    getNowQueue(25, { unassignedOnly: true, visibleToUserId }),
  ]);
  const marketCondition = visibleToUserId
    ? "AND l.market_id IN (SELECT market_id FROM user_market_access WHERE tenant_id = ? AND user_id = ?)"
    : "";
  const marketParams = visibleToUserId ? [tenantId, visibleToUserId] : [];

  const summaryRow = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN l.assigned_to_user_id = ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as my_claimed,
       COALESCE(SUM(CASE WHEN l.assigned_to_user_id = ? AND l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN ${leadUnassignedCondition("l.assigned_to_user_id")} AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity') AND l.status IN ('new','verified','contacted') THEN 1 ELSE 0 END), 0) as best_unclaimed
     FROM leads l
     WHERE COALESCE(l.is_excluded, 0) = 0
       AND l.archived_at IS NULL
       AND l.tenant_id = ?
       ${marketCondition}`
  ).get(userId, userId, today, tenantId, ...marketParams) as Record<string, unknown>;
  const contactRow = await db.prepare(
    "SELECT COUNT(*) as count FROM outreach_events WHERE tenant_id = ? AND actor_user_id = ? AND created_at >= ?"
  ).get(tenantId, userId, weekAgo) as { count: number } | undefined;

  return {
    nextAction: myLeads[0] ?? null,
    myLeads,
    unclaimedLeads,
    summary: {
      myClaimed: Number(summaryRow.my_claimed ?? 0),
      dueToday: Number(summaryRow.due_today ?? 0),
      contactedThisWeek: Number(contactRow?.count ?? 0),
      bestUnclaimed: Number(summaryRow.best_unclaimed ?? 0),
    },
  };
}

export async function getTeamBoardSummary(): Promise<TeamBoardSummary> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = weekAgo;
  const roleBindingAsOf = new Date().toISOString();

  const members = await db.prepare(
    `WITH tenant_scope(tenant_id) AS (VALUES (?))
     SELECT
       au.user_id,
       au.email,
       au.display_name,
       member_role.role,
       0 as is_team_lead,
       NULL as team_lead_user_id,
       NULL as team_label,
       NULL as team_lead_email,
       NULL as team_lead_display_name,
       COALESCE(COUNT(CASE WHEN l.status NOT IN ('closed_won','closed_lost') THEN l.id END), 0) as claimed_active,
       COALESCE(SUM(CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN l.updated_at < ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as stale_claimed,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM lead_notes n
         WHERE n.tenant_id = member.tenant_id
           AND n.author_user_id = au.user_id AND n.created_at >= ? AND n.deleted_at IS NULL
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.created_by_user_id = au.user_id AND ar.created_at >= ?
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM audit_logs al
         WHERE al.scope_kind = 'tenant'
           AND al.tenant_id = member.tenant_id
           AND al.actor_user_id = au.user_id
           AND al.created_at >= ?
           AND al.action NOT IN ('outreach_logged','lead_note_created','admin_request_created','admin_request_duplicate_open')
       ), 0) as activity_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND oe.channel = 'call'
       ), 0) as calls_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND COALESCE(oe.decision_maker_reached, 0) = 1
       ), 0) as decision_makers_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND oe.follow_up_at IS NOT NULL
       ), 0) as followups_set_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_7d,
       COALESCE(SUM(CASE WHEN l.status = 'meeting_set' THEN 1 ELSE 0 END), 0) as meetings,
       COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN 1 ELSE 0 END), 0) as closed_won,
       COALESCE(SUM(CASE WHEN l.status = 'closed_lost' THEN 1 ELSE 0 END), 0) as closed_lost,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'website_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as website_requests_open,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'quote_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as quote_requests_open
     FROM tenant_scope tenant
     JOIN tenant_memberships member
       ON member.tenant_id = tenant.tenant_id
      AND member.status = 'active'
      AND member.auth_identity_id IS NOT NULL
     JOIN tenant_role_bindings member_role
       ON member_role.tenant_id = member.tenant_id
      AND member_role.membership_id = member.id
      AND member_role.revoked_at IS NULL
      AND member_role.valid_from <= ?
     JOIN app_users au
       ON au.user_id = member.auth_identity_id
      AND au.status = 'active'
     LEFT JOIN leads l
       ON l.tenant_id = member.tenant_id
      AND l.assigned_to_user_id = au.user_id
      AND COALESCE(l.is_excluded, 0) = 0
      AND l.archived_at IS NULL
     GROUP BY au.user_id, au.email, au.display_name, member_role.role
     ORDER BY member_role.role ASC, au.email ASC`
  ).all<Record<string, unknown>>(
    tenantId,
    today,
    staleBefore,
    today,
    today,
    today,
    today,
    today,
    today,
    today,
    today,
    weekAgo,
    roleBindingAsOf,
  );

  const unassignedRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads l
     WHERE l.tenant_id = ?
       AND COALESCE(l.is_excluded, 0) = 0
       AND l.archived_at IS NULL
       AND ${leadUnassignedCondition("l.assigned_to_user_id")}
       AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity')
       AND l.status IN ('new','verified','contacted')`
  ).get(tenantId) as { count: number } | undefined;
  const overdueRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads l
     WHERE l.tenant_id = ?
       AND COALESCE(l.is_excluded, 0) = 0
       AND l.archived_at IS NULL
       AND l.reminder_date IS NOT NULL
       AND l.reminder_date <= ?
       AND l.status NOT IN ('closed_won','closed_lost')`
  ).get(tenantId, today) as { count: number } | undefined;
  const todayActivityRows = await getTeamBoardActivityRows({ since: today, limit: 100 });
  const activityRows = await getTeamBoardActivityRows({ limit: 25 });

  return {
    members: members.map((row) => ({
      user_id: String(row.user_id),
      email: String(row.email),
      display_name: row.display_name ? String(row.display_name) : null,
      role: String(row.role),
      is_team_lead: toBoolean(row.is_team_lead),
      team_lead_user_id: (row.team_lead_user_id as string | null) ?? null,
      team_lead_email: (row.team_lead_email as string | null) ?? null,
      team_lead_display_name: (row.team_lead_display_name as string | null) ?? null,
      team_label: (row.team_label as string | null) ?? null,
      claimed_active: Number(row.claimed_active ?? 0),
      due_today: Number(row.due_today ?? 0),
      stale_claimed: Number(row.stale_claimed ?? 0),
      activity_today: Number(row.activity_today ?? 0),
      contacts_today: Number(row.contacts_today ?? 0),
      calls_today: Number(row.calls_today ?? 0),
      decision_makers_today: Number(row.decision_makers_today ?? 0),
      followups_set_today: Number(row.followups_set_today ?? 0),
      contacts_7d: Number(row.contacts_7d ?? 0),
      meetings: Number(row.meetings ?? 0),
      closed_won: Number(row.closed_won ?? 0),
      closed_lost: Number(row.closed_lost ?? 0),
      website_requests_open: Number(row.website_requests_open ?? 0),
      quote_requests_open: Number(row.quote_requests_open ?? 0),
      fulfillment_open: Number(row.website_requests_open ?? 0) + Number(row.quote_requests_open ?? 0),
    })),
    unassignedReady: Number(unassignedRow?.count ?? 0),
    overdueFollowUps: Number(overdueRow?.count ?? 0),
    todayActivity: todayActivityRows.map(parseTeamBoardActivityRow),
    latestActivity: activityRows.map(parseTeamBoardActivityRow),
  };
}

export async function getResearcherTeamBoardSummary(userId: string): Promise<TeamBoardSummary> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = weekAgo;
  const roleBindingAsOf = new Date().toISOString();

  const memberRow = await db.prepare(
    `WITH tenant_scope(tenant_id) AS (VALUES (?))
     SELECT
       au.user_id,
       au.email,
       au.display_name,
       member_role.role,
       0 as is_team_lead,
       NULL as team_lead_user_id,
       NULL as team_label,
       NULL as team_lead_email,
       NULL as team_lead_display_name,
       COALESCE(COUNT(CASE WHEN l.status NOT IN ('closed_won','closed_lost') THEN l.id END), 0) as claimed_active,
       COALESCE(SUM(CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN l.updated_at < ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as stale_claimed,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM lead_notes n
         WHERE n.tenant_id = member.tenant_id
           AND n.author_user_id = au.user_id AND n.created_at >= ? AND n.deleted_at IS NULL
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.created_by_user_id = au.user_id AND ar.created_at >= ?
       ), 0)
       + COALESCE((
         SELECT COUNT(*)
         FROM audit_logs al
         WHERE al.scope_kind = 'tenant'
           AND al.tenant_id = member.tenant_id
           AND al.actor_user_id = au.user_id
           AND al.created_at >= ?
           AND al.action NOT IN ('outreach_logged','lead_note_created','admin_request_created','admin_request_duplicate_open')
       ), 0) as activity_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND oe.channel = 'call'
       ), 0) as calls_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND COALESCE(oe.decision_maker_reached, 0) = 1
       ), 0) as decision_makers_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ? AND oe.follow_up_at IS NOT NULL
       ), 0) as followups_set_today,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.tenant_id = member.tenant_id
           AND oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_7d,
       COALESCE(SUM(CASE WHEN l.status = 'meeting_set' THEN 1 ELSE 0 END), 0) as meetings,
       COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN 1 ELSE 0 END), 0) as closed_won,
       COALESCE(SUM(CASE WHEN l.status = 'closed_lost' THEN 1 ELSE 0 END), 0) as closed_lost,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'website_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as website_requests_open,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.tenant_id = member.tenant_id
           AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'quote_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as quote_requests_open
     FROM tenant_scope tenant
     JOIN tenant_memberships member
       ON member.tenant_id = tenant.tenant_id
      AND member.status = 'active'
      AND member.auth_identity_id = ?
     JOIN tenant_role_bindings member_role
       ON member_role.tenant_id = member.tenant_id
      AND member_role.membership_id = member.id
      AND member_role.revoked_at IS NULL
      AND member_role.valid_from <= ?
     JOIN app_users au
       ON au.user_id = member.auth_identity_id
      AND au.status = 'active'
     LEFT JOIN leads l
       ON l.tenant_id = member.tenant_id
      AND l.assigned_to_user_id = au.user_id
      AND COALESCE(l.is_excluded, 0) = 0
      AND l.archived_at IS NULL
     GROUP BY au.user_id, au.email, au.display_name, member_role.role`
  ).get<Record<string, unknown>>(
    tenantId,
    today,
    staleBefore,
    today,
    today,
    today,
    today,
    today,
    today,
    today,
    today,
    weekAgo,
    userId,
    roleBindingAsOf,
  );

  const todayActivityRows = await getTeamBoardActivityRows({ since: today, actorUserId: userId, limit: 100 });
  const activityRows = await getTeamBoardActivityRows({ actorUserId: userId, limit: 25 });

  const member: TeamBoardMember | null = memberRow ? {
    user_id: String(memberRow.user_id),
    email: String(memberRow.email),
    display_name: memberRow.display_name ? String(memberRow.display_name) : null,
    role: String(memberRow.role),
    is_team_lead: toBoolean(memberRow.is_team_lead),
    team_lead_user_id: (memberRow.team_lead_user_id as string | null) ?? null,
    team_lead_email: (memberRow.team_lead_email as string | null) ?? null,
    team_lead_display_name: (memberRow.team_lead_display_name as string | null) ?? null,
    team_label: (memberRow.team_label as string | null) ?? null,
    claimed_active: Number(memberRow.claimed_active ?? 0),
    due_today: Number(memberRow.due_today ?? 0),
    stale_claimed: Number(memberRow.stale_claimed ?? 0),
    activity_today: Number(memberRow.activity_today ?? 0),
    contacts_today: Number(memberRow.contacts_today ?? 0),
    calls_today: Number(memberRow.calls_today ?? 0),
    decision_makers_today: Number(memberRow.decision_makers_today ?? 0),
    followups_set_today: Number(memberRow.followups_set_today ?? 0),
    contacts_7d: Number(memberRow.contacts_7d ?? 0),
    meetings: Number(memberRow.meetings ?? 0),
    closed_won: Number(memberRow.closed_won ?? 0),
    closed_lost: Number(memberRow.closed_lost ?? 0),
    website_requests_open: Number(memberRow.website_requests_open ?? 0),
    quote_requests_open: Number(memberRow.quote_requests_open ?? 0),
    fulfillment_open: Number(memberRow.website_requests_open ?? 0) + Number(memberRow.quote_requests_open ?? 0),
  } : null;

  return {
    members: member ? [member] : [],
    unassignedReady: 0,
    overdueFollowUps: member?.due_today ?? 0,
    todayActivity: todayActivityRows.map(parseTeamBoardActivityRow),
    latestActivity: activityRows.map(parseTeamBoardActivityRow),
  };
}

async function getTeamBoardActivityRows({
  since,
  actorUserId,
  limit,
}: {
  since?: string;
  actorUserId?: string;
  limit: number;
}): Promise<Array<Record<string, unknown>>> {
  const { tenantId } = requireTenantWideLeadReadContext();
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const params: unknown[] = [];

  const outreachWhere = buildActivityWhere("oe", "actor_user_id", since, actorUserId, params);
  const noteWhere = buildActivityWhere("n", "author_user_id", since, actorUserId, params, ["n.deleted_at IS NULL"]);
  const adminRequestWhere = buildActivityWhere("ar", "created_by_user_id", since, actorUserId, params);
  const auditWhere = buildActivityWhere("al", "actor_user_id", since, actorUserId, params, [
    "al.scope_kind = 'tenant'",
    "al.action NOT IN ('outreach_logged','lead_note_created','admin_request_created','admin_request_duplicate_open')",
  ]);
  params.push(safeLimit);

  return db.prepare(
    `WITH tenant_scope(tenant_id) AS (VALUES (?))
     SELECT *
     FROM (
       SELECT
         'outreach:' || oe.id as id,
         'outreach' as activity_type,
         'outreach_logged' as action,
         oe.lead_id,
         l.name as lead_name,
         oe.actor_user_id,
         COALESCE(oe.actor_email, au.email) as actor_email,
         au.display_name as actor_display_name,
         oe.channel,
         oe.outcome,
         NULL as summary,
         oe.contact_person_name,
         oe.contact_person_role,
         oe.decision_maker_reached,
         oe.objection_reason,
         oe.quoted_amount,
         oe.close_value,
         oe.follow_up_at,
         oe.next_step,
         oe.note,
         '{}' as metadata_json,
         oe.created_at
       FROM outreach_events oe
       LEFT JOIN leads l ON l.tenant_id = oe.tenant_id AND l.id = oe.lead_id
       LEFT JOIN tenant_memberships actor_membership
         ON actor_membership.tenant_id = oe.tenant_id
        AND actor_membership.auth_identity_id = oe.actor_user_id
        AND actor_membership.status = 'active'
       LEFT JOIN tenant_role_bindings actor_role
         ON actor_role.tenant_id = actor_membership.tenant_id
        AND actor_role.membership_id = actor_membership.id
        AND actor_role.revoked_at IS NULL
       LEFT JOIN app_users au
         ON au.user_id = actor_membership.auth_identity_id
        AND au.status = 'active'
        AND actor_role.id IS NOT NULL
       ${outreachWhere}

       UNION ALL

       SELECT
         'note:' || n.id as id,
         'note' as activity_type,
         'lead_note_created' as action,
         n.lead_id,
         l.name as lead_name,
         n.author_user_id as actor_user_id,
         au.email as actor_email,
         au.display_name as actor_display_name,
         'note' as channel,
         'note_created' as outcome,
         NULL as summary,
         NULL as contact_person_name,
         NULL as contact_person_role,
         0 as decision_maker_reached,
         NULL as objection_reason,
         0 as quoted_amount,
         0 as close_value,
         NULL as follow_up_at,
         NULL as next_step,
         n.body as note,
         '{}' as metadata_json,
         n.created_at
       FROM lead_notes n
       LEFT JOIN leads l ON l.tenant_id = n.tenant_id AND l.id = n.lead_id
       LEFT JOIN tenant_memberships actor_membership
         ON actor_membership.tenant_id = n.tenant_id
        AND actor_membership.auth_identity_id = n.author_user_id
        AND actor_membership.status = 'active'
       LEFT JOIN tenant_role_bindings actor_role
         ON actor_role.tenant_id = actor_membership.tenant_id
        AND actor_role.membership_id = actor_membership.id
        AND actor_role.revoked_at IS NULL
       LEFT JOIN app_users au
         ON au.user_id = actor_membership.auth_identity_id
        AND au.status = 'active'
        AND actor_role.id IS NOT NULL
       ${noteWhere}

       UNION ALL

       SELECT
         'admin_request:' || ar.id as id,
         'admin_request' as activity_type,
         'admin_request_created' as action,
         ar.lead_id,
         l.name as lead_name,
         ar.created_by_user_id as actor_user_id,
         COALESCE(ar.created_by_email, au.email) as actor_email,
         au.display_name as actor_display_name,
         ar.request_type as channel,
         ar.status as outcome,
         ar.summary,
         ar.contact_person_name,
         NULL as contact_person_role,
         0 as decision_maker_reached,
         NULL as objection_reason,
         0 as quoted_amount,
         0 as close_value,
         ar.due_at as follow_up_at,
         ar.next_step,
         ar.summary as note,
         '{}' as metadata_json,
         ar.created_at
       FROM admin_requests ar
       LEFT JOIN leads l ON l.tenant_id = ar.tenant_id AND l.id = ar.lead_id
       LEFT JOIN tenant_memberships actor_membership
         ON actor_membership.tenant_id = ar.tenant_id
        AND actor_membership.auth_identity_id = ar.created_by_user_id
        AND actor_membership.status = 'active'
       LEFT JOIN tenant_role_bindings actor_role
         ON actor_role.tenant_id = actor_membership.tenant_id
        AND actor_role.membership_id = actor_membership.id
        AND actor_role.revoked_at IS NULL
       LEFT JOIN app_users au
         ON au.user_id = actor_membership.auth_identity_id
        AND au.status = 'active'
        AND actor_role.id IS NOT NULL
       ${adminRequestWhere}

       UNION ALL

       SELECT
         'audit:' || al.id as id,
         'audit' as activity_type,
         al.action,
         CASE WHEN al.entity_type = 'lead' THEN al.entity_id ELSE NULL END as lead_id,
         l.name as lead_name,
         al.actor_user_id,
         COALESCE(al.actor_email, au.email) as actor_email,
         au.display_name as actor_display_name,
         'audit' as channel,
         al.action as outcome,
         NULL as summary,
         NULL as contact_person_name,
         NULL as contact_person_role,
         0 as decision_maker_reached,
         NULL as objection_reason,
         0 as quoted_amount,
         0 as close_value,
         NULL as follow_up_at,
         NULL as next_step,
         NULL as note,
         CAST(al.metadata AS TEXT) as metadata_json,
         al.created_at
       FROM audit_logs al
       LEFT JOIN leads l ON l.tenant_id = al.tenant_id AND al.entity_type = 'lead' AND l.id = al.entity_id
       LEFT JOIN tenant_memberships actor_membership
         ON actor_membership.tenant_id = al.tenant_id
        AND actor_membership.auth_identity_id = al.actor_user_id
        AND actor_membership.status = 'active'
       LEFT JOIN tenant_role_bindings actor_role
         ON actor_role.tenant_id = actor_membership.tenant_id
        AND actor_role.membership_id = actor_membership.id
        AND actor_role.revoked_at IS NULL
       LEFT JOIN app_users au
         ON au.user_id = actor_membership.auth_identity_id
        AND au.status = 'active'
        AND actor_role.id IS NOT NULL
       ${auditWhere}
     ) activity
     ORDER BY created_at DESC
     LIMIT ?`
  ).all<Record<string, unknown>>(tenantId, ...params);
}

function buildActivityWhere(
  alias: string,
  actorColumn: string,
  since: string | undefined,
  actorUserId: string | undefined,
  params: unknown[],
  extraConditions: string[] = [],
): string {
  const conditions = [
    `${alias}.tenant_id = (SELECT tenant_id FROM tenant_scope)`,
    ...extraConditions,
  ];
  if (since) {
    conditions.push(`${alias}.created_at >= ?`);
    params.push(since);
  }
  if (actorUserId) {
    conditions.push(`${alias}.${actorColumn} = ?`);
    params.push(actorUserId);
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

function parseTeamBoardActivityRow(row: Record<string, unknown>): TeamBoardActivity {
  return {
    id: String(row.id),
    activity_type: normalizeTeamBoardActivityType(row.activity_type),
    action: String(row.action ?? ""),
    lead_id: row.lead_id ? String(row.lead_id) : null,
    lead_name: (row.lead_name as string | null) ?? null,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    actor_email: (row.actor_email as string | null) ?? null,
    actor_display_name: (row.actor_display_name as string | null) ?? null,
    channel: String(row.channel ?? "activity"),
    outcome: String(row.outcome ?? row.action ?? "activity"),
    summary: (row.summary as string | null) ?? null,
    contact_person_name: (row.contact_person_name as string | null) ?? null,
    contact_person_role: (row.contact_person_role as string | null) ?? null,
    decision_maker_reached: toBoolean(row.decision_maker_reached),
    objection_reason: (row.objection_reason as string | null) ?? null,
    quoted_amount: Number(row.quoted_amount ?? 0),
    close_value: Number(row.close_value ?? 0),
    follow_up_at: normalizeNullableDateText(row.follow_up_at),
    next_step: (row.next_step as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    metadata: safeParseJson<Record<string, unknown>>(row.metadata_json, {}),
    created_at: normalizeDateText(row.created_at),
  };
}

function normalizeTeamBoardActivityType(value: unknown): TeamBoardActivity["activity_type"] {
  if (value === "note" || value === "admin_request" || value === "audit") return value;
  return "outreach";
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
  const { tenantId } = requireTenantWideLeadReadContext();
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

  const totalDiscovered = await countRows(db, "leads l", leadWindow, "l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const activeLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const qualifiedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.qualification_status = 'qualified' AND l.tenant_id = ?", [tenantId]);
  const queueCandidates = await countRows(
    db,
    "leads l",
    leadWindow,
    `COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.website_status IN ('none','social','basic') AND ${noUsableAiWebsiteCondition("l")} AND l.qualification_status IN ('qualified','needs_verification') AND l.status IN ('new','verified','contacted') AND l.score > 0 AND l.tenant_id = ?`,
    [tenantId],
  );
  const excludedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 1 AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const demosCreated = await countRows(db, "demos d", demoWindow, "d.tenant_id = ?", [tenantId]);
  const qualifiedNoSiteLeads = await countRows(
    db,
    "leads l",
    leadWindow,
    `COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.qualification_status = 'qualified' AND l.website_status IN ('none','social','basic') AND ${noUsableAiWebsiteCondition("l")} AND l.tenant_id = ?`,
    [tenantId],
  );
  const contactableLeads = await countRows(
    db,
    "leads l",
    leadWindow,
    `COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND (COALESCE(l.phone, '') != '' OR EXISTS (
      SELECT 1 FROM ai_lead_verifications av
      WHERE av.lead_id = l.id
        AND av.tenant_id = l.tenant_id
        AND (COALESCE(av.found_email, '') != '' OR COALESCE(av.found_phone, '') != '')
    )) AND l.tenant_id = ?`,
    [tenantId],
  );
  const contactedLeads = await countDistinctRows(db, "outreach_events oe", "oe.lead_id", outreachWindow, "oe.tenant_id = ?", [tenantId]);
  const replies = await countRows(db, "leads l", replyWindow, "l.first_reply_at IS NOT NULL AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const meetings = await countRows(db, "leads l", meetingWindow, "l.meeting_booked_at IS NOT NULL AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const closedWon = await countRows(db, "leads l", statusWindow, "l.status = 'closed_won' AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);
  const closedLost = await countRows(db, "leads l", statusWindow, "l.status = 'closed_lost' AND l.archived_at IS NULL AND l.tenant_id = ?", [tenantId]);

  const economicsRow = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.qualification_status IN ('qualified','needs_verification') THEN l.estimated_deal_value ELSE 0 END), 0) as pipeline_value,
            COALESCE(AVG(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.estimated_deal_value > 0 THEN l.estimated_deal_value END), 0) as average_deal_value
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL AND l.tenant_id = ?")}`
  ).get(...leadWindow.params, tenantId) as { pipeline_value: number; average_deal_value: number };

  const apiRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as calls, COALESCE(SUM(a.estimated_cost), 0) as cost
     FROM api_usage_events a ${whereFromWindow(apiWindow, "a.success = 1 AND COALESCE(a.was_cached, 0) = 0 AND a.tenant_id = ?")}`
  ).get(...apiWindow.params, tenantId) as { calls: number; cost: number };

  const demoProofRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as published,
            COALESCE(SUM(d.view_count), 0) as views
     FROM demos d ${whereFromWindow(demoWindow, "d.is_published = 1 AND d.revoked_at IS NULL AND d.tenant_id = ?")}`
  ).get(...demoWindow.params, tenantId) as { published: number; views: number };

  const failureRow = await db.prepare(
    `SELECT COALESCE(COUNT(cu.id), 0) as total_units,
            COALESCE(SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END), 0) as failed_units,
            COALESCE(COUNT(DISTINCT CASE WHEN cr.status IN ('blocked','error') THEN cr.id END), 0) as blocked_runs
     FROM crawl_runs cr
     LEFT JOIN crawl_units cu ON cu.crawl_run_id = cr.id AND cu.tenant_id = cr.tenant_id
     ${whereFromWindow(runWindow, "cr.tenant_id = ?")}`
  ).get(...runWindow.params, tenantId) as { total_units: number; failed_units: number; blocked_runs: number };

  const aiUsageRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as calls,
            COALESCE(SUM(ai.estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN COALESCE(ai.was_cached, 0) = 1 THEN 1 ELSE 0 END), 0) as cached
     FROM ai_usage_events ai ${whereFromWindow(aiUsageWindow, "ai.success = 1 AND ai.tenant_id = ?")}`
  ).get(...aiUsageWindow.params, tenantId) as { calls: number; cost: number; cached: number };

  const aiVerificationRow = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as verifications,
            COALESCE(SUM(CASE WHEN av.status = 'site_found' AND COALESCE(av.website_viability_status, '') = 'usable' THEN 1 ELSE 0 END), 0) as usable_site_found,
            COALESCE(SUM(CASE WHEN av.status = 'weak_site_found' THEN 1 ELSE 0 END), 0) as weak_site_found,
            COALESCE(SUM(CASE WHEN av.status IN ('no_site_found','weak_site_found') THEN 1 ELSE 0 END), 0) as website_opportunity_found,
            COALESCE(SUM(CASE WHEN av.status IN ('uncertain','mismatch') THEN 1 ELSE 0 END), 0) as uncertain
     FROM ai_lead_verifications av ${whereFromWindow(aiVerificationWindow, "av.error IS NULL AND av.tenant_id = ?")}`
  ).get(...aiVerificationWindow.params, tenantId) as {
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
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL AND l.tenant_id = ?")}`
  ).get(...leadWindow.params, tenantId) as Record<string, number>;
  const qualityPipelineRows = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.quality_bucket, 'needs_ai_verify') as key,
            COUNT(*) as count,
            COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL THEN l.estimated_deal_value ELSE 0 END), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.quality_bucket, 'needs_ai_verify')
     ORDER BY value DESC, count DESC`,
    [...leadWindow.params, tenantId],
    "bucket",
  );
  const topReadyByType = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.business_type, 'local_services') as key,
            COUNT(*) as count,
            COALESCE(SUM(l.estimated_deal_value), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.quality_bucket = 'ready_to_call' AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')
     ORDER BY count DESC, value DESC
     LIMIT 8`,
    [...leadWindow.params, tenantId],
    "businessType",
  );
  const topValueByType = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.business_type, 'local_services') as key,
            COUNT(*) as count,
            COALESCE(SUM(l.estimated_deal_value), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity') AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')
     ORDER BY value DESC, count DESC
     LIMIT 8`,
    [...leadWindow.params, tenantId],
    "businessType",
  );

  const businessTypes = await getStatisticsBusinessTypes(db, range, tenantId);
  const verification = await getVerificationCoverage(db, leadWindow, tenantId);
  const failedUnits = await countRows(
    db,
    "crawl_units cu INNER JOIN crawl_runs cr ON cr.id = cu.crawl_run_id AND cr.tenant_id = cu.tenant_id",
    runWindow,
    "cu.status = 'failed' AND cu.tenant_id = ?",
    [tenantId],
  );
  const enrichmentBacklog = await countRows(
    db,
    "leads l",
    { clause: "", params: [] },
    "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.enrichment_status = 'pending' AND l.score > 0 AND l.tenant_id = ?",
    [tenantId],
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
    valueProof: {
      qualifiedNoSiteLeads,
      contactableLeads,
      costPerQualifiedLead: divideCurrency(apiRow.cost, qualifiedLeads),
      demosPublished: Number(demoProofRow.published ?? 0),
      demoViews: Number(demoProofRow.views ?? 0),
      demoToMeetingRate: percentage(meetings, Number(demoProofRow.published ?? 0)),
      meetings,
      wins: closedWon,
      losses: closedLost,
      blockedOrFailureRate: percentage(Number(failureRow.failed_units ?? 0) + Number(failureRow.blocked_runs ?? 0), Number(failureRow.total_units ?? 0) + Number(failureRow.blocked_runs ?? 0)),
      blockedRuns: Number(failureRow.blocked_runs ?? 0),
      failedUnits: Number(failureRow.failed_units ?? 0),
      totalUnits: Number(failureRow.total_units ?? 0),
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
      websiteStatus: await getLeadBreakdown(db, "website_status", leadWindow, tenantId),
      qualificationStatus: await getLeadBreakdown(db, "qualification_status", leadWindow, tenantId),
      enrichmentStatus: await getLeadBreakdown(db, "enrichment_status", leadWindow, tenantId),
      exclusionReasons: await getExclusionReasonBreakdown(db, leadWindow, tenantId),
      verificationAverage: verification.average,
      verificationCheckedLeads: verification.checkedLeads,
    },
    operations: {
      apiByEndpoint: await getApiBreakdown(db, "endpoint", apiWindow, tenantId),
      apiBySku: await getApiBreakdown(db, "sku", apiWindow, tenantId),
      crawlRunsByStatus: await getCrawlRunBreakdown(db, runWindow, tenantId),
      failedUnits,
      enrichmentBacklog,
    },
  };
}

async function getStatisticsBusinessTypes(db: DbClient, range: ResolvedStatisticsRange, tenantId: string): Promise<StatisticsBusinessTypeRow[]> {
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
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`
  ).all(...leadWindow.params, tenantId) as Array<Record<string, unknown>>;

  const contacted = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(DISTINCT oe.lead_id) as count
     FROM outreach_events oe INNER JOIN leads l ON l.id = oe.lead_id AND l.tenant_id = oe.tenant_id ${whereFromWindow(outreachWindow, "oe.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    [...outreachWindow.params, tenantId],
  );
  const demos = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM demos d INNER JOIN leads l ON l.id = d.lead_id AND l.tenant_id = d.tenant_id ${whereFromWindow(demoWindow, "d.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    [...demoWindow.params, tenantId],
  );
  const meetings = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(meetingWindow, "l.meeting_booked_at IS NOT NULL AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    [...meetingWindow.params, tenantId],
  );
  const won = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(statusWindow, "l.status = 'closed_won' AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    [...statusWindow.params, tenantId],
  );
  const lost = await countByBusinessType(db,
    `SELECT COALESCE(l.business_type, 'local_services') as business_type, COUNT(*) as count
     FROM leads l ${whereFromWindow(statusWindow, "l.status = 'closed_lost' AND l.tenant_id = ?")}
     GROUP BY COALESCE(l.business_type, 'local_services')`,
    [...statusWindow.params, tenantId],
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

async function getLeadBreakdown(db: DbClient, column: "website_status" | "qualification_status" | "enrichment_status", window: SqlWindow, tenantId: string): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT COALESCE(l.${column}, 'unknown') as key, COUNT(*) as count
     FROM leads l ${whereFromWindow(window, "l.tenant_id = ?")}
     GROUP BY COALESCE(l.${column}, 'unknown')
     ORDER BY count DESC`
  ).all(...window.params, tenantId) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({
    key: row.key,
    label: row.key.replace(/_/g, " "),
    count: row.count,
  }));
}

async function getExclusionReasonBreakdown(db: DbClient, window: SqlWindow, tenantId: string): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT COALESCE(NULLIF(TRIM(l.exclusion_reason), ''), 'No reason recorded') as key, COUNT(*) as count
     FROM leads l ${whereFromWindow(window, "COALESCE(l.is_excluded, 0) = 1 AND l.tenant_id = ?")}
     GROUP BY COALESCE(NULLIF(TRIM(l.exclusion_reason), ''), 'No reason recorded')
     ORDER BY count DESC
     LIMIT 8`
  ).all(...window.params, tenantId) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: row.key, label: row.key, count: row.count }));
}

async function getApiBreakdown(db: DbClient, column: "endpoint" | "sku", window: SqlWindow, tenantId: string): Promise<Array<{ key: string; calls: number; cost: number }>> {
  const rows = await db.prepare(
    `SELECT a.${column} as key, COUNT(*) as calls, COALESCE(SUM(a.estimated_cost), 0) as cost
     FROM api_usage_events a ${whereFromWindow(window, "a.success = 1 AND COALESCE(a.was_cached, 0) = 0 AND a.tenant_id = ?")}
     GROUP BY a.${column}
     ORDER BY cost DESC, calls DESC`
  ).all(...window.params, tenantId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    key: String((row as Record<string, unknown>).key),
    calls: Number((row as Record<string, unknown>).calls ?? 0),
    cost: Math.round(Number((row as Record<string, unknown>).cost ?? 0) * 100) / 100,
  }));
}

async function getCrawlRunBreakdown(db: DbClient, window: SqlWindow, tenantId: string): Promise<StatisticsBreakdownRow[]> {
  const rows = await db.prepare(
    `SELECT cr.status as key, COUNT(*) as count
     FROM crawl_runs cr ${whereFromWindow(window, "cr.tenant_id = ?")}
     GROUP BY cr.status
     ORDER BY count DESC`
  ).all(...window.params, tenantId) as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: row.key, label: row.key.replace(/_/g, " "), count: row.count }));
}

async function getVerificationCoverage(db: DbClient, window: SqlWindow, tenantId: string): Promise<{ average: number; checkedLeads: number }> {
  const rows = await db.prepare(
    `SELECT l.verification FROM leads l ${whereFromWindow(window, "l.tenant_id = ?")}`
  ).all(...window.params, tenantId) as Array<{ verification: string | null }>;
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

async function countRows(db: DbClient, from: string, window: SqlWindow, extra?: string, extraParams: string[] = []): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) as count FROM ${from} ${whereFromWindow(window, extra)}`).get(...window.params, ...extraParams) as { count: number };
  return row.count ?? 0;
}

async function countDistinctRows(db: DbClient, from: string, column: string, window: SqlWindow, extra?: string, extraParams: string[] = []): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(DISTINCT ${column}) as count FROM ${from} ${whereFromWindow(window, extra)}`).get(...window.params, ...extraParams) as { count: number };
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
