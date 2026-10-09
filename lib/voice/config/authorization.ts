/**
 * Voice settings authorization (deterministic; enforced in the service, not only the route).
 *
 * Allowed:
 *   - platform admins (superAdmin / admin): any clinic, incl. platform-only fields
 *   - clinicAdmin / clinicUser: only their own clinic (profile.clinicId must be set and equal)
 *     and only with the `clinic_voice` permission (explicit permissions, else role defaults)
 * Denied: suspended/pending users, agency roles (agency→clinic linkage is not verified here),
 * viewers, unknown roles. Stricter than requireClinicAccess, which admits clinic users that
 * have no clinicId and ignores permission tabs.
 */

import { DEFAULT_PERMISSIONS, type PermissionTab, type UserProfile, type UserRole } from "@/lib/types";
import type { VoiceSettingsActor } from "./types";

export const VOICE_PERMISSION: PermissionTab = "clinic_voice";

const CLINIC_ROLES: Readonly<Record<string, UserRole>> = { clinicadmin: "clinicAdmin", clinicuser: "clinicUser" };

export type VoiceAccessDecision =
  | { ok: true; actor: VoiceSettingsActor; isPlatformAdmin: boolean }
  | { ok: false; code: "VOICE_ACCESS_DENIED" };

function normalizedRole(role: unknown): string {
  return typeof role === "string" ? role.toLowerCase().replace(/_/g, "") : "";
}

export function authorizeVoiceSettingsAccess(
  uid: string,
  profile: Pick<UserProfile, "role" | "permissions" | "status" | "clinicId"> | null | undefined,
  clinicId: string
): VoiceAccessDecision {
  const denied = { ok: false, code: "VOICE_ACCESS_DENIED" } as const;
  if (!uid || !profile) return denied;
  if (profile.status === "suspended" || profile.status === "pending") return denied;

  const role = normalizedRole(profile.role);
  if (role === "superadmin" || role === "admin") {
    return { ok: true, actor: { uid, role: role === "admin" ? "admin" : "superAdmin" }, isPlatformAdmin: true };
  }

  const clinicRole = CLINIC_ROLES[role];
  if (!clinicRole) return denied;
  if (!profile.clinicId || profile.clinicId !== clinicId) return denied;
  const permissions =
    Array.isArray(profile.permissions) && profile.permissions.length > 0 ? profile.permissions : DEFAULT_PERMISSIONS[clinicRole];
  if (!permissions.includes(VOICE_PERMISSION)) return denied;
  return { ok: true, actor: { uid, role: clinicRole }, isPlatformAdmin: false };
}
