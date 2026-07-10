/**
 * agencyService.ts
 *
 * Agency CRUD operations and clinic association management.
 * Uses Firestore client SDK for real-time dashboard operations.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Agency,
  AgencyClinic,
  AgencyDashboardMetrics,
  Lead,
  LeadStatus,
  TreatmentCategory,
  EMPTY_AGENCY_METRICS,
} from "@/lib/types/agency";

// ─── Agency CRUD ────────────────────────────────────────────────────────────

export async function getAgency(agencyId: string): Promise<Agency | null> {
  const snap = await getDoc(doc(db, "agencies", agencyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Agency;
}

export function subscribeToAllAgencies(
  onData: (agencies: Agency[]) => void
): () => void {
  const q = query(collection(db, "agencies"), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Agency)));
    },
    () => onData([])
  );
}

export async function createAgency(
  data: Omit<Agency, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies");
  const docRef = doc(colRef);
  await setDoc(docRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export function subscribeToAgency(
  agencyId: string,
  onData: (agency: Agency | null) => void
): () => void {
  return onSnapshot(
    doc(db, "agencies", agencyId),
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() } as Agency);
      } else {
        onData(null);
      }
    },
    () => onData(null)
  );
}

export async function updateAgency(
  agencyId: string,
  data: Partial<Omit<Agency, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Agency Clinics ─────────────────────────────────────────────────────────

export function subscribeToAgencyClinics(
  agencyId: string,
  onData: (clinics: AgencyClinic[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "clinics"),
    orderBy("priority", "asc")
  );

  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AgencyClinic[]
      );
    },
    () => onData([])
  );
}

// Helper: recursively strip undefined values (Firestore rejects them)
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

export async function addClinicToAgency(
  agencyId: string,
  clinicData: Omit<AgencyClinic, "id" | "addedAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "clinics");
  const docRef = doc(colRef);
  const cleanData = stripUndefined(clinicData as Record<string, any>);
  await setDoc(docRef, {
    ...cleanData,
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function removeClinicFromAgency(
  agencyId: string,
  docId: string
): Promise<void> {
  await deleteDoc(doc(db, "agencies", agencyId, "clinics", docId));
}

export async function updateAgencyClinic(
  agencyId: string,
  docId: string,
  data: Partial<AgencyClinic>
): Promise<void> {
  const cleanData = stripUndefined(data as Record<string, any>);
  await updateDoc(doc(db, "agencies", agencyId, "clinics", docId), {
    ...cleanData,
    updatedAt: serverTimestamp(),
  });
}

// ─── Dashboard Metrics (realtime) ───────────────────────────────────────────

export function subscribeToAgencyDashboard(
  agencyId: string,
  onMetrics: (metrics: AgencyDashboardMetrics) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "leads"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const leads = snap.docs.map((d) => d.data() as Lead);

      const metrics: AgencyDashboardMetrics = {
        totalLeads: leads.length,
        newLeads: leads.filter((l) => l.status === "new").length,
        assignedLeads: leads.filter((l) => l.status === "assigned_to_clinic").length,
        convertedLeads: leads.filter((l) => l.status === "converted").length,
        lostLeads: leads.filter((l) => l.status === "lost").length,
        leadsByCategory: {} as Record<TreatmentCategory, number>,
        leadsByCountry: {},
        leadsByLanguage: {},
        leadsByStatus: {} as Record<LeadStatus, number>,
      };

      for (const lead of leads) {
        // By category
        const cat = lead.treatmentCategory || "other";
        metrics.leadsByCategory[cat as TreatmentCategory] =
          (metrics.leadsByCategory[cat as TreatmentCategory] || 0) + 1;

        // By country
        const country = lead.country || "Unknown";
        metrics.leadsByCountry[country] = (metrics.leadsByCountry[country] || 0) + 1;

        // By language
        const lang = lead.language || "en";
        metrics.leadsByLanguage[lang] = (metrics.leadsByLanguage[lang] || 0) + 1;

        // By status
        const st = lead.status || "new";
        metrics.leadsByStatus[st as LeadStatus] =
          (metrics.leadsByStatus[st as LeadStatus] || 0) + 1;
      }

      onMetrics(metrics);
    },
    () => {
      onMetrics({
        totalLeads: 0,
        newLeads: 0,
        assignedLeads: 0,
        convertedLeads: 0,
        lostLeads: 0,
        leadsByCategory: {} as Record<TreatmentCategory, number>,
        leadsByCountry: {},
        leadsByLanguage: {},
        leadsByStatus: {} as Record<LeadStatus, number>,
      });
    }
  );
}

// ─── Clinic Treatment Pricing ───────────────────────────────────────────────

import type { ClinicTreatmentPricing } from "@/lib/types/agency";

export function subscribeToClinicPricing(
  agencyId: string,
  clinicDocId: string,
  onData: (pricing: ClinicTreatmentPricing[]) => void
): () => void {
  const q = query(
    collection(db, "agencies", agencyId, "clinics", clinicDocId, "pricing"),
    orderBy("treatmentName", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ClinicTreatmentPricing[]);
    },
    () => onData([])
  );
}

export async function addClinicPricing(
  agencyId: string,
  clinicDocId: string,
  data: Omit<ClinicTreatmentPricing, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const colRef = collection(db, "agencies", agencyId, "clinics", clinicDocId, "pricing");
  const docRef = doc(colRef);
  await setDoc(docRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateClinicPricing(
  agencyId: string,
  clinicDocId: string,
  pricingId: string,
  data: Partial<ClinicTreatmentPricing>
): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId, "clinics", clinicDocId, "pricing", pricingId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClinicPricing(
  agencyId: string,
  clinicDocId: string,
  pricingId: string
): Promise<void> {
  await deleteDoc(doc(db, "agencies", agencyId, "clinics", clinicDocId, "pricing", pricingId));
}

// ─── ClinicBridge Clinic Listing (for link mode) ────────────────────────────

export async function getClinicBridgeClinics(): Promise<
  { id: string; name: string; domain?: string; status?: string }[]
> {
  // Main admin panel uses collection "clinics" — same source
  const snap = await getDocs(collection(db, "clinics"));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || d.id,
      domain: data.domain || undefined,
      status: data.status || undefined,
    };
  });
}
