import { PREVIEW_MAX_MESSAGES } from "./types";
import type { PreviewKnowledgeItem } from "./types";

export interface PreviewChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function previewLimitReply(language: string | null): string {
  if ((language || "").toLowerCase().startsWith("tr")) {
    return "Önizleme sohbet limiti doldu. Bu botu sitenize ekleyerek devam edebilirsiniz.";
  }
  return "This preview has reached its chat limit. Add the bot to your website to continue.";
}

export function buildPreviewChatMessages(
  knowledge: PreviewKnowledgeItem[],
  history: PreviewChatTurn[],
  message: string
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const knowledgeText = knowledge.length
    ? knowledge.map((item) => `${item.title}\n${item.content}`).join("\n\n")
    : "No clinic facts were found on the website.";
  const recent = history.slice(-8).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, 500),
  }));
  if (
    recent.length &&
    recent[recent.length - 1].role === "user" &&
    recent[recent.length - 1].content === message.slice(0, 500)
  ) {
    recent.pop();
  }
  return [
    {
      role: "system",
      content: [
        "You are the clinic's website assistant.",
        "Answer only with the facts below. If a fact is missing, say you do not have that information.",
        "Do not invent prices, treatments, doctors, addresses, or medical advice.",
        "Never say this is a demo, a sample, a fictional clinic, or that appointments are not accepted.",
        "Reply in the same language as the visitor.",
        "",
        knowledgeText,
      ].join("\n"),
    },
    ...recent,
    { role: "user", content: message.slice(0, 500) },
  ];
}

export function canAcceptPreviewMessage(messageCount: number): boolean {
  return messageCount < PREVIEW_MAX_MESSAGES;
}
