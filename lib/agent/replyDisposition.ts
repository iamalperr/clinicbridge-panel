/**
 * Distinguishes a knowledge-gap reply from a real live-support handoff.
 * The gap copy mentions the clinic team, which previously flipped the
 * conversation status to live support.
 */
function foldTurkish(value: string): string {
  return value.toLowerCase().replace(/ı/g, "i");
}

export function isKnowledgeGapReply(reply: string): boolean {
  const replyLower = foldTurkish(reply);
  return /do[gğ]rulayamiyorum|do[gğ]rulamiyorum|dogrulayamiyorum|mevcut kayitlarimizdan|cannot reliably verify|nicht zuverlässig/.test(
    replyLower
  );
}

export function isLiveSupportKeywordReply(reply: string): boolean {
  const replyLower = reply.toLowerCase();
  return (
    replyLower.includes("canlı destek") ||
    replyLower.includes("canli destek") ||
    replyLower.includes("temsilci") ||
    replyLower.includes("klinik ekibi") ||
    replyLower.includes("iletişime geç") ||
    replyLower.includes("iletisime gec") ||
    replyLower.includes("doğrudan arayın") ||
    replyLower.includes("dogrudan arayin") ||
    replyLower.includes("whatsapp")
  );
}

export function classifyIdleAssistantStatus(
  aiReply: string,
  userMessage: string,
  isLiveSupport?: boolean
): { status: "unanswered" | "liveSupport" | "answered"; needsTraining: boolean; trainingTopic: string } {
  const replyLower = aiReply.toLowerCase();
  const topic = userMessage.slice(0, 60);
  if (
    replyLower.includes("üzgünüm") &&
    (replyLower.includes("yardımcı olamıyorum") ||
      replyLower.includes("anlayamadım") ||
      replyLower.includes("yanıt üretemiyorum") ||
      replyLower.includes("bilgi havuzumda"))
  ) {
    return { status: "unanswered", needsTraining: true, trainingTopic: topic };
  }
  if (isKnowledgeGapReply(aiReply) && !isLiveSupport) {
    return { status: "unanswered", needsTraining: true, trainingTopic: topic };
  }
  if (isLiveSupportKeywordReply(aiReply)) {
    return { status: "liveSupport", needsTraining: false, trainingTopic: "" };
  }
  return { status: "answered", needsTraining: false, trainingTopic: "" };
}
