import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import {
  sendClinicAppointmentEmail,
  sendPatientSms,
} from "@/lib/appointment-notifications";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* ── Client-side Firebase (for READS only — reads work without auth in most rules) ── */
function getClientDb() {
  const cfg = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) return null;
  try {
    const existing = getApps().find(a => a.name === "chat-api");
    const app = existing ?? initializeApp(cfg, "chat-api");
    return getFirestore(app);
  } catch (e) {
    return null;
  }
}

/* ── Firestore REST API write (bypasses security rules via API key) ───── */
async function firestoreRestAdd(
  projectId: string,
  apiKey: string,
  collectionPath: string,
  data: Record<string, any>
): Promise<string> {
  // Convert plain JS object to Firestore REST API format
  function toFirestoreValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === "boolean") return { booleanValue: val };
    if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    if (typeof val === "string") return { stringValue: val };
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
    if (typeof val === "object") {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        fields[k] = toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  // Extract document ID from the name field: "projects/.../documents/appointments/DOC_ID"
  const parts = json.name?.split("/") ?? [];
  return parts[parts.length - 1] ?? "unknown";
}

/* ── Appointment confirmation detection ──────────────────────────────── */
const CONFIRM_KEYWORDS = [
  "evet", "yes", "onaylıyorum", "onayliyorum", "tamam", "olur",
  "kabul", "evet lütfen", "evet lutfen", "tamamdır", "tamamdir",
  "harika", "ilerleyelim", "oluştur", "olustur", "yap",
];

function isConfirmation(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return CONFIRM_KEYWORDS.some(k =>
    lower === k ||
    lower.startsWith(k + " ") ||
    lower.startsWith(k + ".") ||
    lower.startsWith(k + "!") ||
    lower.startsWith(k + ",")
  );
}

/* ── Extract appointment data from conversation history ──────────────── */
interface AppointmentData {
  patientName: string;
  patientPhone: string;
  requestedService: string;
  requestedDate: string;
  requestedTime: string;
  originalText: string;
}

function extractAppointmentFromHistory(history: any[]): AppointmentData | null {
  const assistantMsgs = history.filter(h => h.role === "assistant").map(h => h.content as string);
  const userMsgs = history.filter(h => h.role === "user").map(h => h.content as string);

  // Find the last assistant message that contains a summary with Ad: and Telefon:
  const confirmMsg = [...assistantMsgs].reverse().find(m =>
    (m.includes("Ad:") || m.includes("ad:") || m.includes("Name:") || m.includes("İsim:")) &&
    (m.includes("Telefon:") || m.includes("Phone:") || m.includes("Tel:"))
  );

  if (!confirmMsg) {
    console.log("[appt-extract] No confirmation summary found in history. msgs:", assistantMsgs.length);
    return null;
  }

  console.log("[appt-extract] Found summary:", confirmMsg.slice(0, 300));

  // Extract each field with flexible regex
  const nameMatch    = confirmMsg.match(/(?:Ad|Name|İsim|Hasta):\s*([^\n\r]+)/i);
  const phoneMatch   = confirmMsg.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
  const serviceMatch = confirmMsg.match(/(?:Hizmet|Service|Tedavi|Treatment):\s*([^\n\r]+)/i);
  const dtMatch      = confirmMsg.match(/(?:Tarih\/Saat|Date\/Time|Tarih|Date|Saat):\s*([^\n\r]+)/i);

  const patientName      = nameMatch?.[1]?.trim() ?? "";
  const patientPhone     = phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "";
  const requestedService = serviceMatch?.[1]?.trim() ?? "Genel Muayene";

  // Parse date and time from the combined field
  let requestedDate = "";
  let requestedTime = "";
  if (dtMatch) {
    const dtStr = dtMatch[1].trim();
    // Look for time pattern HH:MM
    const timeInStr = dtStr.match(/(\d{1,2}:\d{2})/);
    if (timeInStr) {
      requestedTime = timeInStr[1];
      requestedDate = dtStr.replace(timeInStr[0], "").replace(/saat/gi, "").trim();
    } else {
      requestedDate = dtStr;
    }
  }

  const originalText = userMsgs.join(" | ");

  if (!patientName || !patientPhone) {
    console.log(`[appt-extract] Missing required fields: name="${patientName}" phone="${patientPhone}"`);
    return null;
  }

  console.log(`[appt-extract] ✅ name="${patientName}" phone="${patientPhone}" service="${requestedService}" date="${requestedDate}" time="${requestedTime}"`);
  return { patientName, patientPhone, requestedService, requestedDate, requestedTime, originalText };
}

/* ── Create appointment via REST API (no auth needed) ─────────────────── */
async function createAppointmentViaRest(params: {
  clinicId: string;
  clinicName: string;
  data: AppointmentData;
  conversationId: string;
}): Promise<{ appointmentId: string; emailSent: boolean }> {
  const { clinicId, clinicName, data, conversationId } = params;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId || !apiKey) {
    throw new Error("Firebase project config missing");
  }

  const now = new Date().toISOString();
  const apptDoc = {
    clinicId,
    clinicName,
    patientName:      data.patientName,
    patientPhone:     data.patientPhone,
    service:          data.requestedService,
    requestedService: data.requestedService,
    preferredDate:    data.requestedDate,
    requestedDate:    data.requestedDate,
    preferredTime:    data.requestedTime,
    requestedTime:    data.requestedTime,
    status:           "pending",
    source:           "widget",
    originalText:     data.originalText,
    conversationId,
    notificationStatus: {
      smsToPatient:  "pending",
      emailToClinic: "pending",
    },
    createdAt: now,
    updatedAt: now,
  };

  console.log(`[appointment-create] Writing to Firestore REST API...`);
  const appointmentId = await firestoreRestAdd(projectId, apiKey, "appointments", apptDoc);
  console.log(`[appointment-create] ✅ appointmentId=${appointmentId} patient="${data.patientName}"`);

  /* ── Find clinic email ────────────────────────────── */
  let clinicEmail = "";
  try {
    const adminDb = getAdminDb();
    const clientDb = adminDb ? null : getClientDb();

    if (adminDb) {
      const cSnap = await adminDb.collection("clinics").doc(clinicId).get();
      if (cSnap.exists) {
        clinicEmail = cSnap.data()!.notificationEmail ?? cSnap.data()!.email ?? "";
      }
      if (!clinicEmail) {
        const uSnap = await adminDb.collection("users").where("clinicId", "==", clinicId).limit(3).get();
        clinicEmail = uSnap.docs.map((d: any) => d.data().email).filter(Boolean)[0] ?? "";
      }
    } else if (clientDb) {
      const cSnap = await getDoc(doc(clientDb, "clinics", clinicId));
      if (cSnap.exists()) {
        clinicEmail = cSnap.data()!.notificationEmail ?? cSnap.data()!.email ?? "";
      }
      if (!clinicEmail) {
        const uSnap = await getDocs(query(collection(clientDb, "users"), where("clinicId", "==", clinicId)));
        clinicEmail = uSnap.docs.map(d => d.data().email).filter(Boolean)[0] ?? "";
      }
    }
    console.log(`[appointment-create] clinicEmail=${clinicEmail || "(none found)"}`);
  } catch (e: any) {
    console.warn("[appointment-create] Email lookup failed:", e.message);
  }

  /* ── SMS (mock) ───────────────────────────────────── */
  try {
    await sendPatientSms({
      phone:            data.patientPhone,
      clinicName,
      requestedDate:    data.requestedDate,
      requestedTime:    data.requestedTime,
      requestedService: data.requestedService,
    });
  } catch (e: any) {
    console.error("[appointment-sms] Error:", e.message);
  }

  /* ── Email to clinic ──────────────────────────────── */
  let emailSent = false;
  if (clinicEmail) {
    try {
      const result = await sendClinicAppointmentEmail({
        clinicName,
        clinicEmail,
        patientName:      data.patientName,
        patientPhone:     data.patientPhone,
        requestedService: data.requestedService,
        requestedDate:    data.requestedDate,
        requestedTime:    data.requestedTime,
        appointmentId,
      });
      emailSent = result.success;
      console.log(`[appointment-email] ${result.success ? "✅ sent" : "❌ failed"} → ${clinicEmail}`);
    } catch (e: any) {
      console.error("[appointment-email] Error:", e.message);
    }
  } else {
    console.warn(`[appointment-email] No email found for clinicId=${clinicId}`);
  }

  /* ── Update notification status via REST ──────────── */
  try {
    const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments/${appointmentId}` +
      `?updateMask.fieldPaths=notificationStatus.smsToPatient&updateMask.fieldPaths=notificationStatus.emailToClinic&key=${apiKey}`;
    await fetch(updateUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          notificationStatus: {
            mapValue: {
              fields: {
                smsToPatient:  { stringValue: "sent" },
                emailToClinic: { stringValue: emailSent ? "sent" : (clinicEmail ? "failed" : "skipped") },
              },
            },
          },
        },
      }),
    });
  } catch (e) { /* non-critical */ }

  return { appointmentId, emailSent };
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN POST HANDLER
═══════════════════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
  const startTime = Date.now();
  const debugLog: string[] = [];

  try {
    const { clinicId, message, history = [], conversationId = "" } = await req.json();
    debugLog.push(`clinicId=${clinicId} msg="${message?.slice(0, 60)}"`);

    if (!clinicId || !message) {
      return NextResponse.json({ error: "clinicId and message required" }, { status: 400, headers: CORS });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { reply: "Yapay zeka servisi şu an yapılandırılmamış. Lütfen kliniğimizi arayın." },
        { headers: CORS }
      );
    }

    /* ── DB for reads ──────────────────────────────────────────────────── */
    const adminDb  = getAdminDb();
    const clientDb = adminDb ? null : getClientDb();
    debugLog.push(`db=admin:${!!adminDb} client:${!!clientDb}`);

    let clinicName    = "Klinik";
    let promptSettings: any = null;
    let trainingDocs: Array<{ title: string; content: string }> = [];

    if (adminDb) {
      const [clinicSnap, promptSnap, materialsSnap] = await Promise.all([
        adminDb.collection("clinics").doc(clinicId).get(),
        adminDb.collection("promptSettings").doc(clinicId).get(),
        adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(30).get(),
      ]);
      if (clinicSnap.exists) clinicName = clinicSnap.data()!.name ?? "Klinik";
      if (promptSnap.exists) promptSettings = promptSnap.data();
      trainingDocs = materialsSnap.docs.map(d => ({ title: d.data().title ?? "", content: d.data().content ?? "" }));
      debugLog.push(`[admin] clinic="${clinicName}" docs=${trainingDocs.length}`);
    } else if (clientDb) {
      const [clinicSnap, promptSnap] = await Promise.all([
        getDoc(doc(clientDb, "clinics", clinicId)),
        getDoc(doc(clientDb, "promptSettings", clinicId)),
      ]);
      if (clinicSnap.exists()) clinicName = clinicSnap.data()!.name ?? "Klinik";
      if (promptSnap.exists()) promptSettings = promptSnap.data();
      const materialsSnap = await getDocs(query(collection(clientDb, "trainingMaterials"), where("clinicId", "==", clinicId)));
      trainingDocs = materialsSnap.docs.map(d => ({ title: d.data().title ?? "", content: d.data().content ?? "" }));
      debugLog.push(`[client] clinic="${clinicName}" docs=${trainingDocs.length}`);
    }

    /* ── Relevance scoring ─────────────────────────────────────────────── */
    const msgLower = message.toLowerCase();
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);
    const scored = trainingDocs.map(d => {
      const text = (d.title + " " + d.content).toLowerCase();
      const score = msgWords.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);
      return { ...d, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const topDocs = scored.slice(0, 12);
    const knowledgeContext = topDocs.length > 0
      ? topDocs.map(d => `## ${d.title}\n${d.content}`).join("\n\n---\n\n")
      : "";
    debugLog.push(`topDocs=[${topDocs.slice(0, 4).map(d => d.title).join(", ")}]`);

    /* ── SERVER-SIDE confirmation → appointment creation ──────────────── */
    if (isConfirmation(message) && history.length > 0) {
      debugLog.push("CONFIRM_DETECTED");
      console.log(`[widget-chat] Confirmation detected: "${message}" — extracting appointment...`);

      const apptData = extractAppointmentFromHistory(history);

      if (apptData) {
        try {
          const { appointmentId, emailSent } = await createAppointmentViaRest({
            clinicId,
            clinicName,
            data: apptData,
            conversationId: conversationId || `session_${Date.now()}`,
          });

          const firstName = apptData.patientName.split(" ")[0];
          const confirmReply =
            `Randevu talebinizi aldım${firstName ? " " + firstName + " Bey/Hanım" : ""}! ` +
            `${apptData.requestedDate} saat ${apptData.requestedTime} için ` +
            `"${apptData.requestedService}" talebiniz kliniğimize iletildi. ` +
            `Klinik ekibimiz uygunluğu kontrol ederek size dönüş yapacaktır. 🙏` +
            (emailSent ? " Klinik yönetimine e-posta bildirimi gönderildi." : "");

          debugLog.push(`appt_created=${appointmentId} email=${emailSent} ms=${Date.now() - startTime}`);
          console.log("[widget-chat]", debugLog.join(" | "));
          return NextResponse.json(
            { reply: confirmReply, appointmentId, appointmentCreated: true },
            { headers: CORS }
          );
        } catch (e: any) {
          console.error("[appointment-create] ❌ Failed:", e.message);
          debugLog.push(`appt_failed: ${e.message}`);
          console.log("[widget-chat]", debugLog.join(" | "));
          return NextResponse.json(
            { reply: "Randevu talebinizi şu anda sisteme kaydedemedim. Lütfen kliniğimizi doğrudan arayın veya birkaç dakika sonra tekrar deneyin." },
            { headers: CORS }
          );
        }
      } else {
        debugLog.push("confirm_but_no_summary_found");
        console.log("[widget-chat] Confirmation but no appointment summary in history — fallback to AI");
      }
    }

    /* ── Normal AI call ───────────────────────────────────────────────── */
    const customPrompt = promptSettings?.systemPrompt ?? "";
    const today = new Date().toLocaleDateString("tr-TR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const systemPrompt = [
      `Sen ${clinicName}'nin dijital hasta asistanısın. Bugünün tarihi: ${today}.`,
      customPrompt ? `\nKLİNİĞE ÖZEL TALİMATLAR:\n${customPrompt}` : "",
      knowledgeContext
        ? `\nKLİNİK BİLGİ HAVUZU:\n\n${knowledgeContext}`
        : "\n(Bu klinik için henüz eğitim verisi eklenmemiş.)",
      `\nRANDEVU AKIŞI:
Kullanıcı randevu almak istediğinde:
1. Şu bilgileri topla: Ad Soyad, Telefon, Hizmet/Tedavi, Tarih, Saat.
2. Tüm bilgiler tamam olunca MUTLAKA şu formatta özet ve onay iste:
   "Harika! Şu bilgilerle randevu talebi oluşturayım mı?
   Ad: [isim]
   Telefon: [telefon]
   Hizmet: [hizmet]
   Tarih/Saat: [tarih] saat [saat]
   Onaylıyor musunuz? (Evet/Hayır)"
3. Kullanıcı Evet dediğinde sistem otomatik randevu oluşturacak.

GENEL KURALLAR:
- Kesin tıbbi teşhis veya fiyat garantisi verme.
- Gerçek zamanlı müsaitlik bilgin yok.
- Yanıtların kısa (max 4 cümle), nazik olsun.
- Türkçe sorulara Türkçe, İngilizce sorulara İngilizce yanıt ver.`,
    ].join("");

    debugLog.push("calling OpenAI...");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model:       promptSettings?.model ?? "gpt-4o-mini",
      temperature: promptSettings?.temperature ?? 0.5,
      max_tokens:  600,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-12).map((h: any) => ({
          role:    h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim()
      ?? "Üzgünüm, şu an yanıt üretemiyorum.";

    debugLog.push(`OK reply="${reply.slice(0, 60)}" ms=${Date.now() - startTime}`);
    console.log("[widget-chat]", debugLog.join(" | "));

    return NextResponse.json({ reply }, { headers: CORS });

  } catch (err: any) {
    debugLog.push(`ERROR: ${err.message ?? err}`);
    console.error("[widget-chat]", debugLog.join(" | "), err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen kliniğimizi doğrudan arayın." },
      { status: 200, headers: CORS }
    );
  }
}
