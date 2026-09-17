/**
 * Clinic runtime helpers for the single-clinic Agent Core.
 */
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  mapClinicDoctorRecords,
  type ClinicDoctorMatchInput,
} from "@/lib/appointment/requestedDoctorPreference";

export async function fetchClinicDoctorMatchInputs(params: {
  adminDb: any;
  clinicId?: string;
  actualClinicId?: string;
  isAgencyClinic?: boolean;
  agencyIdForClinic?: string | null;
}): Promise<ClinicDoctorMatchInput[]> {
  const { adminDb, clinicId, actualClinicId, isAgencyClinic, agencyIdForClinic } = params;
  if (!adminDb) return [];
  const docId = actualClinicId || clinicId;
  if (!docId) return [];
  try {
    const snap =
      isAgencyClinic && agencyIdForClinic
        ? await adminDb
            .collection("agencies")
            .doc(agencyIdForClinic)
            .collection("clinics")
            .doc(docId)
            .collection("doctors")
            .where("is_active", "==", true)
            .get()
        : await adminDb.collection("clinics").doc(docId).collection("doctors").where("is_active", "==", true).get();
    return mapClinicDoctorRecords(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  } catch {
    return [];
  }
}

/* ── Client-side Firebase (for READS only — reads work without auth in most rules) ── */
export function getClientDb() {
  const cfg = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) return null;
  try {
    const existing = getApps().find(a => a.name === "chat-api");
    const app = existing ?? initializeApp(cfg, "chat-api");
    return getFirestore(app);
  } catch {
    return null;
  }
}
