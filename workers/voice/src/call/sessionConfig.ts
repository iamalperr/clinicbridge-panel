/**
 * Transport-only speech session settings, as plain data so they can be pinned in tests without
 * loading the LiveKit runtime. The LiveKit adapter (livekit/speechSession.ts) applies them
 * verbatim and adds only the injected speech providers.
 *
 * Deliberately absent: any LLM (session or agent), tools, instructions with business content.
 * Every final caller turn goes to ClinicBridge's CallController → Agent Core instead.
 */

import { VOICE_ENDPOINTING_OVERRIDES, type VoiceEndpointingOverrides } from "./speechStack";

export interface VoiceSessionConfig {
  session: {
    /** null: LiveKit's user-away timer is off; the worker's silence scheduler owns silence. */
    userAwayTimeout: null;
    turnHandling: {
      preemptiveGeneration: { enabled: false; preemptiveTts: false };
      interruption: { enabled: true };
      /** Only the keys set here override LiveKit's turn-detector endpointing defaults. */
      endpointing: Readonly<VoiceEndpointingOverrides>;
    };
  };
  agent: {
    /** Required by the Agent constructor; unused because the agent never generates replies. */
    instructions: "";
    /** null: no LLM on the agent, which also overrides any session-level LLM. */
    llm: null;
  };
  start: {
    record: false;
    input: {
      textEnabled: false;
      audioEnabled: true;
      videoEnabled: false;
      closeOnDisconnect: true;
      deleteRoomOnClose: false;
    };
    output: {
      transcriptionEnabled: false;
      audioEnabled: true;
    };
  };
  say: {
    /** Spoken text is not appended to the in-memory LiveKit chat context. */
    addToChatCtx: false;
  };
}

export function buildVoiceSessionConfig(): VoiceSessionConfig {
  return {
    session: {
      userAwayTimeout: null,
      turnHandling: {
        preemptiveGeneration: { enabled: false, preemptiveTts: false },
        interruption: { enabled: true },
        endpointing: VOICE_ENDPOINTING_OVERRIDES,
      },
    },
    agent: { instructions: "", llm: null },
    start: {
      record: false,
      input: {
        textEnabled: false,
        audioEnabled: true,
        videoEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      output: { transcriptionEnabled: false, audioEnabled: true },
    },
    say: { addToChatCtx: false },
  };
}
