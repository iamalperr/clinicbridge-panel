/**
 * Voice Adapter Phase 2 — provider-independent text-turn tests.
 * No telephony / STT / TTS. No public endpoints.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AgentTurnResult, AppointmentData } from "@/lib/agent/types";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import {
  createInMemoryCallSessionStore,
  endCallSession,
  processVoiceTurn,
  runVoiceConversationHarness,
  startCallSession,
  type VoiceAdapterDeps,
} from "@/lib/voice";
import type { AgentHistoryTurn } from "@/lib/voice/loadServerHistory";
import {
  resolveAppointmentTreatmentCarryForward,
  IntentRouter,
  evaluateAppointmentCollectionGate,
  ConversationStateEngine,
  SlotExtractor,
} from "@/lib/conversation";

const REPO = resolve(__dirname, "..");

function makeAgentResult(partial: Partial<AgentTurnResult> & { replyText: string }): AgentTurnResult {
  return {
    conversationId: partial.conversationId || "conv",
    payload: { reply: partial.replyText, ...(partial.payload || {}) },
    httpStatus: 200,
    ...partial,
  };
}

describe("Voice Adapter Phase 2", () => {
  let historyByConv: Map<string, AgentHistoryTurn[]>;
  let deps: VoiceAdapterDeps;
  let lastAgentInput: HandleClinicAgentTurnParams["input"] | null;
  let agentDraft: Partial<AppointmentData>;
  let appointmentCreateCount: number;

  beforeEach(() => {
    historyByConv = new Map();
    lastAgentInput = null;
    agentDraft = {};
    appointmentCreateCount = 0;

    const store = createInMemoryCallSessionStore();
    deps = {
      sessionStore: store,
      adminDb: {},
      generateId: (prefix) => `${prefix}_test_${Math.random().toString(36).slice(2, 8)}`,
      loadHistory: async ({ conversationId }) => historyByConv.get(conversationId) || [],
      runAgentTurn: async (params) => {
        lastAgentInput = params.input;
        expect(params.input.channel).toBe("voice");
        expect(params.input.pendingAppointmentData).toBeUndefined();

        const text = params.input.text;
        const history = params.input.history || [];
        const convId = params.input.conversationId;

        // Append prior server history simulation after reply (adapter persists via Agent Core in prod)
        const ensureHist = () => {
          if (!historyByConv.has(convId)) historyByConv.set(convId, []);
          return historyByConv.get(convId)!;
        };

        // Treatment continuity using the same carry-forward as production Agent Core
        const carry = resolveAppointmentTreatmentCarryForward({
          draftRequestedService: agentDraft.requestedService,
          history: history as any,
          locale: params.input.locale || "tr",
        });
        const activeTreatment =
          !carry.ambiguous && carry.treatmentId ? carry.treatmentId : undefined;

        const intent = IntentRouter.classifyConversationIntent({
          message: text,
          conversationHistory: history as any,
          currentState: "INITIAL",
          activeTreatment,
          locale: params.input.locale || "tr",
        });

        const gate = evaluateAppointmentCollectionGate({
          message: text,
          intent: intent.intent,
          isAppointmentFlowActive: Boolean(agentDraft.requestedDate || agentDraft.requestedService),
          entities: intent.entities,
        });

        let reply = "Size nasıl yardımcı olabilirim?";
        let appointmentState: AgentTurnResult["appointmentState"] = "IDLE";
        let appointmentCreated = false;
        let appointmentId: string | undefined;
        let escalation: AgentTurnResult["escalation"];

        if (/canlı destek|live support|human/i.test(text)) {
          reply = "Sizi klinik ekibimize yönlendirebilirim.";
          escalation = { kind: "live_support" };
        } else if (gate.allowed) {
          if (intent.entities?.preferredDate) agentDraft.requestedDate = intent.entities.preferredDate;
          if (intent.entities?.preferredTime) agentDraft.requestedTime = intent.entities.preferredTime;
          if (intent.entities?.treatment || activeTreatment) {
            const tid = intent.entities?.treatment || activeTreatment!;
            agentDraft.requestedService =
              SlotExtractor.formatMultiTreatmentLabel([tid], params.input.locale || "tr") || tid;
          }
          if (/adım|adim|my name is/i.test(text)) {
            const m = text.match(/(?:adım|adim|name is)\s+(.+)/i);
            if (m) agentDraft.patientName = m[1].replace(/[.,].*$/, "").trim();
          }
          if (/@/.test(text)) {
            const m = text.match(/[^\s]+@[^\s]+/);
            if (m) agentDraft.patientEmail = m[0];
          }
          if (/\+?\d[\d\s-]{8,}/.test(text) && !/@/.test(text)) {
            agentDraft.patientPhone = text.replace(/[^\d+]/g, "");
          }

          // Time amendment
          if (/12:00|12\.00|12 pm/i.test(text) && agentDraft.requestedDate) {
            agentDraft.requestedTime = "12:00";
          }

          const missing = ConversationStateEngine.getMissingSlots({
            treatment: agentDraft.requestedService || undefined,
            preferredDate: agentDraft.requestedDate || undefined,
            preferredTime: agentDraft.requestedTime || undefined,
            fullName: agentDraft.patientName || undefined,
            phone: agentDraft.patientPhone || undefined,
            email: agentDraft.patientEmail || undefined,
          });

          if (/evet|onaylıyorum|yes.*confirm/i.test(text) && missing.length === 0) {
            appointmentCreateCount += 1;
            appointmentCreated = true;
            appointmentId = `appt_${appointmentCreateCount}`;
            appointmentState = "APPOINTMENT_SUBMITTED";
            reply = "Randevu talebiniz iletildi.";
          } else if (missing[0] === "treatment") {
            appointmentState = "COLLECTING_TREATMENT";
            reply = ConversationStateEngine.generateNextSlotPrompt(
              {
                treatment: agentDraft.requestedService,
                preferredDate: agentDraft.requestedDate,
                preferredTime: agentDraft.requestedTime,
              } as any,
              missing,
              params.input.locale || "tr"
            );
          } else if (missing.length) {
            appointmentState = "COLLECTING_INFO";
            reply = ConversationStateEngine.generateNextSlotPrompt(
              {
                treatment: agentDraft.requestedService,
                preferredDate: agentDraft.requestedDate,
                preferredTime: agentDraft.requestedTime,
                fullName: agentDraft.patientName,
                phone: agentDraft.patientPhone,
                email: agentDraft.patientEmail,
              } as any,
              missing,
              params.input.locale || "tr"
            );
          } else {
            appointmentState = "AWAITING_CONFIRMATION";
            reply = "Bilgilerinizi onaylıyor musunuz?";
          }
        } else if (/implant|i̇mplant|ımplant|İmplant/i.test(text) || /implant/i.test(text.normalize("NFD").replace(/\p{M}/gu, ""))) {
          reply =
            "Evet, implant tedavisi sunuyoruz. Dilerseniz ön randevu talebi oluşturabiliriz. Hangi gün sizin için uygundur?";
        }

        const hist = ensureHist();
        hist.push({ role: "user", content: text });
        hist.push({ role: "assistant", content: reply });

        return makeAgentResult({
          replyText: reply,
          conversationId: convId,
          locale: params.input.locale || "tr",
          appointmentState,
          appointmentDraft: { ...agentDraft },
          escalation,
          sideEffects: { appointmentCreated, appointmentId },
          payload: {
            reply,
            liveSupportRequired: escalation?.kind === "live_support",
            appointmentCreated,
            appointmentId,
          },
        });
      },
    };
  });

  it("1. start session returns voice channel ids", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.channel).toBe("voice");
    expect(started.callSessionId).toBeTruthy();
    expect(started.conversationId).toBeTruthy();
    expect(started.clinicId).toBe("clinic_a");
    expect(started.status).toBe("STARTED");
  });

  it("2. general clinic Q&A through Voice Adapter", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    if (!started.ok) throw new Error("start failed");
    const turn = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "İmplant tedavisi yapıyor musunuz?",
      turnId: "t1",
    });
    expect(turn.ok).toBe(true);
    if (!turn.ok) return;
    expect(turn.channel).toBe("voice");
    expect(turn.replyText.toLowerCase()).toMatch(/implant|i̇mplant/);
    expect(lastAgentInput?.channel).toBe("voice");
    expect(lastAgentInput?.history).toEqual([]);
  });

  it("3–4. multi-turn appointment without client history; treatment continuity", async () => {
    const started = await startCallSession(deps, { clinicId: "nova_dental", locale: "tr" });
    if (!started.ok) throw new Error("start failed");

    const t1 = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "İmplant tedavisi yapıyor musunuz?",
      turnId: "t1",
    });
    expect(t1.ok).toBe(true);

    const t2 = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Cumartesi saat 14:00 uygun olur.",
      turnId: "t2",
    });
    expect(t2.ok).toBe(true);
    if (!t2.ok) return;

    // Server history was loaded (turn1 present) — not client-supplied
    expect(lastAgentInput?.history?.length).toBeGreaterThanOrEqual(2);
    expect(lastAgentInput?.pendingAppointmentData).toBeUndefined();
    expect(t2.appointmentDraft?.requestedService?.toLowerCase() || "").toMatch(/implant|i̇mplant/);
    expect(t2.replyText).not.toMatch(/Hangi tedavi veya işlem/i);
  });

  it("5. time amendment 14:00 → 12:00", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    if (!started.ok) throw new Error("start failed");

    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "İmplant tedavisi yapıyor musunuz?",
      turnId: "a1",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Cumartesi saat 14:00 uygun olur.",
      turnId: "a2",
    });
    const amended = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Pardon, 12:00 olsun.",
      turnId: "a3",
    });
    expect(amended.ok).toBe(true);
    if (!amended.ok) return;
    expect(amended.appointmentDraft?.requestedTime).toBe("12:00");
  });

  it("6–7. confirmation creates appointment once; duplicate confirm does not double-create via turnId", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    if (!started.ok) throw new Error("start failed");

    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "İmplant tedavisi yapıyor musunuz?",
      turnId: "c1",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Cumartesi saat 14:00 uygun olur.",
      turnId: "c2",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Adım Test Hasta",
      turnId: "c3",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "+905551112233",
      turnId: "c4",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "test@example.com",
      turnId: "c5",
    });

    const confirm = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Evet, onaylıyorum.",
      turnId: "c6",
    });
    expect(confirm.ok).toBe(true);
    if (!confirm.ok) return;
    expect(confirm.appointmentCreated).toBe(true);
    expect(appointmentCreateCount).toBe(1);

    const replay = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Evet, onaylıyorum.",
      turnId: "c6",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.idempotentReplay).toBe(true);
    expect(appointmentCreateCount).toBe(1);
  });

  it("8. duplicate turnId does not re-invoke agent progression", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a" });
    if (!started.ok) throw new Error("start failed");
    const spy = vi.fn(deps.runAgentTurn!);
    deps.runAgentTurn = spy;

    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Merhaba",
      turnId: "dup1",
    });
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Merhaba",
      turnId: "dup1",
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("9. session not found", async () => {
    const res = await processVoiceTurn(deps, {
      callSessionId: "missing_session",
      text: "Merhaba",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorCode).toBe("SESSION_NOT_FOUND");
  });

  it("10. ended session rejects turns", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a" });
    if (!started.ok) throw new Error("start failed");
    await endCallSession(deps, { callSessionId: started.callSessionId });
    const res = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Merhaba",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorCode).toBe("SESSION_ENDED");
  });

  it("11. empty transcript rejected without Agent Core", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a" });
    if (!started.ok) throw new Error("start failed");
    const spy = vi.fn(deps.runAgentTurn!);
    deps.runAgentTurn = spy;
    const res = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "   ",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorCode).toBe("EMPTY_TRANSCRIPT");
    expect(spy).not.toHaveBeenCalled();
  });

  it("12. language continuity uses session/locale on Agent Core input", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    if (!started.ok) throw new Error("start failed");
    await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "İmplant tedavisi yapıyor musunuz?",
      turnId: "lang1",
    });
    expect(lastAgentInput?.locale).toBe("tr");
  });

  it("13. clinic isolation — Clinic A session cannot be used as Clinic B", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a" });
    if (!started.ok) throw new Error("start failed");
    const res = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      clinicId: "clinic_b",
      text: "Merhaba",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorCode).toBe("CLINIC_MISMATCH");
  });

  it("14. human escalation signal propagated", async () => {
    const started = await startCallSession(deps, { clinicId: "clinic_a", locale: "tr" });
    if (!started.ok) throw new Error("start failed");
    const res = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: "Canlı destek istiyorum",
      turnId: "esc1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.escalationRequested).toBe(true);
    expect(res.escalation?.kind).toBe("live_support");
  });

  it("15. harness runs multi-turn simulation", async () => {
    const run = await runVoiceConversationHarness(deps, {
      clinicId: "clinic_a",
      locale: "tr",
      turns: [
        { text: "İmplant tedavisi yapıyor musunuz?" },
        { text: "Cumartesi saat 14:00 uygun olur." },
      ],
    });
    expect("ok" in run && run.ok === false).toBe(false);
    if ("ok" in run && run.ok === false) return;
    const okRun = run as Exclude<typeof run, { ok: false }>;
    expect(okRun.exchanges).toHaveLength(2);
    expect(okRun.ended).toBe(true);
    expect(okRun.exchanges.every((e) => e.result.ok)).toBe(true);
  });
});

describe("Voice Phase 2 architecture boundaries", () => {
  it("does not add telephony/TTS/public webhook; Sesli Yanıt untouched", () => {
    const voiceIdx = readFileSync(resolve(REPO, "lib/voice/index.ts"), "utf8");
    const adapter = readFileSync(resolve(REPO, "lib/voice/voiceAdapter.ts"), "utf8");
    const route = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");
    const sesli = readFileSync(resolve(REPO, "app/clinics/[clinicId]/voice/page.tsx"), "utf8");

    for (const src of [voiceIdx, adapter]) {
      expect(src).not.toMatch(/twilio|elevenlabs|WebSocket|speechToText|textToSpeech|vonage|telnyx/i);
    }
    expect(route).toContain("handleClinicAgentTurn");
    expect(sesli).toContain("Save Voice Settings");
    expect(adapter).toContain('channel: "voice"');
    expect(adapter).toContain("handleClinicAgentTurn");
  });

  it("no public voice API route exists", () => {
    const { existsSync } = require("fs") as typeof import("fs");
    expect(existsSync(resolve(REPO, "app/api/public/voice"))).toBe(false);
    expect(existsSync(resolve(REPO, "app/api/voice"))).toBe(false);
  });
});
