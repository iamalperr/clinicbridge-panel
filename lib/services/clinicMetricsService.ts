/**
 * clinicMetricsService.ts
 *
 * Merkezi metrik hesaplama servisi.
 * Tüm conversation metriklerini tek kaynaktan (conversationLogs) hesaplar.
 * /clinics kartları, Genel Bakış ve Görüşme Kayıtları aynı veriyi kullanır.
 */

import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Firestore'daki conversationLogs dokümanının status alanı */
type LogStatus = "answered" | "liveSupport" | "unanswered" | "appointment" | string;

/** Hesaplanan metrikler */
export interface ClinicMetrics {
  totalConversations: number;
  totalMessages: number;
  /** Çözülmüş görüşme sayısı (answered + appointment) */
  resolvedCount: number;
  /** 0-100 arası oran; veri yoksa null */
  resolvedRate: number | null;
  unanswered: number;
  liveSupport: number;
  appointments: number;
  
  // Funnel Metrics
  appointmentRequestsCreated: number;
  appointmentsPendingReview: number;
  appointmentsApproved: number;
  appointmentsRejected: number;
  appointmentsPatientNotified: number;
  appointmentsCompleted: number;
  conversionRate: number | null;
}

/**
 * "Çözülmüş" sayılan status'lar.
 * answered + appointment → başarılı etkileşim olarak kabul edilir.
 */
const RESOLVED_STATUSES = new Set<LogStatus>(["answered", "appointment"]);

/** Boş/başlangıç metrik değeri */
export const EMPTY_METRICS: ClinicMetrics = {
  totalConversations: 0,
  totalMessages: 0,
  resolvedCount: 0,
  resolvedRate: null,
  unanswered: 0,
  liveSupport: 0,
  appointments: 0,
  appointmentRequestsCreated: 0,
  appointmentsPendingReview: 0,
  appointmentsApproved: 0,
  appointmentsRejected: 0,
  appointmentsPatientNotified: 0,
  appointmentsCompleted: 0,
  conversionRate: null,
};

/**
 * Tek bir klinik için conversationLogs'u gerçek zamanlı dinler ve metrikleri hesaplar.
 * React useEffect içinde kullanılır; return değeri unsubscribe fonksiyonudur.
 */
export function subscribeToClinicMetrics(
  clinicId: string,
  onMetrics: (metrics: ClinicMetrics) => void
): () => void {
  const qLogs = query(
    collection(db, "clinics", clinicId, "conversationLogs"),
    orderBy("updatedAt", "desc")
  );

  const qAppointments = query(
    collection(db, "clinics", clinicId, "appointments"),
    orderBy("createdAt", "desc")
  );

  let logsData: any[] | null = null;
  let appointmentsData: any[] | null = null;

  const emitMetrics = () => {
    if (logsData === null || appointmentsData === null) return; // Wait for both

    const totalConversations = logsData.length;
    const totalMessages = logsData.reduce(
      (sum, d) => sum + (typeof d.totalMessages === "number" ? d.totalMessages : 0),
      0
    );

    const resolvedCount = logsData.filter((d) => RESOLVED_STATUSES.has(d.status)).length;
    const unanswered = logsData.filter((d) => d.status === "unanswered").length;
    const liveSupport = logsData.filter((d) => d.status === "liveSupport").length;
    // Keep legacy conversation-level appointment metric for logs tab fallback
    const appointments = logsData.filter((d) => d.status === "appointment").length;

    const resolvedRate =
      totalConversations > 0
        ? Math.round((resolvedCount / totalConversations) * 100)
        : null;

    // Funnel metrics from appointments collection
    // Filter only AI-created appointments for accurate funnel if needed, 
    // or assume all if clinic uses AI chatbot heavily. Let's count all or AI specific:
    const aiAppointments = appointmentsData.filter(d => d.source === "ai_chatbot" || d.createdBy === "ai_assistant" || d.source === "ai_agent" || !d.source);

    const appointmentRequestsCreated = aiAppointments.length;
    const appointmentsPendingReview = aiAppointments.filter(d => d.status === "PENDING_REVIEW").length;
    const appointmentsApproved = aiAppointments.filter(d => d.status === "APPROVED").length;
    const appointmentsRejected = aiAppointments.filter(d => d.status === "REJECTED").length;
    const appointmentsCompleted = aiAppointments.filter(d => d.status === "CONFIRMED").length;
    
    // Check if patient was notified. This relies on patientNotificationSent field.
    const appointmentsPatientNotified = aiAppointments.filter(d => d.patientNotificationSent === true).length;

    const conversionRate =
      totalConversations > 0
        ? Math.round((appointmentRequestsCreated / totalConversations) * 100)
        : null;

    onMetrics({
      totalConversations,
      totalMessages,
      resolvedCount,
      resolvedRate,
      unanswered,
      liveSupport,
      appointments,
      appointmentRequestsCreated,
      appointmentsPendingReview,
      appointmentsApproved,
      appointmentsRejected,
      appointmentsPatientNotified,
      appointmentsCompleted,
      conversionRate
    });
  };

  const unsubLogs = onSnapshot(
    qLogs,
    (snap) => {
      logsData = snap.docs.map((d) => d.data());
      emitMetrics();
    },
    () => {
      logsData = [];
      emitMetrics();
    }
  );

  const unsubAppointments = onSnapshot(
    qAppointments,
    (snap) => {
      appointmentsData = snap.docs.map((d) => d.data());
      emitMetrics();
    },
    () => {
      appointmentsData = [];
      emitMetrics();
    }
  );

  return () => {
    unsubLogs();
    unsubAppointments();
  };
}
