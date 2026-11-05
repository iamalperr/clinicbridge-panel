import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { crawlSite, type CrawlResult } from "./crawl";
import { extractPreviewFacts } from "./extract";
import { classifyPreviewCrawlError } from "./fulfillRequest";
import { buildKnowledgeItems } from "./knowledge";
import { assertPublicResolution, parsePublicHttpUrl } from "./ssrf";
import { PREVIEW_TTL_MS, type PreviewFacts } from "./types";

export interface OperatorScanResult {
  previewId: string;
  requestStatus: "ready_for_review" | "sent" | null;
  pagesScanned: number;
  treatmentCount: number;
  languageCount: number;
  questionCount: number;
}

export function parsePreviewScanArgs(argv: string[]): { url: string; requestId: string | null } {
  const positional: string[] = [];
  let requestId: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--request") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("usage");
      requestId = value.trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error("usage");
    positional.push(arg);
  }
  if (positional.length !== 1 || !positional[0].trim()) throw new Error("usage");
  return { url: positional[0].trim(), requestId };
}

export function requestStatusAfterOperatorScan(current: string): "ready_for_review" | "sent" {
  return current === "sent" ? "sent" : "ready_for_review";
}

async function markRequestFailure(db: Firestore, requestId: string, currentStatus: string, error: unknown) {
  const status = currentStatus === "sent" ? "sent" : "needs_manual";
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENAI")) {
    await db.collection("previewRequests").doc(requestId).update({ status, crawlError: "unavailable" });
    return;
  }
  await db.collection("previewRequests").doc(requestId).update({
    status,
    crawlStatus: classifyPreviewCrawlError(error),
  });
}

/** Runs the same crawl and extraction as the server and stores the preview. */
export async function applyOperatorScan(rawUrl: string, requestId: string | null): Promise<OperatorScanResult> {
  const url = parsePublicHttpUrl(rawUrl);
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");

  let clinicName = "";
  let currentStatus = "received";
  let existingPreviewId = "";
  if (requestId) {
    const snap = await db.collection("previewRequests").doc(requestId).get();
    if (!snap.exists) throw new Error("not_found");
    const data = snap.data() ?? {};
    clinicName = typeof data.clinicName === "string" ? data.clinicName : "";
    currentStatus = typeof data.status === "string" ? data.status : "received";
    existingPreviewId = typeof data.previewId === "string" ? data.previewId : "";
  }

  let crawled: CrawlResult;
  let facts: PreviewFacts;
  try {
    await assertPublicResolution(url);
    crawled = await crawlSite(url.toString());
    facts = await extractPreviewFacts(crawled.corpus, {
      languages: crawled.languages,
      logoUrl: crawled.logoUrl,
      primaryColor: crawled.primaryColor,
    });
  } catch (error) {
    if (requestId) await markRequestFailure(db, requestId, currentStatus, error);
    throw error;
  }

  const named = { ...facts, clinicName: facts.clinicName || clinicName || null };
  const now = new Date();
  const payload = {
    ...named,
    sourceUrl: crawled.sourceUrl,
    embeddable: crawled.embeddable,
    pagesScanned: crawled.pages.length,
    knowledgeItems: buildKnowledgeItems(named),
    expiresAt: Timestamp.fromDate(new Date(now.getTime() + PREVIEW_TTL_MS)),
    updatedAt: Timestamp.fromDate(now),
  };
  let previewId = existingPreviewId;
  if (previewId) {
    await db.collection("previews").doc(previewId).set(payload, { merge: true });
  } else {
    const created = db.collection("previews").doc();
    previewId = created.id;
    await created.set({
      ...payload,
      messageCount: 0,
      ...(requestId ? { requestId } : {}),
      createdAt: Timestamp.fromDate(now),
    });
  }

  const requestStatus = requestId ? requestStatusAfterOperatorScan(currentStatus) : null;
  if (requestId) {
    await db.collection("previewRequests").doc(requestId).update({
      previewId,
      status: requestStatus,
      clinicName: named.clinicName || clinicName,
      crawlStatus: null,
      crawlError: null,
    });
  }

  return {
    previewId,
    requestStatus,
    pagesScanned: crawled.pages.length,
    treatmentCount: named.treatments.length,
    languageCount: named.languages.length,
    questionCount: named.faq.length,
  };
}
