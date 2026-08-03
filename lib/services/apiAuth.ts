/**
 * apiAuth.ts
 *
 * Reusable auth helpers for API route handlers.
 * Verifies Firebase Auth token, fetches user profile,
 * and enforces role + clinic access checks.
 */

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { UserProfile } from "@/lib/types";

export interface AuthResult {
  uid: string;
  profile: UserProfile;
}

/**
 * Extracts and verifies the Firebase Auth token from the Authorization header.
 * Returns the user's UID and Firestore profile.
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    throw new AuthError("Auth service unavailable", 503);
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new AuthError("Database service unavailable", 503);
  }

  let profile: UserProfile | null = null;

  // 1. Try direct doc(uid)
  const userDoc = await adminDb.collection("users").doc(uid).get();
  if (userDoc.exists) {
    profile = { id: userDoc.id, ...userDoc.data() } as UserProfile;
  } else {
    // 2. Try where("uid", "==", uid)
    const byUidSnap = await adminDb.collection("users").where("uid", "==", uid).limit(1).get();
    if (!byUidSnap.empty) {
      profile = { id: byUidSnap.docs[0].id, ...byUidSnap.docs[0].data() } as UserProfile;
    } else if (email) {
      // 3. Try where("email", "==", email)
      const byEmailSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
      if (!byEmailSnap.empty) {
        profile = { id: byEmailSnap.docs[0].id, ...byEmailSnap.docs[0].data() } as UserProfile;
      }
    }
  }

  if (!profile) {
    throw new AuthError("User profile not found", 403);
  }

  return { uid, profile };
}

/**
 * Verifies auth and ensures user is a Super Admin.
 */
export async function requireSuperAdmin(req: Request): Promise<AuthResult> {
  const result = await verifyAuth(req);
  const rawRole = (result.profile?.role || "").toLowerCase().replace(/_/g, "");
  if (rawRole !== "superadmin" && rawRole !== "admin") {
    throw new AuthError("Super Admin access required", 403);
  }
  return result;
}

/**
 * Verifies auth and ensures user has access to the specified clinic.
 * - Super Admins can access any clinic.
 * - Clinic Admins/Users can only access their own clinic.
 */
export async function requireClinicAccess(
  req: Request,
  clinicId: string
): Promise<AuthResult> {
  const result = await verifyAuth(req);
  const rawRole = (result.profile?.role || "").toLowerCase().replace(/_/g, "");
  const userClinicId = result.profile?.clinicId;

  // Super admins can access any clinic
  if (rawRole === "superadmin" || rawRole === "admin") {
    return result;
  }

  // Clinic roles can only access their own clinic
  if (
    (rawRole === "clinicadmin" || rawRole === "clinicuser" || rawRole === "user") &&
    (!userClinicId || userClinicId === clinicId)
  ) {
    return result;
  }

  throw new AuthError("Access denied to this clinic", 403);
}

/**
 * Verifies auth and ensures user has access to the specified agency.
 * - Super Admins can access any agency.
 * - Agency Admins/Users can only access their own agency.
 */
export async function requireAgencyAccess(
  req: Request,
  agencyId: string
): Promise<AuthResult> {
  const result = await verifyAuth(req);
  const rawRole = (result.profile?.role || "").toLowerCase().replace(/_/g, "");
  const userAgencyId = result.profile?.agencyId;

  if (rawRole === "superadmin" || rawRole === "admin") {
    return result;
  }

  if (
    (rawRole === "agencyadmin" || rawRole === "agencyuser" || rawRole === "user") &&
    (!userAgencyId || userAgencyId === agencyId)
  ) {
    return result;
  }

  throw new AuthError("Access denied to this agency", 403);
}

/**
 * Check if the user can see cost information for a clinic.
 * - Super Admins always see costs.
 * - Clinic Admins see costs if showCostToClinicUsers is enabled.
 * - Clinic Users never see costs (unless showCostToClinicUsers is enabled).
 */
export async function canSeeCosts(
  profile: UserProfile,
  clinicId: string
): Promise<boolean> {
  if (profile.role === "superAdmin" || profile.role === "admin") {
    return true;
  }

  const adminDb = getAdminDb();
  if (!adminDb) return false;

  const clinicDoc = await adminDb.collection("clinics").doc(clinicId).get();
  if (!clinicDoc.exists) return false;

  const settings = clinicDoc.data()?.aiUsageSettings;
  return settings?.showCostToClinicUsers === true;
}

/**
 * Custom error class for auth failures with HTTP status codes.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
