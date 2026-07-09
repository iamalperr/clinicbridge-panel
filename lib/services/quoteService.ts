/**
 * quoteService.ts
 *
 * Quote request CRUD operations.
 * Firestore path: agencies/{agencyId}/quotes/{quoteId}
 */

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { QuoteRequest, QuoteStatus } from "@/lib/types/matching";

export function subscribeToQuotes(
  agencyId: string,
  onData: (items: QuoteRequest[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "quotes"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuoteRequest)));
    },
    () => onData([])
  );
}

export async function createQuote(
  agencyId: string,
  data: Omit<QuoteRequest, "id" | "agencyId" | "createdAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "quotes");
  const docRef = doc(colRef);
  await setDoc(docRef, {
    ...data,
    agencyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateQuoteStatus(
  agencyId: string,
  quoteId: string,
  status: QuoteStatus,
  extra?: Partial<QuoteRequest>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId, "quotes", quoteId), {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  });
}
