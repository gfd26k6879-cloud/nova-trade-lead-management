import { getDb, generateId, nowISO, type DbClient } from "./index";
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
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
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
  lead_id: string;
  lead_name: string | null;
  actor_email: string | null;
  channel: string;
  outcome: OutreachOutcome;
  note: string | null;
  created_at: string;
}

export interface TeamBoardSummary {
  members: TeamBoardMember[];
  unassignedReady: number;
  overdueFollowUps: number;
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
  await dbReadyPromise;
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
    "CREATE INDEX IF NOT EXISTS idx_ai_verifications_requester_created ON ai_lead_verifications(requested_by_user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_requester_created ON lead_ai_artifacts(requested_by_user_id, created_at DESC)",
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
    "CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_retry_ready ON lead_ai_artifacts(status, next_retry_at, created_at) WHERE status = 'queued'",
    "CREATE INDEX IF NOT EXISTS idx_leads_ai_queue_ready ON leads(ai_queue_status, ai_next_retry_at, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE ai_queue_status = 'queued'",
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

export async function repairAiWebsiteFindingConsistency(limit = 500): Promise<number> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const rows = await db.prepare(
    `SELECT id
     FROM leads
     WHERE (
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
     )
     ORDER BY updated_at ASC
     LIMIT ?`
  ).all(safeLimit) as Array<{ id: string }>;

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
     WHERE id = ?`
  );

  for (const row of rows) {
    await update.run(timestamp, row.id);
    await updateLeadQualityScores(row.id);
  }

  return rows.length;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const warnings: string[] = [];

  if (!appUrl) {
    warnings.push("NEXT_PUBLIC_APP_URL is missing. Password reset links cannot be generated safely in production.");
  }
  if (!supabaseUrl) {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL is missing. Supabase Auth cannot validate sessions.");
  }

  return {
    appUrlConfigured: Boolean(appUrl),
    supabaseUrlConfigured: Boolean(supabaseUrl),
    callbackUrl: appUrl ? `${appUrl}/auth/callback` : null,
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
  const activeRunUsage = activeRun ? await getRunApiUsageSummary(activeRun.id) : emptyApiUsageSummary();
  const activeRunLastError = activeRun ? await getRunLastError(activeRun.id) : null;
  const [todayUsage, monthUsage, leadBacklog, enrichmentBacklog, artifactBacklog, scoreBacklog] = await Promise.all([
    getApiUsageSummarySince(startOfToday()),
    getMonthlyApiUsageSummary(),
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
  await db.prepare("DELETE FROM user_market_access WHERE user_id = ?").run(userId);
  const insert = db.prepare(
    "INSERT INTO user_market_access (user_id, market_id, created_by_user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, market_id) DO NOTHING"
  );
  const now = nowISO();
  for (const marketId of uniqueMarketIds) {
    await insert.run(userId, marketId, actorUserId ?? null, now);
  }
  return listUserMarketAccess(userId);
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

export async function getMarketCoverageSummary(runId?: string): Promise<MarketCoverageSummary[]> {
  const db = await getDb();
  const runFilter = runId ? "AND cu.crawl_run_id = ?" : "";
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
       COALESCE((SELECT COUNT(*) FROM leads l WHERE l.market_id = m.id), 0) as activeLeads,
       MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
     FROM location_markets m
     LEFT JOIN location_cells c ON c.market_id = m.id
     LEFT JOIN crawl_units cu ON cu.location_cell_id = c.id ${runFilter}
     WHERE m.status <> 'archived'
     GROUP BY m.id, m.name, m.country_code, m.admin_area1
     ORDER BY m.country_code, m.name`
  ).all(...(runId ? [runId] : [])) as Array<Record<string, unknown>>;
  return rows.map(normalizeMarketCoverageSummary);
}

export async function getLocationCellCoverage(runId?: string): Promise<LocationCellCoverage[]> {
  const db = await getDb();
  const runFilter = runId ? "AND cu.crawl_run_id = ?" : "";
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
       COALESCE((SELECT COUNT(*) FROM leads l WHERE l.location_cell_id = c.id), 0) as activeLeads,
       MAX(COALESCE(cu.finished_at, cu.started_at, cu.created_at)) as lastRunAt
     FROM location_cells c
     INNER JOIN location_markets m ON m.id = c.market_id
     LEFT JOIN crawl_units cu ON cu.location_cell_id = c.id ${runFilter}
     WHERE c.is_active = 1
     GROUP BY c.id, c.market_id, m.name, m.country_code, c.country_code, c.cell_type, c.cell_label, c.postal_code, c.locality, c.admin_area1, c.admin_area2
     ORDER BY m.country_code, m.name, c.cell_type, c.cell_label`
  ).all(...(runId ? [runId] : [])) as Array<Record<string, unknown>>;
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
    marketId?: string | null;
    selection?: Record<string, unknown> | null;
    name?: string | null;
    scopeLabel?: string | null;
    createdByUserId?: string | null;
  } = {},
): Promise<CrawlRun>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();

  await db.prepare(
    `INSERT INTO crawl_runs (
       id, mode, status, categories, market_id, selection_json, name, scope_label,
       created_by_user_id, started_at, created_at, updated_at
     )
     VALUES (?, 'coverage', 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
    created_at: normalizeDateText(row.created_at),
    updated_at: normalizeDateText(row.updated_at),
  } as unknown as CrawlRun;
}

export async function getCrawlRun(id: string): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getProcessingCrawlRun(): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs WHERE status IN ('running', 'queued') ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getActiveCrawlRun(): Promise<CrawlRun | null>{
  return getDefaultVisibleCrawlRun();
}

export async function getDefaultVisibleCrawlRun(): Promise<CrawlRun | null>{
  const processing = await getProcessingCrawlRun();
  if (processing) return processing;
  return getLatestCrawlRun();
}

export async function getSelectedOrDefaultVisibleCrawlRun(runId?: string | null): Promise<CrawlRun | null>{
  const cleanRunId = normalizeNullableText(runId);
  if (cleanRunId) return getCrawlRun(cleanRunId);
  return getDefaultVisibleCrawlRun();
}

export async function getLatestPausedCrawlRun(): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs WHERE status = 'paused' ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function getLatestCrawlRun(): Promise<CrawlRun | null>{
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM crawl_runs ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseCrawlRunRow(row);
}

export async function listDiscoveryItems(limit = 12): Promise<DiscoveryItemSummary[]> {
  const db = await getDb();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const rows = await db.prepare(
    `WITH latest_runs AS (
       SELECT *
       FROM crawl_runs
       ORDER BY created_at DESC
       LIMIT ?
     ),
     unit_counts AS (
       SELECT
         crawl_run_id,
         COUNT(*) as total_units,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_units,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_units,
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
       cr.created_at,
       cr.started_at,
       cr.ended_at,
       lm.name as market_name,
       lm.country_code,
       COALESCE(uc.total_units, 0) as total_units,
       COALESCE(uc.done_units, 0) as done_units,
       COALESCE(uc.failed_units, 0) as failed_units,
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
  ).all(boundedLimit) as Array<Record<string, unknown>>;

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
      createdAt,
      startedAt: normalizeNullableDateText(row.started_at),
      endedAt: normalizeNullableDateText(row.ended_at),
      totalUnits: Number(row.total_units) || 0,
      doneUnits: Number(row.done_units) || 0,
      failedUnits: Number(row.failed_units) || 0,
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
  const updates: Record<string, unknown> = { status };
  if (status === "done" || status === "error" || status === "canceled") updates.ended_at = nowISO();
  await db.prepare("UPDATE crawl_runs SET status = ?, ended_at = COALESCE(?, ended_at), updated_at = ? WHERE id = ?")
    .run(status, updates.ended_at ?? null, nowISO(), id);
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

  await db.prepare(
    `UPDATE crawl_units SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ? AND status = 'running'
     AND started_at < datetime('now', '-5 minutes')`
  ).run(runId);

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
  await db.prepare(
    `UPDATE crawl_units SET status = 'pending', started_at = NULL
     WHERE crawl_run_id = ? AND status = 'running'
       AND started_at < datetime('now', '-5 minutes')`
  ).run(runId);

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
  ).get<{ id: string }>(nowISO(), runId);

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
    "UPDATE crawl_units SET status = 'done', finished_at = ?, discovered_count = ? WHERE id = ? AND status <> 'canceled'"
  ).run(nowISO(), discoveredCount, unitId);
}

export async function markUnitFailed(unitId: string, error: string): Promise<void>{
  const db = await getDb();
  await db.prepare(
    "UPDATE crawl_units SET status = 'failed', finished_at = ?, last_error = ? WHERE id = ? AND status <> 'canceled'"
  ).run(nowISO(), error, unitId);
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
    "UPDATE crawl_units SET status = 'pending', started_at = NULL, last_error = NULL WHERE crawl_run_id = ? AND status = 'failed'"
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

  const counts = { total: 0, done: 0, failed: 0, running: 0, pending: 0, canceled: 0 };
  for (const row of rows) {
    const count = Number(row.count) || 0;
    counts.total += count;
    if (row.status === "done") counts.done = count;
    else if (row.status === "failed") counts.failed = count;
    else if (row.status === "running") counts.running = count;
    else if (row.status === "canceled") counts.canceled = count;
    else if (row.status === "pending" || row.status === "retry_wait") counts.pending += count;
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
    const leadIsExcluded = Boolean(Number(row.lead_is_excluded) || row.lead_is_excluded === true);
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
     ORDER BY c.country_code, c.postal_code_normalized, c.cell_label`
  ).all() as Array<{
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
      data.market_id ?? null,
      data.location_cell_id ?? null,
      data.country_code ? normalizeCountryCode(data.country_code) : null,
      data.admin_area1 ?? null,
      data.admin_area2 ?? null,
      data.locality ?? null,
      data.postal_code ?? null,
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
      market_id, location_cell_id, country_code, admin_area1, admin_area2, locality, postal_code,
      score, selling_niche, business_type, qualification_status, disqualification_reason, website_verified_at,
      contactability_score, estimated_deal_value, is_excluded, exclusion_reason, excluded_at,
      discovered_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.place_id, data.name ?? null, data.address ?? null, data.phone ?? null,
    JSON.stringify(categories), data.rating ?? null, data.review_count ?? null,
    data.website_uri ?? null, websiteStatus,
    data.maps_uri ?? null, data.business_status ?? null,
    data.price_level ?? null, data.photo_count ?? 0,
    data.has_opening_hours ? 1 : 0, data.primary_type ?? null,
    data.lat ?? null, data.lng ?? null,
    data.market_id ?? null,
    data.location_cell_id ?? null,
    data.country_code ? normalizeCountryCode(data.country_code) : null,
    data.admin_area1 ?? null,
    data.admin_area2 ?? null,
    data.locality ?? null,
    data.postal_code ?? null,
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

export interface ManualLeadInput {
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
  const id = await upsertLead({
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
     WHERE id = ?`
  ).run(notes, nowISO(), id);
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
  if (filters.minReviews != null && filters.minReviews > 0) {
    conditions.push("l.review_count >= ?");
    params.push(filters.minReviews);
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
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { orderBySql } = resolveLeadSort(filters);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };

  const leads = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
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
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { orderBySql } = resolveLeadSort(filters);
  const mapOrderBySql = options.fastOrder ? fastLeadMapOrderBySql(filters) : orderBySql;
  const coordinateCondition = "l.lat IS NOT NULL AND l.lng IS NOT NULL";
  const mapWhere = where ? `${where} AND ${coordinateCondition}` : `WHERE ${coordinateCondition}`;
  const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));

  const countRow = options.includeTotal === false
    ? null
    : await db.prepare(`SELECT COUNT(*) as count FROM leads l ${mapWhere}`).get(...params) as { count: number };
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
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
     ${mapWhere}
     ORDER BY ${mapOrderBySql}
     LIMIT ?`
  ).all(...params, safeLimit) as Array<Record<string, unknown>>;

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
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
  const { orderBySql } = resolveLeadSort(filters);
  const safeLimit = Math.min(100000, Math.max(1, Math.floor(limit)));

  const rows = await db.prepare(
    `SELECT l.*, au.email as assigned_user_email, au.display_name as assigned_user_display_name
     FROM leads l
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
     ${where}
     ORDER BY ${orderBySql}
     LIMIT ?`
  ).all(...params, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(parseLeadRow);
}

export async function getBusinessTypeCounts(filters: LeadFilters = {}): Promise<BusinessTypeCount[]>{
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere({ ...filters, businessType: undefined, page: undefined, pageSize: undefined });
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
  const db = await getDb();
  const { where, params } = buildLeadFilterWhere(filters);
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
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
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

export async function updateLeadFacts(id: string, input: LeadFactsInput): Promise<Lead | null> {
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
  leadValues.push(id);

  await db.prepare(`UPDATE leads SET ${leadUpdates.join(", ")} WHERE id = ?`).run(...leadValues);

  if (current.place_id && placeUpdates.length > 0) {
    placeUpdates.push("updated_at = ?");
    placeValues.push(now, current.place_id);
    await db
      .prepare(`UPDATE places_master SET ${placeUpdates.join(", ")} WHERE place_id = ?`)
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

export async function claimLeadForUser(leadId: string, userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.prepare(
    `UPDATE leads
     SET assigned_to_user_id = ?, updated_at = ?
     WHERE id = ?
       AND (${leadUnassignedCondition("assigned_to_user_id")} OR assigned_to_user_id = ?)`
  ).run(userId, nowISO(), leadId, userId);
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
      usage_input_tokens, usage_output_tokens, estimated_cost, error,
      requested_by_user_id, request_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
  const db = await getDb();
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
     WHERE id = ?`
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
      input_tokens, output_tokens, total_tokens, estimated_cost, metadata,
      actor_user_id, request_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
  const db = await getDb();
  const sources = requestSources.map((source) => source.trim()).filter(Boolean);
  if (!actorUserId || sources.length === 0) return { calls: 0, cost: 0 };
  const placeholders = sources.map(() => "?").join(",");
  const row = await db.prepare(
    `SELECT COALESCE(COUNT(*), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost
     FROM ai_usage_events
     WHERE actor_user_id = ?
       AND request_source IN (${placeholders})
       AND created_at >= ?
       AND COALESCE(success, 1) = 1`
  ).get(actorUserId, ...sources, sinceIso) as { calls: number; cost: number } | undefined;
  return {
    calls: Number(row?.calls ?? 0),
    cost: Number(row?.cost ?? 0),
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
         usage_input_tokens = ?,
         usage_output_tokens = ?,
         estimated_cost = ?,
         error = NULL,
         last_error = NULL,
         next_retry_at = NULL,
         updated_at = ?
     WHERE id = ?`
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
): Promise<{ status: "queued" | "error"; nextRetryAt: string | null; attemptCount: number; maxAttempts: number }> {
  const db = await getDb();
  const row = await db.prepare(
    "SELECT attempt_count, max_attempts FROM lead_ai_artifacts WHERE id = ?"
  ).get<{ attempt_count: number; max_attempts: number }>(id);
  const currentAttempts = Math.max(0, Number(row?.attempt_count ?? 0));
  const safeMaxAttempts = Math.max(1, Math.floor(Number(row?.max_attempts ?? maxAttempts) || maxAttempts));
  const retryable = currentAttempts < safeMaxAttempts;
  const retryDelayMinutes = Math.min(120, Math.max(5, 5 * 2 ** Math.max(currentAttempts - 1, 0)));
  const nextRetry = retryable
    ? new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString()
    : null;
  const status: "queued" | "error" = retryable ? "queued" : "error";

  await db.prepare(
    `UPDATE lead_ai_artifacts
     SET status = ?,
         error = CASE WHEN ? = 'error' THEN ? ELSE NULL END,
         last_error = ?,
         next_retry_at = ?,
         max_attempts = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(status, status, message.slice(0, 1000), message.slice(0, 1000), nextRetry, safeMaxAttempts, nowISO(), id);

  return { status, nextRetryAt: nextRetry, attemptCount: currentAttempts, maxAttempts: safeMaxAttempts };
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
       AND ai_queue_status = 'queued'`
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
  const latest = await getLatestAiVerification(leadId);
  if (latest && latest.error == null && latest.input_hash === inputHash) {
    await updateLeadAiVerificationSummary(leadId, latest, 0);
    return result.changes;
  }
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
       AND archived_at IS NULL
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

export async function leaseNextAiVerificationJob(maxAttempts = 3): Promise<Lead | null> {
  const db = await getDb();
  await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'queued',
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE ai_queue_status = 'running'
       AND updated_at < datetime('now', '-5 minutes')`
  ).run(nowISO());

  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  const now = nowISO();
  const row = await db.prepare(
    `UPDATE leads SET
      ai_queue_status = 'running',
      ai_attempt_count = ai_attempt_count + 1,
      ai_last_error = NULL,
      ai_next_retry_at = NULL,
      updated_at = ?
     WHERE id = (
       SELECT id
       FROM leads
       WHERE ai_queue_status = 'queued'
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
  ).get(now, now, safeMaxAttempts) as Record<string, unknown> | undefined;

  return row ? parseLeadRow(row) : null;
}

export async function getAiVerificationBackfillCandidates(limit = 10000): Promise<Lead[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT *
     FROM leads
     WHERE ai_queue_status NOT IN ('queued','running')
       AND COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL
       AND status NOT IN ('closed_won','closed_lost')
       AND COALESCE(business_status, '') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
     ORDER BY sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at ASC
     LIMIT ?`
  ).all(Math.max(1, Math.floor(limit))) as Array<Record<string, unknown>>;
  return rows.map(parseLeadRow);
}

export async function getAiQueueStats(): Promise<AiQueueStats> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT COALESCE(ai_queue_status, 'not_checked') as status, COUNT(*) as count
     FROM leads
     WHERE archived_at IS NULL
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
    "l.archived_at IS NULL",
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

export async function applyManualWebsiteCorrection(
  leadId: string,
  input: ManualWebsiteCorrectionInput,
): Promise<Lead | null> {
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

  if (input.resolution === "official_website_found") {
    await db.prepare(
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
       WHERE id = ?`
    ).run(...baseValues, now, now, leadId);
  } else if (input.resolution === "weak_or_basic_site") {
    await db.prepare(
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
       WHERE id = ?`
    ).run(websiteUrl, now, websiteUrl, correctionReason, notes, now, now, leadId);
  } else if (input.resolution === "social_or_directory_only") {
    await db.prepare(
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
       WHERE id = ?`
    ).run(...baseValues, now, leadId);
  } else {
    await db.prepare(
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
       WHERE id = ?`
    ).run(correctionReason, notes, now, now, leadId);
  }

  if (current.place_id) {
    await db
      .prepare("UPDATE places_master SET website_uri = ?, updated_at = ? WHERE place_id = ?")
      .run(websiteUrl, now, current.place_id);
  }

  await updateLeadQualityScores(leadId, input.actorUserId ?? null);
  return getLeadById(leadId);
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
  const rows = await db.prepare(
    `SELECT id
     FROM leads
     WHERE archived_at IS NULL
       AND (last_quality_scored_at IS NULL
        OR julianday(updated_at) > julianday(last_quality_scored_at))
     ORDER BY updated_at DESC
     LIMIT ?`
  ).all(safeLimit) as Array<{ id: string }>;
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

export async function updateLeadAiFeedback(
  leadId: string,
  input: LeadAiFeedbackInput,
  actorUserId?: string | null,
): Promise<number> {
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
     WHERE id = ?`
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
    leadId,
  );
  await updateLeadQualityScores(leadId, actorUserId);
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
  const removedWebsiteWhere = buildQualityRemovedWebsiteWhere(filters);
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
  const db = await getDb();
  const { where, params } = buildQualityWhere(filters);
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
         WHERE a.lead_id = l.id AND a.artifact_type = 'business_detail'
         ORDER BY a.created_at DESC
         LIMIT 1
       ) as business_detail_status,
       (
         SELECT a.status
         FROM lead_ai_artifacts a
         WHERE a.lead_id = l.id AND a.artifact_type = 'competitive_report'
         ORDER BY a.created_at DESC
         LIMIT 1
       ) as competitive_report_status
     FROM leads l
     LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
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
  const params: unknown[] = [];
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

export async function getQualityActionCandidateIds(filters: QualityFilters & { limit: number; ids?: string[] }): Promise<string[]>{
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(filters.limit)));
  const { where, params } = buildQualityWhere(filters);
  const idConditions: string[] = [];
  const idParams: unknown[] = [];
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

export async function queueLeadsForEnrichment(ids: string[]): Promise<number>{
  const db = await getDb();
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean).slice(0, 100);
  if (uniqueIds.length === 0) return 0;
  const placeholders = uniqueIds.map(() => "?").join(",");
  const result = await db.prepare(
    `UPDATE leads
     SET enrichment_status = 'pending',
         enriched_at = NULL,
         updated_at = ?
     WHERE id IN (${placeholders})
       AND COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL`
  ).run(nowISO(), ...uniqueIds);
  return Number(result.changes ?? 0);
}

function parseLeadRow(row: Record<string, unknown>): Lead {
  return {
    ...row,
    categories: safeParseJson<string[]>(row.categories, []),
    has_opening_hours: (row.has_opening_hours as number) === 1,
    photo_count: (row.photo_count as number) ?? 0,
    is_excluded: ((row.is_excluded as number) ?? 0) === 1,
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

// ─── Budget Queries ───

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

export async function getRunApiUsageSummary(runId: string): Promise<ApiUsageSummary>{
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT endpoint,
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
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
            COALESCE(SUM(billable_units), 0) as calls,
            COALESCE(SUM(estimated_cost), 0) as cost,
            COALESCE(SUM(CASE WHEN sku = 'places_place_details_enterprise_plus_atmosphere' THEN billable_units ELSE 0 END), 0) as atmosphere_calls,
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

export async function getMonthlyBillableEventsForSku(sku: GooglePlacesSku): Promise<number> {
  const db = await getDb();
  const monthStart = startOfCurrentMonth();
  const row = await db.prepare(
    `SELECT COALESCE(SUM(billable_units), 0) as total
     FROM api_usage_events
     WHERE sku = ?
       AND COALESCE(was_cached, 0) = 0
       AND created_at >= ?`
  ).get(sku, monthStart) as { total: number };
  return Number(row.total) || 0;
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

export async function placeMasterExists(placeId: string): Promise<boolean>{
  const db = await getDb();
  const row = await db.prepare("SELECT 1 as exists_flag FROM places_master WHERE place_id = ? LIMIT 1").get(placeId) as { exists_flag: number } | undefined;
  return !!row;
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
  const businessDetail = await getLatestLeadAiArtifact(leadId, "business_detail");
  const detail = businessDetail?.status === "complete" ? businessDetail.content_json : {};
  const detailServices = Array.isArray(detail.services) ? detail.services.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
  const trustSignals = Array.isArray(detail.trust_signals) ? detail.trust_signals.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
  const businessSummary = typeof detail.business_summary === "string" ? detail.business_summary : null;
  const ctaStrategy = typeof detail.cta_strategy === "string" ? detail.cta_strategy : null;
  const config = {
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

export async function createOutreachEvent(input: OutreachEventInput): Promise<OutreachEvent>{
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  const outcome = input.outcome ?? "contacted";
  const decisionMakerReached = Boolean(input.decisionMakerReached || outcome === "decision_maker_reached" || outcome === "meeting_set" || outcome === "quoted" || outcome === "closed_won");
  const quotedAmount = Math.max(0, Number(input.quotedAmount ?? 0) || 0);
  const closeValue = Math.max(0, Number(input.closeValue ?? 0) || 0);

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
      COALESCE(creator.team_lead_user_id, CASE WHEN creator.is_team_lead = 1 THEN creator.user_id ELSE NULL END) as creator_team_lead_user_id,
      team_lead.email as creator_team_lead_email,
      team_lead.display_name as creator_team_lead_display_name,
      creator.team_label as creator_team_label
    FROM admin_requests ar
    LEFT JOIN leads l ON l.id = ar.lead_id
    LEFT JOIN app_users owner ON owner.user_id = l.assigned_to_user_id
    LEFT JOIN app_users creator ON creator.user_id = ar.created_by_user_id
    LEFT JOIN app_users team_lead ON team_lead.user_id = COALESCE(creator.team_lead_user_id, CASE WHEN creator.is_team_lead = 1 THEN creator.user_id ELSE NULL END)`;
}

export async function getOpenAdminRequestForLead(leadId: string, requestType: AdminRequestType): Promise<AdminRequest | null> {
  const db = await getDb();
  const row = await db.prepare(
    `${adminRequestSelectSql()}
     WHERE ar.lead_id = ? AND ar.request_type = ? AND ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
     ORDER BY ar.created_at DESC
     LIMIT 1`
  ).get<Record<string, unknown>>(leadId, requestType);
  return row ? parseAdminRequestRow(row) : null;
}

export async function createAdminRequest(input: AdminRequestInput): Promise<{ request: AdminRequest; alreadyExists: boolean }> {
  const existing = await getOpenAdminRequestForLead(input.leadId, input.requestType);
  if (existing) return { request: existing, alreadyExists: true };

  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO admin_requests (
      id, lead_id, created_by_user_id, created_by_email, assigned_admin_user_id,
      request_type, status, priority, summary, contact_person_name, budget_hint,
      due_at, next_step, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
  const db = await getDb();
  const row = await db.prepare(
    `${adminRequestSelectSql()} WHERE ar.id = ? LIMIT 1`
  ).get<Record<string, unknown>>(id);
  return row ? parseAdminRequestRow(row) : null;
}

export async function updateAdminRequestStatus(id: string, status: AdminRequestStatus): Promise<AdminRequest | null> {
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
     WHERE id = ?`
  ).run(status, status, now, status, now, now, id);
  return getAdminRequestById(id);
}

export async function getAdminRequests(filters: {
  leadId?: string;
  status?: AdminRequestStatus | "open" | "all";
  requestType?: AdminRequestType;
  limit?: number;
} = {}): Promise<AdminRequest[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
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
     FROM admin_requests`
  ).get<Record<string, unknown>>(now);
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

// ─── Now Queue ───

export async function getNowQueue(
  limit = 25,
  options: { assignedToUserId?: string; unassignedOnly?: boolean; visibleToUserId?: string } = {},
): Promise<QueueLead[]>{
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const candidateLimit = Math.max(limit * 20, 200);
  const assignmentConditions: string[] = [];
  const assignmentParams: unknown[] = [];
  if (options.assignedToUserId) {
    assignmentConditions.push("assigned_to_user_id = ?");
    assignmentParams.push(options.assignedToUserId);
  }
  if (options.unassignedOnly) {
    assignmentConditions.push(leadUnassignedCondition("assigned_to_user_id"));
  }
  if (options.visibleToUserId) {
    assignmentConditions.push("market_id IN (SELECT market_id FROM user_market_access WHERE user_id = ?)");
    assignmentParams.push(options.visibleToUserId);
  }
  const assignmentWhere = assignmentConditions.length > 0 ? `AND ${assignmentConditions.join(" AND ")}` : "";

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
        AND archived_at IS NULL
        ${assignmentWhere}
      ORDER BY ${leadWebsiteNeedRankExpression("leads")} DESC, sales_priority_score DESC, lead_quality_score DESC, score DESC
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
          WHERE a.lead_id = l.id AND a.artifact_type = 'business_detail'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) as business_detail_status,
        (
          SELECT a.status
          FROM lead_ai_artifacts a
          WHERE a.lead_id = l.id AND a.artifact_type = 'competitive_report'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) as competitive_report_status,
        (
          SELECT d.slug
          FROM demos d
          WHERE d.lead_id = l.id AND d.is_published = 1
          ORDER BY d.created_at DESC
          LIMIT 1
        ) as demo_slug,
        (
          SELECT ar.id
          FROM admin_requests ar
          WHERE ar.lead_id = l.id
            AND ar.request_type = 'website_request'
            AND ar.status IN ('new','seen','in_progress','waiting_on_researcher')
          ORDER BY ar.created_at DESC
          LIMIT 1
        ) as open_website_request_id,
        (
          SELECT ar.id
          FROM admin_requests ar
          WHERE ar.lead_id = l.id
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
      LEFT JOIN app_users au ON au.user_id = l.assigned_to_user_id
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
  `).all(...assignmentParams, candidateLimit, today, limit) as Array<Record<string, unknown>>;

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
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const visibleToUserId = options.viewerRole === "admin" ? undefined : userId;
  const [myLeads, unclaimedLeads] = await Promise.all([
    getNowQueue(25, { assignedToUserId: userId, visibleToUserId }),
    getNowQueue(25, { unassignedOnly: true, visibleToUserId }),
  ]);
  const marketCondition = visibleToUserId
    ? "AND l.market_id IN (SELECT market_id FROM user_market_access WHERE user_id = ?)"
    : "";
  const marketParams = visibleToUserId ? [visibleToUserId] : [];

  const summaryRow = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN l.assigned_to_user_id = ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as my_claimed,
       COALESCE(SUM(CASE WHEN l.assigned_to_user_id = ? AND l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN ${leadUnassignedCondition("l.assigned_to_user_id")} AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity') AND l.status IN ('new','verified','contacted') THEN 1 ELSE 0 END), 0) as best_unclaimed
     FROM leads l
     WHERE COALESCE(l.is_excluded, 0) = 0
       AND l.archived_at IS NULL
       ${marketCondition}`
  ).get(userId, userId, today, ...marketParams) as Record<string, unknown>;
  const contactRow = await db.prepare(
    "SELECT COUNT(*) as count FROM outreach_events WHERE actor_user_id = ? AND created_at >= ?"
  ).get(userId, weekAgo) as { count: number } | undefined;

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
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = weekAgo;

  const members = await db.prepare(
    `SELECT
       au.user_id,
       au.email,
       au.display_name,
       au.role,
       au.is_team_lead,
       au.team_lead_user_id,
       au.team_label,
       tl.email as team_lead_email,
       tl.display_name as team_lead_display_name,
       COALESCE(COUNT(CASE WHEN l.status NOT IN ('closed_won','closed_lost') THEN l.id END), 0) as claimed_active,
       COALESCE(SUM(CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN l.updated_at < ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as stale_claimed,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_7d,
       COALESCE(SUM(CASE WHEN l.status = 'meeting_set' THEN 1 ELSE 0 END), 0) as meetings,
       COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN 1 ELSE 0 END), 0) as closed_won,
       COALESCE(SUM(CASE WHEN l.status = 'closed_lost' THEN 1 ELSE 0 END), 0) as closed_lost,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         LEFT JOIN app_users creator ON creator.user_id = ar.created_by_user_id
         WHERE ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'website_request'
           AND (ar.created_by_user_id = au.user_id OR (au.is_team_lead = 1 AND creator.team_lead_user_id = au.user_id))
       ), 0) as website_requests_open,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         LEFT JOIN app_users creator ON creator.user_id = ar.created_by_user_id
         WHERE ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'quote_request'
           AND (ar.created_by_user_id = au.user_id OR (au.is_team_lead = 1 AND creator.team_lead_user_id = au.user_id))
       ), 0) as quote_requests_open
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     LEFT JOIN leads l ON l.assigned_to_user_id = au.user_id AND COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL
     WHERE au.status = 'active'
     GROUP BY au.user_id, au.email, au.display_name, au.role, au.is_team_lead, au.team_lead_user_id, au.team_label, tl.email, tl.display_name
     ORDER BY au.role ASC, au.is_team_lead DESC, au.email ASC`
  ).all<Record<string, unknown>>(today, staleBefore, weekAgo);

  const unassignedRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
     WHERE COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL
       AND ${leadUnassignedCondition("assigned_to_user_id")}
       AND quality_bucket IN ('ready_to_call','broken_site_opportunity')
       AND status IN ('new','verified','contacted')`
  ).get() as { count: number } | undefined;
  const overdueRow = await db.prepare(
    `SELECT COUNT(*) as count
     FROM leads
     WHERE COALESCE(is_excluded, 0) = 0
       AND archived_at IS NULL
       AND reminder_date IS NOT NULL
       AND reminder_date <= ?
       AND status NOT IN ('closed_won','closed_lost')`
  ).get(today) as { count: number } | undefined;
  const activityRows = await db.prepare(
    `SELECT oe.id, oe.lead_id, l.name as lead_name, COALESCE(oe.actor_email, au.email) as actor_email,
       oe.channel, oe.outcome, oe.note, oe.created_at
     FROM outreach_events oe
     LEFT JOIN leads l ON l.id = oe.lead_id
     LEFT JOIN app_users au ON au.user_id = oe.actor_user_id
     ORDER BY oe.created_at DESC
     LIMIT 25`
  ).all<Record<string, unknown>>();

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
    latestActivity: activityRows.map((row) => ({
      id: String(row.id),
      lead_id: String(row.lead_id),
      lead_name: (row.lead_name as string | null) ?? null,
      actor_email: (row.actor_email as string | null) ?? null,
      channel: String(row.channel),
      outcome: normalizeOutreachOutcome(row.outcome),
      note: (row.note as string | null) ?? null,
      created_at: String(row.created_at),
    })),
  };
}

export async function getResearcherTeamBoardSummary(userId: string): Promise<TeamBoardSummary> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = weekAgo;

  const memberRow = await db.prepare(
    `SELECT
       au.user_id,
       au.email,
       au.display_name,
       au.role,
       au.is_team_lead,
       au.team_lead_user_id,
       au.team_label,
       tl.email as team_lead_email,
       tl.display_name as team_lead_display_name,
       COALESCE(COUNT(CASE WHEN l.status NOT IN ('closed_won','closed_lost') THEN l.id END), 0) as claimed_active,
       COALESCE(SUM(CASE WHEN l.reminder_date IS NOT NULL AND l.reminder_date <= ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as due_today,
       COALESCE(SUM(CASE WHEN l.updated_at < ? AND l.status NOT IN ('closed_won','closed_lost') THEN 1 ELSE 0 END), 0) as stale_claimed,
       COALESCE((
         SELECT COUNT(*)
         FROM outreach_events oe
         WHERE oe.actor_user_id = au.user_id AND oe.created_at >= ?
       ), 0) as contacts_7d,
       COALESCE(SUM(CASE WHEN l.status = 'meeting_set' THEN 1 ELSE 0 END), 0) as meetings,
       COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN 1 ELSE 0 END), 0) as closed_won,
       COALESCE(SUM(CASE WHEN l.status = 'closed_lost' THEN 1 ELSE 0 END), 0) as closed_lost,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'website_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as website_requests_open,
       COALESCE((
         SELECT COUNT(*)
         FROM admin_requests ar
         WHERE ar.status IN (${OPEN_ADMIN_REQUEST_STATUS_SQL})
           AND ar.request_type = 'quote_request'
           AND ar.created_by_user_id = au.user_id
       ), 0) as quote_requests_open
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     LEFT JOIN leads l ON l.assigned_to_user_id = au.user_id AND COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL
     WHERE au.status = 'active' AND au.user_id = ?
     GROUP BY au.user_id, au.email, au.display_name, au.role, au.is_team_lead, au.team_lead_user_id, au.team_label, tl.email, tl.display_name`
  ).get<Record<string, unknown>>(today, staleBefore, weekAgo, userId);

  const activityRows = await db.prepare(
    `SELECT oe.id, oe.lead_id, l.name as lead_name, COALESCE(oe.actor_email, au.email) as actor_email,
       oe.channel, oe.outcome, oe.note, oe.created_at
     FROM outreach_events oe
     LEFT JOIN leads l ON l.id = oe.lead_id
     LEFT JOIN app_users au ON au.user_id = oe.actor_user_id
     WHERE oe.actor_user_id = ?
     ORDER BY oe.created_at DESC
     LIMIT 25`
  ).all<Record<string, unknown>>(userId);

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
    latestActivity: activityRows.map((row) => ({
      id: String(row.id),
      lead_id: String(row.lead_id),
      lead_name: (row.lead_name as string | null) ?? null,
      actor_email: (row.actor_email as string | null) ?? null,
      channel: String(row.channel),
      outcome: normalizeOutreachOutcome(row.outcome),
      note: (row.note as string | null) ?? null,
      created_at: String(row.created_at),
    })),
  };
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

  const totalDiscovered = await countRows(db, "leads l", leadWindow, "l.archived_at IS NULL");
  const activeLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL");
  const qualifiedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.qualification_status = 'qualified'");
  const queueCandidates = await countRows(
    db,
    "leads l",
    leadWindow,
    `COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.website_status IN ('none','social','basic') AND ${noUsableAiWebsiteCondition("l")} AND l.qualification_status IN ('qualified','needs_verification') AND l.status IN ('new','verified','contacted') AND l.score > 0`,
  );
  const excludedLeads = await countRows(db, "leads l", leadWindow, "COALESCE(l.is_excluded, 0) = 1 AND l.archived_at IS NULL");
  const demosCreated = await countRows(db, "demos d", demoWindow);
  const contactedLeads = await countDistinctRows(db, "outreach_events oe", "oe.lead_id", outreachWindow);
  const replies = await countRows(db, "leads l", replyWindow, "l.first_reply_at IS NOT NULL AND l.archived_at IS NULL");
  const meetings = await countRows(db, "leads l", meetingWindow, "l.meeting_booked_at IS NOT NULL AND l.archived_at IS NULL");
  const closedWon = await countRows(db, "leads l", statusWindow, "l.status = 'closed_won' AND l.archived_at IS NULL");
  const closedLost = await countRows(db, "leads l", statusWindow, "l.status = 'closed_lost' AND l.archived_at IS NULL");

  const economicsRow = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.qualification_status IN ('qualified','needs_verification') THEN l.estimated_deal_value ELSE 0 END), 0) as pipeline_value,
            COALESCE(AVG(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.estimated_deal_value > 0 THEN l.estimated_deal_value END), 0) as average_deal_value
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL")}`
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
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL")}`
  ).get(...leadWindow.params) as Record<string, number>;
  const qualityPipelineRows = await getQualityValueRows(
    db,
    `SELECT COALESCE(l.quality_bucket, 'needs_ai_verify') as key,
            COUNT(*) as count,
            COALESCE(SUM(CASE WHEN COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL THEN l.estimated_deal_value ELSE 0 END), 0) as value
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL")}
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
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.quality_bucket = 'ready_to_call'")}
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
     FROM leads l ${whereFromWindow(leadWindow, "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.quality_bucket IN ('ready_to_call','broken_site_opportunity')")}
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
    "COALESCE(l.is_excluded, 0) = 0 AND l.archived_at IS NULL AND l.enrichment_status = 'pending' AND l.score > 0",
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
     FROM leads l ${whereFromWindow(leadWindow, "l.archived_at IS NULL")}
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
