/**
 * Thinnest possible LiveKit Agent: it forwards each committed caller turn to ClinicBridge and
 * stops LiveKit from generating a reply of its own. No LLM, no tools, no business logic.
 */

import { voice, type llm } from "@livekit/agents";
import type { VoiceSessionConfig } from "../call/sessionConfig";

export class ClinicBridgeTranscriptAgent extends voice.Agent {
  readonly #onFinalTranscript: (text: string) => void;

  constructor(config: VoiceSessionConfig["agent"], onFinalTranscript: (text: string) => void) {
    super({ instructions: config.instructions, llm: config.llm });
    this.#onFinalTranscript = onFinalTranscript;
  }

  override async onUserTurnCompleted(_chatCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
    const text = newMessage.textContent?.trim() ?? "";
    if (text) this.#onFinalTranscript(text);
    throw new voice.StopResponse();
  }

  /** The default asks LiveKit to generate a reply; ClinicBridge owns every reply instead. */
  override async onUserTurnExceeded(): Promise<void> {}
}
