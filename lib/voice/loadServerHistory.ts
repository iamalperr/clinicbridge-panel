/**
 * Load Agent Core history from the canonical conversation transcript.
 * Voice must not depend on client-supplied history[].
 */

import { loadClinicConversationTranscript } from "@/lib/services/conversations/conversationTranscriptService";

export type AgentHistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * Returns user/assistant turns for IntentRouter / carry-forward / RAG context.
 * System messages are excluded.
 */
export async function loadServerAgentHistory(params: {
  adminDb: any;
  clinicId: string;
  conversationId: string;
}): Promise<AgentHistoryTurn[]> {
  const { adminDb, clinicId, conversationId } = params;
  if (!adminDb || !clinicId || !conversationId) return [];

  try {
    const detail = await loadClinicConversationTranscript(adminDb, {
      clinicId,
      conversationId,
      reconcileCount: false,
    });
    if (!detail?.messages?.length) return [];

    const turns: AgentHistoryTurn[] = [];
    for (const m of detail.messages) {
      const content = String(m.content || "").trim();
      if (!content) continue;
      if (m.role === "user") {
        turns.push({ role: "user", content });
      } else if (m.role === "assistant") {
        turns.push({ role: "assistant", content });
      }
    }
    return turns;
  } catch (e: any) {
    console.error(JSON.stringify({
      checkpoint: "VOICE_HISTORY_LOAD_FAILED",
      clinicId,
      conversationId,
      error: e?.message || String(e),
    }));
    return [];
  }
}
