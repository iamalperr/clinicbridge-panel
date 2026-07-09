/**
 * treatmentService.ts
 *
 * Treatment catalog CRUD operations.
 * Firestore path: agencies/{agencyId}/treatments/{treatmentId}
 */

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { TreatmentCatalogItem } from "@/lib/types/matching";

export function subscribeToTreatments(
  agencyId: string,
  onData: (items: TreatmentCatalogItem[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "treatments"),
    orderBy("category", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TreatmentCatalogItem)));
    },
    () => onData([])
  );
}

export async function createTreatment(
  agencyId: string,
  data: Omit<TreatmentCatalogItem, "id" | "agencyId" | "createdAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "treatments");
  const docRef = doc(colRef);
  await setDoc(docRef, {
    ...data,
    agencyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTreatment(
  agencyId: string,
  treatmentId: string,
  data: Partial<TreatmentCatalogItem>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId, "treatments", treatmentId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTreatment(
  agencyId: string,
  treatmentId: string
): Promise<void> {
  await deleteDoc(doc(db, "agencies", agencyId, "treatments", treatmentId));
}
