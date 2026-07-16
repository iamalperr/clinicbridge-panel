/**
 * aiUsage.ts
 *
 * AI Usage & Cost Tracking type definitions.
 * Used by AI Gateway, usage API endpoints, and frontend components.
 */

// ─── Request / Channel enums ─────────────────────────────────────────────────

export type AIRequestType =
  | "chat"
  | "knowledge_search"
  | "lead_summary"
  | "translation"
  | "voice"
  | "admin_test"
  | "system";

export type AIChannel =
  | "web_widget"
  | "portal"
  | "admin"
  | "api"
  | "voice"
  | "system";

export type AIUsageStatus = "success" | "failed";

export type AIPricingStatus = "calculated" | "missing";

export type AIBudgetExceededAction = "notify" | "restrict" | "stop";

// ─── Core: Individual AI Usage Record ────────────────────────────────────────

export interface ClinicAIUsage {
  id: string;
  clinicId?: string;
  conversationId?: string;
  leadId?: string;
  appointmentId?: string;

  internalRequestId: string;
  openaiRequestId?: string;
  parentRequestId?: string;
  retryCount?: number;

  model: string;
  requestType: AIRequestType;
  channel: AIChannel;

  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;

  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;

  durationMs?: number;
  language?: string;

  status: AIUsageStatus;
  pricingStatus: AIPricingStatus;
  errorCode?: string;

  createdAt: string; // ISO string
}

// ─── Model Pricing ───────────────────────────────────────────────────────────

export interface AIModelPricing {
  id: string;
  model: string;
  inputPricePerMillion: number;
  cachedInputPricePerMillion?: number;
  outputPricePerMillion: number;
  effectiveFrom: string; // ISO string
  effectiveUntil?: string; // ISO string
  isActive: boolean;
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
}

// ─── Daily Aggregate ─────────────────────────────────────────────────────────

export interface ClinicAIUsageDaily {
  clinicId: string;
  date: string; // YYYY-MM-DD
  model: string;
  channel: string;
  requestType: string;

  requestCount: number;
  successCount: number;
  failedCount: number;

  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;

  totalCostUsd: number;
  totalDurationMs: number;
  conversationCount: number;
}

// ─── Clinic AI Usage Settings (stored in clinic doc) ─────────────────────────

export interface ClinicAIUsageSettings {
  showCostToClinicUsers: boolean;
  budgetLimitUsd?: number;
  requestLimit?: number;
  tokenLimit?: number;
  onBudgetExceeded: AIBudgetExceededAction;
  notifiedThresholds: number[]; // e.g. [70, 90, 100]
}

export const DEFAULT_AI_USAGE_SETTINGS: ClinicAIUsageSettings = {
  showCostToClinicUsers: false,
  onBudgetExceeded: "notify",
  notifiedThresholds: [],
};

// ─── API Response Types ──────────────────────────────────────────────────────

export interface AIUsageSummary {
  totalCostUsd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalConversations: number;
  avgCostPerConversation: number;
  avgCostPerRequest: number;
  avgDurationMs: number;

  // Previous period comparison
  previousPeriod?: {
    totalCostUsd: number;
    totalRequests: number;
    totalTokens: number;
    totalConversations: number;
  };
}

export interface AIUsageTimeseriesPoint {
  date: string; // ISO or YYYY-MM-DD or YYYY-MM-DD HH
  totalCostUsd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  requestCount: number;
  conversationCount: number;
  failedCount: number;
  avgDurationMs: number;
}

export interface AIUsageBreakdownItem {
  key: string;
  label: string;
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number;
  failedCount: number;
  sharePercent: number; // percentage of total
}

export interface AIUsageBreakdowns {
  byModel: AIUsageBreakdownItem[];
  byChannel: AIUsageBreakdownItem[];
  byRequestType: AIUsageBreakdownItem[];
  byLanguage: AIUsageBreakdownItem[];
}

export interface AIUsageRecordRow {
  id: string;
  createdAt: string;
  requestType: AIRequestType;
  channel: AIChannel;
  model: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  durationMs?: number;
  status: AIUsageStatus;
}

// ─── Admin — Clinic comparison row ──────────────────────────────────────────

export interface AdminClinicUsageRow {
  clinicId: string;
  clinicName: string;
  plan?: string;
  conversationCount: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerConversation: number;
  avgDurationMs: number;
  errorRate: number;
  limitUsagePercent?: number;
  status: string;
}

// ─── Admin — Profitability metrics ──────────────────────────────────────────

export interface ClinicProfitabilityMetrics {
  clinicId: string;
  clinicName: string;
  monthlyPackageRevenue: number;
  aiCostUsd: number;
  aiCostRatio: number;
  totalLeads: number;
  costPerLead: number;
  totalAppointments: number;
  costPerAppointment: number;
}

// ─── Audit entry ─────────────────────────────────────────────────────────────

export type AuditIssueType =
  | "missing_clinic_id"
  | "missing_pricing"
  | "missing_tokens"
  | "duplicate_request"
  | "negative_tokens"
  | "missing_usage_record"
  | "orphan_usage"
  | "total_mismatch";

export interface AIUsageAuditEntry {
  id: string;
  type: AuditIssueType;
  severity: "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

// ─── Date Range (extended from analyticsService) ────────────────────────────

export type AIUsageDateRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

// ─── AI Gateway request params ──────────────────────────────────────────────

export interface TrackableAIRequestParams {
  clinicId?: string; // required for non-system calls
  conversationId?: string;
  leadId?: string;
  appointmentId?: string;
  channel: AIChannel;
  requestType: AIRequestType;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: string };
  parentRequestId?: string;
  retryCount?: number;
  language?: string;
}

export interface TrackableAIResponse {
  content: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCostUsd: number;
    cachedInputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
  };
  model: string;
  openaiRequestId?: string;
  durationMs: number;
  usageRecordId: string;
}

// ─── Channel & Request Type labels ──────────────────────────────────────────

export const CHANNEL_LABELS: Record<AIChannel, string> = {
  web_widget: "Web Widget",
  portal: "Portal",
  admin: "Admin Test",
  api: "API",
  voice: "Sesli Yanıt",
  system: "Sistem",
};

export const REQUEST_TYPE_LABELS: Record<AIRequestType, string> = {
  chat: "Chat Yanıtları",
  knowledge_search: "Bilgi Havuzu Sorguları",
  lead_summary: "Lead Özetleme",
  translation: "Çeviri",
  voice: "Sesli Yanıt",
  admin_test: "Admin Testleri",
  system: "Sistem İşlemleri",
};
