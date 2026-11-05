import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { DEMO_CHAT_LIMIT_PER_HOUR } from "./demoClinic";
import { PREVIEW_MAX_MESSAGES, PREVIEW_SCAN_LIMIT_PER_HOUR } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export function hashScanIp(ip: string): string {
  return createHash("sha256").update(`preview-scan:${ip}`).digest("hex");
}

export function hashDemoIp(ip: string): string {
  return createHash("sha256").update(`preview-demo:${ip}`).digest("hex");
}

export async function consumeScanRateLimit(db: Firestore, ipHash: string, now = Date.now()): Promise<boolean> {
  const ref = db.collection("previewRateLimits").doc(ipHash);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = typeof data?.windowStart === "number" ? data.windowStart : 0;
    const count = typeof data?.count === "number" ? data.count : 0;
    if (!data || now - windowStart >= HOUR_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }
    if (count >= PREVIEW_SCAN_LIMIT_PER_HOUR) return false;
    tx.update(ref, { count: count + 1 });
    return true;
  });
}

/** Per-visitor cap for the shared sample clinic. One visitor cannot close the demo for everyone. */
export async function consumeDemoChatRateLimit(db: Firestore, ipHash: string, now = Date.now()): Promise<boolean> {
  const ref = db.collection("demoPreviewRateLimits").doc(ipHash);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = typeof data?.windowStart === "number" ? data.windowStart : 0;
    const count = typeof data?.count === "number" ? data.count : 0;
    if (!data || now - windowStart >= HOUR_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }
    if (count >= DEMO_CHAT_LIMIT_PER_HOUR) return false;
    tx.update(ref, { count: count + 1 });
    return true;
  });
}

/** Increases the counter only. Message text is never written. */
export async function consumePreviewMessage(db: Firestore, previewId: string): Promise<boolean> {
  const ref = db.collection("previews").doc(previewId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const count = typeof snap.data()?.messageCount === "number" ? snap.data()!.messageCount : 0;
    if (count >= PREVIEW_MAX_MESSAGES) return false;
    tx.update(ref, { messageCount: count + 1 });
    return true;
  });
}
