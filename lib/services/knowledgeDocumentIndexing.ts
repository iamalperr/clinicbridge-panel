/**
 * Indexes a Firestore knowledge / training document with OpenAI embeddings.
 * Shared by the admin embeddings API and sync/install scripts.
 */

import type { Firestore } from "firebase-admin/firestore";
import { chunkText, generateEmbeddings } from "@/lib/services/embeddingService";

export type KnowledgeIndexResult =
  | { ok: true; chunksCount: number }
  | { ok: false; error: string };

/**
 * Read doc at path, embed title+content, write embeddingChunks + indexed status.
 * On failure writes embedding_status=failed when the doc exists.
 */
export async function indexKnowledgeDocument(
  adminDb: Firestore,
  docPath: string
): Promise<KnowledgeIndexResult> {
  const path = String(docPath || "").trim();
  if (!path) return { ok: false, error: "docPath is required" };

  const docRef = adminDb.doc(path);

  try {
    const docSnap = await docRef.get();
    if (!docSnap.exists) return { ok: false, error: "Document not found" };

    const data = docSnap.data() || {};
    const title = String(data.title || "");
    const content = String(data.content || data.notes || "");
    const fullText = `${title}\n\n${content}`.trim();

    if (!fullText) {
      await docRef.update({
        embedding_status: "indexed",
        embeddingChunks: [],
        indexed_at: new Date().toISOString(),
        last_error: null,
      });
      return { ok: true, chunksCount: 0 };
    }

    const textChunks = chunkText(fullText);
    const embeddings = await generateEmbeddings(textChunks);
    const embeddingChunks = textChunks.map((text, i) => ({
      text,
      embedding: embeddings[i],
      chunk_index: i,
      entity_type: data.entity_type || "general",
    }));

    await docRef.update({
      embedding_status: "indexed",
      embeddingChunks,
      indexed_at: new Date().toISOString(),
      index_version: "v1",
      last_error: null,
    });

    return { ok: true, chunksCount: embeddingChunks.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    try {
      await docRef.update({
        embedding_status: "failed",
        last_error: message,
      });
    } catch {
      /* doc may be missing */
    }
    return { ok: false, error: message };
  }
}
