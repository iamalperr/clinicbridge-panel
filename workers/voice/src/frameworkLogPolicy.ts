/**
 * LiveKit Agents framework log containment. The framework's pino logger writes caller
 * transcripts (`lk.pii.*` fields) at debug/info/warn and SIP participant identities (which carry
 * the caller number) at info. Its only supported control is the CLI log level (`--log-level`,
 * env `LOG_LEVEL`); the pino root level also gates the LiveKit Cloud OTEL log export.
 *
 * The worker therefore runs the framework at "error" and refuses to start when a more verbose
 * level is requested. Error/fatal lines stay visible so operational failures are never hidden.
 */

export const FRAMEWORK_LOG_LEVEL_ENV = "LOG_LEVEL";
export const FRAMEWORK_LOG_LEVEL = "error";

const SAFE_LEVELS: ReadonlySet<string> = new Set(["error", "fatal"]);

export class FrameworkLogPolicyError extends Error {
  readonly code = "FRAMEWORK_LOG_LEVEL_UNSAFE";

  constructor() {
    super("Voice worker startup aborted: framework log level must be error or fatal.");
    this.name = "FrameworkLogPolicyError";
  }
}

function argvLogLevels(argv: readonly string[]): string[] {
  const levels: string[] = [];
  argv.forEach((arg, index) => {
    if (arg === "--log-level") levels.push(argv[index + 1] ?? "");
    else if (arg.startsWith("--log-level=")) levels.push(arg.slice("--log-level=".length));
  });
  return levels;
}

/** Sets LOG_LEVEL=error when unset; throws when argv or env asks for a more verbose level. */
export function enforceFrameworkLogLevel(env: Record<string, string | undefined>, argv: readonly string[]): void {
  for (const level of argvLogLevels(argv)) {
    if (!SAFE_LEVELS.has(level.trim().toLowerCase())) throw new FrameworkLogPolicyError();
  }
  const current = env[FRAMEWORK_LOG_LEVEL_ENV]?.trim().toLowerCase();
  if (current && !SAFE_LEVELS.has(current)) throw new FrameworkLogPolicyError();
  env[FRAMEWORK_LOG_LEVEL_ENV] = current || FRAMEWORK_LOG_LEVEL;
}
