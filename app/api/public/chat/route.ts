import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const { clinicId, message, history = [] } = await req.json();

    if (!clinicId || !message) {
      return NextResponse.json({ error: "clinicId and message required" }, { status: 400, headers: CORS });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI not configured" }, { status: 500, headers: CORS });
    }

    const adminDb = getAdminDb();

    // ── 1. Load clinic prompt settings ──────────────────────────────────────
    let promptSettings: any = null;
    let clinicName = "Klinik";

    if (adminDb) {
      // Clinic basic info
      const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
      if (clinicSnap.exists) {
        const c = clinicSnap.data()!;
        clinicName = c.name ?? "Klinik";
      }

      // AI prompt settings (stored in promptSettings collection)
      const promptSnap = await adminDb.collection("promptSettings").doc(clinicId).get();
      if (promptSnap.exists) {
        promptSettings = promptSnap.data();
      }
    }

    // ── 2. Load training materials for context ───────────────────────────────
    let knowledgeContext = "";

    if (adminDb) {
      const materialsSnap = await adminDb
        .collection("trainingMaterials")
        .where("clinicId", "==", clinicId)
        .limit(30) // reasonable cap to stay within token limit
        .get();

      if (!materialsSnap.empty) {
        const docs = materialsSnap.docs.map(d => d.data());

        // Simple relevance filter: prioritise docs whose title/content contains keywords from user message
        const msgLower = message.toLowerCase();
        const scored = docs.map(doc => {
          const text = ((doc.title ?? "") + " " + (doc.content ?? "")).toLowerCase();
          // Count overlapping words (3+ chars) between question and document
          const words = msgLower.split(/\s+/).filter((w: string) => w.length > 2);
          const score = words.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);
          return { doc, score };
        });

        // Sort by relevance, take top 10 — always include at least 5
        scored.sort((a, b) => b.score - a.score);
        const topDocs = scored.slice(0, 10).map(s => s.doc);

        knowledgeContext = topDocs
          .map(d => `## ${d.title ?? "Bilgi"}\n${d.content ?? ""}`)
          .join("\n\n---\n\n");

        console.log(
          `[widget-chat] clinicId=${clinicId} | totalDocs=${docs.length} | usedDocs=${topDocs.length} | titles=[${topDocs.map(d => d.title).join(", ")}]`
        );
      } else {
        console.log(`[widget-chat] clinicId=${clinicId} | No training materials found`);
      }
    }

    // ── 3. Build system prompt ───────────────────────────────────────────────
    const basePrompt = promptSettings?.systemPrompt ?? "";

    const systemPrompt = `Sen ${clinicName}'nin AI hasta asistanısın.

${basePrompt ? `KLİNİĞE ÖZEL TALİMATLAR:\n${basePrompt}\n\n` : ""}${knowledgeContext ? `KLİNİK BİLGİ HAVUZU (bu bilgileri cevaplarında kullan):\n\n${knowledgeContext}\n\n` : ""}GENEL KURALLAR:
- Yalnızca klinik bilgi havuzundaki bilgilere dayanarak yanıt ver.
- Kesin fiyat, tıbbi teşhis veya ilaç önerisi yapma.
- Tedavi veya randevu için kliniği aramalarını ya da form doldurmalarını öner.
- Yanıtların kısa, dostane ve profesyonel olsun.
- Bilgi havuzunda cevap bulamazsan: "Bu konuda size en doğru bilgiyi verebilmem için kliniğimizi aramanızı öneririm." de.
- Türkçe sorulara Türkçe, İngilizce sorulara İngilizce yanıt ver.`;

    // ── 4. Call OpenAI ───────────────────────────────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      // Include previous conversation history (last 6 exchanges to stay within limits)
      ...history.slice(-12).map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: promptSettings?.model ?? "gpt-4o-mini",
      temperature: promptSettings?.temperature ?? 0.5,
      max_tokens: 600,
      messages: chatMessages,
    });

    const reply = completion.choices[0]?.message?.content ?? "Üzgünüm, şu an yanıt üretemiyorum.";

    return NextResponse.json({ reply }, { headers: CORS });

  } catch (err: any) {
    console.error("[widget-chat] Error:", err.message ?? err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen daha sonra tekrar deneyin veya kliniğimizi arayın." },
      { status: 200, headers: CORS } // 200 so widget shows the fallback gracefully
    );
  }
}
