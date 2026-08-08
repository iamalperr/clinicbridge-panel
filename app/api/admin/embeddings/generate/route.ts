import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { indexKnowledgeDocument } from "@/lib/services/knowledgeDocumentIndexing";

export const maxDuration = 60; // Allow 60 seconds for embedding generation

export async function POST(req: Request) {
  // Capture path before any work so failure status can always be written
  // (req body can only be read once — previous clone().json() left docs stuck on indexing).
  let docPath = "";
  try {
    const body = await req.json();
    docPath = String(body?.docPath || "").trim();

    if (!docPath) {
      return NextResponse.json({ error: "docPath is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }

    const result = await indexKnowledgeDocument(adminDb, docPath);
    if (!result.ok) {
      const status = result.error === "Document not found" ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      chunksCount: result.chunksCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-embeddings] Error:", message);

    if (docPath) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          await adminDb.doc(docPath).update({
            embedding_status: "failed",
            last_error: message,
          });
        }
      } catch (fallbackError) {
        console.error("[generate-embeddings] Failed to write error status:", fallbackError);
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
