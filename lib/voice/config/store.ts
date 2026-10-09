/**
 * Minimal structural Firestore surface for the voice control plane. firebase-admin's
 * `Firestore` satisfies it; tests supply an in-memory fake.
 */

import { VOICE_PROFILES_COLLECTION, type VoiceProfile } from "./types";
import { BUILTIN_VOICE_PROFILES, isBuiltinVoiceProfileId, isValidVoiceProfileId, parseStoredVoiceProfile } from "./voiceProfiles";

export interface VoiceDocSnapshot {
  readonly exists: boolean;
  readonly id: string;
  data(): unknown;
}

export interface VoiceDocRef {
  readonly id: string;
  get(): Promise<VoiceDocSnapshot>;
  collection(path: string): VoiceCollectionRef;
}

export interface VoiceQuery {
  get(): Promise<{ readonly docs: readonly VoiceDocSnapshot[] }>;
}

export interface VoiceCollectionRef extends VoiceQuery {
  doc(id?: string): VoiceDocRef;
  where(field: string, op: "==", value: unknown): VoiceQuery;
}

export interface VoiceTransaction {
  get(ref: VoiceDocRef): Promise<VoiceDocSnapshot>;
  set(ref: VoiceDocRef, data: Record<string, unknown>): unknown;
  update(ref: VoiceDocRef, data: Record<string, unknown>): unknown;
  create(ref: VoiceDocRef, data: Record<string, unknown>): unknown;
}

export interface VoiceConfigFirestore {
  collection(path: string): VoiceCollectionRef;
  runTransaction<T>(fn: (tx: VoiceTransaction) => Promise<T>): Promise<T>;
}

/** Read-only subset used by the resolver. */
export interface VoiceConfigReadFirestore {
  collection(path: string): { doc(id: string): { get(): Promise<{ exists: boolean; data(): unknown }> } };
}

/** Loaded profile: the profile, "INVALID" for a malformed document, null when absent. */
export type LoadedVoiceProfile = VoiceProfile | "INVALID" | null;

/** Loads the given ids (built-ins from code, others from voiceProfiles). Read errors propagate. */
export async function loadVoiceProfiles(
  db: VoiceConfigReadFirestore,
  ids: readonly string[]
): Promise<Map<string, LoadedVoiceProfile>> {
  const out = new Map<string, LoadedVoiceProfile>();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      if (isBuiltinVoiceProfileId(id)) {
        out.set(id, BUILTIN_VOICE_PROFILES[id]);
        return;
      }
      if (!isValidVoiceProfileId(id)) {
        out.set(id, null);
        return;
      }
      const snap = await db.collection(VOICE_PROFILES_COLLECTION).doc(id).get();
      out.set(id, snap.exists ? (parseStoredVoiceProfile(id, snap.data()) ?? "INVALID") : null);
    })
  );
  return out;
}
