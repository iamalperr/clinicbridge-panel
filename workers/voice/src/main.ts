/**
 * CLI entry for the ClinicBridge voice worker. Fails closed before registering with LiveKit when
 * the explicit agent name, the framework log level, the speech stack config, the
 * ParticipantKind contract, or Firebase Admin is unavailable.
 */

import { fileURLToPath } from "node:url";
import { cli, ServerOptions, type JobRequest } from "@livekit/agents";
import { assertVoiceWorkerAdminDb, VoiceWorkerStartupError } from "./adminGuard";
import { assertSipKindContract } from "./agent";
import { assertSpeechStackConfig, SpeechStackConfigError } from "./call/speechStack";
import { enforceFrameworkLogLevel, FrameworkLogPolicyError } from "./frameworkLogPolicy";
import { readVoiceWorkerConfig, VoiceWorkerConfigError } from "./workerConfig";

const AGENT_DISPLAY_NAME = "ClinicBridge Voice";

function reportStartupFailure(err: unknown): void {
  const code =
    err instanceof VoiceWorkerConfigError ||
    err instanceof VoiceWorkerStartupError ||
    err instanceof SpeechStackConfigError ||
    err instanceof FrameworkLogPolicyError
      ? err.code
      : "UNEXPECTED";
  console.error(JSON.stringify({ checkpoint: "VOICE_WORKER_STARTUP_FAILED", code }));
  process.exitCode = 1;
}

function start(): void {
  enforceFrameworkLogLevel(process.env, process.argv);
  const config = readVoiceWorkerConfig(process.env);
  assertSpeechStackConfig(process.env);
  assertSipKindContract();
  assertVoiceWorkerAdminDb();
  console.log(JSON.stringify({
    checkpoint: "VOICE_WORKER_CONFIG",
    voiceConfigShadow: config.voiceConfigShadowEnabled ? "ENABLED" : "DISABLED",
  }));

  const options: ServerOptions = new ServerOptions({
    agent: fileURLToPath(new URL("./agent.mjs", import.meta.url)),
    agentName: config.agentName,
    requestFunc: async (req: JobRequest) => {
      if (req.agentName !== options.agentName) {
        await req.reject();
        return;
      }
      await req.accept(AGENT_DISPLAY_NAME);
    },
  });
  if (!options.agentName) throw new VoiceWorkerConfigError("AGENT_NAME_MISSING");

  cli.runApp(options);
}

try {
  start();
} catch (err) {
  reportStartupFailure(err);
}
