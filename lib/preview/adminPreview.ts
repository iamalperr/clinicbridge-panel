import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { sendClinicEmail } from "@/lib/trial/sendClinicEmail";
import { buildPreviewChatMessages, type PreviewChatTurn } from "./chat";
import { crawlSite } from "./crawl";
import { extractPreviewFacts } from "./extract";
import { classifyPreviewCrawlError, fulfillPreviewRequest, type PreviewCrawlStatus } from "./fulfillRequest";
import {
  buildPreviewLinkEmail,
  clipText,
  editableFromFacts,
  emptyPreviewFacts,
  factsFromEditable,
  mergePreviewFacts,
  previewPublicUrl,
  type EditablePreview,
} from "./adminFacts";
import { buildKnowledgeItems } from "./knowledge";
import { assertPublicResolution, parsePublicHttpUrl, PreviewUrlError } from "./ssrf";
import { PREVIEW_TTL_MS, type PreviewFacts, type PreviewKnowledgeItem } from "./types";

export type { EditablePreview };

function asFacts(data: Record<string, unknown> | undefined): PreviewFacts {
  if (!data) return emptyPreviewFacts();
  const treatments = Array.isArray(data.treatments)
    ? data.treatments.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as { name?: unknown; priceRange?: unknown };
        const name = clipText(record.name, 120);
        if (!name) return [];
        return [{ name, priceRange: clipText(record.priceRange, 80) || null }];
      })
    : [];
  const faq = Array.isArray(data.faq)
    ? data.faq.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as { question?: unknown; answer?: unknown };
        const question = clipText(record.question, 240);
        const answer = clipText(record.answer, 600);
        if (!question || !answer) return [];
        return [{ question, answer }];
      })
    : [];
  return {
    clinicName: clipText(data.clinicName, 120) || null,
    treatments,
    address: clipText(data.address, 240) || null,
    hours: clipText(data.hours, 240) || null,
    phone: clipText(data.phone, 40) || null,
    whatsapp: clipText(data.whatsapp, 40) || null,
    languages: Array.isArray(data.languages) ? data.languages.filter((item): item is string => typeof item === "string") : [],
    faq,
    logoUrl: clipText(data.logoUrl, 400) || null,
    primaryColor: clipText(data.primaryColor, 16) || null,
  };
}

async function loadRequest(db: Firestore, requestId: string) {
  const ref = db.collection("previewRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() ?? {} };
}

async function upsertPreview(db: Firestore, requestId: string, facts: PreviewFacts, sourceUrl: string): Promise<string> {
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const knowledgeItems = buildKnowledgeItems(facts);
  const now = new Date();
  const previewId = typeof loaded.data.previewId === "string" ? loaded.data.previewId : "";
  const payload = {
    ...facts,
    sourceUrl,
    knowledgeItems,
    expiresAt: Timestamp.fromDate(new Date(now.getTime() + PREVIEW_TTL_MS)),
    updatedAt: Timestamp.fromDate(now),
  };
  let id = previewId;
  if (id) {
    await db.collection("previews").doc(id).set(payload, { merge: true });
  } else {
    const created = db.collection("previews").doc();
    id = created.id;
    await created.set({
      ...payload,
      embeddable: false,
      pagesScanned: 0,
      messageCount: 0,
      requestId,
      createdAt: Timestamp.fromDate(now),
    });
  }
  const status = loaded.data.status === "sent" ? "sent" : "ready_for_review";
  await loaded.ref.update({
    previewId: id,
    status,
    clinicName: facts.clinicName || loaded.data.clinicName || "",
  });
  return id;
}

export async function listPreviewRequests() {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const snap = await db.collection("previewRequests").orderBy("createdAt", "desc").limit(40).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() as Date | undefined;
    return {
      id: doc.id,
      clinicName: typeof data.clinicName === "string" ? data.clinicName : "",
      website: typeof data.website === "string" ? data.website : "",
      email: typeof data.email === "string" ? data.email : "",
      createdAt: createdAt ? createdAt.toISOString() : null,
      status: typeof data.status === "string" ? data.status : "received",
      source: data.source === "manual" ? "manual" : "direct",
      viewCount: typeof data.viewCount === "number" ? data.viewCount : 0,
      crawlStatus: typeof data.crawlStatus === "string" ? data.crawlStatus : null,
      previewId: typeof data.previewId === "string" ? data.previewId : null,
    };
  });
}

export async function readPreviewRequest(requestId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) return null;
  const previewId = typeof loaded.data.previewId === "string" ? loaded.data.previewId : "";
  const preview = previewId ? await db.collection("previews").doc(previewId).get() : null;
  const facts = preview?.exists ? asFacts(preview.data()) : emptyPreviewFacts();
  if (!facts.clinicName && typeof loaded.data.clinicName === "string") facts.clinicName = loaded.data.clinicName;
  return {
    id: requestId,
    clinicName: typeof loaded.data.clinicName === "string" ? loaded.data.clinicName : "",
    website: typeof loaded.data.website === "string" ? loaded.data.website : "",
    email: typeof loaded.data.email === "string" ? loaded.data.email : "",
    phone: typeof loaded.data.phone === "string" ? loaded.data.phone : "",
    status: typeof loaded.data.status === "string" ? loaded.data.status : "received",
    source: loaded.data.source === "manual" ? "manual" : "direct",
    viewCount: typeof loaded.data.viewCount === "number" ? loaded.data.viewCount : 0,
    crawlStatus: typeof loaded.data.crawlStatus === "string" ? loaded.data.crawlStatus : null,
    previewId: previewId || null,
    facts: editableFromFacts(facts),
  };
}

export async function savePreviewEdits(requestId: string, editable: EditablePreview): Promise<string> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const website = typeof loaded.data.website === "string" ? loaded.data.website : "";
  return upsertPreview(db, requestId, factsFromEditable(editable), website);
}

export async function rescanPreviewRequest(requestId: string): Promise<{ status: string; crawlStatus: PreviewCrawlStatus | null }> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const website = typeof loaded.data.website === "string" ? loaded.data.website : "";
  const clinicName = typeof loaded.data.clinicName === "string" ? loaded.data.clinicName : "";
  try {
    const crawled = await crawlSite(website);
    const facts = await extractPreviewFacts(crawled.corpus, {
      languages: crawled.languages,
      logoUrl: crawled.logoUrl,
      primaryColor: crawled.primaryColor,
    });
    await upsertPreview(db, requestId, { ...facts, clinicName: facts.clinicName || clinicName || null }, crawled.sourceUrl);
    const status = loaded.data.status === "sent" ? "sent" : "ready_for_review";
    await loaded.ref.update({ status, crawlStatus: null, crawlError: null });
    return { status, crawlStatus: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = loaded.data.status === "sent" ? "sent" : "needs_manual";
    if (message.includes("OPENAI")) {
      await loaded.ref.update({ status, crawlError: "unavailable" });
      return { status, crawlStatus: null };
    }
    const crawlStatus = classifyPreviewCrawlError(error);
    await loaded.ref.update({ status, crawlStatus });
    return { status, crawlStatus };
  }
}

export async function extractIntoPreview(requestId: string, corpus: string): Promise<string> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const previewId = typeof loaded.data.previewId === "string" ? loaded.data.previewId : "";
  const existing = previewId ? await db.collection("previews").doc(previewId).get() : null;
  const base = existing?.exists ? asFacts(existing.data()) : emptyPreviewFacts();
  const extracted = await extractPreviewFacts(corpus.slice(0, 24_000), {
    languages: base.languages,
    logoUrl: base.logoUrl,
    primaryColor: base.primaryColor,
  });
  const website = typeof loaded.data.website === "string" ? loaded.data.website : "";
  return upsertPreview(db, requestId, mergePreviewFacts(base, extracted), website);
}

export async function replyForPreview(requestId: string, message: string, history: PreviewChatTurn[]): Promise<string> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const previewId = typeof loaded.data.previewId === "string" ? loaded.data.previewId : "";
  if (!previewId) throw new Error("no_preview");
  const preview = await db.collection("previews").doc(previewId).get();
  const knowledge = Array.isArray(preview.data()?.knowledgeItems) ? preview.data()!.knowledgeItems as PreviewKnowledgeItem[] : [];
  const response = await trackableAIRequest({
    channel: "system",
    requestType: "system",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 400,
    messages: buildPreviewChatMessages(knowledge, history, message),
  });
  return response.content?.trim() || "Şu an yanıt üretemiyorum.";
}

export async function sendPreviewLink(requestId: string): Promise<{ sent: boolean }> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const loaded = await loadRequest(db, requestId);
  if (!loaded) throw new Error("not_found");
  const previewId = typeof loaded.data.previewId === "string" ? loaded.data.previewId : "";
  const email = typeof loaded.data.email === "string" ? loaded.data.email : "";
  const clinicName = typeof loaded.data.clinicName === "string" ? loaded.data.clinicName : "";
  if (!previewId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("no_preview");
  const letter = buildPreviewLinkEmail(clinicName, previewPublicUrl(previewId));
  const sent = await sendClinicEmail({ to: email, subject: letter.subject, html: letter.html });
  if (!sent) return { sent: false };
  await loaded.ref.update({ status: "sent", linkSentAt: Timestamp.now() });
  return { sent: true };
}

export async function createManualPreview(input: { clinicName: string; website: string; email: string }): Promise<string> {
  const db = getAdminDb();
  if (!db) throw new Error("unavailable");
  const clinicName = clipText(input.clinicName, 120);
  const email = clipText(input.email, 160);
  const url = parsePublicHttpUrl(input.website);
  try {
    await assertPublicResolution(url);
  } catch (error) {
    if (!(error instanceof PreviewUrlError) || error.code !== "dns") throw error;
  }
  const website = url.toString();
  if (!clinicName) throw new Error("invalid");
  const created = await db.collection("previewRequests").add({
    clinicName,
    website,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: null,
    consent: true,
    status: "received",
    source: "manual",
    viewCount: 0,
    clinicEmailSent: false,
    adminEmailSent: false,
    createdAt: Timestamp.now(),
  });
  await fulfillPreviewRequest(created.id, { notifyClinic: false, notifyAdmin: false });
  return created.id;
}
