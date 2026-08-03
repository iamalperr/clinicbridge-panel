/**
 * infrastructureErrors.ts
 *
 * Maps provider-level failures (Firestore/gRPC quota, availability, timeouts)
 * onto controlled API responses with a stable error code.
 *
 * Provider messages such as "8 RESOURCE_EXHAUSTED: Quota exceeded" must never
 * reach an end user: the client renders a localized message keyed off `code`.
 */

export type ServiceErrorCode =
  | "QUOTA_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

export interface MappedServiceError {
  status: number;
  code: ServiceErrorCode;
  /** Safe, generic text. Clients should localize from `code` instead. */
  error: string;
  /** Whether the same request may succeed later. Never implies auto-retry. */
  retryable: boolean;
}

/** gRPC status codes surfaced by firebase-admin. */
const GRPC_DEADLINE_EXCEEDED = 4;
const GRPC_RESOURCE_EXHAUSTED = 8;
const GRPC_UNAVAILABLE = 14;

/** String codes surfaced by the Firebase Web SDK. */
const WEB_RESOURCE_EXHAUSTED = "resource-exhausted";
const WEB_UNAVAILABLE = "unavailable";
const WEB_DEADLINE_EXCEEDED = "deadline-exceeded";

function readCode(err: any): number | string | null {
  if (!err || typeof err !== "object") return null;
  if (typeof err.code === "number") return err.code;
  if (typeof err.code === "string") return err.code.toLowerCase();
  return null;
}

function readMessage(err: any): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  return "";
}

export function isQuotaError(err: any): boolean {
  const code = readCode(err);
  if (code === GRPC_RESOURCE_EXHAUSTED || code === WEB_RESOURCE_EXHAUSTED) return true;
  return /RESOURCE_EXHAUSTED|quota exceeded|quota metric|too many requests/i.test(readMessage(err));
}

export function isUnavailableError(err: any): boolean {
  const code = readCode(err);
  if (code === GRPC_UNAVAILABLE || code === WEB_UNAVAILABLE) return true;
  return /UNAVAILABLE|service is currently unavailable/i.test(readMessage(err));
}

export function isTimeoutError(err: any): boolean {
  const code = readCode(err);
  if (code === GRPC_DEADLINE_EXCEEDED || code === WEB_DEADLINE_EXCEEDED) return true;
  return /DEADLINE_EXCEEDED|etimedout/i.test(readMessage(err));
}

/**
 * Never returns provider text. Callers are expected to log the original error
 * server-side and return only the mapped payload.
 */
export function mapInfrastructureError(err: any): MappedServiceError {
  if (isQuotaError(err)) {
    return {
      status: 429,
      code: "QUOTA_EXCEEDED",
      error: "Service temporarily rate limited. Please try again shortly.",
      retryable: true,
    };
  }

  if (isUnavailableError(err)) {
    return {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      error: "Service temporarily unavailable. Please try again shortly.",
      retryable: true,
    };
  }

  if (isTimeoutError(err)) {
    return {
      status: 503,
      code: "TIMEOUT",
      error: "The request timed out. Please try again shortly.",
      retryable: true,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    error: "Internal error",
    retryable: false,
  };
}
