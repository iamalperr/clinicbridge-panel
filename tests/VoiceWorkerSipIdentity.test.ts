import { describe, expect, it } from "vitest";
import { deriveCallBindingId } from "@/lib/voice/telephony/callBinding";
import {
  extractTrustedSipIdentity,
  LIVEKIT_SIP_PARTICIPANT_KIND,
  SIP_EXTERNAL_CALL_KEY_PREFIX,
  type SipParticipantLike,
} from "@/workers/voice/src/sipIdentity";

const DID = "+908502428852";
const CALLER = "+905321112233";
const CALL_ID = "SCL_7hQk2mZpX9aB";
const TRUNK_ID = "ST_inboundVerimor01";
const RULE_ID = "SDR_clinicbridgeRule01";
const STANDARD_KIND = 0;

function sipParticipant(
  attributes: Record<string, string>,
  extra: Record<string, unknown> = {}
): SipParticipantLike {
  return { kind: LIVEKIT_SIP_PARTICIPANT_KIND, attributes, ...extra } as SipParticipantLike;
}

function canonicalAttributes(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "sip.trunkPhoneNumber": DID,
    "sip.callID": CALL_ID,
    "sip.trunkID": TRUNK_ID,
    "sip.ruleID": RULE_ID,
    "sip.phoneNumber": CALLER,
    "sip.callIDFull": "a84b4c76e66710@pbx.verimor.example",
    "sip.callStatus": "ringing",
    ...overrides,
  };
}

function without(attributes: Record<string, string>, key: string): Record<string, string> {
  const copy = { ...attributes };
  delete copy[key];
  return copy;
}

describe("extractTrustedSipIdentity — canonical success", () => {
  it("1. valid SIP participant succeeds", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    expect(result).toEqual({
      ok: true,
      calledDid: DID,
      externalCallKey: `livekit-sip:${CALL_ID}`,
      sipCallId: CALL_ID,
      trunkId: TRUNK_ID,
      ruleId: RULE_ID,
    });
  });

  it("2. externalCallKey is exactly livekit-sip:<sip.callID>", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    expect(result.ok && result.externalCallKey).toBe(`livekit-sip:${CALL_ID}`);
    expect(SIP_EXTERNAL_CALL_KEY_PREFIX).toBe("livekit-sip:");
  });

  it("passes the called DID onward raw (normalization stays in resolveClinicByDid)", () => {
    const result = extractTrustedSipIdentity(
      sipParticipant(canonicalAttributes({ "sip.trunkPhoneNumber": "08502428852" }))
    );
    expect(result.ok && result.calledDid).toBe("08502428852");
  });

  it("omits trunkId/ruleId when absent and no allowlist is configured", () => {
    const attrs = without(without(canonicalAttributes(), "sip.trunkID"), "sip.ruleID");
    const result = extractTrustedSipIdentity(sipParticipant(attrs));
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("trunkId");
    expect(result).not.toHaveProperty("ruleId");
  });
});

describe("extractTrustedSipIdentity — participant kind", () => {
  it("3. non-SIP participant → NOT_SIP_PARTICIPANT", () => {
    const result = extractTrustedSipIdentity({ kind: STANDARD_KIND, attributes: canonicalAttributes() });
    expect(result).toEqual({ ok: false, code: "NOT_SIP_PARTICIPANT" });
  });

  it("missing kind → NOT_SIP_PARTICIPANT even with canonical sip.* attributes", () => {
    expect(extractTrustedSipIdentity({ attributes: canonicalAttributes() })).toEqual({
      ok: false,
      code: "NOT_SIP_PARTICIPANT",
    });
  });
});

describe("extractTrustedSipIdentity — called DID", () => {
  it("4. missing called DID → CALLED_DID_MISSING", () => {
    const result = extractTrustedSipIdentity(sipParticipant(without(canonicalAttributes(), "sip.trunkPhoneNumber")));
    expect(result).toEqual({ ok: false, code: "CALLED_DID_MISSING" });
  });

  it("5. blank called DID → CALLED_DID_MISSING", () => {
    for (const blank of ["", "   "]) {
      const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.trunkPhoneNumber": blank })));
      expect(result).toEqual({ ok: false, code: "CALLED_DID_MISSING" });
    }
  });

  it("missing attributes object → CALLED_DID_MISSING", () => {
    expect(extractTrustedSipIdentity({ kind: LIVEKIT_SIP_PARTICIPANT_KIND })).toEqual({
      ok: false,
      code: "CALLED_DID_MISSING",
    });
  });

  it("non-string called DID → CALLED_DID_MISSING", () => {
    const attrs = { ...canonicalAttributes(), "sip.trunkPhoneNumber": 908502428852 } as unknown as Record<string, string>;
    expect(extractTrustedSipIdentity(sipParticipant(attrs))).toEqual({ ok: false, code: "CALLED_DID_MISSING" });
  });
});

describe("extractTrustedSipIdentity — SIP call ID", () => {
  it("6. missing sip.callID → SIP_CALL_ID_MISSING", () => {
    const result = extractTrustedSipIdentity(sipParticipant(without(canonicalAttributes(), "sip.callID")));
    expect(result).toEqual({ ok: false, code: "SIP_CALL_ID_MISSING" });
  });

  it("7. blank call ID → SIP_CALL_ID_MISSING", () => {
    for (const blank of ["", "  \t "]) {
      const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.callID": blank })));
      expect(result).toEqual({ ok: false, code: "SIP_CALL_ID_MISSING" });
    }
  });

  it("8. unsafe call ID per existing binding constraints → INVALID_SIP_CALL_ID", () => {
    for (const unsafe of ["SCL with space", "SCL_\u00e7a\u011fr\u0131", "SCL_\n_x", " SCL_padded", "SCL_\u0000"]) {
      expect(deriveCallBindingId(`livekit-sip:${unsafe}`)).toBeNull();
      const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.callID": unsafe })));
      expect(result).toEqual({ ok: false, code: "INVALID_SIP_CALL_ID" });
    }
  });

  it("length limit is the existing binding limit including the prefix", () => {
    const maxCallIdLength = 256 - "livekit-sip:".length;
    const atLimit = "A".repeat(maxCallIdLength);
    const overLimit = "A".repeat(maxCallIdLength + 1);
    expect(extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.callID": atLimit }))).ok).toBe(true);
    expect(extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.callID": overLimit })))).toEqual({
      ok: false,
      code: "INVALID_SIP_CALL_ID",
    });
  });
});

describe("extractTrustedSipIdentity — trunk / rule allowlists", () => {
  it("9. trusted trunk allowlist passes", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), {
      allowedTrunkIds: ["ST_other", TRUNK_ID],
    });
    expect(result.ok && result.trunkId).toBe(TRUNK_ID);
  });

  it("10. wrong trunk → UNTRUSTED_TRUNK", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), { allowedTrunkIds: ["ST_other"] });
    expect(result).toEqual({ ok: false, code: "UNTRUSTED_TRUNK" });
  });

  it("11. required trunk missing → UNTRUSTED_TRUNK", () => {
    for (const attrs of [without(canonicalAttributes(), "sip.trunkID"), canonicalAttributes({ "sip.trunkID": "" })]) {
      const result = extractTrustedSipIdentity(sipParticipant(attrs), { allowedTrunkIds: [TRUNK_ID] });
      expect(result).toEqual({ ok: false, code: "UNTRUSTED_TRUNK" });
    }
  });

  it("12. trusted rule allowlist passes", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), {
      allowedTrunkIds: [TRUNK_ID],
      allowedRuleIds: [RULE_ID],
    });
    expect(result.ok && result.ruleId).toBe(RULE_ID);
  });

  it("13. wrong rule → UNTRUSTED_RULE", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), { allowedRuleIds: ["SDR_other"] });
    expect(result).toEqual({ ok: false, code: "UNTRUSTED_RULE" });
  });

  it("required rule missing → UNTRUSTED_RULE", () => {
    const result = extractTrustedSipIdentity(sipParticipant(without(canonicalAttributes(), "sip.ruleID")), {
      allowedRuleIds: [RULE_ID],
    });
    expect(result).toEqual({ ok: false, code: "UNTRUSTED_RULE" });
  });

  it("14. empty trunk allowlist denies all", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), { allowedTrunkIds: [] });
    expect(result).toEqual({ ok: false, code: "UNTRUSTED_TRUNK" });
  });

  it("15. empty rule allowlist denies all", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), { allowedRuleIds: [] });
    expect(result).toEqual({ ok: false, code: "UNTRUSTED_RULE" });
  });

  it("allowlist match is exact (no prefix/case/whitespace tolerance)", () => {
    for (const trunk of [TRUNK_ID.toLowerCase(), `${TRUNK_ID} `, TRUNK_ID.slice(0, -1)]) {
      const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.trunkID": trunk })), {
        allowedTrunkIds: [TRUNK_ID],
      });
      expect(result).toEqual({ ok: false, code: "UNTRUSTED_TRUNK" });
    }
  });
});

describe("extractTrustedSipIdentity — PII and untrusted sources", () => {
  const callerDigits = CALLER.replace("+", "");

  it("16. caller phone in attributes is not in the success result", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(callerDigits);
    expect(serialized).not.toContain("phoneNumber");
  });

  it("17. participant identity containing the phone number is not in the result", () => {
    const participant = sipParticipant(canonicalAttributes(), { identity: `sip_${CALLER}`, name: CALLER, sid: "PA_x" });
    const result = extractTrustedSipIdentity(participant);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(callerDigits);
    expect(result).not.toHaveProperty("identity");
  });

  it("18. room name and arbitrary metadata are irrelevant", () => {
    const base = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    const noisy = extractTrustedSipIdentity(
      sipParticipant(canonicalAttributes(), {
        roomName: `clinicbridge-call-${CALLER}_abc`,
        metadata: JSON.stringify({ clinicId: "attacker-clinic", did: "+901111111111" }),
      })
    );
    expect(noisy).toEqual(base);
    expect(JSON.stringify(noisy)).not.toContain("clinicbridge-call-");
    expect(JSON.stringify(noisy)).not.toContain("attacker-clinic");
  });

  it("19. sip.callIDFull differing from sip.callID is ignored; sip.callID is used", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    expect(result.ok && result.sipCallId).toBe(CALL_ID);
    expect(JSON.stringify(result)).not.toContain("pbx.verimor.example");
  });

  it("20. header-like/custom attributes cannot replace missing canonical attributes", () => {
    const spoofed = {
      "sip.h.x-called-did": DID,
      "sip.h.to": `sip:${DID}@example`,
      "x-trunk-phone-number": DID,
      trunkPhoneNumber: DID,
      "sip.callIDFull": "full-call-id",
      "sip.h.x-call-id": CALL_ID,
      callID: CALL_ID,
    };
    expect(extractTrustedSipIdentity(sipParticipant(spoofed))).toEqual({ ok: false, code: "CALLED_DID_MISSING" });
    expect(extractTrustedSipIdentity(sipParticipant({ ...spoofed, "sip.trunkPhoneNumber": DID }))).toEqual({
      ok: false,
      code: "SIP_CALL_ID_MISSING",
    });
  });

  it("prototype-inherited canonical keys are not trusted", () => {
    const inherited = Object.create({ "sip.trunkPhoneNumber": DID, "sip.callID": CALL_ID }) as Record<string, string>;
    expect(extractTrustedSipIdentity(sipParticipant(inherited))).toEqual({ ok: false, code: "CALLED_DID_MISSING" });
  });

  it("21. output contains no raw attributes object and only whitelisted keys", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    expect(Object.keys(result).sort()).toEqual(
      ["calledDid", "externalCallKey", "ok", "ruleId", "sipCallId", "trunkId"].sort()
    );
    expect(result).not.toHaveProperty("attributes");
    for (const value of Object.values(result)) expect(typeof value === "object" && value !== null).toBe(false);
  });

  it("failure results carry only a stable code (no raw values)", () => {
    const failures = [
      extractTrustedSipIdentity({ kind: STANDARD_KIND, attributes: canonicalAttributes() }),
      extractTrustedSipIdentity(sipParticipant(canonicalAttributes({ "sip.callID": "bad id" }))),
      extractTrustedSipIdentity(sipParticipant(canonicalAttributes()), { allowedTrunkIds: ["ST_other"] }),
    ];
    for (const failure of failures) {
      expect(Object.keys(failure).sort()).toEqual(["code", "ok"]);
      const serialized = JSON.stringify(failure);
      expect(serialized).not.toContain(callerDigits);
      expect(serialized).not.toContain(TRUNK_ID);
      expect(serialized).not.toContain("bad id");
    }
  });
});

describe("extractTrustedSipIdentity — existing call-binding contract", () => {
  it("22. externalCallKey is accepted by the existing deriveCallBindingId path", () => {
    const result = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    if (!result.ok) throw new Error("expected success");
    const bindingId = deriveCallBindingId(result.externalCallKey);
    expect(bindingId).toMatch(/^vc_[0-9a-f]{32}$/);
    expect(deriveCallBindingId(result.externalCallKey)).toBe(bindingId);
    expect(bindingId).not.toContain(CALL_ID);
  });

  it("same sip.callID always yields the same binding (stable across agent re-dispatch)", () => {
    const first = extractTrustedSipIdentity(sipParticipant(canonicalAttributes()));
    const second = extractTrustedSipIdentity(
      sipParticipant(canonicalAttributes({ "sip.callStatus": "active" }), { identity: "sip_other", sid: "PA_new" })
    );
    if (!first.ok || !second.ok) throw new Error("expected success");
    expect(deriveCallBindingId(second.externalCallKey)).toBe(deriveCallBindingId(first.externalCallKey));
  });
});
