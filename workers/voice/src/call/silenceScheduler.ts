/**
 * Provider-neutral silence countdown for one call. It owns no decisions: when the countdown
 * elapses it calls onTimeout and the orchestrator asks lifecyclePolicy.onSilenceTimeout what to
 * do (reprompt or goodbye). It only counts while the orchestrator reports the call as listening
 * (caller silent, no business turn in flight, no assistant speech playing), and every new
 * listening period starts a fresh countdown.
 *
 * Race safety: each countdown carries a generation; pausing or stopping bumps it, so a timer
 * callback that was already queued when caller speech arrived is ignored.
 */

export interface SilenceTimer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SilenceScheduler {
  /** Arms a countdown when listening starts, clears it when listening stops; idempotent. */
  setListening(listening: boolean): void;
  /** Permanent: once the call is finishing no further silence timeouts fire. */
  stop(): void;
  readonly armed: boolean;
}

export interface SilenceSchedulerOptions {
  timer: SilenceTimer;
  timeoutMs: number;
  onTimeout: () => void;
}

export function createSilenceScheduler(options: SilenceSchedulerOptions): SilenceScheduler {
  let handle: unknown = null;
  let generation = 0;
  let stopped = false;

  function clear(): void {
    generation += 1;
    if (handle === null) return;
    options.timer.clearTimeout(handle);
    handle = null;
  }

  return {
    setListening(listening) {
      if (stopped) return;
      if (!listening) {
        clear();
        return;
      }
      if (handle !== null) return;
      const armedGeneration = ++generation;
      handle = options.timer.setTimeout(() => {
        if (stopped || armedGeneration !== generation) return;
        handle = null;
        options.onTimeout();
      }, options.timeoutMs);
    },
    stop() {
      stopped = true;
      clear();
    },
    get armed() {
      return handle !== null;
    },
  };
}
