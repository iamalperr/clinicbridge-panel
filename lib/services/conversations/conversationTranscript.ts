/**
 * Single-clinic conversation transcript normalization.
 *
 * Builds a canonical visible message list from current conversationLogs
 * message subcollections and legacy conversations message stores.
 * Does not authorize access — callers must enforce clinic isolation.
 */

export type CanonicalMessageRole = "user" | "assistant" | "system" | "clinic" | "unknown";

export interface CanonicalConversationMessage {
  id: string;
  role: CanonicalMessageRole;
  content: string;
  createdAt?: string;
  sequence?: number;
  source?: string;
  /** Portal UI compatibility alias. */
  sender?: "patient" | "assistant" | "system";
  wasAnswered?: boolean;
  needsTraining?: boolean;
}

export interface CanonicalConversationDetail {
  conversationId: string;
  clinicId: string;
  patient?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  status?: string;
  messageCount: number;
  storedMessageCount?: number;
  messages: CanonicalConversationMessage[];
  hasMore?: boolean;
  nextCursor?: string;
  sourcesUsed?: string[];
}

export interface RawTranscriptMessage {
  id?: string;
  role?: string;
  sender?: string;
  content?: string;
  text?: string;
  createdAt?: string | { toDate?: () => Date; seconds?: number };
  sequence?: number;
  source?: string;
  wasAnswered?: boolean;
  needsTraining?: boolean;
}

function toIso(value: unknown, fallbackIndex = 0): string {
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  if (value && typeof value === "object") {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === "function") {
      try {
        return v.toDate().toISOString();
      } catch {
        /* ignore */
      }
    }
    if (typeof v.seconds === "number") {
      return new Date(v.seconds * 1000).toISOString();
    }
  }
  // Stable synthetic timestamp for missing createdAt (order by sequence).
  return new Date(1_700_000_000_000 + fallbackIndex).toISOString();
}

export function normalizeConversationMessageRole(
  raw?: string | null
): CanonicalMessageRole {
  const r = String(raw || "")
    .trim()
    .toLowerCase();
  if (!r) return "unknown";
  if (
    r === "user" ||
    r === "patient" ||
    r === "visitor" ||
    r === "human" ||
    r === "customer"
  ) {
    return "user";
  }
  if (r === "assistant" || r === "bot" || r === "ai" || r === "agent") {
    return "assistant";
  }
  if (r === "clinic" || r === "staff" || r === "operator") {
    return "clinic";
  }
  if (r === "system" || r === "event" || r === "internal") {
    return "system";
  }
  return "unknown";
}

export function roleToPortalSender(
  role: CanonicalMessageRole
): "patient" | "assistant" | "system" {
  if (role === "user") return "patient";
  if (role === "assistant" || role === "clinic") return "assistant";
  return "system";
}

function contentKey(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Fingerprint for dedupe across summary + full sources. */
export function conversationMessageFingerprint(
  role: CanonicalMessageRole,
  content: string
): string {
  return `${role}::${contentKey(content)}`;
}

/**
 * Normalize one raw message. Returns null for empty / non-visible content.
 * System live-support markers remain visible (operational).
 */
export function normalizeRawTranscriptMessage(
  raw: RawTranscriptMessage,
  opts?: { index?: number; source?: string; includeSystem?: boolean }
): CanonicalConversationMessage | null {
  const content = String(raw.content ?? raw.text ?? "").trim();
  if (!content) return null;

  const role = normalizeConversationMessageRole(raw.role || raw.sender);
  const includeSystem = opts?.includeSystem !== false;
  if (role === "system" && !includeSystem) return null;
  if (role === "unknown" && content.length < 1) return null;

  const index = opts?.index ?? 0;
  const createdAt = toIso(raw.createdAt, index);
  const id =
    String(raw.id || "").trim() ||
    `msg_${createdAt}_${role}_${index}`;

  return {
    id,
    role,
    content,
    createdAt,
    sequence: typeof raw.sequence === "number" ? raw.sequence : index,
    source: raw.source || opts?.source,
    sender: roleToPortalSender(role),
    wasAnswered: raw.wasAnswered,
    needsTraining: raw.needsTraining,
  };
}

/**
 * Sort oldest → newest; stable by sequence then id when timestamps equal.
 */
export function sortCanonicalMessages(
  messages: CanonicalConversationMessage[]
): CanonicalConversationMessage[] {
  return [...messages].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    if (ta !== tb) return ta - tb;
    const sa = a.sequence ?? 0;
    const sb = b.sequence ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Merge message sources with precedence:
 * 1. canonical conversationLogs messages
 * 2. full messages arrays
 * 3. legacy conversation turn docs
 * 4. last-message / summary fallbacks (only if nothing else)
 *
 * Duplicates (same role+content) are removed; earlier source wins.
 */
export function mergeConversationTranscriptSources(params: {
  canonicalMessages?: RawTranscriptMessage[];
  fullMessagesArray?: RawTranscriptMessage[];
  legacyTurnMessages?: RawTranscriptMessage[];
  summaryFallbackMessages?: RawTranscriptMessage[];
  includeSystem?: boolean;
}): CanonicalConversationMessage[] {
  const buckets: Array<{ raw: RawTranscriptMessage[]; source: string }> = [
    { raw: params.canonicalMessages || [], source: "conversationLogs.messages" },
    { raw: params.fullMessagesArray || [], source: "messages_array" },
    { raw: params.legacyTurnMessages || [], source: "legacy.conversations.messages" },
  ];

  const seen = new Set<string>();
  const out: CanonicalConversationMessage[] = [];
  let index = 0;

  const pushAll = (rawList: RawTranscriptMessage[], source: string) => {
    for (const raw of rawList) {
      const normalized = normalizeRawTranscriptMessage(raw, {
        index: index++,
        source,
        includeSystem: params.includeSystem,
      });
      if (!normalized) continue;
      const fp = conversationMessageFingerprint(normalized.role, normalized.content);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push(normalized);
    }
  };

  for (const bucket of buckets) {
    pushAll(bucket.raw, bucket.source);
  }

  if (out.length === 0 && (params.summaryFallbackMessages || []).length > 0) {
    pushAll(params.summaryFallbackMessages || [], "summary_fallback");
  }

  return sortCanonicalMessages(out);
}

/** Visible chat count — excludes empty; includes system events that survived normalize. */
export function countVisibleConversationMessages(
  messages: CanonicalConversationMessage[]
): number {
  return messages.filter((m) => String(m.content || "").trim().length > 0).length;
}

/**
 * Build history turns for persistence sync from client history + current turn.
 */
export function buildTurnsFromClientHistory(params: {
  history?: Array<{ role?: string; content?: string }> | null;
  userMessage?: string;
  aiReply?: string;
}): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const h of params.history || []) {
    const role = normalizeConversationMessageRole(h.role);
    const content = String(h.content || "").trim();
    if (!content) continue;
    if (role === "user" || role === "assistant") {
      turns.push({ role, content });
    }
  }
  const user = String(params.userMessage || "").trim();
  const ai = String(params.aiReply || "").trim();
  if (user) {
    const last = turns[turns.length - 1];
    if (!(last && last.role === "user" && contentKey(last.content) === contentKey(user))) {
      turns.push({ role: "user", content: user });
    }
  }
  if (ai) {
    const last = turns[turns.length - 1];
    if (!(last && last.role === "assistant" && contentKey(last.content) === contentKey(ai))) {
      turns.push({ role: "assistant", content: ai });
    }
  }
  return turns;
}

/**
 * Stable doc id for synced history turns (idempotent upserts).
 */
export function stableHistoryMessageDocId(
  role: "user" | "assistant" | "system",
  content: string,
  sequence: number
): string {
  const fp = conversationMessageFingerprint(
    role === "user" ? "user" : role === "assistant" ? "assistant" : "system",
    content
  );
  // Short hash-like id without crypto dependency.
  let hash = 0;
  for (let i = 0; i < fp.length; i++) {
    hash = (hash * 31 + fp.charCodeAt(i)) | 0;
  }
  const sender = role === "user" ? "u" : role === "assistant" ? "a" : "s";
  return `hist_${sequence}_${sender}_${Math.abs(hash).toString(36)}`;
}
