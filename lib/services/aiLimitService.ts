/**
 * aiLimitService.ts
 *
 * Handles logic for checking AI usage limits and creating notifications
 * when thresholds (70%, 90%, 100%) are reached.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import type { ClinicAIUsageSettings } from "@/lib/types/aiUsage";

export interface LimitCheckParams {
  clinicId: string;
  clinicName?: string;
  monthlyCostUsd: number;
  monthlyTokens: number;
  monthlyRequests: number;
  settings: ClinicAIUsageSettings;
}

/**
 * Checks limits and triggers notifications if thresholds are crossed.
 * Updates the notifiedThresholds array in the clinic doc to prevent duplicate alerts.
 */
export async function checkLimitsAndNotify(params: LimitCheckParams): Promise<void> {
  const { clinicId, clinicName = "Klinik", monthlyCostUsd, settings } = params;

  // We only check budget limit for now, as it's the primary metric.
  // Token or request limits can be added similarly if needed.
  const budgetLimit = settings.budgetLimitUsd;
  if (!budgetLimit || budgetLimit <= 0) {
    return; // No limit set
  }

  const usagePercent = (monthlyCostUsd / budgetLimit) * 100;
  
  // Determine which threshold we crossed
  let currentThreshold = 0;
  if (usagePercent >= 100) currentThreshold = 100;
  else if (usagePercent >= 90) currentThreshold = 90;
  else if (usagePercent >= 70) currentThreshold = 70;

  if (currentThreshold === 0) {
    return; // Under 70%, nothing to do
  }

  // Check if we already notified for this threshold (or higher) in the current month.
  // Note: notifiedThresholds should ideally be reset at the start of each month.
  // For simplicity, we assume the array is managed correctly by a monthly cron,
  // or we just check if it contains the current threshold.
  const notified = settings.notifiedThresholds || [];
  if (notified.includes(currentThreshold)) {
    return; // Already notified
  }

  // We need to notify!
  const db = getAdminDb();
  if (!db) return;

  const now = new Date().toISOString();
  let title = "";
  let message = "";
  let type = "ai_limit_warning";

  if (currentThreshold === 100) {
    title = "AI Bütçe Limiti Aşıldı";
    message = `${clinicName} kliniği aylık ${budgetLimit} USD AI bütçe limitini aştı. Mevcut kullanım: $${monthlyCostUsd.toFixed(2)}.`;
    type = "ai_limit_exceeded";
  } else if (currentThreshold === 90) {
    title = "Kritik Uyarı: AI Bütçe Limiti %90'a Ulaştı";
    message = `${clinicName} kliniği aylık ${budgetLimit} USD AI bütçe limitinin %90'ını kullandı.`;
  } else {
    title = "Bilgilendirme: AI Bütçe Limiti %70'e Ulaştı";
    message = `${clinicName} kliniği aylık ${budgetLimit} USD AI bütçe limitinin %70'ini kullandı.`;
  }

  try {
    // 1. Create a notification for the Super Admin
    await db.collection("adminNotifications").add({
      type,
      title,
      message,
      clinicId,
      threshold: currentThreshold,
      read: false,
      createdAt: now,
    });

    // 2. Create a notification for the Clinic Admin
    await db.collection("clinics").doc(clinicId).collection("notifications").add({
      type,
      title,
      message,
      threshold: currentThreshold,
      read: false,
      createdAt: now,
    });

    // 3. Update the clinic doc to record that we sent this notification
    const newNotified = [...notified, currentThreshold];
    // Also include lower thresholds if we skipped them (e.g. jumped straight to 90%)
    if (currentThreshold >= 90 && !newNotified.includes(70)) newNotified.push(70);
    if (currentThreshold === 100 && !newNotified.includes(90)) newNotified.push(90);

    await db.collection("clinics").doc(clinicId).update({
      "aiUsageSettings.notifiedThresholds": newNotified,
    });

    console.log(`[aiLimitService] Triggered ${currentThreshold}% notification for clinic ${clinicId}`);
  } catch (err) {
    console.error("[aiLimitService] Failed to send limit notification:", err);
  }
}
