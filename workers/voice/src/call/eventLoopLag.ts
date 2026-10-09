/**
 * Event-loop delay over one caller turn, so slow I/O can be told apart from a starved worker
 * process. Numbers only; telemetry never affects call handling.
 */

import { monitorEventLoopDelay } from "node:perf_hooks";

export interface EventLoopLagSample {
  eventLoopMaxMs: number;
  eventLoopP99Ms: number;
}

export interface EventLoopLagProbe {
  /** Starts a new measurement window. */
  reset(): void;
  read(): EventLoopLagSample | null;
}

export function createEventLoopLagProbe(resolutionMs = 20): EventLoopLagProbe {
  const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  histogram.enable();
  return {
    reset: () => histogram.reset(),
    read() {
      if (histogram.count === 0) return null;
      return {
        eventLoopMaxMs: Math.round(histogram.max / 1e6),
        eventLoopP99Ms: Math.round(histogram.percentile(99) / 1e6),
      };
    },
  };
}
