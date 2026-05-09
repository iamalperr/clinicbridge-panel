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

/* ── Convert JS object → Firestore REST value format ──────────────────── */
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) { fields[k] = toFirestoreValue(v); }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) { fields[k] = toFirestoreValue(v); }
  return fields;
}

/* ── Firebase Anonymous Auth → get idToken ─────────────────────────────── */
async function getFirebaseAnonToken(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[firebase-anon] Auth failed ${res.status}:`, data?.error?.message ?? JSON.stringify(data).slice(0, 120));
      return null;
    }
    console.log(`[firebase-anon] ✅ Got anon token uid=${data.localId}`);
    return data.idToken ?? null;
  } catch (e: any) {
    console.warn("[firebase-anon] Network error:", e.message);
    return null;
  }
}

/* ── Firestore REST API write ───────────────────────────────────────────── */
async function firestoreRestAdd(
  projectId: string,
  apiKey: string,
  collectionPath: string,
  data: Record<string, any>,
  idToken?: string | null
): Promise<string> {
  const fields = toFirestoreFields(data);

  // Strategy 1: use Bearer token (works when rules require auth)
  // Strategy 2: use API key only (works when rules allow unauthenticated writes)
  const strategies: Array<{ url: string; headers: Record<string, string> }> = [];

  if (idToken) {
    strategies.push({
      url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    });
  }
  // Always add API key fallback
  strategies.push({
    url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}?key=${apiKey}`,
    headers: { "Content-Type": "application/json" },
  });

  let lastError = "";
  for (const { url, headers } of strategies) {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ fields }) });
    if (res.ok) {
      const json = await res.json();
      const parts = (json.name ?? "").split("/");
      return parts[parts.length - 1] ?? "unknown";
    }
    const errText = await res.text();
    lastError = `HTTP ${res.status}: ${errText.slice(0, 300)}`;
    console.warn(`[firestore-rest] Strategy failed — ${lastError}`);
  }

  throw new Error(`All Firestore write strategies failed. Last error: ${lastError}`);
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

/* ── Create appointment — Admin SDK (primary) or REST API (fallback) ──── */
async function createAppointment(params: {
  clinicId: string;
  clinicName: string;
  data: AppointmentData;
  conversationId: string;
}): Promise<{ appointmentId: string; emailSent: boolean }> {
  const { clinicId, clinicName, data, conversationId } = params;

  const now = new Date().toISOString();
  // Sanitize: no undefined fields (Firestore rejects them)
  const apptDoc = {
    clinicId:         clinicId || "",
    clinicName:       clinicName || "Klinik",
    patientName:      data.patientName || "",
    patientPhone:     data.patientPhone || "",
    service:          data.requestedService || "Genel Muayene",
    requestedService: data.requestedService || "Genel Muayene",
    preferredDate:    data.requestedDate || "",
    requestedDate:    data.requestedDate || "",
    preferredTime:    data.requestedTime || "",
    requestedTime:    data.requestedTime || "",
    status:           "pending",
    source:           "widget",
    originalText:     data.originalText || "",
    conversationId:   conversationId || "",
    notificationStatus: { smsToPatient: "pending", emailToClinic: "pending" },
    createdAt: now,
    updatedAt: now,
  };

  console.log("[APPOINTMENT_CREATE_START]", {
    clinicId, patientName: data.patientName, patientPhone: data.patientPhone,
    requestedService: data.requestedService, requestedDate: data.requestedDate, requestedTime: data.requestedTime,
  });

  let appointmentId = "";

  /* ── Strategy 1: Firebase Admin SDK (bypasses security rules entirely) ── */
  const adminDb = getAdminDb();
  console.log(`[FIRESTORE_ADMIN] adminDb available: ${!!adminDb}`);

  if (adminDb) {
    console.log("[FIRESTORE_WRITE_START] Using Admin SDK...");
    const ref = await adminDb.collection("appointments").add(apptDoc);
    appointmentId = ref.id;
    console.log(`[FIRESTORE_WRITE_SUCCESS] appointmentId=${appointmentId}`);
  } else {
    /* ── Strategy 2: Firestore REST API with anon token then API key ─────── */
    console.log("[FIRESTORE_WRITE_START] Admin SDK unavailable — trying REST API...");
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
    const apiKey    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY    ?? "";
    if (!projectId || !apiKey) throw new Error("No Firebase config (projectId or apiKey missing)");

    const idToken = await getFirebaseAnonToken(apiKey);
    console.log(`[FIRESTORE_WRITE_START] anonToken=${idToken ? "OK" : "null — will try API key only"}`);
    appointmentId = await firestoreRestAdd(projectId, apiKey, "appointments", apptDoc, idToken);
    console.log(`[FIRESTORE_WRITE_SUCCESS] REST appointmentId=${appointmentId}`);
  }


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
    const { clinicId, message, history = [], conversationId = "", pendingAppointmentData } = await req.json();
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
    if (isConfirmation(message)) {
      debugLog.push("CONFIRM_DETECTED");
      console.log(`[widget-chat] Confirmation: "${message}" | pendingAppointmentData=${!!pendingAppointmentData}`);

      // Prefer explicit pendingAppointmentData sent from widget, then history parse
      const apptData: AppointmentData | null =
        pendingAppointmentData && pendingAppointmentData.patientName && pendingAppointmentData.patientPhone
          ? (pendingAppointmentData as AppointmentData)
          : extractAppointmentFromHistory(history);

      console.log("[PARSED_APPOINTMENT_DATA]", apptData
        ? JSON.stringify({ name: apptData.patientName, phone: apptData.patientPhone, service: apptData.requestedService, date: apptData.requestedDate, time: apptData.requestedTime })
        : "null — no data found");

      if (apptData) {
        try {
          const { appointmentId, emailSent } = await createAppointment({
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
          console.error("[FIRESTORE_WRITE_FAILED]", e.message);
          debugLog.push(`appt_failed: ${e.message}`);
          console.log("[widget-chat]", debugLog.join(" | "));
          return NextResponse.json(
            { reply: "Randevu talebinizi şu anda sisteme kaydedemedim. Lütfen kliniğimizi doğrudan arayın veya birkaç dakika sonra tekrar deneyin." },
            { headers: CORS }
          );
        }
      } else {
        debugLog.push("confirm_but_no_data");
        console.log("[widget-chat] Confirmation but no appointment data found — fallback to AI");
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

    // If AI response contains a confirmation summary, extract and return pendingAppointmentData
    // so the widget can send it back on confirmation — more reliable than history parsing
    const isConfirmSummary =
      (reply.includes("Ad:") || reply.includes("Name:")) &&
      (reply.includes("Telefon:") || reply.includes("Phone:")) &&
      (reply.includes("Onaylıyor") || reply.includes("Onaylay") || reply.includes("Confirm"));

    const responsePayload: any = { reply };

    if (isConfirmSummary) {
      // Parse the summary from AI reply and attach as pendingAppointmentData
      const nameMatch    = reply.match(/(?:Ad|Name|İsim):\s*([^\n\r]+)/i);
      const phoneMatch   = reply.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
      const serviceMatch = reply.match(/(?:Hizmet|Service|Tedavi):\s*([^\n\r]+)/i);
      const dtMatch      = reply.match(/(?:Tarih\/Saat|Tarih|Date):\s*([^\n\r]+)/i);
      const timeMatch    = reply.match(/(\d{1,2}:\d{2})/i);

      const dtStr  = dtMatch?.[1]?.trim() ?? "";
      const timeStr = timeMatch?.[1]?.trim() ?? "";
      const dateStr = dtStr.replace(timeStr, "").replace(/saat/gi, "").trim();

      const pending: AppointmentData = {
        patientName:      nameMatch?.[1]?.trim()    ?? "",
        patientPhone:     phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "",
        requestedService: serviceMatch?.[1]?.trim() ?? "Genel Muayene",
        requestedDate:    dateStr || dtStr,
        requestedTime:    timeStr,
        originalText:     reply,
      };

      if (pending.patientName && pending.patientPhone) {
        responsePayload.pendingAppointmentData = pending;
        console.log("[widget-chat] pendingAppointmentData attached:", JSON.stringify(pending));
      }
    }

    return NextResponse.json(responsePayload, { headers: CORS });

  } catch (err: any) {
    debugLog.push(`ERROR: ${err.message ?? err}`);
    console.error("[widget-chat]", debugLog.join(" | "), err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen kliniğimizi doğrudan arayın." },
      { status: 200, headers: CORS }
    );
  }
}
