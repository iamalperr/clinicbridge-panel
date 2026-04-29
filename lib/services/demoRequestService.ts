import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/* ─── Types ─────────────────────────────────────────────── */

export type DemoRequestStatus = "new" | "contacted" | "qualified" | "closed";

export interface DemoRequestData {
  fullName: string;
  clinicName: string;
  phone: string;
  email: string;
  website: string;
  message: string;
}

export interface DemoRequest extends DemoRequestData {
  id: string;
  source: "landing";
  status: DemoRequestStatus;
  createdAt: Timestamp | null;
}

/* ─── Submit (public — called from landing page) ─────────── */

export async function submitDemoRequest(data: DemoRequestData): Promise<void> {
  const res = await fetch("/api/demo-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

/* ─── Fetch all (admin only) ─────────────────────────────── */

export async function fetchDemoRequests(): Promise<DemoRequest[]> {
  const q = query(
    collection(db, "demoRequests"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DemoRequest, "id">),
  }));
}

/* ─── Update status (admin only) ────────────────────────── */

export async function updateDemoRequestStatus(
  id: string,
  status: DemoRequestStatus
): Promise<void> {
  await updateDoc(doc(db, "demoRequests", id), { status });
}
