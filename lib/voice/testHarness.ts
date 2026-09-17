/**
 * Dev/test harness for multi-turn Voice Adapter simulations (Phase 2).
 * Not a public production endpoint.
 */

import type { VoiceAdapterDeps } from "./voiceAdapter";
import { endCallSession, processVoiceTurn, startCallSession } from "./voiceAdapter";
import type { VoiceErrorResult, VoiceTurnResult } from "./types";

export interface VoiceHarnessTurn {
  text: string;
  turnId?: string;
  locale?: string;
}

export interface VoiceHarnessExchange {
  patientText: string;
  result: VoiceTurnResult | VoiceErrorResult;
}

export interface VoiceHarnessRunResult {
  callSessionId: string;
  conversationId: string;
  clinicId: string;
  exchanges: VoiceHarnessExchange[];
  ended: boolean;
}

/**
 * Simulate a full voice conversation using finalized transcript text only.
 */
export async function runVoiceConversationHarness(
  deps: VoiceAdapterDeps,
  params: {
    clinicId: string;
    turns: VoiceHarnessTurn[];
    callerE164?: string;
    locale?: string;
    endSession?: boolean;
  }
): Promise<VoiceHarnessRunResult | VoiceErrorResult> {
  const started = await startCallSession(deps, {
    clinicId: params.clinicId,
    callerE164: params.callerE164,
    locale: params.locale,
  });
  if (!started.ok) return started;

  const exchanges: VoiceHarnessExchange[] = [];
  for (let i = 0; i < params.turns.length; i++) {
    const t = params.turns[i];
    const result = await processVoiceTurn(deps, {
      callSessionId: started.callSessionId,
      text: t.text,
      turnId: t.turnId || `harness_turn_${i + 1}`,
      locale: t.locale || params.locale,
    });
    exchanges.push({ patientText: t.text, result });
    if (!result.ok) {
      return {
        ...result,
        // partial context for debugging
        callSessionId: started.callSessionId,
        conversationId: started.conversationId,
        clinicId: started.clinicId,
      } as VoiceErrorResult;
    }
  }

  let ended = false;
  if (params.endSession !== false) {
    const end = await endCallSession(deps, { callSessionId: started.callSessionId });
    ended = Boolean(end.ok);
  }

  return {
    callSessionId: started.callSessionId,
    conversationId: started.conversationId,
    clinicId: started.clinicId,
    exchanges,
    ended,
  };
}
