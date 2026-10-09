/**
 * Load + reconcile single-clinic conversation transcripts (admin SDK).
 */

import type { DocumentReference, Firestore, QuerySnapshot, WriteBatch } from "firebase-admin/firestore";
import {
  buildTurnsFromClientHistory,
  countVisibleConversationMessages,
  mergeConversationTranscriptSources,
  stableHistoryMessageDocId,
  visibleTurnIdempotencyKey,
  type CanonicalConversationDetail,
  type RawTranscriptMessage,
} from "./conversationTranscript";
import { safeErrorMeta } from "@/lib/services/infrastructureErrors";

async function readMessagesSubcollection(
  adminDb: Firestore,
  path: { clinicId: string; collection: string; conversationId: string }
): Promise<RawTranscriptMessage[]> {
  const snap = await adminDb
    .collection("clinics")
    .doc(path.clinicId)
    .collection(path.collection)
    .doc(path.conversationId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      role: data.role,
      sender: data.sender,
      content: data.content ?? data.text,
      createdAt: data.createdAt,
      wasAnswered: data.wasAnswered,
      needsTraining: data.needsTraining,
      source: path.collection,
    } as RawTranscriptMessage;
  });
}

/**
 * Load canonical detail for a clinic conversation.
 * Merges conversationLogs messages with legacy conversations messages.
 */
export async function loadClinicConversationTranscript(
  adminDb: Firestore,
  params: {
    clinicId: string;
    conversationId: string;
    /** Soft-reconcile stale totalMessages on the log doc. */
    reconcileCount?: boolean;
  }
): Promise<CanonicalConversationDetail | null> {
  const { clinicId, conversationId } = params;
  const logRef = adminDb
    .collection("clinics")
    .doc(clinicId)
    .collection("conversationLogs")
    .doc(conversationId);

  // Allow legacy-only conversations that never got a conversationLogs doc.
  const legacyRef = adminDb
    .collection("clinics")
    .doc(clinicId)
    .collection("conversations")
    .doc(conversationId);

  // The four reads are independent: issue them together. Document reads still reject the
  // load; a failed messages subcollection read (missing index / empty) still falls through.
  const [logSnap, legacySnap, canonicalMessages, legacyTurnMessages] = await Promise.all([
    logRef.get(),
    legacyRef.get(),
    readMessagesSubcollection(adminDb, {
      clinicId,
      collection: "conversationLogs",
      conversationId,
    }).catch((): RawTranscriptMessage[] => []),
    readMessagesSubcollection(adminDb, {
      clinicId,
      collection: "conversations",
      conversationId,
    }).catch((): RawTranscriptMessage[] => []),
  ]);

  if (!logSnap.exists && !legacySnap.exists) {
    return null;
  }

  const logData = logSnap.exists ? logSnap.data() || {} : {};
  const legacyData = legacySnap.exists ? legacySnap.data() || {} : {};

  const sourcesUsed: string[] = [];
  if (canonicalMessages.length) sourcesUsed.push("conversationLogs.messages");
  if (legacyTurnMessages.length) sourcesUsed.push("legacy.conversations.messages");

  const fullMessagesArray = Array.isArray(logData.messages)
    ? (logData.messages as RawTranscriptMessage[])
    : Array.isArray(legacyData.messages)
      ? (legacyData.messages as RawTranscriptMessage[])
      : [];
  if (fullMessagesArray.length) sourcesUsed.push("messages_array");

  const summaryFallback: RawTranscriptMessage[] = [];
  if (logData.lastMessagePreview || legacyData.firstMessage) {
    summaryFallback.push({
      id: "summary_user_preview",
      sender: "patient",
      content: String(logData.lastMessagePreview || legacyData.firstMessage || ""),
      createdAt: logData.updatedAt || legacyData.updatedAt,
    });
  }

  const messages = mergeConversationTranscriptSources({
    canonicalMessages,
    fullMessagesArray,
    legacyTurnMessages,
    summaryFallbackMessages: summaryFallback,
    includeSystem: true,
  });

  const messageCount = countVisibleConversationMessages(messages);
  const storedMessageCount =
    typeof logData.totalMessages === "number"
      ? logData.totalMessages
      : typeof legacyData.messageCount === "number"
        ? legacyData.messageCount
        : undefined;

  if (params.reconcileCount !== false && logSnap.exists && messageCount > 0) {
    if (storedMessageCount !== messageCount) {
      try {
        await logRef.set(
          {
            totalMessages: messageCount,
            messageCountReconciledAt: new Date().toISOString(),
          },
          { merge: true }
        );
        console.info(
          `[conversationTranscript] reconciled totalMessages clinicId=${clinicId} conversationId=${conversationId} stored=${storedMessageCount} actual=${messageCount}`
        );
      } catch (err: any) {
        console.warn(
          `[conversationTranscript] reconcile failed conversationId=${conversationId}:`,
          JSON.stringify(safeErrorMeta(err))
        );
      }
    }
  }

  return {
    conversationId,
    clinicId,
    patient: {
      name: logData.patientName || legacyData.userName || undefined,
      phone: logData.patientPhone || undefined,
      email: logData.patientEmail || undefined,
    },
    status: logData.status || legacyData.status,
    messageCount,
    storedMessageCount,
    messages,
    hasMore: false,
    sourcesUsed,
  };
}

type ConversationLogMessageSyncParams = {
  clinicId: string;
  conversationId: string;
  history?: Array<{ role?: string; content?: string }> | null;
  userMessage: string;
  aiReply: string;
  baseIso?: string;
  includeLiveSupportSystem?: boolean;
};

function conversationLogRef(adminDb: Firestore, clinicId: string, conversationId: string): DocumentReference {
  return adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(conversationId);
}

/**
 * Upsert client history turns into conversationLogs messages (idempotent).
 * Returns the number of visible messages after sync.
 */
export async function syncConversationLogMessagesFromHistory(
  adminDb: Firestore,
  params: ConversationLogMessageSyncParams
): Promise<number> {
  const logRef = conversationLogRef(adminDb, params.clinicId, params.conversationId);
  const existingSnap = await logRef.collection("messages").get();
  const batch = adminDb.batch();
  const { writes } = stageConversationLogMessages(logRef, batch, existingSnap, params);

  if (writes > 0) {
    await batch.commit();
  }

  // Count after sync (prefer counting synced turns; include existing extras).
  const after = await logRef.collection("messages").get();
  return after.size;
}

/** Firestore's per-batch limit is 500 writes; leave headroom for the log doc itself. */
export const CONVERSATION_LOG_SINGLE_BATCH_MAX_WRITES = 450;

export type SingleBatchConversationLogResult =
  | { committed: true; logData: Record<string, unknown>; messageCount: number }
  | { committed: false; reason: "TOO_MANY_WRITES" };

/**
 * One visible turn persisted with two round trips instead of five: the log doc and its
 * messages are read in parallel, then the message upserts and the log doc merge commit in
 * ONE atomic batch (all-or-nothing). Same documents and fields as
 * `syncConversationLogMessagesFromHistory` + the caller's log doc `set(merge)`.
 *
 * `messageCount` is the union of existing and upserted message ids, which equals the
 * sequential path's re-read count unless another writer adds messages concurrently.
 * Callers fall back to the sequential path when `committed` is false.
 */
export async function commitConversationLogTurnInSingleBatch(
  adminDb: Firestore,
  params: Omit<ConversationLogMessageSyncParams, "baseIso"> & {
    nowIso: string;
    buildLogData(existing: Record<string, any> | null, messageCount: number): Record<string, unknown>;
  }
): Promise<SingleBatchConversationLogResult> {
  const logRef = conversationLogRef(adminDb, params.clinicId, params.conversationId);
  const [logSnap, existingSnap] = await Promise.all([logRef.get(), logRef.collection("messages").get()]);
  const existing = logSnap.exists ? (logSnap.data() ?? null) : null;

  const batch = adminDb.batch();
  const { writes, docIds } = stageConversationLogMessages(logRef, batch, existingSnap, {
    ...params,
    baseIso: existing?.createdAt || params.nowIso,
  });
  if (writes + 1 > CONVERSATION_LOG_SINGLE_BATCH_MAX_WRITES) {
    return { committed: false, reason: "TOO_MANY_WRITES" };
  }

  const messageCount = new Set([...existingSnap.docs.map((d) => d.id), ...docIds]).size;
  const logData = params.buildLogData(existing, messageCount);
  batch.set(logRef, logData, { merge: true });
  await batch.commit();
  return { committed: true, logData, messageCount };
}

/**
 * Stages the idempotent message upserts of one history sync on `batch`.
 * Returns the number of staged writes and the ids of the staged message docs.
 */
function stageConversationLogMessages(
  logRef: DocumentReference,
  batch: WriteBatch,
  existingSnap: QuerySnapshot,
  params: ConversationLogMessageSyncParams
): { writes: number; docIds: string[] } {
  const turns = buildTurnsFromClientHistory({
    history: params.history,
    userMessage: params.userMessage,
    aiReply: params.aiReply,
  });

  const base = Date.parse(params.baseIso || "") || Date.now();
  // Preserve first-write timestamps: re-sync must not shuffle chronology.
  const existingById = new Map(existingSnap.docs.map((d) => [d.id, d.data() || {}]));
  let nextSequence =
    Math.max(
      -1,
      ...existingSnap.docs.map((d) => {
        const seq = d.data()?.sequence;
        return typeof seq === "number" ? seq : -1;
      })
    ) + 1;

  let writes = 0;
  const docIds: string[] = [];
  const now = Date.now();

  turns.forEach((turn, index) => {
    const docId = stableHistoryMessageDocId(turn.role, turn.content, index);
    docIds.push(docId);
    const ref = logRef.collection("messages").doc(docId);
    const prior = existingById.get(docId);
    const isNew = !prior;
    const createdAt =
      typeof prior?.createdAt === "string" && prior.createdAt
        ? prior.createdAt
        : new Date(isNew ? now + index : base + index * 2).toISOString();
    const sequence =
      typeof prior?.sequence === "number" ? prior.sequence : nextSequence++;
    batch.set(
      ref,
      {
        sender: turn.role === "user" ? "patient" : "assistant",
        role: turn.role,
        content: turn.content,
        createdAt,
        sequence,
        wasAnswered: true,
        needsTraining: false,
        source: prior?.source || "history_sync",
      },
      { merge: true }
    );
    writes++;
  });

  if (params.includeLiveSupportSystem) {
    const sysContent = "Canlı Destek Yönlendirmesi Gösterildi";
    const sysId = stableHistoryMessageDocId("system", sysContent, turns.length);
    docIds.push(sysId);
    const prior = existingById.get(sysId);
    batch.set(
      logRef.collection("messages").doc(sysId),
      {
        sender: "system",
        role: "system",
        content: sysContent,
        createdAt:
          typeof prior?.createdAt === "string" && prior.createdAt
            ? prior.createdAt
            : new Date(now + turns.length).toISOString(),
        sequence:
          typeof prior?.sequence === "number" ? prior.sequence : nextSequence++,
        wasAnswered: true,
        needsTraining: false,
        source: prior?.source || "history_sync",
      },
      { merge: true }
    );
    writes++;
  }

  return { writes, docIds };
}

export interface PersistVisibleChatTurnParams {
  clinicId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  responseType?: string;
  clientMessageId?: string | null;
  appointmentState?: string | null;
  /** Prior widget history — best-effort backfill of missing earlier turns. */
  history?: Array<{ role?: string; content?: string }> | null;
  isLiveSupport?: boolean;
  statusHint?: string;
}

/**
 * Canonical persistence for one user-visible chat turn.
 * Writes both sides exactly once (content-stable ids) and optionally
 * backfills earlier history turns that fell out of prior writes.
 */
export async function persistVisibleChatTurn(
  adminDb: Firestore,
  params: PersistVisibleChatTurnParams
): Promise<{ messageCount: number; persistedAssistant: boolean }> {
  const userMessage = String(params.userMessage || "").trim();
  const assistantMessage = String(params.assistantMessage || "").trim();
  if (!params.clinicId || !params.conversationId) {
    return { messageCount: 0, persistedAssistant: false };
  }
  // No user-visible assistant text → do not invent an assistant turn.
  if (!assistantMessage) {
    if (userMessage) {
      // Still persist the user side if somehow orphaned.
      await syncConversationLogMessagesFromHistory(adminDb, {
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        history: params.history,
        userMessage,
        aiReply: "",
      });
    }
    return { messageCount: 0, persistedAssistant: false };
  }

  const nowIso = new Date().toISOString();
  const logRef = adminDb
    .collection("clinics")
    .doc(params.clinicId)
    .collection("conversationLogs")
    .doc(params.conversationId);

  // Backfill any history turns (idempotent), then ensure current pair exists.
  const count = await syncConversationLogMessagesFromHistory(adminDb, {
    clinicId: params.clinicId,
    conversationId: params.conversationId,
    history: params.history,
    userMessage,
    aiReply: assistantMessage,
    baseIso: nowIso,
    includeLiveSupportSystem: Boolean(params.isLiveSupport),
  });

  // Stamp response metadata on the assistant doc for diagnostics (no PII dump).
  const asstId = stableHistoryMessageDocId("assistant", assistantMessage);
  await logRef.collection("messages").doc(asstId).set(
    {
      responseType: params.responseType || "CHAT_REPLY",
      turnKey: visibleTurnIdempotencyKey({
        conversationId: params.conversationId,
        userMessage,
        assistantMessage,
        clientMessageId: params.clientMessageId,
      }),
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const patch: Record<string, unknown> = {
    clinicId: params.clinicId,
    updatedAt: nowIso,
    totalMessages: count,
    lastMessagePreview: userMessage.slice(0, 100) || assistantMessage.slice(0, 100),
  };
  if (params.appointmentState) patch.appointmentState = params.appointmentState;
  if (params.statusHint) patch.status = params.statusHint;

  const snap = await logRef.get();
  if (!snap.exists) {
    patch.createdAt = nowIso;
    patch.convertedToAppointment = false;
    patch.language = "tr";
    patch.status = params.statusHint || "open";
  }
  await logRef.set(patch, { merge: true });

  return { messageCount: count, persistedAssistant: true };
}
