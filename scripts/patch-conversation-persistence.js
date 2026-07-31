const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname, "../app/api/public/agency/[slug]/matching-chat/route.ts");
let code = fs.readFileSync(routePath, "utf-8");

const helperCode = `
/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSATION PERSISTENCE HELPER
═══════════════════════════════════════════════════════════════════════════ */
async function saveConversationStateAsync(
  adminDb: any, 
  agencyId: string, 
  ctx: any, 
  history: any[], 
  replyText: string, 
  replyType: string
) {
  if (!ctx.sessionId) return;
  try {
    let status = "active";
    if (ctx.leadStage === "completed") status = "quote_requested";
    else if (ctx.leadStage === "clinic_selected") status = "clinic_recommended";
    else if (ctx.leadStage === "recommendation") status = "qualified";

    let aiCompletionRate = 10;
    if (ctx.leadStage === "discovery") aiCompletionRate = 30;
    if (ctx.leadStage === "recommendation") aiCompletionRate = 60;
    if (ctx.leadStage === "clinic_selected") aiCompletionRate = 80;
    if (ctx.leadStage === "collecting_email" || ctx.leadStage === "collecting_consent") aiCompletionRate = 90;
    if (ctx.leadStage === "quote_request_created" || ctx.leadStage === "completed") aiCompletionRate = 100;

    const fullHistory = [...(history || []), { role: "assistant", content: replyText, type: replyType }];

    await adminDb.collection("agencies").doc(agencyId).collection("conversations").doc(ctx.sessionId).set({
      agencyId,
      patientName: ctx.patientName || "",
      language: ctx.language || "tr",
      treatmentCategory: ctx.lastTreatmentCategory || "",
      subTreatment: ctx.lastSubTreatment || "",
      location: ctx.lastLocation || "",
      status,
      leadStage: ctx.leadStage || "discovery",
      messagesCount: fullHistory.length,
      aiCompletionRate,
      leadId: ctx.leadId || "",
      selectedClinicId: ctx.selectedClinicId || ctx.lastFocusedClinicId || "",
      recommendedClinicIds: ctx.lastRecommendedClinicIds || [],
      history: fullHistory,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
      createdAt: ctx.createdAt || new Date()
    }, { merge: true });
  } catch (err) {
    console.error("[matching-chat] Failed to save conversation state:", err);
  }
}
`;

if (!code.includes("saveConversationStateAsync")) {
  code += helperCode;
}

let modified = false;

const replacePattern = /return NextResponse\.json\(\{\s*reply:\s*(.*?),\s*type:\s*(.*?),\s*(clinics:\s*.*?,)?\s*sessionContext:\s*newCtx(.*?\})\s*,\s*\{\s*headers:\s*CORS\s*\}\);/gs;

code = code.replace(replacePattern, (match, reply, type, clinicsOpt, restOfObj) => {
  modified = true;
  return `// Save conversation state asynchronously\n    saveConversationStateAsync(adminDb, agencyId, newCtx, history, ${reply}, ${type}).catch(console.error);\n    ${match}`;
});

const pattern2 = /return NextResponse\.json\(\{\s*reply:\s*(.*?),\s*type:\s*"clinic_recommendations",\s*clinics:\s*(.*?),\s*sessionContext:\s*newCtx\s*\}\s*,\s*\{\s*headers:\s*CORS\s*\}\);/gs;
code = code.replace(pattern2, (match, reply, clinics) => {
    modified = true;
    return `// Save conversation state asynchronously\n    saveConversationStateAsync(adminDb, agencyId, newCtx, history, ${reply}, "clinic_recommendations").catch(console.error);\n    ${match}`;
});

if (modified) {
  fs.writeFileSync(routePath, code);
  console.log("Successfully patched route.ts to save conversations.");
} else {
  console.log("No modifications made (pattern might not have matched).");
}
