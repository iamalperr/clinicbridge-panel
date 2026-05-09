import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc, addDoc, serverTimestamp,
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

/* ── Client-side Firebase fallback ──────────────────────────────────────── */
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
  const app = getApps().find(a => a.name === "chat-api") ?? initializeApp(cfg, "chat-api");
  return getFirestore(app);
}

/* ── Appointment confirmation detection ─────────────────────────────────── */
const CONFIRM_KEYWORDS = [
  "evet", "yes", "onaylıyorum", "onayliyorum", "tamam", "olur",
  "kabul", "evet lütfen", "evet lutfen", "tamamdır", "tamamdir",
  "harika", "mükemmel", "mukemmel", "ilerleyelim",
];

function isConfirmation(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return CONFIRM_KEYWORDS.some(k => lower === k || lower.startsWith(k + " ") || lower.startsWith(k + ".") || lower.startsWith(k + "!"));
}

/* ── Extract appointment data from conversation history ─────────────────── */
interface AppointmentData {
  patientName: string;
  patientPhone: string;
  requestedService: string;
  requestedDate: string;
  requestedTime: string;
  originalText: string;
}

function extractAppointmentFromHistory(history: any[]): AppointmentData | null {
  // Find the last assistant message that contains an appointment summary
  // We look for the confirmation message pattern in the last assistant turn
  const assistantMsgs = history.filter(h => h.role === "assistant").map(h => h.content);
  const userMsgs = history.filter(h => h.role === "user").map(h => h.content);

  const confirmMsg = assistantMsgs.find(m =>
    (m.includes("Ad:") || m.includes("ad:") || m.includes("Name:")) &&
    (m.includes("Telefon:") || m.includes("Phone:")) &&
    (m.includes("Tarih") || m.includes("Date") || m.includes("Saat") || m.includes("Time"))
  );

  if (!confirmMsg) {
    console.log("[appointment-extract] No confirmation summary found in history");
    return null;
  }

  console.log("[appointment-extract] Found confirmation summary:", confirmMsg.slice(0, 200));

  // Extract name
  const nameMatch = confirmMsg.match(/(?:Ad|Name|İsim|Hasta):\s*(.+?)(?:\n|$)/i);
  // Extract phone
  const phoneMatch = confirmMsg.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+?)(?:\n|$)/i);
  // Extract service
  const serviceMatch = confirmMsg.match(/(?:Hizmet|Service|Tedavi|Treatment):\s*(.+?)(?:\n|$)/i);
  // Extract date/time together
  const dateTimeMatch = confirmMsg.match(/(?:Tarih\/Saat|Date\/Time|Tarih|Date):\s*(.+?)(?:\n|$)/i);
  const timeMatch = confirmMsg.match(/(?:Saat|Time):\s*([0-9:]+)/i);

  const patientName    = nameMatch?.[1]?.trim() ?? "";
  const patientPhone   = phoneMatch?.[1]?.replace(/\s/g, "").trim() ?? "";
  const requestedService = serviceMatch?.[1]?.trim() ?? "Genel Muayene";
  const dateTimeStr    = dateTimeMatch?.[1]?.trim() ?? "";
  const requestedTime  = timeMatch?.[1]?.trim() ?? "";
  const requestedDate  = dateTimeStr.replace(requestedTime, "").trim() || dateTimeStr;
  const originalText   = userMsgs.join(" | ");

  if (!patientName || !patientPhone) {
    console.log("[appointment-extract] Missing required fields — name or phone not found");
    return null;
  }

  return { patientName, patientPhone, requestedService, requestedDate, requestedTime, originalText };
}

/* ── Create appointment in Firestore ────────────────────────────────────── */
async function createAppointment(params: {
  clinicId: string;
  clinicName: string;
  data: AppointmentData;
  conversationId: string;
  adminDb: any;
  clientDb: any;
}): Promise<{ appointmentId: string; emailSent: boolean }> {
  const { clinicId, clinicName, data, conversationId, adminDb, clientDb } = params;

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
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  };

  let appointmentId = "";

  if (adminDb) {
    const ref = await adminDb.collection("appointments").add(apptDoc);
    appointmentId = ref.id;
  } else if (clientDb) {
    const ref = await addDoc(collection(clientDb, "appointments"), apptDoc);
    appointmentId = ref.id;
  } else {
    throw new Error("No database available");
  }

  console.log(`[appointment-create] ✅ Created appointmentId=${appointmentId} clinicId=${clinicId} patient="${data.patientName}" phone=${data.patientPhone}`);

  /* ── Find clinic email ────────────────────────────────── */
  let clinicEmail = "";
  try {
    if (adminDb) {
      const cSnap = await adminDb.collection("clinics").doc(clinicId).get();
      if (cSnap.exists) {
        clinicEmail = cSnap.data().notificationEmail ?? cSnap.data().email ?? "";
      }
      if (!clinicEmail) {
        const uSnap = await adminDb.collection("users")
          .where("clinicId", "==", clinicId).limit(3).get();
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
    console.log(`[appointment-create] clinicEmail=${clinicEmail || "(none)"}`);
  } catch (e: any) {
    console.warn("[appointment-create] Could not fetch clinic email:", e.message);
  }

  /* ── SMS (mock/provider-ready) ────────────────────────── */
  try {
    await sendPatientSms({
      phone: data.patientPhone,
      clinicName,
      requestedDate:    data.requestedDate,
      requestedTime:    data.requestedTime,
      requestedService: data.requestedService,
    });
    console.log(`[appointment-sms] Mock SMS sent to ${data.patientPhone}`);
  } catch (e: any) {
    console.error("[appointment-sms] Error:", e.message);
  }

  /* ── Email to clinic ──────────────────────────────────── */
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
    console.warn(`[appointment-email] No email found for clinicId=${clinicId} — skipping`);
  }

  /* ── Update notification status ──────────────────────── */
  try {
    const statusUpdate = {
      "notificationStatus.smsToPatient":  "sent", // mock always succeeds
      "notificationStatus.emailToClinic": emailSent ? "sent" : (clinicEmail ? "failed" : "skipped"),
    };
    if (adminDb) {
      await adminDb.collection("appointments").doc(appointmentId).update(statusUpdate);
    } else if (clientDb) {
      const { updateDoc, doc: fsDoc } = await import("firebase/firestore");
      await updateDoc(fsDoc(clientDb, "appointments", appointmentId), statusUpdate);
    }
  } catch (e) { /* non-critical */ }

  return { appointmentId, emailSent };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN POST HANDLER
═══════════════════════════════════════════════════════════════════════════ */
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
      console.error("[widget-chat] OPENAI_API_KEY missing");
      return NextResponse.json(
        { reply: "Yapay zeka servisi şu an yapılandırılmamış. Lütfen kliniğimizi arayın." },
        { headers: CORS }
      );
    }

    /* ── DB ──────────────────────────────────────────────────────────────── */
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

    /* ── Relevance scoring ───────────────────────────────────────────────── */
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

    /* ── SERVER-SIDE confirmation detection ─────────────────────────────── */
    // If user says yes/confirm AND history has a summary → create appointment NOW on server
    if (isConfirmation(message) && history.length > 0) {
      debugLog.push("CONFIRM_DETECTED — attempting server-side appointment creation");
      console.log("[widget-chat] Confirmation detected, extracting appointment data from history...");

      const apptData = extractAppointmentFromHistory(history);

      if (apptData) {
        console.log("[appointment-extract] Extracted:", JSON.stringify(apptData));
        try {
          const { appointmentId, emailSent } = await createAppointment({
            clinicId,
            clinicName,
            data: apptData,
            conversationId: conversationId || `session_${Date.now()}`,
            adminDb,
            clientDb,
          });

          const confirmReply = `Randevu talebinizi aldım ${apptData.patientName.split(" ")[0]} Bey/Hanım! ` +
            `${apptData.requestedDate} saat ${apptData.requestedTime} için "${apptData.requestedService}" talebiniz ` +
            `kliniğimize iletildi. Klinik ekibimiz uygunluğu kontrol ederek size dönüş yapacaktır. 🙏` +
            (emailSent ? " Klinik yönetimine e-posta bildirimi gönderildi." : "");

          debugLog.push(`appointment created appointmentId=${appointmentId} email=${emailSent}`);
          console.log("[widget-chat]", debugLog.join(" | "));
          return NextResponse.json(
            { reply: confirmReply, appointmentId, appointmentCreated: true },
            { headers: CORS }
          );
        } catch (e: any) {
          console.error("[appointment-create] Failed:", e.message);
          debugLog.push(`appt_create_failed: ${e.message}`);
          // Fall through to normal AI reply with error message
          const errReply = "Randevu talebinizi şu anda sisteme kaydedemedim. " +
            "Lütfen kliniğimizi doğrudan arayın veya birkaç dakika sonra tekrar deneyin.";
          console.log("[widget-chat]", debugLog.join(" | "));
          return NextResponse.json({ reply: errReply }, { headers: CORS });
        }
      } else {
        debugLog.push("confirm_detected_but_no_summary");
        console.log("[widget-chat] Confirmation detected but no appointment summary in history — falling through to AI");
      }
    }

    /* ── Normal AI call ──────────────────────────────────────────────────── */
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
Kullanıcı randevu almak istediğinde şu adımları takip et:

1. RANDEVU NİYETİ: "randevu", "appointment", "saat", "gelmek istiyorum" gibi ifadeler niyet sayılır.
2. EKSİK BİLGİ: Gerekli: Ad Soyad, Telefon, Hizmet/Tedavi, Tarih, Saat. Eksik olanları sırayla sor.
3. ÖZET VE ONAY: Tüm bilgiler tamamlandığında MUTLAKA şu formatta özet ver ve onay iste:
   "Harika! Şu bilgilerle randevu talebi oluşturayım mı?
   Ad: [isim]
   Telefon: [telefon]
   Hizmet: [hizmet]
   Tarih/Saat: [tarih] saat [saat]
   Onaylıyor musunuz? (Evet/Hayır)"
4. ONAY SONRASI: Kullanıcı "Evet" dedikten sonra sistem randevuyu otomatik oluşturacak. Sen sadece bekle.

GENEL KURALLAR:
- Kesin tıbbi teşhis, ilaç önerisi veya garanti içeren fiyat bilgisi verme.
- Gerçek zamanlı müsaitlik bilgin yok; "talep kliniğe iletilecek, teyit edilecek" de.
- Yanıtların kısa (max 4 cümle), nazik ve anlaşılır olsun.
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
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen kliniğimizi doğrudan arayın veya daha sonra tekrar deneyin." },
      { status: 200, headers: CORS }
    );
  }
}
