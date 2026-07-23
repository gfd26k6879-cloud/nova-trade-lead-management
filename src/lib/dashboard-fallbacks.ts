import type { DiscoveryMode, PaginationPolicy } from "@/lib/discovery-sizing";
import {
  buildSchedulerHealthFallback,
  type AdminFulfillmentSummary,
  type DiscoveryItemSummary,
  type LaunchReadinessSummary,
  type StatisticsSummary,
  type TeamBoardSummary,
} from "@/lib/db/queries";

export type DashboardLoadError = "db_statement_timeout" | "transient_db_error" | "dashboard_stats_unavailable";
export type DashboardSummaryLoadError = "db_statement_timeout" | "transient_db_error" | "summary_panels_unavailable" | "discovery_items_unavailable";

export interface DashboardStatsResult {
  runStatus: string;
  runId: string | null;
  processingRunStatus: string;
  processingRunId: string | null;
  discoveryItems: DiscoveryItemSummary[];
  leadsTotal: number;
  leadsToday: number;
  failedUnits: number;
  progress: { total: number; done: number; failed: number; pending: number; running: number; canceled: number } | null;
  todayFocus: number;
  needsFollowUp: number;
  conversionMetrics: {
    totalContacted: number;
    totalReplies: number;
    totalMeetings: number;
    replyRate: number;
    meetingRate: number;
    medianHoursToContact: number | null;
  };
  apiCallsUsed: number;
  estimatedCost: number;
  discoveryApiCalls: number;
  discoveryEstimatedCost: number;
  enrichmentApiCalls: number;
  enrichmentEstimatedCost: number;
  atmosphereEnrichmentCalls: number;
  atmosphereEstimatedCost: number;
  monthlyApiCalls: number;
  monthlyApiCost: number;
  projectedMonthlyCost: number;
  lastError: string | null;
  qualifiedLeadCount: number;
  costPerQualifiedLead: number | null;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
  activeZipCount: number;
  countiesSelected: number;
  countiesCompleted: number;
  aiQueueStats: {
    notChecked: number;
    queued: number;
    running: number;
    verified: number;
    error: number;
    total: number;
  };
  schedulerHealth: ReturnType<typeof buildSchedulerHealthFallback>;
  launchReadiness: LaunchReadinessSummary;
  googleDiscoveryDefaults: {
    discoveryMode: DiscoveryMode;
    paginationPolicy: PaginationPolicy;
  };
}

export interface DashboardSummaryPanelsResult {
  teamSummary: TeamBoardSummary;
  weeklyStats: StatisticsSummary;
  fulfillmentSummary: AdminFulfillmentSummary;
  loadError?: DashboardSummaryLoadError;
}

export function emptyDashboardStats(reason = "Dashboard stats are temporarily unavailable."): DashboardStatsResult {
  return {
    runStatus: "idle",
    runId: null,
    processingRunStatus: "idle",
    processingRunId: null,
    discoveryItems: [],
    leadsTotal: 0,
    leadsToday: 0,
    failedUnits: 0,
    progress: null,
    todayFocus: 0,
    needsFollowUp: 0,
    conversionMetrics: {
      totalContacted: 0,
      totalReplies: 0,
      totalMeetings: 0,
      replyRate: 0,
      meetingRate: 0,
      medianHoursToContact: null,
    },
    apiCallsUsed: 0,
    estimatedCost: 0,
    discoveryApiCalls: 0,
    discoveryEstimatedCost: 0,
    enrichmentApiCalls: 0,
    enrichmentEstimatedCost: 0,
    atmosphereEnrichmentCalls: 0,
    atmosphereEstimatedCost: 0,
    monthlyApiCalls: 0,
    monthlyApiCost: 0,
    projectedMonthlyCost: 0,
    lastError: reason,
    qualifiedLeadCount: 0,
    costPerQualifiedLead: null,
    zipCodesSelected: 0,
    zipCodesCompleted: 0,
    zipCodesStarted: 0,
    zipCodesNotStarted: 0,
    zipCodesCanceled: 0,
    zipCodesNotSelected: 0,
    activeZipCount: 0,
    countiesSelected: 0,
    countiesCompleted: 0,
    aiQueueStats: {
      notChecked: 0,
      queued: 0,
      running: 0,
      verified: 0,
      error: 0,
      total: 0,
    },
    schedulerHealth: buildSchedulerHealthFallback(reason),
    launchReadiness: emptyLaunchReadinessSummary(),
    googleDiscoveryDefaults: {
      discoveryMode: "coverage_probe",
      paginationPolicy: "auto_yield_based",
    },
  };
}

function emptyLaunchReadinessSummary(): LaunchReadinessSummary {
  return {
    readyCount: 0,
    totalCount: 0,
    blockers: 0,
    items: [],
  };
}

export function emptyTeamBoardSummary(): TeamBoardSummary {
  return {
    members: [],
    unassignedReady: 0,
    overdueFollowUps: 0,
    todayActivity: [],
    latestActivity: [],
  };
}

export function emptyAdminFulfillmentSummary(): AdminFulfillmentSummary {
  return {
    openTotal: 0,
    openWebsiteRequests: 0,
    openQuoteRequests: 0,
    waitingOnResearcher: 0,
    overdueRequests: 0,
    newRequests: 0,
    latestRequests: [],
  };
}

export function emptyStatisticsSummary(): StatisticsSummary {
  return {
    range: {
      range: "7d",
      label: "Last 7 days",
      from: null,
      to: null,
    },
    kpis: {
      totalDiscovered: 0,
      activeLeads: 0,
      qualifiedLeads: 0,
      queueCandidates: 0,
      excludedLeads: 0,
      demosCreated: 0,
      contactedLeads: 0,
      replies: 0,
      meetings: 0,
      closedWon: 0,
      closedLost: 0,
    },
    economics: {
      pipelineValue: 0,
      averageDealValue: 0,
      apiCost: 0,
      apiCalls: 0,
      costPerQualifiedLead: null,
      costPerContactedLead: null,
      costPerMeeting: null,
    },
    valueProof: {
      qualifiedNoSiteLeads: 0,
      contactableLeads: 0,
      costPerQualifiedLead: null,
      demosPublished: 0,
      demoViews: 0,
      demoToMeetingRate: 0,
      meetings: 0,
      wins: 0,
      losses: 0,
      blockedOrFailureRate: 0,
      blockedRuns: 0,
      failedUnits: 0,
      totalUnits: 0,
    },
    ai: {
      cost: 0,
      calls: 0,
      verifications: 0,
      cachedResults: 0,
      siteFound: 0,
      usableSiteFound: 0,
      weakSiteFound: 0,
      websiteOpportunityFound: 0,
      uncertain: 0,
      costPerVerification: null,
    },
    quality: {
      readyToCall: 0,
      needsAiVerify: 0,
      needsManualReview: 0,
      brokenSiteOpportunities: 0,
      notFit: 0,
      aiVerifiedNoSiteRate: 0,
      usableSiteFoundRate: 0,
      brokenSiteRate: 0,
      contactedToReplyRate: 0,
      replyToMeetingRate: 0,
      meetingToCloseRate: 0,
      pipelineByBucket: [],
      topReadyByType: [],
      topValueByType: [],
    },
    businessTypes: [],
    dataQuality: {
      websiteStatus: [],
      qualificationStatus: [],
      enrichmentStatus: [],
      exclusionReasons: [],
      verificationAverage: 0,
      verificationCheckedLeads: 0,
    },
    operations: {
      apiByEndpoint: [],
      apiBySku: [],
      crawlRunsByStatus: [],
      failedUnits: 0,
      enrichmentBacklog: 0,
    },
  };
}

export function emptyDashboardSummaryPanels(loadError?: DashboardSummaryLoadError): DashboardSummaryPanelsResult {
  return {
    teamSummary: emptyTeamBoardSummary(),
    weeklyStats: emptyStatisticsSummary(),
    fulfillmentSummary: emptyAdminFulfillmentSummary(),
    ...(loadError ? { loadError } : {}),
  };
}
