/**
 * aiGateway.ts
 *
 * Centralized gateway for all OpenAI API calls within ClinicBridge.
 * Handles the actual API request, calculates token usage and costs,
 * checks limits, and persists the usage record to Firestore.
 */

import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";
import { getModelPricing, calculateCost } from "./aiPricingService";
import { checkLimitsAndNotify } from "./aiLimitService";
import type {
  TrackableAIRequestParams,
  TrackableAIResponse,
  ClinicAIUsage,
  AIUsageStatus,
  AIPricingStatus,
} from "@/lib/types/aiUsage";

// Initialize OpenAI client lazily
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Generates a unique internal ID for the request.
 */
function generateInternalId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Main function to make an OpenAI request and track its usage.
 * Replaces direct calls to `openai.chat.completions.create`.
 */
export async function trackableAIRequest(
  params: TrackableAIRequestParams
): Promise<TrackableAIResponse> {
  const startTime = Date.now();
  const internalRequestId = generateInternalId();
  const now = new Date();
  
  // Default values
  const model = params.model || "gpt-4o-mini";
  const temperature = params.temperature ?? 0.7;
  const clinicId = params.clinicId; // may be undefined for pure system calls
  
  let status: AIUsageStatus = "success";
  let errorCode: string | undefined;
  let openaiRequestId: string | undefined;
  
  // Usage tracking variables
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  
  let aiContent = "";

  try {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError: any;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const openai = getOpenAI();
        
        // Make the actual API call
        const completion = await openai.chat.completions.create({
          model,
          temperature,
          messages: params.messages as any,
          max_tokens: params.maxTokens,
          response_format: params.responseFormat as any,
        });

        aiContent = completion.choices[0]?.message?.content || "";
        openaiRequestId = completion.id;
        
        // Extract token usage
        if (completion.usage) {
          totalTokens = completion.usage.total_tokens || 0;
          inputTokens = completion.usage.prompt_tokens || 0;
          outputTokens = completion.usage.completion_tokens || 0;
          
          // Extract cached tokens if available (requires newer OpenAI types)
          const promptDetails = (completion.usage as any).prompt_tokens_details;
          if (promptDetails && promptDetails.cached_tokens) {
            cachedInputTokens = promptDetails.cached_tokens;
            // Non-cached input tokens = total input - cached
            // Note: OpenAI's prompt_tokens includes cached. Our pricing model separates them.
            inputTokens = Math.max(0, inputTokens - cachedInputTokens);
          }
        }
        
        // Success
        status = "success";
        break;

      } catch (err: any) {
        lastError = err;
        const eCode = err.response?.data?.error?.code || err.code || err.type || "";
        const eType = err.response?.data?.error?.type || "";
        const httpStatus = err.status || err.response?.status;

        const isQuota = eCode === "insufficient_quota" || eType === "insufficient_quota";
        const isRateLimit = eCode === "rate_limit_exceeded" || eType === "rate_limit_exceeded" || httpStatus === 429;
        const isTimeout = httpStatus === 408 || httpStatus === 504 || eCode === "ETIMEDOUT";

        if (isQuota) {
          errorCode = "OPENAI_QUOTA_EXCEEDED";
          break; // Do not retry
        } else if (isRateLimit) {
          errorCode = "OPENAI_RATE_LIMITED";
        } else if (isTimeout) {
          errorCode = "OPENAI_TIMEOUT";
        } else if (httpStatus === 401 || httpStatus === 403) {
          errorCode = "OPENAI_AUTH_FAILED";
          break;
        } else if (eCode === "model_not_found") {
          errorCode = "OPENAI_MODEL_NOT_FOUND";
          break;
        } else if (eCode === "context_length_exceeded") {
          errorCode = "OPENAI_CONTEXT_TOO_LARGE";
          break;
        } else {
          errorCode = "OPENAI_ERROR_" + (eCode || httpStatus || "UNKNOWN");
          break;
        }

        if (attempts < maxAttempts && (isRateLimit || isTimeout)) {
          const baseMs = attempts === 1 ? 600 : 2000;
          const jitter = Math.random() * 200;
          const delayMs = baseMs + jitter;
          console.warn(`[aiGateway] Attempt ${attempts} failed (${errorCode}). Retrying in ${delayMs.toFixed(0)}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          break;
        }
      }
    }

    if (!aiContent && lastError) {
      status = "failed";
      console.error(`[aiGateway] Request failed after ${attempts} attempts (${internalRequestId}):`, lastError.message);
    }
  } catch (err: any) {
    status = "failed";
    errorCode = "INTERNAL_GATEWAY_ERROR";
    console.error(`[aiGateway] Fatal gateway error (${internalRequestId}):`, err.message);
  }

  const durationMs = Date.now() - startTime;

  // 1. Calculate Cost
  let pricingStatus: AIPricingStatus = "calculated";
  let costs = {
    inputCostUsd: 0,
    cachedInputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
  };

  const pricing = await getModelPricing(model, now);
  
  if (!pricing) {
    pricingStatus = "missing";
    console.warn(`[aiGateway] Missing pricing for model: ${model}`);
  } else if (status === "success" && totalTokens > 0) {
    costs = calculateCost(inputTokens, cachedInputTokens, outputTokens, pricing);
  }

  // 2. Prepare Usage Record
  const usageRecord: ClinicAIUsage = {
    id: internalRequestId, // use internal ID as document ID for idempotency
    internalRequestId,
    clinicId,
    conversationId: params.conversationId,
    leadId: params.leadId,
    appointmentId: params.appointmentId,
    openaiRequestId,
    parentRequestId: params.parentRequestId,
    retryCount: params.retryCount,
    
    model,
    requestType: params.requestType,
    channel: params.channel,
    
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    
    ...costs,
    
    durationMs,
    language: params.language,
    status,
    pricingStatus,
    errorCode,
    
    createdAt: now.toISOString(),
  };

  // 3. Save to Firestore (non-blocking if possible, but we await to ensure it's saved)
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      await adminDb.collection("aiUsage").doc(internalRequestId).set(usageRecord);
      
      // 4. Update daily aggregate (fire and forget)
      if (clinicId) {
        updateDailyAggregate(adminDb, usageRecord).catch(e => 
          console.error(`[aiGateway] Failed to update daily aggregate:`, e)
        );
        
        // 5. Check Limits (if success and cost > 0)
        if (status === "success" && costs.totalCostUsd > 0) {
          checkLimitsForClinic(adminDb, clinicId, costs.totalCostUsd).catch(e =>
            console.error(`[aiGateway] Failed to check limits:`, e)
          );
        }
      }
    } catch (dbErr) {
      console.error(`[aiGateway] Failed to save usage record (${internalRequestId}):`, dbErr);
    }
  }

  // If the OpenAI request failed, throw the error back to the caller
  if (status === "failed") {
    const error = new Error(`OpenAI Request Failed: ${errorCode}`);
    (error as any).code = errorCode;
    throw error;
  }

  return {
    content: aiContent,
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
    },
    cost: costs,
    model,
    openaiRequestId,
    durationMs,
    usageRecordId: internalRequestId,
  };
}

/**
 * Updates the daily aggregate document for a clinic.
 * Uses Firestore FieldValue.increment for atomic updates.
 */
async function updateDailyAggregate(
  db: FirebaseFirestore.Firestore,
  usage: ClinicAIUsage
): Promise<void> {
  if (!usage.clinicId) return;

  const dateStr = usage.createdAt.split("T")[0]; // YYYY-MM-DD
  const docId = `${usage.clinicId}_${dateStr}_${usage.model}_${usage.channel}_${usage.requestType}`;
  const ref = db.collection("aiUsageDaily").doc(docId);
  
   
  const { FieldValue } = require("firebase-admin/firestore");

  const incrementObj: any = {
    requestCount: FieldValue.increment(1),
    successCount: FieldValue.increment(usage.status === "success" ? 1 : 0),
    failedCount: FieldValue.increment(usage.status === "failed" ? 1 : 0),
    inputTokens: FieldValue.increment(usage.inputTokens),
    cachedInputTokens: FieldValue.increment(usage.cachedInputTokens),
    outputTokens: FieldValue.increment(usage.outputTokens),
    totalTokens: FieldValue.increment(usage.totalTokens),
    totalCostUsd: FieldValue.increment(usage.totalCostUsd),
    totalDurationMs: FieldValue.increment(usage.durationMs || 0),
  };

  // We don't increment conversationCount here accurately (needs distinct conversation IDs).
  // This is a naive approach. A more accurate way is a background cron job.

  try {
    await ref.set({
      clinicId: usage.clinicId,
      date: dateStr,
      model: usage.model,
      channel: usage.channel,
      requestType: usage.requestType,
      ...incrementObj
    }, { merge: true });
  } catch (err) {
    console.error(`[aiGateway] Daily aggregate update failed for ${docId}:`, err);
  }
}

/**
 * Lightweight limit check. Sums current month's cost and delegates to aiLimitService.
 */
async function checkLimitsForClinic(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
  newCostUsd: number
): Promise<void> {
  const clinicDoc = await db.collection("clinics").doc(clinicId).get();
  if (!clinicDoc.exists) return;

  const clinicData = clinicDoc.data()!;
  const settings = clinicData.aiUsageSettings;
  
  // Only check if limits are actually configured
  if (!settings || !settings.budgetLimitUsd || settings.budgetLimitUsd <= 0) {
    return;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Calculate total cost for the month so far
  // Note: For a very busy clinic, querying all aiUsage for the month might be slow.
  // A better approach is to rely on the daily aggregates, but for now we sum directly.
  const usageSnap = await db.collection("aiUsage")
    .where("clinicId", "==", clinicId)
    .where("createdAt", ">=", startOfMonth)
    .get();

  let monthlyCostUsd = newCostUsd; // Include the cost of the current request
  let monthlyTokens = 0;
  let monthlyRequests = 1;

  usageSnap.forEach(doc => {
    const data = doc.data();
    monthlyCostUsd += data.totalCostUsd || 0;
    monthlyTokens += data.totalTokens || 0;
    monthlyRequests += 1;
  });

  await checkLimitsAndNotify({
    clinicId,
    clinicName: clinicData.name,
    monthlyCostUsd,
    monthlyTokens,
    monthlyRequests,
    settings,
  });
}
