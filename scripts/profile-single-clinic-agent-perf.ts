import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminDb } from "../lib/firebase-admin";
import {
  IntentRouter,
  evaluateAppointmentCollectionGate,
  resolveConversationLocaleWithMeta,
} from "../lib/conversation";

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: s[0] ?? 0,
    mean: s.length ? Math.round(sum / s.length) : 0,
    p50: percentile(s, 50),
    p75: percentile(s, 75),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    max: s[s.length - 1] ?? 0,
  };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - t0), value };
}

function timeSync<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: Math.round((performance.now() - t0) * 1000) / 1000, value };
}

const CLINIC_ID = "ByTnY4VEmBTJxogqCQ7q";

const SCENARIOS: Array<{ id: string; message: string; language?: string }> = [
  { id: "A_location", message: "Kliniğiniz nerede?" },
  { id: "A_hours", message: "Çalışma saatleriniz nedir?" },
  { id: "A_english", message: "Do you speak English?", language: "en" },
  { id: "B_endodontist", message: "Endodonti uzmanınız var mı?" },
  { id: "B_implant_doctor", message: "İmplant konusunda hangi doktorunuz ilgileniyor?" },
  { id: "C_whitening", message: "Diş beyazlatma yapıyor musunuz?" },
  { id: "C_implant", message: "İmplant tedaviniz var mı?" },
  { id: "D_whitening_price", message: "Diş beyazlatma fiyatını öğrenebilir miyim?" },
  { id: "D_implant_price", message: "İmplant fiyatı ne kadar?" },
  { id: "E_rag_production", message: "Merhaba Plak temizleme - diş beyazlatma için fiyat öğrenebilir miyim" },
  { id: "F_appt_start", message: "Yarın diş beyazlatma için randevu almak istiyorum." },
  { id: "G_appt_date_only", message: "5 Ağustos 2026" },
];

async function main() {
  const db = getAdminDb();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  console.log(JSON.stringify({ phase: "meta", clinicId: CLINIC_ID, hasOpenAI }, null, 2));

  // ── Cold Firestore loads ──────────────────────────────────────────────
  const coldClinic = await timeAsync(() => db.collection("clinics").doc(CLINIC_ID).get());
  const clinicName =
    coldClinic.value.data()?.clinicName || coldClinic.value.data()?.name || "(unknown)";
  console.log(
    JSON.stringify({
      phase: "cold_clinic",
      ms: coldClinic.ms,
      exists: coldClinic.value.exists,
      clinicName,
    })
  );

  const coldPrompt = await timeAsync(() => db.collection("promptSettings").doc(CLINIC_ID).get());
  const promptData = coldPrompt.value.data() || {};
  console.log(
    JSON.stringify({
      phase: "cold_prompt",
      ms: coldPrompt.ms,
      exists: coldPrompt.value.exists,
      model: promptData.model || "gpt-4o-mini(default)",
      hasSystemPrompt: Boolean(promptData.systemPrompt),
    })
  );

  const materialsCold = await timeAsync(() =>
    db.collection("trainingMaterials").where("clinicId", "==", CLINIC_ID).limit(250).get()
  );
  let chunkCount = 0;
  let contentChars = 0;
  let docsWithEmbeddings = 0;
  const trainingDocs: Array<{ id: string; title: string; content: string; embeddingChunks?: any[] }> =
    [];
  materialsCold.value.docs.forEach((d) => {
    const data = d.data();
    const chunks = Array.isArray(data.embeddingChunks) ? data.embeddingChunks : [];
    contentChars += String(data.content || "").length;
    chunkCount += chunks.length;
    if (chunks.length > 0) docsWithEmbeddings += 1;
    trainingDocs.push({
      id: d.id,
      title: data.title || "",
      content: data.content || "",
      embeddingChunks: chunks,
    });
  });
  console.log(
    JSON.stringify({
      phase: "cold_materials",
      ms: materialsCold.ms,
      materialsCount: materialsCold.value.size,
      docsWithEmbeddings,
      embeddingChunks: chunkCount,
      contentChars,
    })
  );

  // ── Warm parallel clinic+prompt+materials (20) ────────────────────────
  const parallelSamples: number[] = [];
  const clinicSamples: number[] = [];
  const materialsSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const [c, , m] = await Promise.all([
      timeAsync(() => db.collection("clinics").doc(CLINIC_ID).get()),
      timeAsync(() => db.collection("promptSettings").doc(CLINIC_ID).get()),
      timeAsync(() =>
        db.collection("trainingMaterials").where("clinicId", "==", CLINIC_ID).limit(250).get()
      ),
    ]);
    parallelSamples.push(Math.round(performance.now() - t0));
    clinicSamples.push(c.ms);
    materialsSamples.push(m.ms);
  }
  console.log(JSON.stringify({ phase: "warm_parallel_clinic_prompt_materials", ...stats(parallelSamples) }));
  console.log(JSON.stringify({ phase: "warm_clinic_get", ...stats(clinicSamples) }));
  console.log(JSON.stringify({ phase: "warm_materials", ...stats(materialsSamples) }));

  // Conversation state miss
  const convId = `bench_perf_${Date.now()}`;
  const stateSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await timeAsync(() =>
      db.collection("clinics").doc(CLINIC_ID).collection("conversationLogs").doc(convId).get()
    );
    stateSamples.push(r.ms);
  }
  console.log(JSON.stringify({ phase: "warm_conversation_state_miss", ...stats(stateSamples) }));

  const doctors = await timeAsync(() =>
    db.collection("clinics").doc(CLINIC_ID).collection("doctors").where("is_active", "==", true).get()
  );
  console.log(JSON.stringify({ phase: "doctors_load", ms: doctors.ms, count: doctors.value.size }));

  // ── Deterministic intent / locale / gate (200 reps each scenario) ─────
  for (const scenario of SCENARIOS) {
    const intentSamples: number[] = [];
    const localeSamples: number[] = [];
    const gateSamples: number[] = [];
    let lastIntent = "";
    let lastGate = false;
    let lastLocale = "";
    for (let i = 0; i < 200; i++) {
      const intentTimed = timeSync(() =>
        IntentRouter.classifyConversationIntent({
          message: scenario.message,
          currentState: "INITIAL",
          locale: scenario.language || "tr",
        })
      );
      intentSamples.push(intentTimed.ms);
      lastIntent = intentTimed.value.intent;

      const localeTimed = timeSync(() =>
        resolveConversationLocaleWithMeta({
          requestLanguage: scenario.language || "en",
          currentMessage: scenario.message,
          clinicDefaultLocale: "tr",
        })
      );
      localeSamples.push(localeTimed.ms);
      lastLocale = localeTimed.value.locale;

      const gateTimed = timeSync(() =>
        evaluateAppointmentCollectionGate({
          message: scenario.message,
          intent: intentTimed.value.intent,
          isAppointmentFlowActive: false,
          entities: intentTimed.value.entities,
        })
      );
      gateSamples.push(gateTimed.ms);
      lastGate = gateTimed.value.allowed;
    }
    console.log(
      JSON.stringify({
        phase: "deterministic_path",
        scenario: scenario.id,
        intent: lastIntent,
        startsAppointment: lastGate,
        locale: lastLocale,
        intent_ms: stats(intentSamples),
        locale_ms: stats(localeSamples),
        gate_ms: stats(gateSamples),
      })
    );
  }

  // ── Keyword-only RAG scoring cost (no OpenAI) ─────────────────────────
  // Simulates the local scoring loop over all chunks for one query.
  const keywordScoreSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const q = "diş beyazlatma fiyat";
    let scored = 0;
    for (const doc of trainingDocs) {
      const chunks =
        doc.embeddingChunks && doc.embeddingChunks.length > 0
          ? doc.embeddingChunks
          : [{ text: `${doc.title} ${doc.content}` }];
      for (const chunk of chunks) {
        const text = String(chunk.text || "").toLowerCase();
        if (text.includes("diş") || text.includes("beyazlatma") || text.includes("fiyat")) {
          scored += 1;
        }
      }
    }
    keywordScoreSamples.push(Math.round(performance.now() - t0));
    if (i === 0) {
      console.log(JSON.stringify({ phase: "keyword_score_probe", matchedChunks: scored, docs: trainingDocs.length, chunks: chunkCount }));
    }
  }
  console.log(JSON.stringify({ phase: "local_keyword_score_loop", ...stats(keywordScoreSamples) }));

  // ── Optional OpenAI path ──────────────────────────────────────────────
  if (hasOpenAI) {
    const { rewriteQuery, hybridSearch, validateGroundedness } = await import(
      "../lib/services/retrievalService"
    );
    const { generateEmbeddings } = await import("../lib/services/embeddingService");
    const { trackableAIRequest } = await import("../lib/services/aiGateway");

    const rewriteSamples: number[] = [];
    const embedSamples: number[] = [];
    const hybridSamples: number[] = [];
    const chatSamples: number[] = [];
    const groundSamples: number[] = [];
    const e2eSamples: number[] = [];

    const msg = "Diş beyazlatma fiyatını öğrenebilir miyim?";
    const iterations = 8; // keep OpenAI cost bounded

    for (let i = 0; i < iterations; i++) {
      const e2e0 = performance.now();

      const rw = await timeAsync(() => rewriteQuery(msg, clinicName));
      rewriteSamples.push(rw.ms);

      const emb = await timeAsync(() => generateEmbeddings([msg, ...(rw.value || [])].slice(0, 4)));
      embedSamples.push(emb.ms);

      const hs = await timeAsync(() => hybridSearch(msg, trainingDocs, clinicName, 10));
      hybridSamples.push(hs.ms);

      const ctx = hs.value
        .slice(0, 5)
        .map((d) => `## ${d.title}\n${d.text}`)
        .join("\n\n")
        .slice(0, 8000);

      const chat = await timeAsync(() =>
        trackableAIRequest({
          clinicId: CLINIC_ID,
          channel: "web_widget",
          requestType: "chat",
          language: "tr",
          model: (promptData.model as string) || "gpt-4o-mini",
          maxTokens: 600,
          messages: [
            {
              role: "system",
              content: `Sen ${clinicName} klinik asistanısın. Bilgi havuzu:\n${ctx}\nKısa Türkçe yanıt ver.`,
            },
            { role: "user", content: msg },
          ],
        })
      );
      chatSamples.push(chat.ms);

      const ground = await timeAsync(() =>
        validateGroundedness(chat.value.content || "", ctx)
      );
      groundSamples.push(ground.ms);

      e2eSamples.push(Math.round(performance.now() - e2e0));
      console.log(
        JSON.stringify({
          phase: "openai_iteration",
          i,
          rewrite_ms: rw.ms,
          embed_ms: emb.ms,
          hybrid_ms: hs.ms,
          chat_ms: chat.ms,
          groundedness_ms: ground.ms,
          e2e_ms: e2eSamples[e2eSamples.length - 1],
          topDoc: hs.value[0]?.title,
          replyPreview: String(chat.value.content || "").slice(0, 80),
        })
      );
    }

    console.log(JSON.stringify({ phase: "openai_rewrite", ...stats(rewriteSamples) }));
    console.log(JSON.stringify({ phase: "openai_embed", ...stats(embedSamples) }));
    console.log(JSON.stringify({ phase: "openai_hybrid_total", ...stats(hybridSamples) }));
    console.log(JSON.stringify({ phase: "openai_chat", ...stats(chatSamples) }));
    console.log(JSON.stringify({ phase: "openai_groundedness", ...stats(groundSamples) }));
    console.log(JSON.stringify({ phase: "openai_pipeline_e2e", ...stats(e2eSamples) }));
  } else {
    console.log(
      JSON.stringify({
        phase: "openai_skipped",
        reason: "OPENAI_API_KEY not configured in local environment",
      })
    );
  }

  // ── After: short-TTL clinic runtime cache simulation ───────────────────
  const { getCachedClinicRuntime, setCachedClinicRuntime, invalidateClinicRuntimeCache } = await import(
    "../lib/performance/clinicRuntimeCache"
  );
  invalidateClinicRuntimeCache();
  const cacheMissSamples: number[] = [];
  const cacheHitSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    invalidateClinicRuntimeCache();
    const miss = await timeAsync(async () => {
      const [c, p, m] = await Promise.all([
        db.collection("clinics").doc(CLINIC_ID).get(),
        db.collection("promptSettings").doc(CLINIC_ID).get(),
        db.collection("trainingMaterials").where("clinicId", "==", CLINIC_ID).limit(250).get(),
      ]);
      const docs = m.docs.map((d) => ({
        id: d.id,
        title: d.data().title || "",
        content: d.data().content || "",
        embeddingChunks: d.data().embeddingChunks || [],
      }));
      setCachedClinicRuntime(CLINIC_ID, {
        clinicData: c.data(),
        clinicName: c.data()?.clinicName || c.data()?.name || "Klinik",
        clinicWhatsapp: c.data()?.whatsappNumber || "",
        clinicTelegram: c.data()?.telegramUsername || "",
        clinicLanguage: c.data()?.language || "tr",
        promptSettings: p.data() || null,
        trainingDocs: docs,
      });
      return docs.length;
    });
    cacheMissSamples.push(miss.ms);

    const hit = await timeAsync(async () => {
      const cached = getCachedClinicRuntime(CLINIC_ID);
      if (!cached) throw new Error("expected cache hit");
      return cached.trainingDocs.length;
    });
    cacheHitSamples.push(hit.ms);
  }
  console.log(JSON.stringify({ phase: "after_cache_miss_clinic_bundle", ...stats(cacheMissSamples) }));
  console.log(JSON.stringify({ phase: "after_cache_hit_clinic_bundle", ...stats(cacheHitSamples) }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
