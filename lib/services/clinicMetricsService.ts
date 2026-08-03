/**
 * clinicMetricsService.ts
 *
 * Merkezi metrik hesaplama servisi.
 * Tüm conversation metriklerini tek kaynaktan (conversationLogs) hesaplar.
 * /clinics kartları, Genel Bakış ve Görüşme Kayıtları aynı veriyi kullanır.
 */

import { collection, query, orderBy, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  normalizeConversationStatus,
  isConversationConverted,
} from "./conversations/conversationStatusResolver";

/** Hesaplanan metrikler */
export interface ClinicMetrics {
  totalConversations: number;
  totalMessages: number;
  /** Çözülmüş görüşme sayısı (successfully_answered + converted_to_appointment + collecting_appointment_information) */
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

function buildLogsQuery(clinicId: string) {
  return query(
    collection(db, "clinics", clinicId, "conversationLogs"),
    orderBy("updatedAt", "desc")
  );
}

function buildAppointmentsQuery(clinicId: string) {
  return query(
    collection(db, "clinics", clinicId, "appointments"),
    orderBy("createdAt", "desc")
  );
}

/**
 * Metrik hesaplaması. Realtime ve tek seferlik okuma yollarının aynı sayıları
 * üretmesi için tek kaynak; iki yol da bu fonksiyonu kullanır.
 */
export function computeClinicMetrics(
  logsData: any[],
  appointmentsData: any[]
): ClinicMetrics {
  const totalConversations = logsData.length;
  const totalMessages = logsData.reduce(
    (sum, d) => sum + (typeof d.totalMessages === "number" ? d.totalMessages : 0),
    0
  );

  let resolvedCount = 0;
  let unanswered = 0;
  let liveSupport = 0;
  let appointments = 0;

  logsData.forEach((d) => {
    const normalized = normalizeConversationStatus(d.status, {
      convertedToAppointment: d.convertedToAppointment,
      appointmentId: d.appointmentId,
    });
    const isConv = isConversationConverted(d);

    if (
      normalized === "successfully_answered" ||
      normalized === "converted_to_appointment" ||
      normalized === "collecting_appointment_information" ||
      isConv
    ) {
      resolvedCount++;
    }

    if (normalized === "unanswered") {
      unanswered++;
    } else if (normalized === "live_support_required") {
      liveSupport++;
    }

    if (isConv) {
      appointments++;
    }
  });

  const resolvedRate =
    totalConversations > 0
      ? Math.round((resolvedCount / totalConversations) * 100)
      : null;

  // Funnel metrics from appointments collection
  const aiAppointments = appointmentsData.filter(
    (d) =>
      d.source === "ai_chatbot" ||
      d.createdBy === "ai_assistant" ||
      d.source === "ai_agent" ||
      !d.source
  );

  const appointmentRequestsCreated = aiAppointments.length;
  const appointmentsPendingReview = aiAppointments.filter(
    (d) => d.status === "PENDING_REVIEW"
  ).length;
  const appointmentsApproved = aiAppointments.filter(
    (d) => d.status === "APPROVED"
  ).length;
  const appointmentsRejected = aiAppointments.filter(
    (d) => d.status === "REJECTED"
  ).length;
  const appointmentsCompleted = aiAppointments.filter(
    (d) => d.status === "CONFIRMED"
  ).length;

  // Check if patient was notified. This relies on patientNotificationSent field.
  const appointmentsPatientNotified = aiAppointments.filter(
    (d) => d.patientNotificationSent === true
  ).length;

  const conversionRate =
    totalConversations > 0
      ? Math.round((appointmentRequestsCreated / totalConversations) * 100)
      : null;

  return {
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
    conversionRate,
  };
}

/**
 * Tek seferlik okuma. Realtime dinleyiciden farkı: bağlantı açık kalmadığı için
 * koleksiyona yapılan her yazma tekrar okuma faturalandırmaz.
 */
export async function fetchClinicMetrics(clinicId: string): Promise<ClinicMetrics> {
  const [logsSnap, appointmentsSnap] = await Promise.all([
    getDocs(buildLogsQuery(clinicId)),
    getDocs(buildAppointmentsQuery(clinicId)),
  ]);

  return computeClinicMetrics(
    logsSnap.docs.map((d) => d.data()),
    appointmentsSnap.docs.map((d) => d.data())
  );
}

/**
 * Tek bir klinik için conversationLogs'u gerçek zamanlı dinler ve metrikleri hesaplar.
 * React useEffect içinde kullanılır; return değeri unsubscribe fonksiyonudur.
 */
export function subscribeToClinicMetrics(
  clinicId: string,
  onMetrics: (metrics: ClinicMetrics) => void
): () => void {
  const qLogs = buildLogsQuery(clinicId);
  const qAppointments = buildAppointmentsQuery(clinicId);

  let logsData: any[] | null = null;
  let appointmentsData: any[] | null = null;

  const emitMetrics = () => {
    if (logsData === null || appointmentsData === null) return; // Wait for both
    onMetrics(computeClinicMetrics(logsData, appointmentsData));
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
