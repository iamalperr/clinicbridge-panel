/**
 * The shared ClinicBridge voice runtime as seen from the worker bundle.
 *
 * Importing this module must not initialize Firebase, read credentials or open network
 * connections; the Admin Firestore handle is passed in by the job entry.
 */

import {
  createRuntimeLeaseOperations,
  type CallControllerOptions,
  type RuntimeLeaseOperations,
} from "@/lib/voice/runtime/callController";
import { composeVoiceRuntimeCapabilities } from "@/lib/voice/runtime/composeVoiceRuntime";
import { createVoiceRuntimeBridge, type VoiceRuntimeBridge } from "@/lib/voice/runtime/voiceRuntimeBridge";
import type { VoiceWorkerAdminDb } from "./adminGuard";

export { composeVoiceRuntimeCapabilities } from "@/lib/voice/runtime/composeVoiceRuntime";
export { createVoiceRuntimeBridge } from "@/lib/voice/runtime/voiceRuntimeBridge";
export { createCallController, createRuntimeLeaseOperations } from "@/lib/voice/runtime/callController";

export interface VoiceRuntimeGraph {
  bridge: VoiceRuntimeBridge;
  lease: RuntimeLeaseOperations;
  /** The composed bridge verifies the lease inside its turn id transaction. */
  controllerOptions: Pick<CallControllerOptions, "verifyLeaseInTurnAllocation">;
}

export interface VoiceRuntimeGraphOptions {
  /** From CLINICBRIDGE_VOICE_CONFIG_SHADOW_ENABLED; false removes the shadow resolver entirely. */
  voiceConfigShadowEnabled: boolean;
}

export function createVoiceRuntimeGraph(adminDb: VoiceWorkerAdminDb, options: VoiceRuntimeGraphOptions): VoiceRuntimeGraph {
  return {
    bridge: createVoiceRuntimeBridge({
      capabilities: composeVoiceRuntimeCapabilities({ adminDb, voiceConfigShadow: options.voiceConfigShadowEnabled }),
    }),
    lease: createRuntimeLeaseOperations({ adminDb }),
    controllerOptions: { verifyLeaseInTurnAllocation: true },
  };
}
