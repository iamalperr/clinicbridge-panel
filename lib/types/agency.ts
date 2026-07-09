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

export interface AgencyClinic {
  id?: string; // Firestore doc ID
  clinicId: string;
  clinicName: string;
  clinicType?: "clinicbridge" | "external";
  branch?: string;
  category?: string;
  location: AgencyClinicLocation;
  profileUrl?: string; // e.g. https://www.feelinhealthy.com/medicalcenter/...
  website?: string;
  whatsapp?: string;
  supportedLanguages: string[];
  treatmentCategories: TreatmentCategory[];
  subTreatments?: string[];
  accreditation?: string[];
  rating?: number;
  reviewCount?: number;
  status: AgencyClinicStatus;
  priority: number;
  responseSLA?: number; // hours
  leadCapacity?: number;
  addedAt: any;
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
  assignedClinicName?: string;

  // Patient info
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
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

  // Status management
  status: LeadStatus;
  statusHistory: LeadStatusHistoryEntry[];

  // Source
  source: LeadSource;
  sourceUrl?: string;

  createdAt: any;
  updatedAt: any;
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
