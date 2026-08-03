/**
 * conversationStatusResolver.ts
 *
 * Single source of truth for canonical conversation system statuses,
 * backward-compatible status normalization, manual conversion detection,
 * localization mappings, badge variants, and CSV export formatting.
 */

export type CanonicalConversationStatus =
  | "successfully_answered"
  | "collecting_appointment_information"
  | "converted_to_appointment"
  | "live_support_required"
  | "unanswered";

export interface ConversationStatusContext {
  convertedToAppointment?: boolean;
  appointmentId?: string | null;
  appointmentStatus?: string | null;
  manualConversionStatus?: string | null;
  customLabel?: string | null;
  customLabelId?: string | null;
  customLabelName?: string | null;
}

export const CANONICAL_CONVERSATION_STATUSES: CanonicalConversationStatus[] = [
  "successfully_answered",
  "collecting_appointment_information",
  "converted_to_appointment",
  "live_support_required",
  "unanswered",
];

export const CONVERSATION_STATUS_LABELS: Record<
  CanonicalConversationStatus,
  { tr: string; en: string; de: string; ar: string; es: string }
> = {
  successfully_answered: {
    tr: "Başarılı Yanıtlandı",
    en: "Successfully Answered",
    de: "Erfolgreich beantwortet",
    ar: "تمت الإجابة بنجاح",
    es: "Respondido con éxito",
  },
  collecting_appointment_information: {
    tr: "Randevu Bilgisi Toplanıyor",
    en: "Collecting Appointment Information",
    de: "Terminangaben werden erfasst",
    ar: "جاري جمع معلومات الموعد",
    es: "Recopilando información de la cita",
  },
  converted_to_appointment: {
    tr: "Randevuya Dönüştü",
    en: "Converted to Appointment",
    de: "In Termin umgewandelt",
    ar: "تحول إلى موعد",
    es: "Convertido en cita",
  },
  live_support_required: {
    tr: "Canlı Destek Gerekli",
    en: "Live Support Required",
    de: "Live-Support erforderlich",
    ar: "الدعم المباشر مطلوب",
    es: "Se requiere soporte en vivo",
  },
  unanswered: {
    tr: "Yanıtlanamadı",
    en: "Unanswered",
    de: "Unbeantwortet",
    ar: "لم يتم الرد",
    es: "Sin respuesta",
  },
};

export const CONVERSATION_STATUS_VARIANTS: Record<
  CanonicalConversationStatus,
  "resolved" | "warning" | "pro" | "open" | "failed"
> = {
  successfully_answered: "resolved",
  collecting_appointment_information: "warning",
  converted_to_appointment: "pro",
  live_support_required: "open",
  unanswered: "failed",
};

/**
 * Checks if a conversation has been manually marked as converted via custom label.
 */
export function isConversationManuallyConverted(log: Partial<ConversationStatusContext> | any): boolean {
  if (!log) return false;
  if (log.manualConversionStatus === "converted_to_appointment") return true;
  if (log.customLabel === "converted_to_appointment") return true;
  if (log.customLabelId === "converted_to_appointment" || log.customLabelId === "appointment_converted") return true;
  if (
    log.customLabelName === "Randevuya Dönüştü" ||
    log.customLabelName === "Converted to Appointment" ||
    log.customLabelName === "Appointment Converted"
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if a conversation was converted automatically by chatbot (real appointment created).
 */
export function isConversationSystemConverted(log: Partial<ConversationStatusContext> | any): boolean {
  if (!log) return false;
  if (typeof log.appointmentId === "string" && log.appointmentId.trim().length > 0) return true;
  if (log.convertedToAppointment === true) return true;
  if (log.appointmentStatus === "created") return true;
  const s = String(log.status || "").toLowerCase();
  if (s === "appointment" || s === "converted_to_appointment" || s === "logs.status.appointment") return true;
  return false;
}

/**
 * Evaluates whether a conversation is converted (either automatically by chatbot OR manually marked).
 * Guaranteed to return true once, preventing any double-counting in analytics.
 */
export function isConversationConverted(log: Partial<ConversationStatusContext> | any): boolean {
  return isConversationSystemConverted(log) || isConversationManuallyConverted(log);
}

/**
 * Returns the human-readable conversion source for display and CSV export.
 * Possible values:
 * - TR: "Chatbot", "Manuel", "Chatbot + Manuel", "Dönüşmedi"
 * - EN: "Chatbot", "Manual", "Chatbot + Manual", "Not Converted"
 */
export function getConversionSource(log: Partial<ConversationStatusContext> | any, language: string = "tr"): string {
  const isEn = language === "en";
  const sys = isConversationSystemConverted(log);
  const man = isConversationManuallyConverted(log);

  if (sys && man) return isEn ? "Chatbot + Manual" : "Chatbot + Manuel";
  if (sys) return "Chatbot";
  if (man) return isEn ? "Manual" : "Manuel";
  return isEn ? "Not Converted" : "Dönüşmedi";
}

/**
 * Normalizes any legacy or canonical status string to a CanonicalConversationStatus.
 *
 * Supported legacy inputs include:
 * - "logs.status.collecting", "collecting", "appointment_collecting", "collecting_info"
 * - "logs.status.appointment", "appointment", "appointment_converted", "converted"
 * - "logs.status.livesupport", "liveSupport", "live_support", "live_support_required"
 * - "logs.status.unanswered", "unanswered", "failed"
 * - "logs.status.answered", "answered", "successful", "open", "successfully_answered"
 *
 * In addition, if conversation context contains appointmentId or convertedToAppointment,
 * it returns "converted_to_appointment".
 */
export function normalizeConversationStatus(
  rawStatus: string | undefined | null,
  context?: ConversationStatusContext
): CanonicalConversationStatus {
  // If an appointment was created from this conversation (system conversion)
  if (
    context?.convertedToAppointment === true ||
    (typeof context?.appointmentId === "string" && context.appointmentId.trim().length > 0) ||
    context?.appointmentStatus === "created"
  ) {
    return "converted_to_appointment";
  }

  if (!rawStatus) {
    return "successfully_answered";
  }

  const s = String(rawStatus).trim().toLowerCase();

  // Collecting appointment info mappings
  if (
    s === "collecting_appointment_information" ||
    s === "collecting" ||
    s === "logs.status.collecting" ||
    s === "appointment_collecting" ||
    s === "collecting_info" ||
    s === "collecting_information" ||
    s === "bilgi toplanıyor" ||
    s === "randevu bilgisi toplanıyor"
  ) {
    return "collecting_appointment_information";
  }

  // Converted to appointment mappings
  if (
    s === "converted_to_appointment" ||
    s === "appointment" ||
    s === "appointment_converted" ||
    s === "logs.status.appointment" ||
    s === "randevuya dönüştü" ||
    s === "converted"
  ) {
    return "converted_to_appointment";
  }

  // Live support required mappings
  if (
    s === "live_support_required" ||
    s === "livesupport" ||
    s === "live_support" ||
    s === "logs.status.livesupport" ||
    s === "canlı destek gerekli" ||
    s === "live support"
  ) {
    return "live_support_required";
  }

  // Unanswered mappings
  if (
    s === "unanswered" ||
    s === "logs.status.unanswered" ||
    s === "yanıtlanamadı" ||
    s === "failed"
  ) {
    return "unanswered";
  }

  // Successfully answered mappings
  if (
    s === "successfully_answered" ||
    s === "answered" ||
    s === "successful" ||
    s === "logs.status.answered" ||
    s === "başarılı yanıtlandı" ||
    s === "open"
  ) {
    return "successfully_answered";
  }

  return "successfully_answered";
}

/**
 * Returns the localized user-facing label for a given canonical status.
 */
export function getConversationStatusLabel(
  status: CanonicalConversationStatus | string,
  language: string = "tr"
): string {
  const normalized = normalizeConversationStatus(status);
  const langKey = (["tr", "en", "de", "ar", "es"].includes(language) ? language : "tr") as
    | "tr"
    | "en"
    | "de"
    | "ar"
    | "es";
  return CONVERSATION_STATUS_LABELS[normalized][langKey] || CONVERSATION_STATUS_LABELS[normalized].tr;
}

/**
 * Returns the UI Badge variant for a canonical status.
 */
export function getConversationStatusVariant(
  status: CanonicalConversationStatus | string
): "resolved" | "warning" | "pro" | "open" | "failed" {
  const normalized = normalizeConversationStatus(status);
  return CONVERSATION_STATUS_VARIANTS[normalized] || "resolved";
}

/**
 * Escapes a cell value for standard CSV formatting.
 */
export function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export interface CSVLogRecord {
  id: string;
  patientName?: string;
  patientPhone?: string;
  language?: string;
  status?: string;
  convertedToAppointment?: boolean;
  appointmentId?: string | null;
  customLabelId?: string | null;
  customLabelName?: string | null;
  manualConversionStatus?: string | null;
  customLabel?: string | null;
  totalMessages?: number;
  createdAt?: string | Date;
  lastMessagePreview?: string;
}

/**
 * Generates and triggers download of conversation logs in CSV format with separated columns:
 * - Görüşme Durumu / Conversation Status
 * - Özel Etiket / Custom Label
 * - Dönüşüm Kaynağı / Conversion Source
 * - Randevuya Dönüştü / Converted to Appointment
 * - Randevu ID / Appointment ID
 */
export function exportConversationLogsToCSV(
  logs: CSVLogRecord[],
  language: string = "tr",
  clinicName?: string
): string {
  const isEn = language === "en";

  const headers = [
    isEn ? "Conversation ID" : "Görüşme ID",
    isEn ? "Patient Name" : "Hasta Adı",
    isEn ? "Phone" : "Telefon",
    isEn ? "Language" : "Dil",
    isEn ? "Conversation Status" : "Görüşme Durumu",
    isEn ? "Custom Label" : "Özel Etiket",
    isEn ? "Conversion Source" : "Dönüşüm Kaynağı",
    isEn ? "Converted to Appointment" : "Randevuya Dönüştü",
    isEn ? "Appointment ID" : "Randevu ID",
    isEn ? "Total Messages" : "Toplam Mesaj",
    isEn ? "Date" : "Tarih",
    isEn ? "Last Message" : "Son Mesaj",
  ];

  const rows = logs.map((log) => {
    const normalizedStatus = normalizeConversationStatus(log.status, {
      convertedToAppointment: log.convertedToAppointment,
      appointmentId: log.appointmentId,
    });
    const statusLabel = getConversationStatusLabel(normalizedStatus, isEn ? "en" : "tr");
    
    // Custom label: if manually converted, localized "Randevuya Dönüştü" / "Converted to Appointment"
    let customLabel = log.customLabelName;
    if (isConversationManuallyConverted(log)) {
      customLabel = isEn ? "Converted to Appointment" : "Randevuya Dönüştü";
    } else if (!customLabel) {
      customLabel = isEn ? "No Label" : "Etiket Yok";
    }

    const conversionSource = getConversionSource(log, isEn ? "en" : "tr");
    const isConverted = isConversationConverted(log) ? (isEn ? "Yes" : "Evet") : (isEn ? "No" : "Hayır");
    const appointmentId = log.appointmentId || "-";

    let dateFormatted = "-";
    if (log.createdAt) {
      try {
        const d = typeof log.createdAt === "string" ? new Date(log.createdAt) : log.createdAt;
        dateFormatted = d.toLocaleString(isEn ? "en-US" : "tr-TR");
      } catch {
        dateFormatted = String(log.createdAt);
      }
    }

    return [
      escapeCSV(log.id),
      escapeCSV(log.patientName || (isEn ? "Anonymous Visitor" : "Anonim Ziyaretçi")),
      escapeCSV(log.patientPhone || "-"),
      escapeCSV(log.language?.toUpperCase() || "-"),
      escapeCSV(statusLabel),
      escapeCSV(customLabel),
      escapeCSV(conversionSource),
      escapeCSV(isConverted),
      escapeCSV(appointmentId),
      escapeCSV(log.totalMessages || 0),
      escapeCSV(dateFormatted),
      escapeCSV(log.lastMessagePreview || "-"),
    ].join(",");
  });

  const bom = "\uFEFF";
  const csvContent = [headers.join(","), ...rows].join("\n");
  const fullCSV = bom + csvContent;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([fullCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    const prefix = isEn ? "conversation_logs" : "gorusme_kayitlari";
    link.setAttribute("href", url);
    link.setAttribute("download", `${prefix}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return fullCSV;
}
