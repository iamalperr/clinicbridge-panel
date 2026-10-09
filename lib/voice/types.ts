/**
 * Provider-independent Voice Adapter types (Phase 2).
 * Text turns only — no telephony, STT, TTS, or audio concepts.
 */

import type { AppointmentData, AppointmentState } from "@/lib/agent/types";
import type { RuntimeLeaseErrorCode, RuntimeLeaseProof } from "./runtime/runtimeLease";
import type { AllocateTurnIdResult } from "./telephony/callBinding";

export type CallSessionStatus = "STARTED" | "ACTIVE" | "COMPLETED" | "FAILED";

export type VoiceErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_ENDED"
  | "CLINIC_NOT_FOUND"
  | "EMPTY_TRANSCRIPT"
  | "CLINIC_MISMATCH"
  | "AGENT_ERROR";

export interface CallSession {
  callSessionId: string;
  clinicId: string;
  conversationId: string;
  channel: "voice";
  status: CallSessionStatus;
  startedAt: string;
  lastActivityAt: string;
  endedAt?: string;
  callerE164?: string;
  locale?: string;
  /** Processed turn idempotency keys (bounded). */
  processedTurnIds: string[];
  /** Cached results for idempotent turn replays (turnId → result). */
  turnResultCache?: Record<string, VoiceTurnResult>;
}

export interface StartCallSessionInput {
  clinicId: string;
  callerE164?: string;
  locale?: string;
  /** Optional stable conversation id; otherwise generated. */
  conversationId?: string;
}

export interface StartCallSessionResult {
  ok: true;
  callSessionId: string;
  conversationId: string;
  clinicId: string;
  channel: "voice";
  status: CallSessionStatus;
}

export interface VoiceTurnInput {
  callSessionId: string;
  text: string;
  /** Optional idempotency key for provider retries. */
  turnId?: string;
  locale?: string;
  /** Optional soft check — must match session.clinicId when provided. */
  clinicId?: string;
}

/**
 * Read-only turn context loaded ahead of processVoiceTurn (in parallel with turn id
 * allocation). Never rejects; processVoiceTurn validates it against the session it describes.
 */
export interface VoiceTurnPrefetch {
  callSessionId: string;
  clinicId: string;
  conversationId: string;
  session: { ok: true; value: CallSession | null } | { ok: false; error: unknown };
  history: { ok: true; value: Array<{ role: "user" | "assistant"; content: string }> } | { ok: false };
  sessionReadMs: number;
  historyMs: number;
}

export interface ProcessVoiceTurnOptions {
  prefetch?: Promise<VoiceTurnPrefetch>;
}

export type VoiceTurnLeaseErrorCode = RuntimeLeaseErrorCode;

/**
 * Runtime-lease ownership check verified in the same transaction that allocates the turn id.
 * `proof` is the controller's in-memory lease handle; it is never logged or persisted.
 */
export interface VoiceTurnLeaseCheck {
  proof: RuntimeLeaseProof;
  minRemainingMs: number;
}

export type LeasedTurnAllocationResult =
  | AllocateTurnIdResult
  | { ok: false; code: "TURN_LEASE_REJECTED"; leaseCode: VoiceTurnLeaseErrorCode };

export interface VoiceTurnEscalation {
  kind: "live_support";
}

export interface VoiceTurnResult {
  ok: true;
  callSessionId: string;
  conversationId: string;
  clinicId: string;
  channel: "voice";
  replyText: string;
  locale?: string;
  appointmentState?: AppointmentState;
  appointmentDraft?: Partial<AppointmentData> | null;
  appointmentCreated?: boolean;
  appointmentId?: string;
  escalationRequested?: boolean;
  escalation?: VoiceTurnEscalation;
  /** True when this turnId was already processed and the cached result is returned. */
  idempotentReplay?: boolean;
  endCallSuggested?: boolean;
}

export interface VoiceErrorResult {
  ok: false;
  errorCode: VoiceErrorCode;
  message: string;
  callSessionId?: string;
  clinicId?: string;
  conversationId?: string;
}

export type VoiceAdapterResult = StartCallSessionResult | VoiceTurnResult | VoiceErrorResult;

export interface EndCallSessionInput {
  callSessionId: string;
  clinicId?: string;
  reason?: "completed" | "failed" | "abandoned";
}

export interface EndCallSessionResult {
  ok: true;
  callSessionId: string;
  conversationId: string;
  clinicId: string;
  status: CallSessionStatus;
}
