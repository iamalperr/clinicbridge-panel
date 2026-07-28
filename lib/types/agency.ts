/**
 * Agency Portal — Type Definitions
 *
 * FeelinHealthy gibi sağlık turizmi acentaları için
 * çoklu klinik yönetim modeli type'ları.
 *
 * Mevcut clinic/widget/user type'ları lib/types.ts'de korunur.
 */

// ─── Treatment Categories ───────────────────────────────────────────────────

export type TreatmentCategory =
  | "dental"
  | "hair_transplant"
  | "aesthetic_surgery"
  | "ivf"
  | "check_up"
  | "eye_treatments"
  | "oncology"
  | "stroke_rehab"
  | "cardiology"
  | "bone_marrow"
  | "other";

export const TREATMENT_CATEGORIES: Record<TreatmentCategory, { tr: string; en: string }> = {
  dental:             { tr: "Diş Tedavisi",                        en: "Dental" },
  hair_transplant:    { tr: "Saç Ekimi",                            en: "Hair Transplant" },
  aesthetic_surgery:  { tr: "Estetik Cerrahi",                      en: "Aesthetic Surgery" },
  ivf:                { tr: "Tüp Bebek (IVF)",                      en: "IVF" },
  check_up:           { tr: "Check-Up",                              en: "Check-Up" },
  eye_treatments:     { tr: "Göz Tedavisi",                          en: "Eye Treatments" },
  oncology:           { tr: "Onkoloji",                              en: "Oncology" },
  stroke_rehab:       { tr: "İnme Rehabilitasyonu",                  en: "Stroke Rehabilitation" },
  cardiology:         { tr: "Kardiyoloji ve Kalp Damar Cerrahisi",   en: "Cardiology & Cardiovascular" },
  bone_marrow:        { tr: "Kemik İliği ve Kök Hücre Nakli",        en: "Bone Marrow & Stem Cell" },
  other:              { tr: "Diğer",                                 en: "Other" },
};

// ─── Lead Status ────────────────────────────────────────────────────────────

export type LeadStatus =
  | "new"
  | "pre_qualified"
  | "waiting_for_assignment"
  | "assigned_to_clinic"
  | "clinic_contacted"
  | "quote_requested"
  | "appointment_requested"
  | "converted"
  | "lost";

export const LEAD_STATUSES: Record<LeadStatus, { tr: string; en: string; color: string }> = {
  new:                      { tr: "Yeni",                 en: "New",                   color: "#3b82f6" },
  pre_qualified:            { tr: "Ön Değerlendirme",     en: "Pre-Qualified",         color: "#8b5cf6" },
  waiting_for_assignment:   { tr: "Atanma Bekliyor",      en: "Waiting for Assignment", color: "#f59e0b" },
  assigned_to_clinic:       { tr: "Kliniğe Atandı",       en: "Assigned to Clinic",    color: "#10b981" },
  clinic_contacted:         { tr: "Klinik İletişimde",    en: "Clinic Contacted",      color: "#06b6d4" },
  quote_requested:          { tr: "Teklif İstendi",       en: "Quote Requested",       color: "#6366f1" },
  appointment_requested:    { tr: "Randevu İstendi",      en: "Appointment Requested", color: "#ec4899" },
  converted:                { tr: "Dönüşüm",             en: "Converted",             color: "#22c55e" },
  lost:                     { tr: "Kayıp",                en: "Lost",                  color: "#ef4444" },
};

export type LeadUrgency = "low" | "medium" | "high" | "emergency";

export const LEAD_URGENCIES: Record<LeadUrgency, { tr: string; en: string; color: string }> = {
  low:       { tr: "Düşük",    en: "Low",       color: "#94a3b8" },
  medium:    { tr: "Orta",     en: "Medium",    color: "#f59e0b" },
  high:      { tr: "Yüksek",   en: "High",      color: "#ef4444" },
  emergency: { tr: "Acil",     en: "Emergency", color: "#dc2626" },
};

// ─── Agency ─────────────────────────────────────────────────────────────────

export type AgencyStatus = "active" | "inactive" | "trial";

export interface AgencyBranding {
  primaryColor: string;
  accentColor?: string;
}

export interface AgencyPrivacySettings {
  enabled: boolean;
  mode: "kvkk" | "gdpr" | "kvkk_and_gdpr";
  version: string;
  consentTextTr: string;
  consentTextEn: string;
  noticeUrlTr?: string;
  noticeUrlEn?: string;
  requiredBeforePersonalData: boolean;
}

export interface AgencySettings {
  maxClinicsPerTreatmentRequest?: number;
  documentUploadEnabled?: boolean;
  documentUploadAllowedContexts?: string[];
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logo?: string;
  branding: AgencyBranding;
  supportedLanguages: string[];
  privacyUrl: string;
  treatmentCategories: TreatmentCategory[];
  status: AgencyStatus;
  productType?: string;
  contactEmail?: string;
  timezone?: string;
  allowedDomains?: string[];
  privacySettings?: AgencyPrivacySettings;
  settings?: AgencySettings;
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
}

// ─── Agency ↔ Clinic Relationship ───────────────────────────────────────────

export interface AgencyClinicLocation {
  city: string;
  country: string;
  address?: string;
}

export type AgencyClinicStatus = "active" | "paused" | "inactive";

// ─── Clinic Profile Sub-Types ───────────────────────────────────────────────

export interface ClinicOverview {
  shortDescription?: string;
  longDescription?: string;
  specialties?: string[];
  highlightedTreatments?: string[];
  targetPatientProfile?: string;
  healthTourismExperience?: string;
  internationalPatientSupport?: boolean;
  accommodationSupport?: boolean;
  transferSupport?: boolean;
  onlineConsultation?: boolean;
  averageResponseTime?: string;
  clinicNotes?: string;
}

export interface ClinicKnowledgeBase {
  summary?: string;
  detailedInfo?: string;
  keySellingPoints?: string[];
  doNotSay?: string[];
  treatmentNotes?: string;
  routingNotes?: string;
  pricingNotes?: string;
  medicalDisclaimer?: string;
  consentNotes?: string;
}

export interface ClinicLocationDetails {
  city: string;
  country: string;
  district?: string;
  address?: string;
  mapLink?: string;
  nearestAirport?: string;
  transferSupport?: boolean;
  accommodationSupport?: boolean;
  onlineConsultation?: boolean;
}

export interface ClinicQuoteSettings {
  quoteEnabled?: boolean;
  quoteContactEmail?: string;
  defaultResponseSLA?: number;
  requiredPatientFields?: string[];
  requiredDocuments?: string[];
  consentRequired?: boolean;
  canReceiveLead?: boolean;
  manualApprovalRequired?: boolean;
}

export interface ClinicFAQ {
  id?: string;
  question: string;
  answer: string;
  treatmentCategory?: string;
  showOnPublicProfile?: boolean;
  useInAIAnswers?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ClinicDoctor {
  id?: string;
  doctorName: string;
  title?: string; // Dt., Prof. Dr., Op. Dr.
  specialty?: string; // Diş Hekimi, Plastik Cerrah
  role?: string; // Dentist, Head Doctor
  photoUrl?: string;
  shortBio?: string;
  longBio?: string;
  education?: string;
  experienceYears?: number;
  expertiseAreas?: string[];
  certifications?: string[];
  supportedLanguages?: string[];
  treatmentCategories?: TreatmentCategory[];
  subTreatments?: string[];
  highlightedTreatments?: string[];
  // AI fields
  aiSummary?: string;
  aiHighlights?: string[];
  doNotSay?: string[];
  // Display
  showOnPublicProfile?: boolean;
  status: "active" | "inactive";
  order?: number;
  createdAt: any;
  updatedAt: any;
}

// ─── AI Config (Prompt Studio) ──────────────────────────────────────────────

export interface AIIntakeInstruction {
  key: string;
  labelTR: string;
  labelEN: string;
  questionTR: string;
  questionEN: string;
  required: boolean;
  type: string;
  usage: string;
}

export interface AgencyAIConfig {
  id?: string;
  assistantName?: string;
  persona?: string;
  tone?: string;
  greetingMessageTR?: string;
  greetingMessageEN?: string;
  intakeInstructions?: AIIntakeInstruction[];
  responseRules?: string[];
  forbiddenClaims?: string[];
  leadCollectionMode?: "light" | "moderate" | "aggressive";
  recommendationBehavior?: "ask_first" | "direct_recommend" | "always_alternatives" | "strict_match";
  pricingBehavior?: "show_exact" | "show_range" | "quote_only" | "fallback_quote";
  languageBehavior?: "user_lang" | "default_tr" | "default_en";
  customSystemPrompt?: string;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Agency Clinic ──────────────────────────────────────────────────────────

export interface AgencyClinic {
  id?: string; // Firestore doc ID
  clinicId: string;
  clinicName: string;
  clinicSlug?: string;
  clinicType?: "clinicbridge" | "external";
  branch?: string;
  category?: string;
  location: AgencyClinicLocation;
  profileUrl?: string;
  website?: string;
  whatsapp?: string;
  contactEmail?: string;
  phone?: string;
  // Legacy flat fields (kept for backward compat)
  shortDescription?: string;
  longDescription?: string;
  supportedLanguages: string[];
  treatmentCategories: TreatmentCategory[];
  subTreatments?: string[];
  targetPatientCountries?: string[];
  accreditation?: string[];
  rating?: number;
  reviewCount?: number;
  doctorCount?: number;
  experienceYears?: number;
  status: AgencyClinicStatus;
  priority: number;
  responseSLA?: number;
  leadCapacity?: number;
  quoteEnabled?: boolean;
  quoteContactEmail?: string;
  showInRecommendations?: boolean;
  showPriceRange?: boolean;
  showProfileLink?: boolean;
  // Nested profile data (single doc read)
  overview?: ClinicOverview;
  knowledgeBase?: ClinicKnowledgeBase;
  locationDetails?: ClinicLocationDetails;
  quoteSettings?: ClinicQuoteSettings;
  addedAt: any;
  updatedAt: any;
}

// ─── Clinic Treatment Pricing ───────────────────────────────────────────────

export type PriceType = "average" | "starting_from" | "package" | "per_unit" | "per_tooth" | "per_session" | "per_jaw";

export interface ClinicTreatmentPricing {
  id?: string;
  agencyClinicId: string;
  // Category + sub-treatment
  treatmentCategoryName?: string;
  subTreatmentName?: string;
  priceGroup?: string; // İmplant, Taç, Protezler, Kaplamalar, etc.
  treatmentName: string; // display name (backward compat)
  // Pricing
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType: PriceType;
  duration?: string; // "3 Gün", "7 Gün"
  // Details
  notes?: string;
  packageIncludes?: string[];
  packageExcludes?: string[];
  packageDetails?: string;
  showOnPublicProfile?: boolean;
  allowQuoteRequest?: boolean;
  status: "active" | "inactive";
  createdAt: any;
  updatedAt: any;
}

// ─── Lead ───────────────────────────────────────────────────────────────────

export type LeadSource = "widget" | "whatsapp" | "manual" | "api";

export interface LeadStatusHistoryEntry {
  status: LeadStatus;
  changedAt: any; // Firestore Timestamp
  changedBy?: string;
  note?: string;
}

export interface Lead {
  id: string;
  agencyId: string;
  clinicId: string | null;
  clinicIds?: string[];
  assignedClinicName?: string;
  clinicRequestCount?: number;

  // Patient info
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  country: string;
  language: string;

  // Treatment info
  treatmentCategory: TreatmentCategory;
  treatmentSubcategory?: string;
  urgency: LeadUrgency;

  // AI conversation
  conversationSummary: string;
  conversationId?: string;
  aiExtractedNotes?: string;

  // KVKK / GDPR
  consentStatus: "accepted" | "declined" | "pending";
  consentTimestamp?: any;
  consentVersion?: string;
  
  // Storage
  attachments?: string[];

  // Status management
  status: LeadStatus;
  statusHistory: LeadStatusHistoryEntry[];

  // Source
  source: LeadSource;
  sourceUrl?: string;

  createdAt: any;
  updatedAt: any;
}

// ─── Clinic Request ─────────────────────────────────────────────────────────

export type ClinicRequestStatus = "pending" | "submitted" | "viewed" | "under_review" | "responded" | "rejected" | "cancelled";

export interface ClinicRequest {
  id: string;
  leadId: string;
  agencyId: string;
  clinicId: string;
  status: ClinicRequestStatus;
  source: LeadSource;
  
  createdAt: any;
  updatedAt: any;
  submittedAt?: any;
  viewedAt?: any;
  reviewStartedAt?: any;
  respondedAt?: any;
  rejectedAt?: any;
  cancelledAt?: any;
}

// ─── Dashboard Metrics ──────────────────────────────────────────────────────

export interface AgencyDashboardMetrics {
  totalLeads: number;
  newLeads: number;
  assignedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  leadsByCategory: Record<TreatmentCategory, number>;
  leadsByCountry: Record<string, number>;
  leadsByLanguage: Record<string, number>;
  leadsByStatus: Record<LeadStatus, number>;
}

export const EMPTY_AGENCY_METRICS: AgencyDashboardMetrics = {
  totalLeads: 0,
  newLeads: 0,
  assignedLeads: 0,
  convertedLeads: 0,
  lostLeads: 0,
  leadsByCategory: {} as Record<TreatmentCategory, number>,
  leadsByCountry: {},
  leadsByLanguage: {},
  leadsByStatus: {} as Record<LeadStatus, number>,
};

// ─── AI Knowledge Base ──────────────────────────────────────────────────────

export type AgencyKnowledgeCategory = 
  | "Klinik Genel Bilgi"
  | "Tedaviler"
  | "Fiyatlandırma Notları"
  | "Doktorlar"
  | "Hasta Destek Hizmetleri"
  | "Transfer / Konaklama"
  | "Çalışma Saatleri"
  | "Sık Sorulan Sorular"
  | "Yanıt Kuralları"
  | "Söylenmemesi Gerekenler"
  | "Diğer";

export type AgencyKnowledgeLanguage = "TR" | "EN";
export type AgencyKnowledgePriority = "Düşük" | "Normal" | "Yüksek";

export interface AgencyKnowledgeRecord {
  id?: string;
  agencyId: string;
  clinicId: string;
  title: string;
  category: AgencyKnowledgeCategory;
  language: AgencyKnowledgeLanguage;
  content: string;
  isActive: boolean;
  priority: AgencyKnowledgePriority;
  embedding_status?: "pending" | "indexing" | "indexed" | "failed";
  last_error?: string | null;
  embeddingChunks?: Array<{ text: string, embedding: number[], chunk_index: number }>;
  indexed_at?: any;
  index_version?: string;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Document Upload (Agency Patient Request) ───────────────────────────────

export type DocumentCategory =
  | "dental_xray"
  | "medical_image"
  | "treatment_photo"
  | "treatment_plan"
  | "medical_report"
  | "lab_result"
  | "other_medical_document";

export type DocumentContextType = "agency_patient_request";
export type DocumentUploadedByType = "patient" | "agency_user" | "system";
export type DocumentStatus = "pending_upload" | "uploaded" | "processing" | "available" | "rejected" | "failed" | "deleted";
export type DocumentScanStatus = "pending" | "clean" | "infected" | "failed" | "not_required";
export type DocumentVisibility = "patient_and_agency" | "agency_only" | "clinic_authorized";

export interface LeadDocument {
  id: string;
  agencyId: string;
  leadId: string;
  contextType: DocumentContextType;
  uploadedByType: DocumentUploadedByType;
  uploadedByUserId?: string; // Optional if patient uploaded
  patientAccessTokenId?: string;
  category: DocumentCategory;
  originalFileName: string;
  sanitizedFileName: string;
  storageProvider: "firebase_storage";
  storageBucket: string;
  storageKey: string;
  mimeType: string;
  detectedMimeType?: string;
  fileExtension: string;
  sizeBytes: number;
  checksum?: string;
  status: DocumentStatus;
  scanStatus: DocumentScanStatus;
  visibility: DocumentVisibility;
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
  uploadedAt?: any;
  scanCompletedAt?: any;
  deletedAt?: any;
  deleteReason?: string;
  cleanupStatus?: string;
}
