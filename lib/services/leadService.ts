/**
 * leadService.ts
 *
 * Lead CRUD operations, status management, and clinic assignment.
 * Used by both the Agency Portal UI and API routes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Lead,
  LeadStatus,
  LeadStatusHistoryEntry,
  TreatmentCategory,
  LeadUrgency,
  LeadSource,
} from "@/lib/types/agency";

// ─── Lead CRUD ──────────────────────────────────────────────────────────────

export async function getLead(
  agencyId: string,
  leadId: string
): Promise<Lead | null> {
  const snap = await getDoc(
    doc(db, "agencies", agencyId, "leads", leadId)
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Lead;
}

export function subscribeToLead(
  agencyId: string,
  leadId: string,
  onData: (lead: Lead | null) => void
): () => void {
  return onSnapshot(
    doc(db, "agencies", agencyId, "leads", leadId),
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() } as Lead);
      } else {
        onData(null);
      }
    },
    () => onData(null)
  );
}

export interface CreateLeadInput {
  agencyId: string;
  patientName?: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  country: string;
  language: string;
  treatmentCategory: TreatmentCategory;
  treatmentSubcategory?: string;
  urgency?: LeadUrgency;
  conversationSummary: string;
  conversationId?: string;
  aiExtractedNotes?: string;
  consentStatus?: "accepted" | "declined" | "pending";
  source: LeadSource;
  sourceUrl?: string;
}

export async function createLead(input: CreateLeadInput): Promise<string> {
  const colRef = collection(db, "agencies", input.agencyId, "leads");
  const docRef = doc(colRef);

  const lead: Omit<Lead, "id"> = {
    agencyId: input.agencyId,
    clinicId: null,
    assignedClinicName: undefined,
    patientName: input.patientName ?? null,
    patientEmail: input.patientEmail ?? null,
    patientPhone: input.patientPhone ?? null,
    country: input.country,
    language: input.language,
    treatmentCategory: input.treatmentCategory,
    treatmentSubcategory: input.treatmentSubcategory,
    urgency: input.urgency ?? "medium",
    conversationSummary: input.conversationSummary,
    conversationId: input.conversationId,
    aiExtractedNotes: input.aiExtractedNotes,
    consentStatus: input.consentStatus ?? "pending",
    consentTimestamp: input.consentStatus === "accepted" ? serverTimestamp() : undefined,
    status: "new",
    statusHistory: [
      {
        status: "new",
        changedAt: new Date().toISOString(),
        note: "Lead created",
      },
    ],
    source: input.source,
    sourceUrl: input.sourceUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, lead);
  return docRef.id;
}

// ─── Lead Status Update ─────────────────────────────────────────────────────

export async function updateLeadStatus(
  agencyId: string,
  leadId: string,
  newStatus: LeadStatus,
  changedBy?: string,
  note?: string
): Promise<void> {
  const leadRef = doc(db, "agencies", agencyId, "leads", leadId);
  const snap = await getDoc(leadRef);
  if (!snap.exists()) throw new Error("Lead not found");

  const current = snap.data() as Lead;
  const historyEntry: LeadStatusHistoryEntry = {
    status: newStatus,
    changedAt: new Date().toISOString(),
    changedBy,
    note,
  };

  await updateDoc(leadRef, {
    status: newStatus,
    statusHistory: [...(current.statusHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  });
}

// ─── Clinic Assignment ──────────────────────────────────────────────────────

export async function assignLeadToClinic(
  agencyId: string,
  leadId: string,
  clinicId: string,
  clinicName: string,
  assignedBy?: string
): Promise<void> {
  const leadRef = doc(db, "agencies", agencyId, "leads", leadId);
  const snap = await getDoc(leadRef);
  if (!snap.exists()) throw new Error("Lead not found");

  const current = snap.data() as Lead;
  const historyEntry: LeadStatusHistoryEntry = {
    status: "assigned_to_clinic",
    changedAt: new Date().toISOString(),
    changedBy: assignedBy,
    note: `Assigned to ${clinicName}`,
  };

  await updateDoc(leadRef, {
    clinicId,
    assignedClinicName: clinicName,
    status: "assigned_to_clinic",
    statusHistory: [...(current.statusHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  });
}

// ─── Lead Update (general fields) ───────────────────────────────────────────

export async function updateLead(
  agencyId: string,
  leadId: string,
  data: Partial<Pick<Lead, "patientName" | "patientEmail" | "patientPhone" | "country" | "language" | "treatmentCategory" | "treatmentSubcategory" | "urgency" | "aiExtractedNotes">>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId, "leads", leadId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Realtime Lead List ─────────────────────────────────────────────────────

export function subscribeToLeads(
  agencyId: string,
  onData: (leads: Lead[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "leads"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Lead[]
      );
    },
    () => onData([])
  );
}
