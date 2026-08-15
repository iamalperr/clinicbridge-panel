/**
 * Lightweight request-scoped performance timer for ClinicBridge AI runtimes.
 * Emits structured stage timings without logging patient message content.
 */

export type PerfStage =
  | "parse_request"
  | "clinic_config_load"
  | "conversation_state_load"
  | "locale_resolve"
  | "intent_classify"
  | "appointment_gate"
  | "appointment_collection"
  | "doctor_retrieval"
  | "rag_hybrid_search"
  | "rag_query_rewrite"
  | "rag_embeddings"
  | "prompt_build"
  | "llm_chat"
  | "groundedness"
  | "persistence"
  | "total";

export interface PerfMark {
  stage: string;
  ms: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export class RequestTimer {
  private readonly t0: number;
  private readonly marks: PerfMark[] = [];
  private readonly open = new Map<string, number>();
  private context: {
    conversationId?: string;
    clinicId?: string;
    traceId?: string;
    scenario?: string;
  };

  constructor(
    context: {
      conversationId?: string;
      clinicId?: string;
      traceId?: string;
      scenario?: string;
    } = {}
  ) {
    this.t0 = performance.now();
    this.context = { ...context };
  }

  setContext(
    patch: {
      conversationId?: string;
      clinicId?: string;
      traceId?: string;
      scenario?: string;
    }
  ): void {
    this.context = { ...this.context, ...patch };
  }

  start(stage: string): void {
    this.open.set(stage, performance.now());
  }

  end(stage: string, meta?: PerfMark["meta"]): number {
    const started = this.open.get(stage);
    const now = performance.now();
    const ms = started !== undefined ? Math.round(now - started) : Math.round(now - this.t0);
    this.open.delete(stage);
    this.marks.push({ stage, ms, meta });
    return ms;
  }

  async measure<T>(stage: string, fn: () => Promise<T> | T, meta?: PerfMark["meta"]): Promise<T> {
    this.start(stage);
    try {
      return await fn();
    } finally {
      this.end(stage, meta);
    }
  }

  snapshot(): {
    conversationId?: string;
    clinicId?: string;
    traceId?: string;
    scenario?: string;
    totalMs: number;
    stages: PerfMark[];
    modelCallHints: number;
  } {
    const stages = [...this.marks];
    const modelCallHints = stages.filter((s) =>
      /llm_|rag_query_rewrite|rag_embeddings|groundedness/.test(s.stage)
    ).length;
    return {
      ...this.context,
      totalMs: Math.round(performance.now() - this.t0),
      stages,
      modelCallHints,
    };
  }

  /**
   * Emit a single structured log line suitable for production diagnosis.
   * Does not include user message text.
   */
  log(extra?: Record<string, unknown>): void {
    const snap = this.snapshot();
    const stageMap: Record<string, number> = {};
    for (const m of snap.stages) stageMap[m.stage] = m.ms;
    console.log(
      JSON.stringify({
        checkpoint: "REQUEST_PERF",
        conversationId: snap.conversationId,
        clinicId: snap.clinicId,
        traceId: snap.traceId,
        scenario: snap.scenario,
        totalMs: snap.totalMs,
        modelCallHints: snap.modelCallHints,
        stages: stageMap,
        ...extra,
      })
    );
  }
}
