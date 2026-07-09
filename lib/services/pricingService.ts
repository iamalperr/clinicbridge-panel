/**
 * pricingService.ts
 *
 * Clinic treatment pricing CRUD.
 * Firestore path: agencies/{agencyId}/pricing/{pricingId}
 */

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClinicTreatmentPrice } from "@/lib/types/matching";

export function subscribeToPricing(
  agencyId: string,
  onData: (items: ClinicTreatmentPrice[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "pricing"),
    orderBy("category", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClinicTreatmentPrice)));
    },
    () => onData([])
  );
}

export async function createPricing(
  agencyId: string,
  data: Omit<ClinicTreatmentPrice, "id" | "agencyId" | "createdAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "pricing");
  const docRef = doc(colRef);
  await setDoc(docRef, {
    ...data,
    agencyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updatePricing(
  agencyId: string,
  pricingId: string,
  data: Partial<ClinicTreatmentPrice>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId, "pricing", pricingId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePricing(
  agencyId: string,
  pricingId: string
): Promise<void> {
  await deleteDoc(doc(db, "agencies", agencyId, "pricing", pricingId));
}
