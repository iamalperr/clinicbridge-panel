/**
 * Loads the top-level clinic runtime bundle (clinic profile, prompt settings, training
 * materials) into the in-process clinicRuntimeCache. Shared by Agent Core and the voice
 * pre-warm, so both read exactly the same data the same way.
 *
 * Keyed by clinicId only; carries no conversation or patient data.
 */

import {
  getClinicRuntimeCacheRemainingMs,
  setCachedClinicRuntime,
  type CachedClinicRuntimeBundle,
} from "./clinicRuntimeCache";

export type ClinicRuntime = Omit<CachedClinicRuntimeBundle, "fetchedAt">;

type DocData = Record<string, any>;

export interface ClinicRuntimeFirestore {
  collection(name: string): {
    doc(id: string): { get(): Promise<{ exists: boolean; data(): DocData | undefined }> };
    where(field: string, op: "==", value: string): {
      limit(n: number): { get(): Promise<{ docs: Array<{ id: string; data(): DocData }> }> };
    };
  };
}

export const CLINIC_RUNTIME_TRAINING_DOC_LIMIT = 250;

const inflight = new Map<string, Promise<ClinicRuntime | null>>();

async function readTopLevelClinicRuntime(
  adminDb: ClinicRuntimeFirestore,
  clinicId: string
): Promise<ClinicRuntime | null> {
  const [clinicSnap, promptSnap, materialsSnap] = await Promise.all([
    adminDb.collection("clinics").doc(clinicId).get(),
    adminDb.collection("promptSettings").doc(clinicId).get(),
    adminDb
      .collection("trainingMaterials")
      .where("clinicId", "==", clinicId)
      .limit(CLINIC_RUNTIME_TRAINING_DOC_LIMIT)
      .get(),
  ]);
  if (!clinicSnap.exists) return null;

  const cData = clinicSnap.data() ?? {};
  const runtime: ClinicRuntime = {
    clinicData: cData,
    clinicName: cData.name ?? "Klinik",
    clinicWhatsapp: cData.whatsappNumber ?? "",
    clinicTelegram: cData.telegramUsername ?? "",
    clinicLanguage: cData.language ?? "tr",
    promptSettings: promptSnap.exists ? promptSnap.data() : null,
    trainingDocs: materialsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title ?? "",
        content: data.content ?? "",
        embeddingChunks: data.embeddingChunks || [],
      };
    }),
  };
  setCachedClinicRuntime(clinicId, runtime);
  return runtime;
}

function startLoad(adminDb: ClinicRuntimeFirestore, clinicId: string): Promise<ClinicRuntime | null> {
  const load = readTopLevelClinicRuntime(adminDb, clinicId).finally(() => {
    if (inflight.get(clinicId) === load) inflight.delete(clinicId);
  });
  inflight.set(clinicId, load);
  return load;
}

/**
 * Read the top-level clinic runtime and cache it. Resolves null when no top-level clinic
 * document exists (agency clinics are resolved by Agent Core). Concurrent callers for the
 * same clinic share one read; a caller that joined a failed read retries once on its own.
 */
export function loadTopLevelClinicRuntime(
  adminDb: ClinicRuntimeFirestore,
  clinicId: string
): Promise<ClinicRuntime | null> {
  const pending = inflight.get(clinicId);
  if (pending) return pending.catch(() => startLoad(adminDb, clinicId));
  return startLoad(adminDb, clinicId);
}

export type ClinicRuntimeWarmOutcome = "FRESH" | "LOADED" | "NOT_TOP_LEVEL" | "FAILED";

/**
 * Best-effort pre-warm: loads only when the cached entry is missing or has less than
 * `minRemainingMs` left. Never throws.
 */
export async function warmClinicRuntime(
  adminDb: ClinicRuntimeFirestore,
  clinicId: string,
  options: { minRemainingMs: number }
): Promise<ClinicRuntimeWarmOutcome> {
  if (getClinicRuntimeCacheRemainingMs(clinicId) > options.minRemainingMs) return "FRESH";
  try {
    const loaded = await loadTopLevelClinicRuntime(adminDb, clinicId);
    return loaded ? "LOADED" : "NOT_TOP_LEVEL";
  } catch {
    return "FAILED";
  }
}

/** Test helper */
export function _clinicRuntimeInflightSize(): number {
  return inflight.size;
}
