/**
 * LLM emergency signal (OpenAI, strict JSON schema). It only adds recall on top of the
 * deterministic keyword detector: it never throws, never blocks past its timeout, and any
 * timeout / error / invalid output leaves the keyword decision in charge.
 */
import { trackableAIRequest } from "@/lib/services/aiGateway";
import type { AIChannel } from "@/lib/types/aiUsage";

export type LlmEmergencyStatus = "emergency" | "not_emergency" | "timeout" | "error" | "invalid";

export interface LlmEmergencyResult {
  status: LlmEmergencyStatus;
  latencyMs: number;
}

export const LLM_EMERGENCY_TIMEOUT_MS = { web: 1500, voice: 1000 } as const;

const MAX_MESSAGE_CHARS = 500;

const SYSTEM_PROMPT = [
  "You are a safety filter for a dental and health-tourism clinic chat. The patient may write in any language.",
  "Set emergency=true only when the message describes an acute symptom the patient has now, or says it is an emergency:",
  "heavy or persistent bleeding, severe or unbearable pain, swelling of the face, throat, tongue or lips,",
  "difficulty breathing or swallowing, high fever, chest pain or pressure, fainting or loss of consciousness,",
  "or an allergic reaction (hives, swelling, breathing trouble), for example after an extraction, implant or surgery.",
  "Set emergency=false for questions about what might happen before or after a treatment (\"will it hurt?\", \"is swelling normal?\"),",
  "prices, information, booking, requests for an urgent or emergency appointment without an acute symptom,",
  "medical history (\"I am allergic to penicillin\"), and symptoms that are already over.",
  'Reply with JSON only: {"emergency": true} or {"emergency": false}.',
].join(" ");

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "emergency_signal",
    strict: true,
    schema: {
      type: "object",
      properties: { emergency: { type: "boolean" } },
      required: ["emergency"],
      additionalProperties: false,
    },
  },
} as const;

/** Accepts exactly `{"emergency": boolean}`; anything else is invalid (null). */
export function readEmergencySignal(content: unknown): boolean | null {
  if (typeof content !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  const value = (parsed as Record<string, unknown>).emergency;
  return keys.length === 1 && typeof value === "boolean" ? value : null;
}

export interface LlmEmergencyCheckParams {
  message: string;
  clinicId?: string;
  conversationId?: string;
  channel: AIChannel;
  timeoutMs: number;
  request?: typeof trackableAIRequest;
}

/** Starts the check immediately; the returned promise always resolves within `timeoutMs`. */
export function startLlmEmergencyCheck(params: LlmEmergencyCheckParams): Promise<LlmEmergencyResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const request = params.request ?? trackableAIRequest;

  const call = (async (): Promise<LlmEmergencyResult> => {
    try {
      const response = await request({
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        channel: params.channel,
        requestType: "safety_check",
        model: "gpt-4o-mini",
        temperature: 0,
        maxTokens: 20,
        responseFormat: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: params.message.slice(0, MAX_MESSAGE_CHARS) },
        ],
      });
      const signal = readEmergencySignal(response?.content);
      if (signal === null) return { status: "invalid", latencyMs: elapsed() };
      return { status: signal ? "emergency" : "not_emergency", latencyMs: elapsed() };
    } catch {
      return { status: "error", latencyMs: elapsed() };
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LlmEmergencyResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout", latencyMs: elapsed() }), params.timeoutMs);
  });

  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}
