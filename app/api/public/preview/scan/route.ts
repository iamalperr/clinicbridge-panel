import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { extractClientIp } from "@/lib/auth/passwordResetRateLimit";
import { crawlSite } from "@/lib/preview/crawl";
import { extractPreviewFacts } from "@/lib/preview/extract";
import { buildKnowledgeItems } from "@/lib/preview/knowledge";
import { consumeScanRateLimit, hashScanIp } from "@/lib/preview/rateLimit";
import { PreviewUrlError, parsePublicHttpUrl } from "@/lib/preview/ssrf";
import { PREVIEW_TTL_MS } from "@/lib/preview/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: CORS });
}

export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_url");
  }

  try {
    parsePublicHttpUrl(typeof body.url === "string" ? body.url : "");
  } catch {
    return jsonError(400, "invalid_url");
  }

  const db = getAdminDb();
  if (!db) return jsonError(503, "unavailable");

  const allowed = await consumeScanRateLimit(db, hashScanIp(extractClientIp(req)));
  if (!allowed) return jsonError(429, "rate_limited");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        send({ stage: "reading" });
        const crawled = await crawlSite(String(body.url));
        send({ stage: "extracting" });
        const facts = await extractPreviewFacts(crawled.corpus, {
          languages: crawled.languages,
          logoUrl: crawled.logoUrl,
          primaryColor: crawled.primaryColor,
        });
        const knowledgeItems = buildKnowledgeItems(facts);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + PREVIEW_TTL_MS);
        const ref = db.collection("previews").doc();
        await ref.set({
          ...facts,
          sourceUrl: crawled.sourceUrl,
          embeddable: crawled.embeddable,
          pagesScanned: crawled.pages.length,
          knowledgeItems,
          messageCount: 0,
          createdAt: Timestamp.fromDate(createdAt),
          expiresAt: Timestamp.fromDate(expiresAt),
        });
        send({
          stage: "done",
          previewId: ref.id,
          summary: {
            treatments: facts.treatments.length,
            languages: facts.languages.length,
            questions: facts.faq.length,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code = error instanceof PreviewUrlError ? error.code : "";
        const errorCode = message.includes("OPENAI")
          ? "unavailable"
          : code === "empty"
            ? "empty"
            : code === "private" || code === "host"
              ? "invalid_url"
              : "unreachable";
        send({ stage: "error", error: errorCode });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
