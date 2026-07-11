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

/** Remove undefined values recursively — Firestore rejects undefined. */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && typeof value.toDate !== "function") {
      result[key] = stripUndefined(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function subscribeToPricing(
  agencyId: string,
  onData: (items: ClinicTreatmentPrice[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "pricing"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClinicTreatmentPrice)));
    },
    (error) => {
      console.error("[pricingService] subscribeToPricing error:", error);
      onData([]);
    }
  );
}

export async function createPricing(
  agencyId: string,
  data: Partial<ClinicTreatmentPrice>
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "pricing");
  const docRef = doc(colRef);
  const cleanData = stripUndefined({
    ...data,
    agencyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log("[pricingService] createPricing payload:", cleanData);
  await setDoc(docRef, cleanData);
  return docRef.id;
}

export async function updatePricing(
  agencyId: string,
  pricingId: string,
  data: Partial<ClinicTreatmentPrice>
): Promise<void> {
  const cleanData = stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  });
  console.log("[pricingService] updatePricing payload:", cleanData);
  await updateDoc(doc(db, "agencies", agencyId, "pricing", pricingId), cleanData);
}

export async function deletePricing(
  agencyId: string,
  pricingId: string
): Promise<void> {
  await deleteDoc(doc(db, "agencies", agencyId, "pricing", pricingId));
}
