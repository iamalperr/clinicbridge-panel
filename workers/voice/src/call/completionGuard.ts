/**
 * Stale-completion guard for AGENT_COMPLETED. A final reply's completion is honored only if
 * nothing newer happened since it started playing: an accepted caller transcript or another
 * spoken reply supersedes it. Generations are local counters, never business identifiers.
 */

export interface CompletionToken {
  readonly generation: number;
  readonly turnSeq: number;
}

export interface CompletionGuard {
  /** A final reply of `turnSeq` started playing. */
  arm(turnSeq: number): CompletionToken;
  /** Something newer happened on the call; any armed completion is stale. */
  supersede(): void;
  isCurrent(token: CompletionToken): boolean;
}

export function createCompletionGuard(): CompletionGuard {
  let generation = 0;
  let armed: CompletionToken | null = null;
  return {
    arm(turnSeq) {
      generation += 1;
      armed = Object.freeze({ generation, turnSeq });
      return armed;
    },
    supersede() {
      generation += 1;
      armed = null;
    },
    isCurrent(token) {
      return armed !== null && armed.generation === token.generation && generation === token.generation;
    },
  };
}
