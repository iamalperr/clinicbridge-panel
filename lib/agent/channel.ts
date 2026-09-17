/**
 * Maps Agent Core channel → AI usage channel without a repo-wide enum migration.
 *
 * Remaining inconsistency (documented, not fixed in Phase 1):
 * - ConversationContext.channel includes "whatsapp" but not "phone"/"voice"
 * - AIChannel includes "voice" but appointment source still uses ai_chatbot / widget paths
 * - AgentChannel uses "voice" for future phone; AI usage already has "voice"
 */
import type { AIChannel } from "@/lib/types/aiUsage";
import type { AgentChannel } from "./types";

export function toAIUsageChannel(channel: AgentChannel): AIChannel {
  switch (channel) {
    case "web_widget":
      return "web_widget";
    case "voice":
      return "voice";
    case "api":
      return "api";
    default:
      return "api";
  }
}

export function resolveAgentChannel(
  channel: AgentChannel | string | undefined | null,
  fallback: AgentChannel = "web_widget"
): AgentChannel {
  if (channel === "web_widget" || channel === "voice" || channel === "api" || channel === "other") {
    return channel;
  }
  return fallback;
}
