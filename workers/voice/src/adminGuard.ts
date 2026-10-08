/**
 * Worker-only Firebase Admin fail-fast guard.
 *
 * The shared `getAdminDb()` returns null (and logs) when Admin cannot initialize, and several
 * Agent Core paths silently skip persistence on null. The worker must refuse to run instead.
 * There is deliberately no fallback to the Firebase client SDK.
 *
 * `getAdminDb()` logs raw initialization errors; those can carry credential fragments (for
 * example JSON parse errors on a malformed service account), so its console output is replaced
 * by a sanitized line for the duration of the synchronous call.
 */

import { getAdminDb } from "@/lib/firebase-admin";

/** Typed from the shared module so root and worker builds agree on a single firebase-admin copy. */
export type VoiceWorkerAdminDb = NonNullable<ReturnType<typeof getAdminDb>>;

export type VoiceWorkerStartupErrorCode =
  | "ADMIN_DB_UNAVAILABLE"
  | "ADMIN_DB_INIT_THROWN"
  | "ADMIN_DB_INVALID";

const STARTUP_ERROR_MESSAGES: Record<VoiceWorkerStartupErrorCode, string> = {
  ADMIN_DB_UNAVAILABLE: "Voice worker startup aborted: Firebase Admin Firestore is unavailable.",
  ADMIN_DB_INIT_THROWN: "Voice worker startup aborted: Firebase Admin initialization threw.",
  ADMIN_DB_INVALID: "Voice worker startup aborted: Firebase Admin returned an invalid Firestore handle.",
};

export class VoiceWorkerStartupError extends Error {
  readonly code: VoiceWorkerStartupErrorCode;

  constructor(code: VoiceWorkerStartupErrorCode) {
    super(STARTUP_ERROR_MESSAGES[code]);
    this.name = "VoiceWorkerStartupError";
    this.code = code;
  }
}

export interface VoiceWorkerAdminGuardDeps {
  getAdminDb?: () => VoiceWorkerAdminDb | null;
}

const FIREBASE_ADMIN_LOG_PREFIX = "[firebase-admin]";
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,63}$/;
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function safeErrorFields(args: readonly unknown[]): { errorName?: string; errorCode?: string } {
  const err = args.find((arg): arg is Error => arg instanceof Error);
  if (!err) return {};
  const code: unknown = (err as { code?: unknown }).code;
  return {
    errorName: SAFE_ERROR_NAME_PATTERN.test(err.name) ? err.name : undefined,
    errorCode: typeof code === "string" && SAFE_ERROR_CODE_PATTERN.test(code) ? code : undefined,
  };
}

function withSanitizedConsole<T>(fn: () => T): T {
  const originalError = console.error;
  const originalWarn = console.warn;
  const sanitized =
    (level: "error" | "warn", write: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const head = args[0];
      // Only the static prefix line authored in lib/firebase-admin.ts is kept; error objects are reduced.
      const message =
        typeof head === "string" && head.startsWith(FIREBASE_ADMIN_LOG_PREFIX)
          ? head
          : `${FIREBASE_ADMIN_LOG_PREFIX} log suppressed`;
      write(
        JSON.stringify({
          checkpoint: "VOICE_WORKER_ADMIN_INIT_LOG",
          level,
          message,
          ...safeErrorFields(args),
        })
      );
    };
  console.error = sanitized("error", originalError);
  console.warn = sanitized("warn", originalWarn);
  try {
    return fn();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function isFirestoreLike(value: unknown): value is VoiceWorkerAdminDb {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { collection?: unknown; runTransaction?: unknown };
  return typeof candidate.collection === "function" && typeof candidate.runTransaction === "function";
}

export function assertVoiceWorkerAdminDb(deps: VoiceWorkerAdminGuardDeps = {}): VoiceWorkerAdminDb {
  const resolve = deps.getAdminDb ?? getAdminDb;
  let db: VoiceWorkerAdminDb | null;
  try {
    db = withSanitizedConsole(resolve);
  } catch {
    throw new VoiceWorkerStartupError("ADMIN_DB_INIT_THROWN");
  }
  if (db === null || db === undefined) throw new VoiceWorkerStartupError("ADMIN_DB_UNAVAILABLE");
  if (!isFirestoreLike(db)) throw new VoiceWorkerStartupError("ADMIN_DB_INVALID");
  return db;
}
