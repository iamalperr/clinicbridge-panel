/**
 * Trusted SIP identity boundary for the LiveKit voice worker.
 *
 * Pure: no env, no logging, no I/O. Reads only the LiveKit-managed `sip.*` attributes of a
 * participant whose kind is SIP and returns the minimum needed to start a ClinicBridge call:
 *
 *   calledDid       ← attributes["sip.trunkPhoneNumber"] (raw; normalized later by resolveClinicByDid)
 *   externalCallKey ← "livekit-sip:" + attributes["sip.callID"]
 *
 * Never used and never returned: caller number (sip.phoneNumber), sip.callIDFull, room name,
 * participant identity, custom/header-mapped attributes, or the raw attributes object.
 */

import { deriveCallBindingId } from "@/lib/voice/telephony/callBinding";

/** Numeric value of `ParticipantKind.SIP` in @livekit/rtc-node; the worker asserts it at boot. */
export const LIVEKIT_SIP_PARTICIPANT_KIND = 3;

export const SIP_EXTERNAL_CALL_KEY_PREFIX = "livekit-sip:";

export const SIP_ATTRIBUTE_CALLED_DID = "sip.trunkPhoneNumber";
export const SIP_ATTRIBUTE_CALL_ID = "sip.callID";
export const SIP_ATTRIBUTE_TRUNK_ID = "sip.trunkID";
export const SIP_ATTRIBUTE_RULE_ID = "sip.ruleID";

/** Structural subset of a LiveKit RemoteParticipant. */
export interface SipParticipantLike {
  readonly kind?: number;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Optional operational allowlists.
 * - `undefined` → not enforced.
 * - non-empty   → the attribute must be present and an exact member.
 * - empty array → deny all (fail closed).
 */
export interface SipTrustPolicy {
  readonly allowedTrunkIds?: readonly string[];
  readonly allowedRuleIds?: readonly string[];
}

export type TrustedSipIdentityErrorCode =
  | "NOT_SIP_PARTICIPANT"
  | "CALLED_DID_MISSING"
  | "SIP_CALL_ID_MISSING"
  | "INVALID_SIP_CALL_ID"
  | "UNTRUSTED_TRUNK"
  | "UNTRUSTED_RULE";

export interface TrustedSipIdentity {
  ok: true;
  calledDid: string;
  externalCallKey: string;
  sipCallId: string;
  trunkId?: string;
  ruleId?: string;
}

export type TrustedSipIdentityResult =
  | TrustedSipIdentity
  | { ok: false; code: TrustedSipIdentityErrorCode };

function readAttribute(
  attributes: Readonly<Record<string, string>> | undefined,
  key: string
): string | undefined {
  if (!attributes || !Object.prototype.hasOwnProperty.call(attributes, key)) return undefined;
  const value: unknown = attributes[key];
  return typeof value === "string" ? value : undefined;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function passesAllowlist(value: string | undefined, allowlist: readonly string[] | undefined): boolean {
  if (allowlist === undefined) return true;
  return isPresent(value) && allowlist.includes(value);
}

export function extractTrustedSipIdentity(
  participant: SipParticipantLike,
  policy: SipTrustPolicy = {}
): TrustedSipIdentityResult {
  if (participant.kind !== LIVEKIT_SIP_PARTICIPANT_KIND) {
    return { ok: false, code: "NOT_SIP_PARTICIPANT" };
  }
  const attributes = participant.attributes;

  const calledDid = readAttribute(attributes, SIP_ATTRIBUTE_CALLED_DID);
  if (!isPresent(calledDid)) return { ok: false, code: "CALLED_DID_MISSING" };

  const sipCallId = readAttribute(attributes, SIP_ATTRIBUTE_CALL_ID);
  if (!isPresent(sipCallId)) return { ok: false, code: "SIP_CALL_ID_MISSING" };

  const externalCallKey = `${SIP_EXTERNAL_CALL_KEY_PREFIX}${sipCallId}`;
  if (deriveCallBindingId(externalCallKey) === null) {
    return { ok: false, code: "INVALID_SIP_CALL_ID" };
  }

  const trunkId = readAttribute(attributes, SIP_ATTRIBUTE_TRUNK_ID);
  if (!passesAllowlist(trunkId, policy.allowedTrunkIds)) return { ok: false, code: "UNTRUSTED_TRUNK" };

  const ruleId = readAttribute(attributes, SIP_ATTRIBUTE_RULE_ID);
  if (!passesAllowlist(ruleId, policy.allowedRuleIds)) return { ok: false, code: "UNTRUSTED_RULE" };

  const identity: TrustedSipIdentity = { ok: true, calledDid, externalCallKey, sipCallId };
  if (isPresent(trunkId)) identity.trunkId = trunkId;
  if (isPresent(ruleId)) identity.ruleId = ruleId;
  return identity;
}
