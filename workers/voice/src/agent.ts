/**
 * LiveKit job entry for the ClinicBridge voice worker.
 *
 * Side-effect free on import: LiveKit job processes import this module and read its default
 * export; the CLI lives in main.ts.
 *
 * Per job: connect with audio-only subscription, wait (bounded) for the SIP participant, then
 * hand over to runVoiceCall (trusted SIP identity → ClinicBridge call start → runtime lease →
 * speech session). LiveKit is transport and speech only; every business turn goes through the
 * CallController to ClinicBridge's Agent Core.
 *
 * Speech stack: Turkish LiveKit Inference STT/TTS + audio turn detector per job, local Silero VAD
 * per process (prewarm). If any component is unavailable the job ends before any ClinicBridge
 * record is created.
 */

import { AutoSubscribe, defineAgent, type JobContext, type JobProcess, type VAD } from "@livekit/agents";
import { ParticipantKind, RoomEvent, type RemoteParticipant, type Room } from "@livekit/rtc-node";
import { assertVoiceWorkerAdminDb } from "./adminGuard";
import { createEventLoopLagProbe, type EventLoopLagProbe } from "./call/eventLoopLag";
import { buildVoiceSessionConfig } from "./call/sessionConfig";
import { runVoiceCall } from "./call/voiceCall";
import { createWorkerLogger } from "./call/workerLog";
import { createLiveKitCallTransport } from "./livekit/callTransport";
import { prewarmVoiceVad, resolveSpeechProviders } from "./livekit/speechProviders";
import { createLiveKitSpeechSession } from "./livekit/speechSession";
import { createVoiceRuntimeGraph } from "./runtimeGraph";
import { LIVEKIT_SIP_PARTICIPANT_KIND } from "./sipIdentity";
import { readVoiceWorkerConfig } from "./workerConfig";

export const SIP_PARTICIPANT_WAIT_MS = 10_000;

let eventLoopProbe: EventLoopLagProbe | null = null;

export function assertSipKindContract(): void {
  if ((ParticipantKind.SIP as number) !== LIVEKIT_SIP_PARTICIPANT_KIND) {
    throw new Error("Voice worker startup aborted: ParticipantKind.SIP contract mismatch.");
  }
}

function isSipParticipant(participant: RemoteParticipant): boolean {
  return participant.kind === ParticipantKind.SIP;
}

function waitForSipParticipant(room: Room, timeoutMs: number): Promise<RemoteParticipant | null> {
  for (const participant of room.remoteParticipants.values()) {
    if (isSipParticipant(participant)) return Promise.resolve(participant);
  }
  return new Promise((resolve) => {
    const onConnected = (participant: RemoteParticipant) => {
      if (!isSipParticipant(participant)) return;
      clearTimeout(timer);
      room.off(RoomEvent.ParticipantConnected, onConnected);
      resolve(participant);
    };
    const timer = setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      resolve(null);
    }, timeoutMs);
    room.on(RoomEvent.ParticipantConnected, onConnected);
  });
}

function prewarmedVad(proc: JobProcess): VAD | null {
  const vad: unknown = proc.userData.vad;
  return vad ? (vad as VAD) : null;
}

export default defineAgent({
  prewarm: (proc: JobProcess) => {
    assertSipKindContract();
    proc.userData.adminDb = assertVoiceWorkerAdminDb();
    proc.userData.vad = prewarmVoiceVad();
  },
  entry: async (ctx: JobContext) => {
    const config = readVoiceWorkerConfig(process.env);
    const jobId = ctx.job.id;
    const writeLog = createWorkerLogger();
    const log: typeof writeLog = (checkpoint, fields) => writeLog(checkpoint, { jobId, ...fields });

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    const participant = await waitForSipParticipant(ctx.room, SIP_PARTICIPANT_WAIT_MS);
    if (!participant) {
      log("VOICE_WORKER_CALL_NOT_STARTED", { code: "SIP_PARTICIPANT_NOT_FOUND" });
      ctx.shutdown("clinicbridge:SIP_PARTICIPANT_NOT_FOUND");
      return;
    }

    const linkedParticipantIdentity = participant.identity;
    const speechStack = resolveSpeechProviders({ env: process.env, vad: prewarmedVad(ctx.proc) });
    if (!speechStack.ok) log("VOICE_WORKER_SPEECH_STACK_UNAVAILABLE", { code: speechStack.code });
    const runtime = createVoiceRuntimeGraph(assertVoiceWorkerAdminDb());

    const call = runVoiceCall({
      participant: { kind: participant.kind, attributes: participant.attributes },
      sipTrust: config.sipTrust,
      bridge: runtime.bridge,
      lease: runtime.lease,
      controllerOptions: runtime.controllerOptions,
      ownerId: `${ctx.workerId}:${jobId}`,
      speech: {
        available: () => speechStack.ok,
        create: () => {
          if (!speechStack.ok) throw new Error("Speech providers are not configured.");
          return createLiveKitSpeechSession({
            room: ctx.room,
            linkedParticipantIdentity,
            providers: speechStack.providers,
            config: buildVoiceSessionConfig(),
          });
        },
      },
      transport: createLiveKitCallTransport(ctx, linkedParticipantIdentity),
      log,
      eventLoop: (eventLoopProbe ??= createEventLoopLagProbe()),
    });
    ctx.addShutdownCallback(() => call.shutdown());
  },
});
