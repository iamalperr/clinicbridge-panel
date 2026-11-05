import { NextResponse } from "next/server";
import { FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { requireClinicCaller } from "@/lib/setup/caller";
import {
  SETUP_CATEGORIES,
  draftsFromSetup,
  parseFaq,
  parseTreatment,
  type SetupCategory,
  type SetupFaqInput,
  type SetupTreatmentInput,
} from "@/lib/setup/materials";
import { buildWidgetEmbedCode } from "@/lib/widget/embedCode";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireClinicCaller(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await readSetup(auth.caller.db, auth.caller.clinicId, auth.caller.clinic));
}

export async function PATCH(req: Request) {
  const auth = await requireClinicCaller(req);
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const treatments = asTreatments(body.treatments);
  const faq = asFaq(body.faq);
  const hours = block(body.hours, 500);
  const doNotSay = block(body.doNotSay, 2000);
  const appointmentEmail = text(body.appointmentEmail, 200).toLowerCase();
  const appointmentWhatsapp = text(body.appointmentWhatsapp, 24);
  if (appointmentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointmentEmail)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (body.complete === true && !appointmentEmail && appointmentWhatsapp.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "contact_required" }, { status: 400 });
  }
  const { db, clinicId, clinic, language } = auth.caller;
  const drafts = draftsFromSetup({
    treatments,
    hours,
    faq,
    doNotSay,
    language: language === "en" ? "EN" : "TR",
  });
  const existing = await db.collection("trainingMaterials").where("clinicId", "==", clinicId).get();
  const batch = db.batch();
  existing.docs.forEach((item) => {
    if (SETUP_CATEGORIES.includes(item.data().category as SetupCategory)) batch.delete(item.ref);
  });
  for (const draft of drafts) {
    const ref = db.collection("trainingMaterials").doc();
    batch.set(ref, {
      title: draft.title,
      content: draft.content,
      category: draft.category,
      language: draft.language,
      type: "note",
      status: "learned",
      source: "setup",
      clinicId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.update(db.collection("clinics").doc(clinicId), {
    workingHours: hours,
    appointmentEmail,
    whatsappNumber: appointmentWhatsapp,
    setupCompleted: body.complete === true ? true : clinic.setupCompleted === true,
  });
  await batch.commit();
  const fresh = await db.collection("clinics").doc(clinicId).get();
  return NextResponse.json(await readSetup(db, clinicId, fresh.data() || {}));
}

async function readSetup(db: Firestore, clinicId: string, clinic: DocumentData) {
  const snap = await db.collection("trainingMaterials").where("clinicId", "==", clinicId).get();
  const treatments: Array<{ id: string; name: string; priceRange: string }> = [];
  const faq: Array<{ id: string; question: string; answer: string }> = [];
  let hours = typeof clinic.workingHours === "string" ? clinic.workingHours : "";
  let doNotSay = "";
  snap.docs.forEach((item) => {
    const data = item.data();
    if (data.category === "Tedaviler") {
      const parsed = parseTreatment(String(data.title || ""), String(data.content || ""));
      treatments.push({ id: item.id, ...parsed });
    } else if (data.category === "Sık Sorulan Sorular") {
      const parsed = parseFaq(String(data.title || ""), String(data.content || ""));
      faq.push({ id: item.id, ...parsed });
    } else if (data.category === "Çalışma Saatleri" && !hours) {
      hours = String(data.content || "");
    } else if (data.category === "Söylenmemesi Gerekenler") {
      doNotSay = String(data.content || "");
    }
  });
  const installedAt = clinic.widgetInstalledAt?.toDate?.()?.toISOString?.()
    || (typeof clinic.widgetInstalledAt === "string" ? clinic.widgetInstalledAt : null);
  return {
    clinicId,
    clinicName: typeof clinic.name === "string" ? clinic.name : "",
    treatments,
    hours,
    faq,
    doNotSay,
    appointmentEmail: typeof clinic.appointmentEmail === "string" ? clinic.appointmentEmail : (typeof clinic.email === "string" ? clinic.email : ""),
    appointmentWhatsapp: typeof clinic.whatsappNumber === "string" ? clinic.whatsappNumber : "",
    widgetInstalledAt: installedAt,
    installedDomain: typeof clinic.installedDomain === "string" ? clinic.installedDomain : null,
    setupCompleted: clinic.setupCompleted === true,
    embedCode: buildWidgetEmbedCode(clinicId),
  };
}

function block(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function asTreatments(value: unknown): SetupTreatmentInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((entry) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: typeof record.id === "string" ? record.id : undefined,
      name: text(record.name, 120),
      priceRange: text(record.priceRange, 80),
    };
  });
}

function asFaq(value: unknown): SetupFaqInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: typeof record.id === "string" ? record.id : undefined,
      question: text(record.question, 200),
      answer: block(record.answer, 600),
    };
  });
}
