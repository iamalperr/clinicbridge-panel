/**
 * LiveKit room/job adapter for the provider-neutral CallTransportPort.
 */

import type { JobContext } from "@livekit/agents";
import { RoomEvent, type RemoteParticipant } from "@livekit/rtc-node";
import type { CallTransportPort } from "../call/ports";

export function createLiveKitCallTransport(ctx: JobContext, sipParticipantIdentity: string): CallTransportPort {
  return {
    onCallerDisconnected(listener) {
      const onDisconnected = (participant: RemoteParticipant) => {
        if (participant.identity !== sipParticipantIdentity) return;
        ctx.room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
        listener();
      };
      ctx.room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
      if (!ctx.room.remoteParticipants.has(sipParticipantIdentity)) {
        ctx.room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
        queueMicrotask(listener);
      }
    },
    isCallerConnected() {
      return ctx.room.remoteParticipants.has(sipParticipantIdentity);
    },
    async hangUp() {
      await ctx.deleteRoom();
    },
    shutdownJob(reason) {
      ctx.shutdown(reason);
    },
  };
}
