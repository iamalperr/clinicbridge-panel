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
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new AuthError("Database service unavailable", 503);
  }

  const userDoc = await adminDb.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new AuthError("User profile not found", 403);
  }

  const profile = { id: uid, ...userDoc.data() } as UserProfile;
  return { uid, profile };
}

/**
 * Verifies auth and ensures user is a Super Admin.
 */
export async function requireSuperAdmin(req: Request): Promise<AuthResult> {
  const result = await verifyAuth(req);
  if (result.profile.role !== "superAdmin" && result.profile.role !== "admin") {
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
  const { role, clinicId: userClinicId } = result.profile;

  // Super admins can access any clinic
  if (role === "superAdmin" || role === "admin") {
    return result;
  }

  // Clinic roles can only access their own clinic
  if (
    (role === "clinicAdmin" || role === "clinicUser") &&
    userClinicId === clinicId
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
  const { role, agencyId: userAgencyId } = result.profile;

  if (role === "superAdmin" || role === "admin") {
    return result;
  }

  if (
    (role === "agencyAdmin" || role === "agencyUser") &&
    userAgencyId === agencyId
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
