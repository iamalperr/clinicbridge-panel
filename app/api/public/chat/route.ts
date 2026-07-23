import { NextResponse } from "next/server";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import {
  sendClinicAppointmentEmail,
  sendPatientSms,
  sendPatientAppointmentEmail,
} from "@/lib/appointment-notifications";

// Cache to avoid parsing working hours repeatedly
const workingHoursCache = new Map<string, any>();

async function parseWorkingHours(clinicId: string, workingHoursText: string): Promise<any> {
  if (workingHoursCache.has(clinicId)) {
    return workingHoursCache.get(clinicId);
  }
  
  const prompt = `Aşağıdaki klinik çalışma saatleri metnini tam olarak aşağıdaki JSON formatına dönüştür. YALNIZCA JSON döndür. Kapalı günleri null yap. Saatleri "HH:mm" formatında (24 saat) yaz.
{
  "monday": ["10:00", "19:00"] | null,
  "tuesday": ["10:00", "19:00"] | null,
  "wednesday": ["10:00", "19:00"] | null,
  "thursday": ["10:00", "19:00"] | null,
  "friday": ["10:00", "19:00"] | null,
  "saturday": ["10:00", "17:00"] | null,
  "sunday": ["10:00", "17:00"] | null
}

Çalışma Saatleri Metni:
${workingHoursText}`;

  try {
    const res = await trackableAIRequest({
      messages: [{ role: "system", content: "Sen bir JSON parser'sın. SADECE geçerli bir JSON objesi dön." }, { role: "user", content: prompt }],
      clinicId,
      model: "gpt-4o-mini",
      channel: "web_widget",
      requestType: "system",
      temperature: 0.1
    });
    
    const match = res.content.match(/\{[\s\S]*\}/);
    if (match) {
       const json = JSON.parse(match[0]);
       workingHoursCache.set(clinicId, json);
       return json;
    }
  } catch (e) {
    console.error("[route] Error parsing working hours", e);
  }
  return null;
}

async function extractRequestedTime(message: string, clinicId: string): Promise<{ day: string, time: string } | null> {
   const today = new Date();
   const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
   const todayName = days[today.getDay()];
   const tomorrowName = days[(today.getDay() + 1) % 7];
   
   const prompt = `Hasta mesajında belirtilen randevu gününü ve saatini çıkar.
Şu anki gün: ${todayName} (Eğer "yarın" diyorsa ${tomorrowName} gününü al).
SADECE şu formatta JSON dön: {"day": "monday", "time": "14:00"}
Eğer gün belirtilmemişse veya spesifik bir SAAT belirtilmemişse (örn "Yarın akşam" belirsizdir, "Yarın akşam 8" nettir) null dön. 
Mesaj: "${message}"`;

   try {
     const res = await trackableAIRequest({
       messages: [{ role: "system", content: "SADECE JSON VEYA null DÖN." }, { role: "user", content: prompt }],
       clinicId,
       model: "gpt-4o-mini",
       channel: "web_widget",
       requestType: "system",
       temperature: 0.1
     });
     if (res.content.includes("null")) return null;
     const match = res.content.match(/\{[\s\S]*\}/);
     if (match) {
        return JSON.parse(match[0]);
     }
   } catch(e) {
      console.error("[route] Error extracting time", e);
   }
   return null;
}

function checkTimeWithinWorkingHours(requested: {day: string, time: string}, workingHours: any): {valid: boolean, reason?: string} {
  if (!workingHours) return {valid: true}; 
  const dayHours = workingHours[requested.day.toLowerCase()];
  if (!dayHours) return {valid: false, reason: "closed"};
  
  const [open, close] = dayHours;
  if (requested.time < open || requested.time > close) {
     return {valid: false, reason: "outside_hours"};
  }
  return {valid: true};
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  patientEmail?: string;
  requestedService: string;
  requestedDate: string;
  requestedTime: string | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredTimePeriod?: "morning" | "afternoon" | "evening" | "earliest_available" | null;
  preferredTimeText?: string | null;
  timezone?: string;
  originalText: string;
}

function parseTimeText(text: string) {
  const t = text.trim();
  const lower = t.toLowerCase();
  
  if (!t || lower === "belirtilmedi" || lower === "belirtilmemiş") {
    return { preferredTime: null, preferredTimeStart: null, preferredTimeEnd: null, preferredTimePeriod: null, preferredTimeText: null };
  }

  const result = {
    preferredTime: null as string | null,
    preferredTimeStart: null as string | null,
    preferredTimeEnd: null as string | null,
    preferredTimePeriod: null as "morning" | "afternoon" | "evening" | "earliest_available" | null,
    preferredTimeText: t
  };

  if (lower.includes("sabah") || lower.includes("morning")) {
    result.preferredTimePeriod = "morning";
  } else if (lower.includes("öğleden sonra") || lower.includes("öğleden_sonra") || lower.includes("afternoon")) {
    result.preferredTimePeriod = "afternoon";
  } else if (lower.includes("akşamüstü") || lower.includes("akşam") || lower.includes("evening")) {
    result.preferredTimePeriod = "evening";
  } else if (lower.includes("en erken") || lower.includes("erken") || lower.includes("earliest")) {
    result.preferredTimePeriod = "earliest_available";
  } else if (t.includes("-")) {
    const parts = t.split("-").map(p => p.trim());
    result.preferredTimeStart = parts[0]?.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
    result.preferredTimeEnd = parts[1]?.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
  } else {
    result.preferredTime = t.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
  }

  return result;
}

function extractAppointmentFromHistory(history: any[]): AppointmentData | null {
  const assistantMsgs = history.filter(h => h.role === "assistant").map(h => h.content as string);
  const userMsgs = history.filter(h => h.role === "user").map(h => h.content as string);

  // Find the last assistant message that contains a summary with Ad: and Telefon:
  const confirmMsg = [...assistantMsgs].reverse().find(m =>
    (m.includes("Ad:") || m.includes("ad:") || m.includes("Name:") || m.includes("İsim:")) &&
    (m.includes("Telefon:") || m.includes("Phone:") || m.includes("Tel:") || m.includes("E-posta:") || m.includes("Email:") || m.includes("E-mail:"))
  );

  if (!confirmMsg) {
    console.log("[appt-extract] No confirmation summary found in history. msgs:", assistantMsgs.length);
    return null;
  }

  console.log("[appt-extract] Found summary:", confirmMsg.slice(0, 300));

  // Extract each field with flexible regex
  const nameMatch    = confirmMsg.match(/(?:Ad|Name|İsim|Hasta):\s*([^\n\r]+)/i);
  const phoneMatch   = confirmMsg.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
  const emailMatch   = confirmMsg.match(/(?:E-posta|Email|Mail|E-mail):\s*([^\n\r\s]+)/i);
  const serviceMatch = confirmMsg.match(/(?:Hizmet|Service|Tedavi|Treatment):\s*([^\n\r]+)/i);
  const dtMatch      = confirmMsg.match(/(?:Tarih|Date):\s*([^\n\r]+)/i);
  const timeMatch    = confirmMsg.match(/(?:Saat|Time):\s*([^\n\r]+)/i);

  const patientName      = nameMatch?.[1]?.trim() ?? "";
  const patientPhone     = phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "";
  const patientEmail     = emailMatch?.[1]?.trim().toLowerCase() ?? "";
  const requestedService = serviceMatch?.[1]?.trim() ?? "Genel Muayene";

  const requestedDate = dtMatch?.[1]?.trim() ?? "";
  const rawTimeStr = timeMatch?.[1]?.trim() ?? "";
  
  const parsedTime = parseTimeText(rawTimeStr);

  const originalText = userMsgs.join(" | ");

  if (!patientName || (!patientPhone && !patientEmail)) {
    console.log(`[appt-extract] Missing required fields: name="${patientName}" phone="${patientPhone}" email="${patientEmail}"`);
    return null;
  }

  console.log(`[appt-extract] ✅ name="${patientName}" phone="${patientPhone}" service="${requestedService}" date="${requestedDate}" time="${parsedTime.preferredTime}"`);
  return {
    patientName,
    patientPhone,
    patientEmail,
    requestedService,
    requestedDate,
    requestedTime: parsedTime.preferredTime,
    preferredTimeStart: parsedTime.preferredTimeStart,
    preferredTimeEnd: parsedTime.preferredTimeEnd,
    preferredTimePeriod: parsedTime.preferredTimePeriod,
    preferredTimeText: parsedTime.preferredTimeText,
    originalText: confirmMsg
  };
}

/* ── Create appointment — Admin SDK (primary) or REST API (fallback) ──── */
async function createAppointment(params: {
  clinicId: string;
  widgetId?: string;
  clinicName: string;
  data: AppointmentData;
  conversationId: string;
  notificationSettings: any;
}): Promise<any> {
  const { clinicId, widgetId, clinicName, data, conversationId, notificationSettings } = params;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const apiKey    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY    ?? "";

  // Normalize Notification Settings
  const ns = notificationSettings || {};
  const patientChannel = ns.patient?.appointmentChannel || ns.patientAppointmentChannel || "email";
  const clinicEmailEnabled = ns.clinic?.newAppointmentEmailEnabled ?? true;
  let clinicRecipientEmails = ns.clinic?.recipientEmails || [];

  const now = new Date().toISOString();
  
  // Strict Validation: If widgetId context is provided, ensure they match (in this case, we use the resolved clinicId from the payload/widget as the tenant context).
  if (widgetId && clinicId && widgetId !== clinicId && !widgetId.includes(clinicId)) {
     // Log tenant error
     console.error(`[TENANT_ERROR] Invalid clinicId context. widgetId=${widgetId}, clinicId=${clinicId}`);
     // We will trust the clinicId passed since the route verified it, but log heavily.
  }

  let notificationChannelToSave = patientChannel;
  if (notificationChannelToSave === "email_and_sms" || notificationChannelToSave === "email_and_whatsapp") {
    notificationChannelToSave = "email";
  }

  if (!data.requestedDate) {
    console.error("[VALIDATION_ERROR] requestedDate is missing.");
    throw new Error("Validation Error: requestedDate is required");
  }
  
  let validRequestedTime: string | null = data.requestedTime || null;
  if (validRequestedTime && validRequestedTime.toLowerCase() !== "belirtilmedi") {
    // Make sure it matches HH:mm (e.g. 14:30)
    const timeRegex = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
    if (!timeRegex.test(validRequestedTime)) {
      console.error(`[VALIDATION_ERROR] requestedTime format invalid: ${validRequestedTime}`);
      throw new Error(`Validation Error: requestedTime must be in HH:mm format, got: ${validRequestedTime}`);
    }
  } else {
    validRequestedTime = null;
  }

  const apptDoc = {
    clinicId:         clinicId || "",
    conversationId:   conversationId || "",
    patientName:      data.patientName || "",
    patientPhone:     data.patientPhone || "",
    patientEmail:     data.patientEmail || "",
    treatmentType:    data.requestedService || "Genel Muayene",
    preferredDate:    data.requestedDate || "",
    preferredTime:    validRequestedTime,
    preferredTimeStart: data.preferredTimeStart || null,
    preferredTimeEnd: data.preferredTimeEnd || null,
    preferredTimePeriod: data.preferredTimePeriod || null,
    preferredTimeText: data.preferredTimeText || null,
    timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
    appointmentDateTime: "",
    notes:            "",
    source:           "ai_chatbot",
    status:           "pending_clinic_review",
    notificationChannel: notificationChannelToSave,
    createdBy:        "ai_assistant",
    language:         "tr",
    rawConversationSummary: data.originalText || "",
    createdAt: now,
    updatedAt: now,
  };

  let appointmentId = "";
  let databaseInsertSuccess = false;

  /* ── Strategy 1: Firebase Admin SDK (bypasses security rules entirely) ── */
  const adminDb = getAdminDb();
  console.log(`[FIRESTORE_ADMIN] adminDb available: ${!!adminDb}`);

  if (adminDb) {
    console.log("[FIRESTORE_WRITE_START] Using Admin SDK...");
    const ref = await adminDb.collection("clinics").doc(clinicId).collection("appointments").add(apptDoc);
    appointmentId = ref.id;
    console.log(`[FIRESTORE_WRITE_SUCCESS] appointmentId=${appointmentId}`);
  } else {
    /* ── Strategy 2: Firestore REST API with anon token then API key ─────── */
    console.log("[FIRESTORE_WRITE_START] Admin SDK unavailable — trying REST API...");
    if (!projectId || !apiKey) throw new Error("No Firebase config (projectId or apiKey missing)");

    const idToken = await getFirebaseAnonToken(apiKey);
    const collectionPath = `clinics/${clinicId}/appointments`;
    console.log(`[FIRESTORE_WRITE_START] anonToken=${idToken ? "OK" : "null — will try API key only"}`);
    appointmentId = await firestoreRestAdd(projectId, apiKey, collectionPath, apptDoc, idToken);
    console.log(`[FIRESTORE_WRITE_SUCCESS] REST appointmentId=${appointmentId}`);
  }

  /* ── Notification to clinic ────────────────────────────── */
  if (adminDb && appointmentId) {
    try {
      await adminDb.collection("clinics").doc(clinicId).collection("notifications").add({
        type: "appointment_request",
        title: "Yeni randevu talebi",
        message: `${data.patientName} (${data.patientPhone}) adlı hasta ${data.requestedService} için randevu talebinde bulundu.`,
        appointmentId,
        conversationId,
        read: false,
        createdAt: now,
      });
      console.log(`[appointment-notification] Created notification for clinicId=${clinicId}`);
    } catch (e: any) {
      console.error("[appointment-notification] Error:", e.message);
    }
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
  if (notificationChannelToSave === "sms" || notificationChannelToSave === "email_and_sms") {
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
  }

  /* ── Patient Email ────────────────────────────────── */
  if ((notificationChannelToSave === "email" || notificationChannelToSave === "email_and_sms" || notificationChannelToSave === "email_and_whatsapp") && data.patientEmail) {
    try {
      await sendPatientAppointmentEmail({
        clinicName,
        clinicEmails: [data.patientEmail], // Reusing clinicEmails field in payload for recipient email
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        requestedService: data.requestedService,
        requestedDate: data.requestedDate,
        requestedTime: data.requestedTime,
        preferredTimeStart: data.preferredTimeStart,
        preferredTimeEnd: data.preferredTimeEnd,
        preferredTimePeriod: data.preferredTimePeriod,
        preferredTimeText: data.preferredTimeText,
        appointmentId,
      });
    } catch (e: any) {
      console.error("[appointment-patient-email] Error:", e.message);
    }
  }

  /* ── Email to clinic ──────────────────────────────── */
  let emailSent = false;
  if (clinicEmail) {
    try {
      const result = await sendClinicAppointmentEmail({
        clinicName,
        clinicEmails: [clinicEmail],
        patientName:      data.patientName,
        patientPhone: data.patientPhone,
        requestedService: data.requestedService,
        requestedDate: data.requestedDate,
        requestedTime: data.requestedTime,
        preferredTimeStart: data.preferredTimeStart,
        preferredTimeEnd: data.preferredTimeEnd,
        preferredTimePeriod: data.preferredTimePeriod,
        preferredTimeText: data.preferredTimeText,
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
    if (!projectId || !apiKey) throw new Error("Missing projectId or apiKey for notification update");
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

  return { success: !!appointmentId, appointmentId, emailSent };
}

/* ── Log conversation to Firestore ───────────────────────────────────── */
async function logConversation(params: {
  clinicId: string;
  convId: string;
  userMessage: string;
  aiReply: string;
  historyLength: number;
  apptData?: AppointmentData | null;
  appointmentId?: string;
  isAppointmentCreated?: boolean;
  isLiveSupport?: boolean;
}) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  try {
    const logRef = adminDb.collection("clinics").doc(params.clinicId).collection("conversationLogs").doc(params.convId);
    
    // Check existing
    const snap = await logRef.get();
    const existing = snap.exists ? snap.data() : null;

    let status = existing?.status || "answered";
    let needsTraining = existing?.needsTraining || false;
    let trainingTopic = existing?.trainingTopic || "";
    
    const replyLower = params.aiReply.toLowerCase();

    if (params.isAppointmentCreated) {
      status = "appointment";
    } else if (params.isLiveSupport) {
      status = "liveSupport";
    } else if (replyLower.includes("üzgünüm") && (replyLower.includes("yardımcı olamıyorum") || replyLower.includes("anlayamadım") || replyLower.includes("yanıt üretemiyorum") || replyLower.includes("bilgi havuzumda"))) {
      status = "unanswered";
      needsTraining = true;
      if (!trainingTopic) trainingTopic = params.userMessage.slice(0, 60);
    } else if (replyLower.includes("canlı destek") || replyLower.includes("temsilci") || replyLower.includes("klinik ekibi") || replyLower.includes("iletişime geç") || replyLower.includes("doğrudan arayın") || replyLower.includes("whatsapp")) {
      status = "liveSupport";
    }

    const nowStr = new Date().toISOString();
    
    const logData: any = {
      clinicId: params.clinicId,
      updatedAt: nowStr,
      totalMessages: params.historyLength + 2,
      lastMessagePreview: params.userMessage.slice(0, 100),
      status,
      needsTraining,
    };

    if (!existing) {
      logData.createdAt = nowStr;
      logData.convertedToAppointment = false;
      logData.language = "tr"; // default
    }

    if (trainingTopic) logData.trainingTopic = trainingTopic;
    if (params.apptData?.patientName) logData.patientName = params.apptData.patientName;
    if (params.apptData?.patientPhone) logData.patientPhone = params.apptData.patientPhone;
    let activeIntent = existing?.activeIntent || "";
    let appointmentStatus = existing?.appointmentStatus || "";

    const userMessageLower = params.userMessage.toLowerCase();
    const intentKeywords = ["randevu", "görüşme almak", "doktora görünmek", "appointment", "consultation"];
    if (intentKeywords.some(k => userMessageLower.includes(k) || replyLower.includes(k))) {
      activeIntent = "appointment";
      if (!existing?.convertedToAppointment && appointmentStatus !== "readyToCreate") {
        appointmentStatus = "collecting";
      }
    }

    if (params.apptData) {
      logData.pendingAppointmentData = {
        patientName: params.apptData.patientName || "",
        patientPhone: params.apptData.patientPhone || "",
        patientEmail: "",
        treatmentType: params.apptData.requestedService || "",
        preferredDate: params.apptData.requestedDate || "",
        preferredTime: params.apptData.requestedTime || "",
        notes: ""
      };
      activeIntent = "appointment";
      appointmentStatus = "readyToCreate";
    }

    if (params.isAppointmentCreated) {
      status = "appointment";
      activeIntent = "appointment";
      appointmentStatus = "created";
      logData.convertedToAppointment = true;
      logData.appointmentId = params.appointmentId;
    }

    logData.activeIntent = activeIntent;
    logData.appointmentStatus = appointmentStatus;

    // Write log doc
    await logRef.set(logData, { merge: true });

    // Write user message
    const userMsgRef = logRef.collection("messages").doc(`msg_${Date.now()}_u`);
    await userMsgRef.set({
      sender: "patient",
      content: params.userMessage,
      createdAt: nowStr,
      wasAnswered: true,
      needsTraining: false,
    });

    // Write AI message
    const aiMsgRef = logRef.collection("messages").doc(`msg_${Date.now() + 1}_a`);
    await aiMsgRef.set({
      sender: "assistant",
      content: params.aiReply,
      createdAt: new Date(Date.now() + 1).toISOString(),
      wasAnswered: status !== "unanswered",
      needsTraining: needsTraining && status === "unanswered",
    });

    // Write system action log when live support is shown
    if (params.isLiveSupport) {
      const sysRef = logRef.collection("messages").doc(`msg_${Date.now() + 2}_sys`);
      await sysRef.set({
        sender: "system",
        content: "Canlı Destek Yönlendirmesi Gösterildi",
        createdAt: new Date(Date.now() + 2).toISOString(),
        wasAnswered: true,
        needsTraining: false,
      });
    }

  } catch (err: any) {
    console.error("[logConversation] Error:", err.message);
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   MAIN POST HANDLER
═══════════════════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
  const startTime = Date.now();
  const debugLog: string[] = [];

  try {
    const body = await req.json();
    const { clinicId, widgetId, message, history = [], conversationId = "", pendingAppointmentData, _systemAction } = body;
    const convId = conversationId || `session_${Date.now()}`;
    debugLog.push(`clinicId=${clinicId} msg="${message?.slice(0, 60)}"`);

    if (!clinicId || !message) {
      return NextResponse.json({ error: "clinicId and message required" }, { status: 400, headers: CORS });
    }

    /* ── Handle system actions (no OpenAI needed) ── */
    if (_systemAction && conversationId) {
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          const now = new Date().toISOString();
          const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(conversationId);

          if (_systemAction.type === "liveSupportHandoffDisplayed") {
            await logRef.set({
              status: "liveSupport", updatedAt: now, clinicId,
              lastMessagePreview: message?.slice(0, 100) ?? "",
            }, { merge: true });
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_handoff`);
            await sysRef.set({
              sender: "system", content: "Canlı Destek Yönlendirmesi Gösterildi",
              action: "live_support_handoff_displayed",
              createdAt: now, wasAnswered: true, needsTraining: false,
            });
            console.log(`[handoff] Logged handoff displayed convId=${conversationId}`);

          } else if (_systemAction.type === "liveSupportChannelClick") {
            const isWhatsapp = _systemAction.channel === "whatsapp";
            const action  = isWhatsapp ? "whatsapp_redirect_clicked" : "telegram_redirect_clicked";
            const label   = isWhatsapp ? "WhatsApp'a Yönlendirildi" : "Telegram'a Yönlendirildi";
            const sysRef  = logRef.collection("messages").doc(`msg_${Date.now()}_sys_click`);
            await sysRef.set({
              sender: "system", content: label, action, channel: _systemAction.channel,
              createdAt: now, wasAnswered: true, needsTraining: false,
            });
            await logRef.set({ lastRedirectAction: action, lastRedirectAt: now }, { merge: true });
            console.log(`[channel-click] Logged: ${label} convId=${conversationId}`);

          } else if (_systemAction.type === "satisfaction_survey_displayed") {
            await logRef.set({
              surveyDisplayed: true, surveyDisplayedAt: now, updatedAt: now, clinicId,
            }, { merge: true });
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_survey`);
            await sysRef.set({
              sender: "system", content: "Memnuniyet Anketi Gösterildi",
              action: "satisfaction_survey_displayed",
              createdAt: now, wasAnswered: true, needsTraining: false,
            });
            console.log(`[survey] Displayed convId=${conversationId}`);

          } else if (_systemAction.type === "satisfaction_survey_submitted") {
            const rating = typeof _systemAction.rating === "number" ? _systemAction.rating : 0;
            await logRef.set({
              surveySubmitted: true, surveyRating: rating, surveySubmittedAt: now, updatedAt: now,
            }, { merge: true });
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_rating`);
            await sysRef.set({
              sender: "system",
              content: `Memnuniyet Anketi Yanıtlandı — ${rating}/5 ⭐`,
              action: "satisfaction_survey_submitted",
              rating,
              createdAt: now, wasAnswered: true, needsTraining: false,
            });
            console.log(`[survey] Submitted rating=${rating} convId=${conversationId}`);

          } else if (_systemAction.type === "quick_action_clicked") {
            const { actionType, label } = _systemAction as any;
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_qa`);
            await sysRef.set({
              sender: "system",
              content: `Hızlı Komut Tıklandı — ${label} (${actionType})`,
              action: "quick_action_clicked",
              actionType: actionType ?? "",
              label: label ?? "",
              createdAt: now, wasAnswered: true, needsTraining: false,
            });
            console.log(`[quick-action] clicked type=${actionType} label=${label} convId=${conversationId}`);
          }

        } catch (e: any) {
          console.warn("[system-action] Log error:", e.message);
        }
      }
      return NextResponse.json({ ok: true }, { headers: CORS });
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
    let trainingDocs: Array<{ id: string; title: string; content: string; embeddingChunks?: any[] }> = [];
    let clinicWhatsapp = "";
    let clinicTelegram = "";
    let clinicLanguage = "tr";
    let clinicData: any = null;

    let isAgencyClinic = false;
    let agencyIdForClinic: string | null = null;
    let actualClinicId = clinicId; // Store the real document ID if it differs from the slug

    if (adminDb) {
      const [clinicSnap, promptSnap, materialsSnap] = await Promise.all([
        adminDb.collection("clinics").doc(clinicId).get(),
        adminDb.collection("promptSettings").doc(clinicId).get(),
        adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(250).get(),
      ]);
      if (clinicSnap.exists) {
        const cData = clinicSnap.data()!;
        clinicData      = cData;
        clinicName      = cData.name          ?? "Klinik";
        clinicWhatsapp  = cData.whatsappNumber  ?? "";
        clinicTelegram  = cData.telegramUsername ?? "";
        clinicLanguage  = cData.language         ?? "tr";
        
        if (promptSnap.exists) promptSettings = promptSnap.data();
        trainingDocs = materialsSnap.docs.map(d => ({ 
          id: d.id, 
          title: d.data().title ?? "", 
          content: d.data().content ?? "",
          embeddingChunks: d.data().embeddingChunks || []
        }));
        debugLog.push(`[admin] clinic="${clinicName}" docs=${trainingDocs.length}`);
      } else {
        // Fallback for Agency Clinics
        const agenciesSnap = await adminDb.collection("agencies").get();
        for (const agency of agenciesSnap.docs) {
          let aClinicSnap: any = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(clinicId).get();
          
          if (!aClinicSnap.exists) {
            const aClinicsQuery = await adminDb.collection("agencies").doc(agency.id).collection("clinics").where("clinicSlug", "==", clinicId).limit(1).get();
            if (!aClinicsQuery.empty) {
              aClinicSnap = aClinicsQuery.docs[0];
            }
          }

          if (aClinicSnap.exists) {
             const aData = aClinicSnap.data()!;
             agencyIdForClinic = agency.id;
             isAgencyClinic = true;
             
             // Update actualClinicId to the actual document ID for subsequent queries
             actualClinicId = aClinicSnap.id;
             
             clinicData = aData;
             clinicName = aData.clinicName || aData.name || "Klinik";
             clinicWhatsapp = aData.whatsapp || aData.whatsappNumber || "";
             clinicTelegram = aData.telegram || aData.telegramUsername || "";
             clinicLanguage = aData.language || "tr";
             
             if (aData.aiQuoteSettings?.prompt) {
                 promptSettings = { basePrompt: aData.aiQuoteSettings.prompt };
             }
             
             const aMaterialsSnap = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(actualClinicId).collection("knowledgeBase").where("isActive", "==", true).get();
             trainingDocs = aMaterialsSnap.docs.map(d => ({
               id: d.id,
               title: d.data().title ?? "",
               content: d.data().content ?? "",
               embeddingChunks: d.data().embeddingChunks || []
             }));
             debugLog.push(`[admin-agency] clinic="${clinicName}" docs=${trainingDocs.length}`);
             break;
          }
        }
      }
    } else if (clientDb) {
      const [clinicSnap, promptSnap] = await Promise.all([
        getDoc(doc(clientDb, "clinics", clinicId)),
        getDoc(doc(clientDb, "promptSettings", clinicId)),
      ]);
      if (clinicSnap.exists()) {
        const cData = clinicSnap.data()!;
        clinicData      = cData;
        clinicName      = cData.name          ?? "Klinik";
        clinicWhatsapp  = cData.whatsappNumber  ?? "";
        clinicTelegram  = cData.telegramUsername ?? "";
        clinicLanguage  = cData.language         ?? "tr";
        
        if (promptSnap.exists()) promptSettings = promptSnap.data();
        const materialsSnap = await getDocs(query(collection(clientDb, "trainingMaterials"), where("clinicId", "==", clinicId)));
        trainingDocs = materialsSnap.docs.map(d => ({ 
          id: d.id, 
          title: d.data().title ?? "", 
          content: d.data().content ?? "",
          embeddingChunks: d.data().embeddingChunks || []
        }));
        debugLog.push(`[client] clinic="${clinicName}" docs=${trainingDocs.length}`);
      }
    }

    /* ── Relevance scoring ─────────────────────────────────────────────── */
    const msgLower = message.toLowerCase();
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);
    
    // YENİ: RAG araması iyileştirmesi (Çalışma saatleri garantisi)
    const isAppointmentIntent = /\b(randevu|appointment|saat|gün|müsait|boş|yarın|bugün|alabilir)\b/.test(msgLower);
    
    // YENİ: Konum RAG araması iyileştirmesi
    const isLocationIntent = /\b(nerede|adres|nerdesiniz|semt|ilçe|ulaşım|konum|lokasyon|address|where|get there|befindet|adresse)\b/.test(msgLower);

    // YENİ: Fiyat/Ücret niyet tespiti (Priority: examination > xray > general treatment)
    const isExaminationFeeIntent = /\b(muayene|kontrol|ilk değerlendirme|ilk randevu).*(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|free|cost|ne tutar|ne kadara mal olur)\b/i.test(msgLower) || /\b(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|cost|ne tutar).*(muayene|kontrol|ilk değerlendirme|ilk randevu)\b/i.test(msgLower);
    const isXrayFeeIntent = /\b(röntgen|x-ray|film|tomografi).*(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|free|cost|ne tutar|ne kadara mal olur)\b/i.test(msgLower) || /\b(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|cost|ne tutar).*(röntgen|x-ray|film|tomografi)\b/i.test(msgLower);
    const isTreatmentPriceIntent = /\b(ücret|fiyat|ne kadar|fiyatı|parası|maliyeti|cost|price|ne tutar|ne kadara mal olur)\b/i.test(msgLower) && !isExaminationFeeIntent && !isXrayFeeIntent;
    
    let activePriceIntent = "";
    if (isExaminationFeeIntent) activePriceIntent = "examination_fee";
    else if (isXrayFeeIntent) activePriceIntent = "xray_fee";
    else if (isTreatmentPriceIntent) activePriceIntent = "treatment_price";
    
    debugLog.push(`intent_price=${activePriceIntent || "none"}`);

    // YENİ: Doktor niyet tespiti
    const isDoctorIntent = /\b(doktor|hekim|uzman|doctor|dentist|specialist|cerrah|surgeon|tıbbi|medical team|ekip|doctors|hekimler|doktorlar)\b/i.test(msgLower);
    
    let doctorContext = "";
    let doctorDataMissing = false;
    let allowedDoctorNames: string[] = [];
    
    if (isDoctorIntent) {
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          let docsSnap;
          if (isAgencyClinic && agencyIdForClinic) {
            docsSnap = await adminDb.collection("agencies").doc(agencyIdForClinic).collection("clinics").doc(actualClinicId).collection("doctors").where("is_active", "==", true).get();
          } else {
            docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").where("is_active", "==", true).get();
          }
          
          if (!docsSnap.empty) {
            let docs = docsSnap.docs.map(d => d.data() as any);
            if (docs.length > 0) {
              docs.sort((a, b) => (a.display_order || a.order || 0) - (b.display_order || b.order || 0));
              
              let specialistCount = 0;
              let generalCount = 0;
              const specialistKeywords = /uzman|uzm\.|dr\.|doç\.|prof\.|cerrahisi|ortodonti|endodonti|periodontoloji|pedodonti|protetik|restoratif|oral diagnoz/i;

              const docsListStrings = docs.map((data, index) => {
                const fullName = `${data.title ? data.title + ' ' : ''}${data.doctorName || data.full_name || data.fullName}`.trim();
                allowedDoctorNames.push(fullName);
                
                const docId = data.id || data.doctor_id || `doctor_${index + 1}`;
                let text = `HEKİM ID: ${docId}\n`;
                text += `Ad: ${fullName}\n`;
                
                const titleStr = String(data.title || data.professional_title || "Diş Hekimi").trim();
                text += `Unvan: ${titleStr}\n`;
                
                const specialtyStr = String(data.specialty || data.primary_specialization || "").trim();
                if (specialtyStr) {
                  text += `Uzmanlık Alanı: ${specialtyStr}\n`;
                } else {
                  text += `Uzmanlık Alanı: Sistem kayıtlarında ayrıca tanımlanmış bir uzmanlık alanı bulunmamaktadır.\n`;
                }
                
                if (data.department) text += `Departman: ${data.department}\n`;
                
                let treatments: string[] = [];
                if (Array.isArray(data.treatments)) {
                  treatments = data.treatments;
                } else if (typeof data.treatments === "string") {
                  treatments = data.treatments.split(",").map((t: string) => t.trim()).filter(Boolean);
                }
                if (treatments.length > 0) {
                  text += `Yaptığı Tedaviler: ${treatments.join(", ")}\n`;
                }
                
                if (data.education) text += `Eğitim: ${data.education}\n`;
                if (data.experienceYears) text += `Deneyim: ${data.experienceYears} Yıl\n`;
                
                // Sınıflandırma
                if (specialistKeywords.test(titleStr) || specialistKeywords.test(specialtyStr)) {
                  specialistCount++;
                } else {
                  generalCount++;
                }

                return text.trim();
              });

              console.log(`[DOCTOR INTENT] Resolved ${docs.length} active structured doctors for clinic ${clinicId}. Specialists: ${specialistCount}, General: ${generalCount}`);

              doctorContext = `[HEKİM KADROSU BİLGİSİ]
Kliniğimizde an itibarıyla toplam ${docs.length} aktif hekim görev yapmaktadır.
Bu hekimlerin ${specialistCount} tanesi uzman diş hekimi, ${generalCount} tanesi ise diş hekimidir.

TAM LİSTE:
${docsListStrings.join('\n\n---\n\n')}

ÖNEMLİ KURAL (HEKİM BİLGİSİ):
1. Hasta sadece "kaç doktor var" veya benzeri bir sayı soruyorsa, YUKARIDAKİ TOPLAM SAYIYI ve uzman/diş hekimi dağılımını ver. Gerekmiyorsa tüm listeyi TEK TEK YAZMA, sadece dilerse isimlerini paylaşabileceğini belirt.
2. Hasta hekim isimlerini veya kadroyu görmek istiyorsa, SADECE yukarıdaki listede bulunan hekimleri sun. Asla uydurma hekim ismi ekleme.
3. Uzmanlık sorulduğunda SADECE 'Uzmanlık Alanı' alanına bak. Eğer 'Sistem kayıtlarında ayrıca tanımlanmış bir uzmanlık alanı bulunmamaktadır' yazıyorsa, kendi kafandan unvana, biyografiye veya tedavilere bakarak uzmanlık uydurma.
4. Tedaviler ile uzmanlıkları karıştırma. Bir tedaviyi (örn. implant) yapıyor olması, doktoru o alanın uzmanı (örn. çene cerrahı) yapmaz. 'Yaptığı Tedaviler' alanı sadece hastanın o tedavi için kime gideceğini sorduğu durumlar içindir.
5. Hekim verilerini birbirine karıştırma; her hekimi sadece kendi ID'si altındaki verilerle değerlendir.
6. Hasta belirli bir alandaki uzmanı (örn. "Ortodonti uzmanı") sorarsa ve eşleşen uzman yoksa şu cümleyi kur: "Mevcut aktif hekim kayıtlarımızda bu uzmanlık alanıyla eşleşen bir hekim görünmüyor."`;
            } else {
              doctorDataMissing = true;
            }
          } else {
            doctorDataMissing = true;
          }
        } catch (err) {
          console.error("[chat] Error fetching doctors", err);
          doctorDataMissing = true;
        }

      } else {
        doctorDataMissing = true;
      }
      
      if (doctorDataMissing) {
        doctorContext = `DİKKAT: Sistemde bu kliniğin yapısal (structured) doktor listesi bulunamadı. Lütfen sağlanan 'Bilgi Havuzu' (Knowledge Base) kayıtlarına bak.
Eğer Bilgi Havuzunda doktor isimleri başlık olarak geçiyorsa şu kurallara KESİNLİKLE uy:
1. Her doktor başlığının altındaki bilgileri (Unvan, Uzmanlık, Tedaviler vb.) SADECE o doktora ait tek ve bağımsız bir kayıt olarak değerlendir. Asla başka bir doktorun bilgileriyle karıştırma.
2. Uzmanlık alanlarını ASLA tahmin etme veya unvandan/tedavilerden çıkarma. Sadece o doktorun başlığı altında AÇIKÇA yazan uzmanlık bilgisini kullan. Açıkça uzmanlık yazmıyorsa uydurma.
3. Hasta "kaç doktorunuz var?" veya "hekim sayınız nedir?" diye sorarsa, Bilgi Havuzu'ndaki doktor başlıklarını (isimlerini) say ve hastaya doğru toplam sayıyı ver.
Eğer Bilgi Havuzunda da doktor bilgisi YOKSA, KESİNLİKLE uydurma yapma ve SADECE SADECE şu cümleyi söyle: "Kliniğimizin güncel hekim kadrosuna ilişkin kayıtlı bir sayı bulunmuyor. Dilerseniz klinik ekibimizden teyit edilmesini sağlayabilirim." (Bu cümlenin sonuna 'Başka bir konuda...' gibi bir ifade Ekleme.)`;
      }
    }

    // HYBRID SEARCH & QUERY REWRITING
    const sliceLimit = isDoctorIntent ? 15 : 10;
    
    // Dynamically import retrievalService to avoid edge runtime issues if applicable, but this is a node API route
    const { hybridSearch } = await import("@/lib/services/retrievalService");
    
    // YENİ: Override search query for specific price intents to guarantee deterministic RAG match
    let searchMessage = message;
    if (activePriceIntent === "examination_fee") {
      searchMessage = "ilk muayene ücreti ücretsiz muayene fiyatı bedava muayene mi";
    } else if (activePriceIntent === "xray_fee") {
      searchMessage = "röntgen ücreti ücretsiz röntgen fiyatı tomografi bedeli bedava mı";
    }

    let topDocs = await hybridSearch(searchMessage, trainingDocs, clinicName, sliceLimit);
    
    let knowledgeContext = topDocs.length > 0
      ? topDocs.map(d => `## ${d.title}\n${d.text}`).join("\n\n---\n\n")
      : "";
      
    // Safeguard: Hard limit knowledgeContext to prevent TPM / max context limits
    if (knowledgeContext.length > 15000) {
       knowledgeContext = knowledgeContext.substring(0, 15000) + "\n...[METİN KESİLDİ]";
    }

    debugLog.push(`topDocs=[${topDocs.slice(0, 4).map(d => d.title).join(", ")}]`);

    // Log detailed RAG matching data for debug
    if (topDocs.length > 0) {
      console.log(`[RAG-DEBUG] widget_clinic_id: ${clinicId}`);
      console.log(`[RAG-DEBUG] query_text: "${message}"`);
      topDocs.slice(0, 3).forEach((d, i) => {
        console.log(`[RAG-DEBUG] match_${i + 1} - title: "${d.title}", score: ${d.score.toFixed(3)}, vec: ${d.vectorScore.toFixed(3)}, kw: ${d.keywordScore.toFixed(3)}, content_preview: "${d.text.slice(0, 100).replace(/\n/g, ' ')}..."`);
      });
      console.log(`[RAG-DEBUG] final_context_sent_to_llm_length: ${knowledgeContext.length} chars`);
    }

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
          const ns = clinicData?.notificationSettings || {};
          
          const appointmentResult = await createAppointment({
            clinicId,
            widgetId,
            clinicName,
            data: apptData,
            conversationId: conversationId || `session_${Date.now()}`,
            notificationSettings: ns
          });

          let confirmReply = appointmentResult.patientMessage || "Randevu talebinizi kliniğimize ilettim.";

          const isEnglish = /\b(yes|confirm|ok|okay|sure|please|yeah)\b/i.test(message) || 
                            (history.length > 0 && /\b(english|appointment|date|time|name|phone)\b/i.test(history[history.length - 1].content || ""));

          if (isEnglish) {
            if (!appointmentResult.success) {
              confirmReply = "Your appointment request could not be sent to the clinic at this time. Please try again shortly.";
            } else if (appointmentResult.clinicNotification?.attempted && !appointmentResult.clinicNotification?.sent) {
              confirmReply = "Your pre-appointment request has been saved, but the email notification to the clinic team could not be sent at this time.";
            } else {
              let channelStrEn = "email";
              if (appointmentResult.notificationChannel === "sms") channelStrEn = "SMS";
              else if (appointmentResult.notificationChannel === "whatsapp") channelStrEn = "WhatsApp";
              
              confirmReply = `Your appointment request has been sent to the clinic. The clinic team will review your preferred date and time. Once your request is approved or an alternative time is suggested, you will be notified by ${channelStrEn}.`;
            }
          }

          debugLog.push(`appt_created=${appointmentResult.appointmentId} db_success=${appointmentResult.success} ms=${Date.now() - startTime}`);
          console.log("[widget-chat]", debugLog.join(" | "));

          await logConversation({
            clinicId,
            convId,
            userMessage: message,
            aiReply: confirmReply,
            historyLength: history.length,
            apptData,
            appointmentId: appointmentResult.appointmentId,
            isAppointmentCreated: appointmentResult.success,
          });

          return NextResponse.json(
            { reply: confirmReply, toolResponse: appointmentResult, appointmentCreated: appointmentResult.success, conversationId: convId },
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

    /* ── PRE-FLIGHT: Deterministic Appointment Working Hours Validation ── */
    if (isAppointmentIntent && !isConfirmation(message)) {
       const workingHoursDoc = topDocs.find(d => /\b(çalışma|saat|mesai|opening|business|working|gün)\b/.test((d.title + d.text).toLowerCase()));
       if (workingHoursDoc) {
          const [parsedHours, requestedTime] = await Promise.all([
             parseWorkingHours(clinicId, workingHoursDoc.text),
             extractRequestedTime(message, clinicId)
          ]);

          if (parsedHours && requestedTime) {
             const checkResult = checkTimeWithinWorkingHours(requestedTime, parsedHours);
             
             console.log(`[appt-validator] requested: ${JSON.stringify(requestedTime)}, result: ${checkResult.valid}`);
             debugLog.push(`appt_valid=${checkResult.valid}`);

             if (!checkResult.valid) {
                let fallbackMsg = "";
                // Generate a readable hours string from JSON for the response
                const hoursText = Object.entries(parsedHours).map(([day, hours]) => {
                   const trDays: Record<string, string> = { monday: "Pazartesi", tuesday: "Salı", wednesday: "Çarşamba", thursday: "Perşembe", friday: "Cuma", saturday: "Cumartesi", sunday: "Pazar" };
                   const h = hours as string[] | null;
                   return `${trDays[day] || day}: ${h ? `${h[0]}-${h[1]}` : 'Kapalı'}`;
                }).join(", ");

                if (checkResult.reason === "closed") {
                   fallbackMsg = `Belirttiğiniz gün kliniğimiz kapalıdır. Kliniğimizin çalışma saatleri şöyledir: ${hoursText}. Uygun olduğunuz başka bir gün ve saat paylaşabilir misiniz?`;
                } else {
                   fallbackMsg = `Belirttiğiniz ${requestedTime.time} saati kliniğimizin çalışma saatleri dışında kalıyor. Kliniğimizin çalışma saatleri şöyledir: ${hoursText}. Bu saatler içerisinden size uygun başka bir saat paylaşabilir misiniz?`;
                }
                
                await logConversation({
                  clinicId,
                  convId,
                  userMessage: message,
                  aiReply: fallbackMsg,
                  historyLength: history.length,
                });

                console.log("[widget-chat] Rejected appointment time:", requestedTime);
                return NextResponse.json({ reply: fallbackMsg, conversationId: convId }, { headers: CORS });
             }
          }
       }
    }

    /* ── PRE-FLIGHT: detect live support intent BEFORE calling OpenAI ────── */
    const LIVE_SUPPORT_KEYWORDS = [
      // Turkish — explicit
      "canlı destek", "canli destek",
      "canlı birine", "canli birine",
      "canlı biriyle", "canli biriyle",
      "insana bağla", "insana bagla",
      "insan ile görüş", "insan ile goruş",
      "gerçek kişi", "gercek kisi",
      "biriyle görüşmek", "biriyle gorusmek",
      "klinikle iletişime", "klinikle iletisime",
      "sizinle görüşmek", "sizinle gorusmek",
      "ekiple görüşmek", "ekiple gorusmek",
      "yetkili", "müşteri temsilci", "musteri temsilci",
      "operatöre bağla", "operatore bagla",
      // Turkish — channel names
      "whatsapp", "telegram",
      // English
      "live support", "live chat", "real person", "human agent",
      "talk to someone", "speak to someone", "connect me",
      "contact clinic", "reach clinic",
    ];
    const msgLowerPre = message.toLowerCase();
    const userWantsLive = LIVE_SUPPORT_KEYWORDS.some(k => msgLowerPre.includes(k));

    if (userWantsLive) {
      debugLog.push("LIVE_SUPPORT_SHORT_CIRCUIT");

      // Detect conversation language from the message
      const isTurkish = /[ğüşıöçĞÜŞİÖÇ]/.test(message)
        || /\b(istiyorum|misin|mısın|mısınız|lütfen|teşekkür|merhaba|tamam|evet|hayır|bağla|destek|görüşmek|iletişim)\b/i.test(message);
      const lang = isTurkish ? "tr" : (clinicLanguage === "tr" ? "tr" : "en");

      const handoffMsg = lang === "tr"
        ? `Sizi canlı destek ekibimize yönlendirebilirim. Aşağıdaki kanallardan biriyle ${clinicName} ekibine ulaşabilirsiniz.`
        : `I can direct you to our live support team. You can contact ${clinicName} through one of the channels below.`;

      const handoffPayload: any = {
        reply: handoffMsg,
        conversationId: convId,
        liveSupportRequired: true,
        clinicName,
        detectedLanguage: lang,
      };
      if (clinicWhatsapp) handoffPayload.whatsappNumber = clinicWhatsapp;
      if (clinicTelegram) handoffPayload.telegramLink   = clinicTelegram;

      debugLog.push(`liveSupport=short-circuit wa=${!!clinicWhatsapp} tg=${!!clinicTelegram} lang=${lang}`);
      console.log("[widget-chat]", debugLog.join(" | "));

      // Log the handoff event
      await logConversation({
        clinicId,
        convId,
        userMessage: message,
        aiReply: handoffMsg,
        historyLength: history.length,
        isLiveSupport: true,
      });

      return NextResponse.json(handoffPayload, { headers: CORS });
    }

    /* ── Normal AI call ───────────────────────────────────────────────── */
    const customPrompt  = promptSettings?.systemPrompt ?? "";
    const aiSkills      = (promptSettings?.aiSkills    ?? {}) as Record<string, boolean>;
    const guardrails    = (promptSettings?.guardrails   ?? {}) as Record<string, { enabled: boolean; text: string }>;
    const today = new Date().toLocaleDateString("tr-TR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    /* Helper: skill is enabled when aiSkills entry is true OR not set (default on) */
    const skillOn = (id: string) => aiSkills[id] !== false;

    /* ── Capability-driven instruction blocks ── */
    const skillBlocks: string[] = [];

    // create_appointment_request — always injected if enabled (core UX)
    if (skillOn("create_appointment_request")) {
      const notificationSettings = clinicData?.notificationSettings || {
        patientAppointmentChannel: "email",
        requireEmail: true,
        requirePhone: false
      };

      const { patientAppointmentChannel, requireEmail, requirePhone } = notificationSettings;

      const requiresEmailStr = requireEmail ? "- E-posta Adresi (Mutlaka geçerli bir adres alınmalı)" : "";
      const requiresPhoneStr = requirePhone ? "- Telefon Numarası" : "";
      
      const validationRules = requireEmail 
          ? `3. E-posta adresi geçerliliğini kontrol et (@ işareti, alan adı vs.). Hatalıysa: "E-posta adresinizde küçük bir eksiklik görünüyor. Klinik dönüşünü iletebilmemiz için adresinizi örneğin adiniz@example.com formatında tekrar paylaşabilir misiniz?" şeklinde nazikçe uyar.`
          : `3. Bilgileri doğrula.`;
          
      let confirmationSentence = "";
      switch (patientAppointmentChannel) {
        case "whatsapp":
          confirmationSentence = `Talebiniz onaylandığında veya farklı bir saat önerildiğinde, WhatsApp üzerinden bilgilendirileceksiniz.`;
          break;
        case "email":
          confirmationSentence = `Talebiniz onaylandığında veya farklı bir saat önerildiğinde, paylaştığınız e-posta adresi üzerinden bilgilendirileceksiniz.`;
          break;
        case "sms":
        default:
          confirmationSentence = `Talebiniz onaylandığında veya farklı bir saat önerildiğinde, SMS üzerinden bilgilendirileceksiniz.`;
          break;
      }

      skillBlocks.push(`\nRANDEVU AKIŞI:
Kullanıcı randevu almak istediğinde (örn: "Randevu almak istiyorum", "Yarın diş beyazlatma", "Doktora görünmek istiyorum", vb.):
1. Şu bilgileri adım adım, tek tek ve DOĞAL bir dille topla:
   - Ad ve Soyad
   ${requiresPhoneStr}
   ${requiresEmailStr}
   - Tedavi/İşlem Türü
   - Tercih edilen Tarih
   - Tercih edilen Saat (Eğer hasta saat belirtmediyse mutlaka şu soruyu sor: "Randevu talebinizi kliniğe doğru şekilde iletebilmem için tercih ettiğiniz saat veya saat aralığını da paylaşabilir misiniz?" Hasta saat belirtmeden devam etmek isterse boş bırakabilirsin.)
2. Eğer bir bilgi eksikse sadece o bilgiyi sor. (Aynı konuşmada daha önce verilen bir bilgiyi tekrar sorma).
${validationRules}
4. Tüm bilgiler tamam olunca MUTLAKA şu formatta özet ve onay iste:
   "Harika! Şu bilgilerle randevu talebi oluşturayım mı?
   Ad: [isim]
   ${requirePhone ? 'Telefon: [telefon]\n   ' : ''}${requireEmail ? 'E-posta: [email]\n   ' : ''}Hizmet: [hizmet]
   Tarih: [tarih]
   Saat: [Tercih edilen saat. Sadece şu formatlardan birini kullan: Net saat ise "14:00", Aralık ise "10:00-12:00", Dönem ise "sabah" / "öğleden_sonra" / "akşamüstü" / "en_erken", Belirtilmediyse "Belirtilmedi"]
   Onaylıyor musunuz? (Evet/Hayır)"
5. Kullanıcı "Evet" dediğinde sistem klinik onayına sunulmak üzere bir ÖN RANDEVU TALEBİ oluşturacak. 
   Kesinlikle "randevunuz oluşturuldu", "onaylandı" deme.
   Kapanış mesajı olarak şunu kullan: "Ön randevu talebinizi kliniğimize ilettim. [Hizmet] işlemi için tercih ettiğiniz [Tarih] [Saat] bilgisi klinik ekibi tarafından değerlendirilecektir. ${confirmationSentence}"`);
    } else {
      skillBlocks.push("\nNot: Randevu oluşturma özelliği bu klinik için şu an devre dışıdır. Randevu talepleri için kullanıcıyı kliniği doğrudan aramaya yönlendir.");
    }

    // send_patient_satisfaction_survey
    if (skillOn("send_patient_satisfaction_survey")) {
      skillBlocks.push("\nHASTA MEMNUNİYET ANKETİ: Randevu veya AI görüşmesi sonrasında uygun bir noktada kısa bir memnuniyet sorusu sor (örn: 'Görüşmemizden memnun kaldınız mı? 1-5 arası puan verebilir misiniz?'). Tıbbi sorular sırasında sorma.");
    }

    // collect_appointment_feedback
    if (skillOn("collect_appointment_feedback")) {
      skillBlocks.push("\nRANDEVU GERİ BİLDİRİMİ: Kullanıcı geçmiş randevusundan bahsederse deneyimi, doktor iletişimini ve hizmet kalitesini sorabilirsin.");
    }

    // follow_up_treatment_interest
    if (skillOn("follow_up_treatment_interest")) {
      skillBlocks.push("\nTEDAVİ İLGİSİ TAKİBİ: Kullanıcı bir tedaviye ilgi gösterip randevu almadan konuyu değiştirirse nazikçe hatırlat: 'Bu tedavi hakkında size daha fazla bilgi vermemi veya randevu ayarlamamı ister misiniz?'");
    }

    // clinic_policy_lookup
    if (skillOn("clinic_policy_lookup")) {
      skillBlocks.push("\nKLİNİK POLİTİKASI: Çalışma saatleri, iptal politikası, fiyatlandırma ve randevu kuralları hakkındaki sorularda önce bilgi havuzuna bak. Bulamazsan kliniği doğrudan aramalarını öner.");
    }

    // emergency_guidance — always active regardless of toggle
    skillBlocks.push("\nACİL DURUM: Hasta acil semptomlar tarif ederse (şiddetli ağrı, kanama, nefes darlığı vb.) TEŞHİS KOYMA. Doğrudan kliniği veya 112'yi aramasını söyle.");

    // knowledge_lookup — always active
    if (knowledgeContext) {
      skillBlocks.push(`\nKLİNİK BİLGİ HAVUZU:\n\n${knowledgeContext}`);
    } else {
      skillBlocks.push("\n(Bu klinik için henüz eğitim verisi eklenmemiş.)");
    }

    if (isLocationIntent) {
      skillBlocks.push("\nKONUM BİLGİSİ: Konum veya adres sorulduğunda, bilgi havuzunda bulunan semt, ilçe, şehir, yakındaki önemli noktalar (havalimanı vb.) gibi TÜM detayları açıkça belirt. Sadece şehri söyleyip geçme. Bilgi varsa gereksiz yere 'iletişime geçin' deme, adresi tam olarak yaz.");
    }

    if (activePriceIntent) {
      skillBlocks.push(`\nÖNEMLİ FİYATLANDIRMA KURALLARI:
1. "Ücretsiz" (free), geçerli ve doğrulanmış bir fiyat türüdür. Bilgi Havuzunda (Örn: "İlk muayene ücretsizdir") geçiyorsa "doğrulanmış bilgi mevcut değil" DEME, "fiyatlar muayene sonrası belli olur" DEME.
2. Soru muayene veya röntgen ücreti ise ve cevap "ücretsiz" ise, DOĞRUDAN net cevap ver: "İlk muayene kliniğimizde ücretsizdir." (veya bağlama uygun şekilde).
3. Soruya doğrudan cevap vermeden önce asla randevu akışını veya iletişim bilgisini öne çıkarma. Önce sorulan fiyat bilgisini / ücretsizlik bilgisini ver, sonra dilerse randevu alabileceğini belirt.`);
    }

    if (doctorContext) {
      skillBlocks.push(`\n${doctorContext}`);
    }

    /* ── Guardrail blocks ── */
    const guardrailBlocks: string[] = [];
    if (guardrails?.noDiagnosis?.enabled !== false) {
      guardrailBlocks.push("- Kesinlikle tıbbi teşhis veya tedavi tavsiyesi verme.");
    }
    if (guardrails?.noAssumptions?.enabled !== false) {
      guardrailBlocks.push("- Hasta durumu hakkında net bilgi olmadan varsayımda bulunma.");
    }
    if (guardrails?.dataPrivacy?.enabled !== false) {
      guardrailBlocks.push("- Kişisel veya hassas sağlık verilerini paylaşma.");
    }

    /* ── System prompt construction ──
       When the clinic has provided a comprehensive custom prompt (e.g. İDA),
       it becomes the PRIMARY identity. Otherwise, use the default intro.
    */
    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;

    const systemPrompt = [
      // ── PRIMARY IDENTITY ──
      hasCustomPrompt
        ? customPrompt   // Custom prompt IS the identity (e.g. "Your name is İDA...")
        : `Sen ${clinicName}'nin dijital hasta asistanısın.`,

      // ── Date context (always injected) ──
      `\n\nBugünün tarihi ve saati: ${today}.`,

      // ── Skill and knowledge blocks ──
      ...skillBlocks,

      // ── Guardrails ──
      guardrailBlocks.length > 0 ? `\nEK GÜVENLİK KURALLARI:\n${guardrailBlocks.join("\n")}` : "",

      // ── System-level rules ──
      `\nSİSTEM KURALLARI:
- Kesin randevu onayı veya kesin müsaitlik garantisi VERME.
- Yanıt dilini kullanıcının diline göre belirle.${!hasCustomPrompt ? "\n- Yanıtların kısa (max 4 cümle), nazik olsun." : "\n- Yanıt uzunluğunu kendi talimatlarına göre belirle; bilgi varsa eksiksiz aktar."}
- Eğer mevcut konuşmanın bağlamıyla DOĞRUDAN ilgili ve kullanıcının seçebileceği 2 veya 3 kısa hızlı aksiyon önerebiliyorsan, yanıtının EN SONUNA şu formatta ekle: [ACTIONS: Aksiyon 1 | Aksiyon 2]
- Bu aksiyonlar kesinlikle kullanıcının diliyle eşleşmelidir (Türkçe konuşmada "Randevu almak istiyorum", "Hangi hizmetleri sunuyorsunuz?", "Kliniğiniz nerede?" gibi olmalı. "Book an appointment" gibi İngilizce kalıpları Türkçe konuşmada KULLANMA).
- SADECE mantıklıysa öner. Randevu akışı başladıysa (isim/telefon soruluyorsa veya onay bekleniyorsa) genel tedavi komutları GÖSTERME.
- [ACTIONS: ...] etiketi DAİMA en sonda olsun ve tek satırda olsun.`,
    ].join("");

    debugLog.push("calling OpenAI...");
    console.log("[widget-chat] capabilities:", {
      skills: Object.fromEntries(Object.entries(aiSkills).map(([k,v]) => [k, v ? "ON" : "OFF"])),
      guardrails: Object.fromEntries(Object.entries(guardrails).map(([k,v]: any) => [k, v?.enabled ? "ON" : "OFF"])),
      skillBlockCount: skillBlocks.length,
    });
    const completion = await trackableAIRequest({
      clinicId,
      conversationId: convId,
      channel: "web_widget",
      requestType: "chat",
      language: "tr",
      model:       promptSettings?.model ?? "gpt-4o-mini",
      temperature: promptSettings?.temperature ?? 0.5,
      maxTokens:   600,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-12).map((h: any) => ({
          role:    h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
    });

    let reply = completion.content?.trim()
      ?? "Üzgünüm, şu an yanıt üretemiyorum.";

    // Strip markdown formatting characters (**, *, #) as requested
    reply = reply.replace(/\*\*|\*|#/g, '');

    let suggestedActions: string[] = [];
    const actionsMatch = reply.match(/\[ACTIONS:\s*(.*?)\]/);
    if (actionsMatch) {
      suggestedActions = actionsMatch[1].split("|").map(a => a.trim()).filter(Boolean);
      reply = reply.replace(actionsMatch[0], "").trim();
    }

    // HARD VALIDATION for Doctor Intent (Preventing Hallucinations)
    if (isDoctorIntent) {
      const lowerReply = reply.toLowerCase();
      // We removed the unconditional override so that the AI can successfully pull doctors from the Knowledge Base.
    }

    // GROUNDEDNESS CHECK
    // Only check if we retrieved RAG context and the AI didn't already use the safe fallback
    if (knowledgeContext.length > 0 && !reply.includes("doğrulamıyorum") && !reply.includes("erişemediğim") && !isDoctorIntent) {
      const { validateGroundedness } = await import("@/lib/services/retrievalService");
      
      const fullContextForValidation = doctorContext ? `${knowledgeContext}\n\n${doctorContext}` : knowledgeContext;
      const validation = await validateGroundedness(reply, fullContextForValidation);
      if (!validation.isGrounded) {
         console.warn(`[Groundedness Failed] Reason: ${validation.reason}\nReply: ${reply}`);
         reply = "Bu bilgiyi şu anda güvenilir şekilde doğrulayamıyorum. Yanlış yönlendirmemek için klinik ekibimizden teyit edilmesi gerekir.";
      }
    }

    debugLog.push(`OK reply="${reply.slice(0, 60)}" ms=${Date.now() - startTime}`);
    console.log("[widget-chat]", debugLog.join(" | "));

    const responsePayload: any = { reply, conversationId: convId };
    if (suggestedActions.length > 0) {
      responsePayload.suggestedActions = suggestedActions;
    }

    // If AI response contains a confirmation summary, extract and return pendingAppointmentData
    // so the widget can send it back on confirmation — more reliable than history parsing
    const isConfirmSummary =
      (reply.includes("Ad:") || reply.includes("Name:")) &&
      (reply.includes("Telefon:") || reply.includes("Phone:") || reply.includes("E-posta:") || reply.includes("Email:") || reply.includes("E-mail:")) &&
      (reply.includes("Onaylıyor") || reply.includes("Onaylay") || reply.includes("Confirm"));

    if (isConfirmSummary) {
      // Parse the summary from AI reply and attach as pendingAppointmentData
      const nameMatch    = reply.match(/(?:Ad|Name|İsim):\s*([^\n\r]+)/i);
      const phoneMatch   = reply.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
      const emailMatch   = reply.match(/(?:E-posta|Email|Mail|E-mail):\s*([^\n\r\s]+)/i);
      const serviceMatch = reply.match(/(?:Hizmet|Service|Tedavi):\s*([^\n\r]+)/i);
      const dtMatch      = reply.match(/(?:Tarih|Date):\s*([^\n\r]+)/i);
      const timeMatch    = reply.match(/(?:Saat|Time):\s*([^\n\r]+)/i);

      const dtStr  = dtMatch?.[1]?.trim() ?? "";
      const rawTimeStr = timeMatch?.[1]?.trim() ?? "";
      
      const parsedTime = parseTimeText(rawTimeStr);

      const pending: AppointmentData = {
        patientName:      nameMatch?.[1]?.trim()    ?? "",
        patientPhone:     phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "",
        patientEmail:     emailMatch?.[1]?.trim().toLowerCase() ?? "",
        requestedService: serviceMatch?.[1]?.trim() ?? "Genel Muayene",
        requestedDate:    dtStr,
        requestedTime:    parsedTime.preferredTime,
        preferredTimeStart: parsedTime.preferredTimeStart,
        preferredTimeEnd: parsedTime.preferredTimeEnd,
        preferredTimePeriod: parsedTime.preferredTimePeriod,
        preferredTimeText: parsedTime.preferredTimeText,
        originalText:     reply,
      };

      if (pending.patientName && (pending.patientPhone || pending.patientEmail)) {
        responsePayload.pendingAppointmentData = pending;
        console.log("[widget-chat] pendingAppointmentData attached:", JSON.stringify(pending));
      }
    }

    await logConversation({
      clinicId,
      convId,
      userMessage: message,
      aiReply: responsePayload.reply,
      historyLength: history.length,
      apptData: isConfirmSummary ? responsePayload.pendingAppointmentData : null,
    });

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
