import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendClinicEmail } from "@/lib/trial/sendClinicEmail";
import { crawlSite } from "./crawl";
import { extractPreviewFacts } from "./extract";
import { buildKnowledgeItems } from "./knowledge";
import { PreviewUrlError } from "./ssrf";
import { PREVIEW_TTL_MS } from "./types";

export const PREVIEW_REQUEST_NOTIFY = "info@clinicbridge-ai.com";

export type PreviewCrawlStatus = "blocked" | "timeout" | "not_found" | "empty";

export function classifyPreviewCrawlError(error: unknown): PreviewCrawlStatus {
  const code = error instanceof PreviewUrlError ? error.code : "";
  if (code === "timeout") return "timeout";
  if (code === "not_found" || code === "dns") return "not_found";
  if (code === "empty") return "empty";
  if (code === "blocked" || code === "private" || code === "host") return "blocked";
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "TimeoutError" || name === "AbortError" || /timeout/i.test(message)) return "timeout";
  return "blocked";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

/** Saves a preview when the crawl yields facts. The clinic email never includes the preview link. */
export async function fulfillPreviewRequest(requestId: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection("previewRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() ?? {};
  if (data.status !== "received") return;

  const clinicName = typeof data.clinicName === "string" ? data.clinicName : "";
  const website = typeof data.website === "string" ? data.website : "";
  const email = typeof data.email === "string" ? data.email : "";
  const phone = typeof data.phone === "string" ? data.phone : "";

  if (data.clinicEmailSent !== true) {
    const clinicEmailSent = await sendClinicEmail({
      to: email,
      subject: "Önizleme talebinizi aldık",
      html: [
        "<p>Önizleme talebinizi aldık. Botunuzu sitenizdeki bilgilerle hazırlayıp 24 saat içinde size özel linki e-postayla göndereceğiz.</p>",
        "<p>We received your preview request. We will prepare your bot from your website and email your private link within 24 hours.</p>",
      ].join(""),
    });
    await ref.update({ clinicEmailSent });
  }

  let status: "ready_for_review" | "needs_manual" = "needs_manual";
  let crawlStatus: PreviewCrawlStatus | null = null;
  try {
    const crawled = await crawlSite(website);
    const facts = await extractPreviewFacts(crawled.corpus, {
      languages: crawled.languages,
      logoUrl: crawled.logoUrl,
      primaryColor: crawled.primaryColor,
    });
    const named = { ...facts, clinicName: facts.clinicName || clinicName || null };
    const knowledgeItems = buildKnowledgeItems(named);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + PREVIEW_TTL_MS);
    const previewRef = db.collection("previews").doc();
    await previewRef.set({
      ...named,
      sourceUrl: crawled.sourceUrl,
      embeddable: crawled.embeddable,
      pagesScanned: crawled.pages.length,
      knowledgeItems,
      messageCount: 0,
      requestId,
      createdAt: Timestamp.fromDate(createdAt),
      expiresAt: Timestamp.fromDate(expiresAt),
    });
    status = "ready_for_review";
    await ref.update({ status, previewId: previewRef.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("OPENAI")) {
      await ref.update({ status, crawlError: "unavailable" });
    } else {
      crawlStatus = classifyPreviewCrawlError(error);
      await ref.update({ status, crawlStatus });
    }
  }

  if (data.adminEmailSent === true) return;
  const detail = crawlStatus ? `${status} (${crawlStatus})` : status;
  const adminEmailSent = await sendClinicEmail({
    to: PREVIEW_REQUEST_NOTIFY,
    subject: `Yeni önizleme talebi: ${clinicName}`,
    html: [
      `<p>Yeni önizleme talebi: ${escapeHtml(clinicName)}, durum: ${escapeHtml(detail)}</p>`,
      `<p>Site: ${escapeHtml(website)}</p>`,
      `<p>E-posta: ${escapeHtml(email)}</p>`,
      phone ? `<p>Telefon: ${escapeHtml(phone)}</p>` : "",
    ].join(""),
  });
  await ref.update({ adminEmailSent });
}
