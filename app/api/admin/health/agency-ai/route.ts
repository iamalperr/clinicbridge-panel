import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { trackableAIRequest } from "@/lib/services/aiGateway";

export const dynamic = "force-dynamic"; // Ensure it's not statically cached

export async function GET(request: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ status: "Down", reason: "Database unavailable" }, { status: 503 });
    }

    // 1. Check API Key
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ status: "Down", reason: "OPENAI_API_KEY missing" }, { status: 500 });
    }
    const maskedKey = `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 4)}`;

    // 2. Fetch specific Agency (FeelinHealthy)
    const agencySnap = await adminDb.collection("agencies").where("slug", "==", "feelinhealthy").limit(1).get();
    if (agencySnap.empty) {
      return NextResponse.json({ status: "Down", reason: "FeelinHealthy agency not found" }, { status: 500 });
    }
    const agencyId = agencySnap.docs[0].id;

    // 3. Count connected clinics for that agency
    const clinicsSnap = await adminDb.collection("clinics").where("agencyId", "==", agencyId).get();
    const clinicCount = clinicsSnap.size;

    // 4. Test OpenAI Minimal Prompt
    let aiStatus = "Operational";
    let aiReason = "OK";
    let duration = 0;
    const start = Date.now();
    try {
      await trackableAIRequest({
        channel: "portal",
        requestType: "chat",
        model: "gpt-4o-mini", // Explicitly test the primary model
        temperature: 0,
        maxTokens: 5,
        messages: [{ role: "user", content: "Say OK" }]
      });
      duration = Date.now() - start;
    } catch (err: any) {
      aiStatus = "Degraded";
      aiReason = err.code || err.message || "Unknown OpenAI Error";
      duration = Date.now() - start;
    }

    // Combine result
    const overallStatus = aiStatus === "Operational" && clinicCount > 0 ? "Operational" : "Degraded";
    
    return NextResponse.json({
      status: overallStatus,
      aiProvider: aiStatus,
      aiReason,
      aiLatencyMs: duration,
      agencyConfig: "Operational",
      clinicCount,
      keyFingerprint: maskedKey,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (err: any) {
    console.error("[HealthCheck] AI Gateway failed:", err);
    return NextResponse.json({ status: "Down", reason: err.message }, { status: 500 });
  }
}
