/**
 * matching.ts
 *
 * AI Clinic Matching & Quote Assistant — Type Definitions
 *
 * FeelinHealthy iş modeli: hasta → treatment detection → clinic matching →
 * price range → quote request akışını yöneten SaaS altyapısı.
 */

import type { TreatmentCategory } from "./agency";

// ─── Treatment Catalog ──────────────────────────────────────────────────────

export interface TreatmentCatalogItem {
  id: string;
  agencyId: string;
  category: TreatmentCategory;
  name: string;
  slug: string;
  description?: string;
  avgPriceMin?: number;
  avgPriceMax?: number;
  currency: string;
  priceType: "average" | "starting_from" | "package" | "per_unit";
  duration?: string;
  recoveryTime?: string;
  requiredDocuments?: string[];
  intakeQuestions?: IntakeQuestion[];
  eligibleClinicIds?: string[];
  status: "active" | "inactive";
  createdAt: any;
  updatedAt: any;
}

// ─── Intake Questions ───────────────────────────────────────────────────────

export type IntakeQuestionType =
  | "text"
  | "select"
  | "multi_select"
  | "date"
  | "file"
  | "phone"
  | "email"
  | "number";

export interface IntakeQuestionOption {
  label: string;
  value: string;
}

export interface IntakeQuestion {
  id: string;
  questionText: string;
  questionType: IntakeQuestionType;
  options?: IntakeQuestionOption[];
  required: boolean;
  order: number;
  saveAsField?: string;
  conditionalOn?: {
    questionId: string;
    value: string;
  };
}

// ─── Clinic Treatment Pricing ───────────────────────────────────────────────

export interface ClinicTreatmentPrice {
  id: string;
  agencyId: string;
  clinicId?: string;
  clinicName?: string;
  treatmentId: string;
  treatmentName: string;
  category: TreatmentCategory;
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType: "average" | "starting_from" | "package" | "per_unit";
  packageDetails?: string;
  notes?: string;
  status: "active" | "inactive";
  createdAt: any;
  updatedAt: any;
}

// ─── AI Matching Config ─────────────────────────────────────────────────────

export type RoutingMode = "manual" | "assisted" | "auto";

export interface AIMatchingConfig {
  id: string;
  agencyId: string;
  routingMode: RoutingMode;
  maxClinicsToShow: number;
  showPriceRange: boolean;
  showProfileLinks: boolean;
  requireConsentBeforeQuote: boolean;
  treatmentClinicRules: TreatmentClinicRule[];
  createdAt: any;
  updatedAt: any;
}

export interface TreatmentClinicRule {
  treatmentCategory: TreatmentCategory;
  eligibleClinicIds: string[];
  preferredClinicIds?: string[];
}

// ─── Recommended Clinic (AI output per lead) ────────────────────────────────

export interface RecommendedClinic {
  clinicId: string;
  clinicName: string;
  location: string;
  profileUrl?: string;
  supportedTreatments: string[];
  supportedLanguages: string[];
  estimatedPriceMin?: number;
  estimatedPriceMax?: number;
  currency?: string;
  score: number;
  reason: string;
}

// ─── Quote Request ──────────────────────────────────────────────────────────

export type QuoteStatus =
  | "draft"
  | "waiting_consent"
  | "requested"
  | "clinic_reviewing"
  | "offer_received"
  | "sent_to_patient"
  | "accepted"
  | "rejected"
  | "expired";

export const QUOTE_STATUSES: Record<QuoteStatus, { en: string; color: string }> = {
  draft:            { en: "Draft",            color: "#94a3b8" },
  waiting_consent:  { en: "Waiting Consent",  color: "#f59e0b" },
  requested:        { en: "Requested",        color: "#3b82f6" },
  clinic_reviewing: { en: "Clinic Reviewing", color: "#8b5cf6" },
  offer_received:   { en: "Offer Received",   color: "#06b6d4" },
  sent_to_patient:  { en: "Sent to Patient",  color: "#6366f1" },
  accepted:         { en: "Accepted",          color: "#22c55e" },
  rejected:         { en: "Rejected",          color: "#ef4444" },
  expired:          { en: "Expired",           color: "#64748b" },
};

export interface ClinicOffer {
  clinicId: string;
  clinicName: string;
  treatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  packageDetails?: string;
  validUntil?: string;
  notes?: string;
  recommendedNextStep?: string;
  submittedAt?: any;
}

export interface QuoteRequest {
  id: string;
  agencyId: string;
  leadId: string;
  patientName?: string;
  patientEmail?: string;
  patientCountry?: string;
  treatmentCategory: TreatmentCategory;
  treatmentName: string;
  subTreatment?: string;
  selectedClinicIds: string[];
  selectedClinicNames: string[];
  intakeAnswers?: Record<string, string>;
  consentStatus: "pending" | "accepted" | "declined";
  status: QuoteStatus;
  clinicOffers: ClinicOffer[];
  internalNotes?: string;
  createdAt: any;
  updatedAt: any;
}

// ─── Widget Mode ────────────────────────────────────────────────────────────

export type WidgetMode = "chat" | "matching_assistant" | "quote_assistant";

export const WIDGET_MODES: Record<WidgetMode, { label: string; description: string }> = {
  chat:                { label: "Chat",               description: "Standard conversational chatbot" },
  matching_assistant:  { label: "Matching Assistant",  description: "AI Clinic Matching with recommendations" },
  quote_assistant:     { label: "Quote Assistant",     description: "Full matching + quote request flow" },
};
