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
};

/**
 * Tek bir klinik için conversationLogs'u gerçek zamanlı dinler ve metrikleri hesaplar.
 * React useEffect içinde kullanılır; return değeri unsubscribe fonksiyonudur.
 */
export function subscribeToClinicMetrics(
  clinicId: string,
  onMetrics: (metrics: ClinicMetrics) => void
): () => void {
  const q = query(
    collection(db, "clinics", clinicId, "conversationLogs"),
    orderBy("updatedAt", "desc")
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => d.data());

      const totalConversations = docs.length;
      const totalMessages = docs.reduce(
        (sum, d) => sum + (typeof d.totalMessages === "number" ? d.totalMessages : 0),
        0
      );

      const resolvedCount = docs.filter((d) => RESOLVED_STATUSES.has(d.status)).length;
      const unanswered = docs.filter((d) => d.status === "unanswered").length;
      const liveSupport = docs.filter((d) => d.status === "liveSupport").length;
      const appointments = docs.filter((d) => d.status === "appointment").length;

      const resolvedRate =
        totalConversations > 0
          ? Math.round((resolvedCount / totalConversations) * 100)
          : null;

      onMetrics({
        totalConversations,
        totalMessages,
        resolvedCount,
        resolvedRate,
        unanswered,
        liveSupport,
        appointments,
      });
    },
    () => {
      // Erişim hatası veya koleksiyon yoksa boş metrik dön
      onMetrics(EMPTY_METRICS);
    }
  );

  return unsub;
}
