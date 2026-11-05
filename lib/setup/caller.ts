import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { DocumentData, Firestore } from "firebase-admin/firestore";

export interface ClinicCaller {
  db: Firestore;
  uid: string;
  clinicId: string;
  email: string;
  name: string;
  language: "tr" | "en";
  clinic: DocumentData;
}

export async function requireClinicCaller(req: Request): Promise<{ caller: ClinicCaller } | { error: NextResponse }> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  if (!adminAuth || !db) {
    return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  }
  let uid = "";
  try {
    uid = (await adminAuth.verifyIdToken(header.slice("Bearer ".length))).uid;
  } catch {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.data();
  const clinicId = typeof user?.clinicId === "string" ? user.clinicId : "";
  if (!clinicId) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const clinicSnap = await db.collection("clinics").doc(clinicId).get();
  if (!clinicSnap.exists) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const clinic = clinicSnap.data() || {};
  return {
    caller: {
      db,
      uid,
      clinicId,
      email: typeof user?.email === "string" ? user.email : "",
      name: typeof user?.name === "string" ? user.name : "",
      language: clinic.language === "en" ? "en" : "tr",
      clinic,
    },
  };
}
