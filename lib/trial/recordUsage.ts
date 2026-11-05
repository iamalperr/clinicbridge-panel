import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { monthKey, planUsageNotification, trialLanguage, type UsageNotice } from "@/lib/trial/policy";

export interface UsageTick {
  notify: UsageNotice | null;
  month: string;
  count: number;
  limit: number;
  language: "tr" | "en";
  email: string;
  clinicName: string;
}

export async function recordMonthlyConversation(
  db: Firestore,
  clinicId: string,
  conversationId: string,
  now: Date
): Promise<UsageTick | null> {
  const month = monthKey(now);
  const clinicRef = db.collection("clinics").doc(clinicId);
  const marker = clinicRef.collection("monthlyChatUsage").doc(month).collection("conversations").doc(conversationId);
  return db.runTransaction(async (tx) => {
    const mark = await tx.get(marker);
    const clinicSnap = await tx.get(clinicRef);
    const clinic = clinicSnap.data() || {};
    if (!clinicSnap.exists || clinic.acquisition !== "direct") return null;
    const limit = typeof clinic.chatLimit === "number" ? clinic.chatLimit : 0;
    if (limit <= 0) return null;
    const language = trialLanguage(undefined, clinic.language);
    const email = typeof clinic.email === "string" ? clinic.email : "";
    const clinicName = typeof clinic.name === "string" ? clinic.name : "Klinik";
    if (mark.exists) {
      return {
        notify: null,
        month,
        count: typeof clinic.chatUsageCount === "number" ? clinic.chatUsageCount : 0,
        limit,
        language,
        email,
        clinicName,
      };
    }
    const sameMonth = clinic.chatUsageMonth === month;
    const count = (sameMonth && typeof clinic.chatUsageCount === "number" ? clinic.chatUsageCount : 0) + 1;
    const planned = planUsageNotification({
      count,
      limit,
      warned80: sameMonth ? clinic.chatWarn80Sent === true : false,
      warned100: sameMonth ? clinic.chatWarn100Sent === true : false,
    });
    tx.set(marker, { conversationId, createdAt: Timestamp.now() });
    tx.set(clinicRef, {
      chatUsageMonth: month,
      chatUsageCount: count,
      chatWarn80Sent: planned.warned80,
      chatWarn100Sent: planned.warned100,
    }, { merge: true });
    return { notify: planned.notify, month, count, limit, language, email, clinicName };
  });
}

export async function clearUsageWarning(db: Firestore, clinicId: string, month: string, notice: UsageNotice): Promise<void> {
  const ref = db.collection("clinics").doc(clinicId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.chatUsageMonth !== month) return;
    tx.set(ref, notice === "80" ? { chatWarn80Sent: false } : { chatWarn100Sent: false }, { merge: true });
  });
}
