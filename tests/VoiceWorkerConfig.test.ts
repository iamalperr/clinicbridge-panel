import { describe, expect, it } from "vitest";
import { readVoiceWorkerConfig, VoiceWorkerConfigError } from "@/workers/voice/src/workerConfig";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof VoiceWorkerConfigError ? err.code : "OTHER";
  }
  return undefined;
}

describe("readVoiceWorkerConfig", () => {
  it("requires LIVEKIT_AGENT_NAME (fails closed against automatic dispatch)", () => {
    expect(codeOf(() => readVoiceWorkerConfig({}))).toBe("AGENT_NAME_MISSING");
    expect(codeOf(() => readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: "" }))).toBe("AGENT_NAME_MISSING");
    expect(codeOf(() => readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: "   " }))).toBe("AGENT_NAME_MISSING");
  });

  it("rejects malformed agent names", () => {
    for (const bad of ["has space", "-leading", "a/b", "x".repeat(65)]) {
      expect(codeOf(() => readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: bad }))).toBe("AGENT_NAME_INVALID");
    }
  });

  it("accepts an explicit agent name and leaves allowlists unenforced when unset", () => {
    const config = readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: "clinicbridge-voice" });
    expect(config).toEqual({ agentName: "clinicbridge-voice", sipTrust: {} });
    expect(config.sipTrust).not.toHaveProperty("allowedTrunkIds");
    expect(config.sipTrust).not.toHaveProperty("allowedRuleIds");
  });

  it("parses comma-separated allowlists", () => {
    const config = readVoiceWorkerConfig({
      LIVEKIT_AGENT_NAME: "clinicbridge-voice",
      CLINICBRIDGE_VOICE_ALLOWED_SIP_TRUNK_IDS: " ST_a , ST_b ,",
      CLINICBRIDGE_VOICE_ALLOWED_SIP_RULE_IDS: "SDR_a",
    });
    expect(config.sipTrust).toEqual({ allowedTrunkIds: ["ST_a", "ST_b"], allowedRuleIds: ["SDR_a"] });
  });

  it("a set-but-empty allowlist becomes [] (deny all), never 'allow everything'", () => {
    const config = readVoiceWorkerConfig({
      LIVEKIT_AGENT_NAME: "clinicbridge-voice",
      CLINICBRIDGE_VOICE_ALLOWED_SIP_TRUNK_IDS: "",
      CLINICBRIDGE_VOICE_ALLOWED_SIP_RULE_IDS: " , ",
    });
    expect(config.sipTrust).toEqual({ allowedTrunkIds: [], allowedRuleIds: [] });
  });

  it("error messages never echo env values", () => {
    try {
      readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: "bad name with secret-ish value" });
    } catch (err) {
      expect((err as Error).message).not.toContain("secret-ish");
    }
  });
});
