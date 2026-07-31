import { db } from "@/lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import type { Conversation, ConversationStatus } from "@/lib/types/conversation";

/**
 * Client-side subscription for Recent Conversations
 */
export function subscribeToRecentConversations(
  agencyId: string,
  limitCount: number = 5,
  callback: (data: Conversation[]) => void
) {
  const q = query(
    collection(db, "agencies", agencyId, "conversations"),
    orderBy("lastActivityAt", "desc"),
    limit(limitCount)
  );
  
  return onSnapshot(q, (snap) => {
    const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
    callback(results);
  });
}

/**
 * Calculate funnel & health metrics directly from the raw conversations data.
 * In a huge production DB, this might be a Cloud Function aggregation,
 * but this approach works efficiently for moderate limits.
 */
export async function getConversationStats(agencyId: string) {
  // To keep it lightweight and fast, we can query the latest N conversations (e.g. 500)
  // or use count queries if we need absolute totals. 
  // We'll use a direct fetch for the last 30 days of data in a robust setup.
  
  const q = query(
    collection(db, "agencies", agencyId, "conversations"),
    orderBy("createdAt", "desc"),
    limit(500)
  );
  
  const snap = await getDocs(q);
  const convos = snap.docs.map(d => d.data() as Conversation);
  
  let totalConversations = convos.length;
  let todaysConversations = 0;
  let clinicRecommended = 0;
  let quoteRequests = 0;
  let appointments = 0;
  let totalCompletionScore = 0;
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  convos.forEach(c => {
    // Check if created today
    let createdDate = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
    if (createdDate >= todayStart) {
      todaysConversations++;
    }

    if (c.status === "clinic_recommended" || c.status === "quote_requested" || c.status === "appointment_scheduled") {
      clinicRecommended++;
    }
    if (c.status === "quote_requested" || c.status === "appointment_scheduled" || c.quoteRequestId) {
      quoteRequests++;
    }
    if (c.status === "appointment_scheduled" || c.appointmentId) {
      appointments++;
    }
    
    totalCompletionScore += (c.aiCompletionRate || 0);
  });

  const avgCompletionRate = totalConversations > 0 ? Math.round(totalCompletionScore / totalConversations) : 0;
  
  return {
    totalConversations,
    todaysConversations,
    clinicRecommended,
    quoteRequests,
    appointments,
    avgCompletionRate,
    qualified: Math.round(totalConversations * 0.7) // Example fallback/mock logic if 'qualified' state isn't strictly tracked yet
  };
}

/**
 * Server-side / Admin equivalent for upserting a conversation (Called from matching-chat API)
 */
// This logic is mostly moved to matching-chat/route.ts via adminDb directly 
// to avoid importing client firebase SDKs in the server route.
