/**
 * Voice worker configuration, parsed from an explicitly passed env record (no global reads).
 *
 * `LIVEKIT_AGENT_NAME` (official LiveKit name) is required: an empty agent name makes LiveKit
 * dispatch the worker to every new room in the project, so the worker fails closed instead.
 *
 * Optional SIP allowlists (comma-separated LiveKit IDs):
 *   CLINICBRIDGE_VOICE_ALLOWED_SIP_TRUNK_IDS, CLINICBRIDGE_VOICE_ALLOWED_SIP_RULE_IDS
 * Unset → not enforced. Set (even to "") → enforced; an empty list denies every call.
 */

import type { SipTrustPolicy } from "./sipIdentity";

export const VOICE_WORKER_AGENT_NAME_ENV = "LIVEKIT_AGENT_NAME";
export const VOICE_WORKER_ALLOWED_TRUNK_IDS_ENV = "CLINICBRIDGE_VOICE_ALLOWED_SIP_TRUNK_IDS";
export const VOICE_WORKER_ALLOWED_RULE_IDS_ENV = "CLINICBRIDGE_VOICE_ALLOWED_SIP_RULE_IDS";

const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type VoiceWorkerConfigErrorCode = "AGENT_NAME_MISSING" | "AGENT_NAME_INVALID";

export class VoiceWorkerConfigError extends Error {
  readonly code: VoiceWorkerConfigErrorCode;

  constructor(code: VoiceWorkerConfigErrorCode) {
    super(
      code === "AGENT_NAME_MISSING"
        ? `Voice worker config error: ${VOICE_WORKER_AGENT_NAME_ENV} is required (explicit dispatch only).`
        : `Voice worker config error: ${VOICE_WORKER_AGENT_NAME_ENV} has an invalid format.`
    );
    this.name = "VoiceWorkerConfigError";
    this.code = code;
  }
}

export interface VoiceWorkerConfig {
  agentName: string;
  sipTrust: SipTrustPolicy;
}

type EnvRecord = Readonly<Record<string, string | undefined>>;

function parseAllowlist(raw: string | undefined): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function readVoiceWorkerConfig(env: EnvRecord): VoiceWorkerConfig {
  const agentName = env[VOICE_WORKER_AGENT_NAME_ENV]?.trim();
  if (!agentName) throw new VoiceWorkerConfigError("AGENT_NAME_MISSING");
  if (!AGENT_NAME_PATTERN.test(agentName)) throw new VoiceWorkerConfigError("AGENT_NAME_INVALID");

  const sipTrust: { allowedTrunkIds?: readonly string[]; allowedRuleIds?: readonly string[] } = {};
  const allowedTrunkIds = parseAllowlist(env[VOICE_WORKER_ALLOWED_TRUNK_IDS_ENV]);
  const allowedRuleIds = parseAllowlist(env[VOICE_WORKER_ALLOWED_RULE_IDS_ENV]);
  if (allowedTrunkIds !== undefined) sipTrust.allowedTrunkIds = allowedTrunkIds;
  if (allowedRuleIds !== undefined) sipTrust.allowedRuleIds = allowedRuleIds;

  return { agentName, sipTrust };
}
