import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* ── Client-side Firebase (fallback when Admin SDK unavailable) ── */
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
  const app = getApps().length > 0 ? getApp() : initializeApp(cfg, "chat-api");
  return getFirestore(app);
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let debugLog: string[] = [];

  try {
    const { clinicId, message, history = [] } = await req.json();
    debugLog.push(`clinicId=${clinicId} message="${message?.slice(0, 60)}"`);

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

    // ── Try Admin SDK first, fall back to client SDK ──────────────────────────
    const adminDb = getAdminDb();
    const clientDb = adminDb ? null : getClientDb();
    debugLog.push(`db=admin:${!!adminDb} client:${!!clientDb}`);

    let clinicName = "Klinik";
    let promptSettings: any = null;
    let trainingDocs: Array<{ title: string; content: string }> = [];

    if (adminDb) {
      // ── Admin SDK path ──
      const [clinicSnap, promptSnap, materialsSnap] = await Promise.all([
        adminDb.collection("clinics").doc(clinicId).get(),
        adminDb.collection("promptSettings").doc(clinicId).get(),
        adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(30).get(),
      ]);

      if (clinicSnap.exists) clinicName = (clinicSnap.data()!.name ?? "Klinik");
      if (promptSnap.exists) promptSettings = promptSnap.data();

      trainingDocs = materialsSnap.docs.map(d => ({
        title:   d.data().title   ?? "",
        content: d.data().content ?? "",
      }));
      debugLog.push(`[admin] clinic="${clinicName}" docs=${trainingDocs.length}`);

    } else if (clientDb) {
      // ── Client SDK fallback ──
      const [clinicSnap, promptSnap] = await Promise.all([
        getDoc(doc(clientDb, "clinics", clinicId)),
        getDoc(doc(clientDb, "promptSettings", clinicId)),
      ]);

      if (clinicSnap.exists()) clinicName = clinicSnap.data()!.name ?? "Klinik";
      if (promptSnap.exists()) promptSettings = promptSnap.data();

      const q = query(
        collection(clientDb, "trainingMaterials"),
        where("clinicId", "==", clinicId)
      );
      const materialsSnap = await getDocs(q);
      trainingDocs = materialsSnap.docs.map(d => ({
        title:   d.data().title   ?? "",
        content: d.data().content ?? "",
      }));
      debugLog.push(`[client] clinic="${clinicName}" docs=${trainingDocs.length}`);

    } else {
      debugLog.push("NO_DB — proceeding with no training context");
    }

    // ── Relevance scoring ─────────────────────────────────────────────────────
    const msgLower = message.toLowerCase();
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);

    const scored = trainingDocs.map(d => {
      const text = (d.title + " " + d.content).toLowerCase();
      const score = msgWords.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);
      return { ...d, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // Always include at least 8 docs to ensure broad context; score=0 docs go last
    const topDocs = scored.slice(0, 12);
    const knowledgeContext = topDocs.length > 0
      ? topDocs.map(d => `## ${d.title}\n${d.content}`).join("\n\n---\n\n")
      : "";

    debugLog.push(`topDocs=[${topDocs.slice(0, 5).map(d => d.title).join(", ")}]`);

    // ── Build system prompt ───────────────────────────────────────────────────
    const customPrompt = promptSettings?.systemPrompt ?? "";

    const systemPrompt = [
      `Sen ${clinicName}'nin dijital hasta asistanısın.`,
      customPrompt ? `\nKLİNİĞE ÖZEL TALİMATLAR:\n${customPrompt}` : "",
      knowledgeContext
        ? `\nKLİNİK BİLGİ HAVUZU (cevaplarında bu bilgileri kullan):\n\n${knowledgeContext}`
        : "\n(Bu klinik için henüz eğitim verisi eklenmemiş.)",
      `\nGENEL KURALLAR:
- Yalnızca yukarıdaki bilgi havuzuna dayanarak yanıt ver.
- Kesin tıbbi teşhis, ilaç önerisi veya garanti içeren fiyat bilgisi verme.
- Uygun durumlarda randevu almalarını veya kliniği aramalarını öner.
- Yanıtların kısa (max 3-4 cümle), nazik ve anlaşılır olsun.
- Bilgi havuzunda cevap bulamazsan açıkça söyle ve kliniği aramalarını öner.
- Türkçe sorulara Türkçe, İngilizce sorulara İngilizce yanıt ver.`,
    ].join("");

    // ── OpenAI call ───────────────────────────────────────────────────────────
    debugLog.push("calling OpenAI...");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model:       promptSettings?.model ?? "gpt-4o-mini",
      temperature: promptSettings?.temperature ?? 0.5,
      max_tokens:  500,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((h: any) => ({
          role:    h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim()
      ?? "Üzgünüm, şu an yanıt üretemiyorum.";

    debugLog.push(`OK reply="${reply.slice(0, 80)}" ms=${Date.now() - startTime}`);
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
