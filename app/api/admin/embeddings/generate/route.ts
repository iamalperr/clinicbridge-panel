import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateEmbeddings, chunkText } from "@/lib/services/embeddingService";

export const maxDuration = 60; // Allow 60 seconds for embedding generation

export async function POST(req: Request) {
  try {
    const { docPath } = await req.json();

    if (!docPath) {
      return NextResponse.json({ error: "docPath is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }

    const docRef = adminDb.doc(docPath);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const data = docSnap.data();
    if (!data) {
      return NextResponse.json({ error: "Document is empty" }, { status: 400 });
    }

    // Combine title and content for embedding
    const title = data.title || "";
    const content = data.content || data.notes || ""; // Handle different schema variants
    const fullText = `${title}\n\n${content}`.trim();

    if (!fullText) {
      await docRef.update({
        embedding_status: "indexed",
        embeddingChunks: [],
        indexed_at: new Date(),
        last_error: null,
      });
      return NextResponse.json({ success: true, chunks: 0 });
    }

    // Chunk the text
    const textChunks = chunkText(fullText);

    // Generate embeddings
    const embeddings = await generateEmbeddings(textChunks);

    // Structure for saving
    const embeddingChunks = textChunks.map((text, i) => ({
      text,
      embedding: embeddings[i],
      chunk_index: i,
      entity_type: data.entity_type || "general",
    }));

    // Update document
    await docRef.update({
      embedding_status: "indexed",
      embeddingChunks,
      indexed_at: new Date(),
      index_version: "v1", // track index version
      last_error: null,
    });

    return NextResponse.json({
      success: true,
      chunksCount: embeddingChunks.length,
    });
  } catch (error: any) {
    console.error("[generate-embeddings] Error:", error);
    
    // Attempt to update the document with failure status
    try {
      const { docPath } = await req.clone().json();
      if (docPath) {
         const adminDb = getAdminDb();
         if (adminDb) {
           await adminDb.doc(docPath).update({
             embedding_status: "failed",
             last_error: error.message || "Unknown error",
           });
         }
      }
    } catch (fallbackError) {
      console.error("[generate-embeddings] Failed to write error status:", fallbackError);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
