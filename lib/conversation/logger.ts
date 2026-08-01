/**
 * Structured Observability Logger for Conversation Engine
 * Automatically masks PII (emails, phone numbers, names) in logs.
 */

import { ConversationSlots, ConversationState, ConversationIntent } from "./types";

export interface ConversationLogEntry {
  conversationId: string;
  channel: string;
  clinicId?: string;
  agencyId?: string;
  previousState: ConversationState;
  detectedIntent: ConversationIntent;
  confidence: number;
  extractedSlots?: Partial<ConversationSlots>;
  requiresKnowledgeBase: boolean;
  knowledgeSourceUsed?: string;
  nextState: ConversationState;
  appointmentAction?: string;
  fallbackReason?: string;
  processingDurationMs: number;
}

export class ConversationLogger {
  /**
   * Mask email address (e.g. john.doe@example.com -> j***e@example.com)
   */
  public static maskEmail(email?: string): string | undefined {
    if (!email) return undefined;
    const parts = email.split("@");
    if (parts.length !== 2) return "***";
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }

  /**
   * Mask phone number (e.g. +90 532 123 45 67 -> +90 532 *** ** 67)
   */
  public static maskPhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const clean = phone.trim();
    if (clean.length <= 6) return "***";
    const start = clean.slice(0, 4);
    const end = clean.slice(-2);
    return `${start}******${end}`;
  }

  /**
   * Mask slots for privacy-compliant logging
   */
  public static maskSlots(slots?: Partial<ConversationSlots>): Record<string, any> | undefined {
    if (!slots) return undefined;
    const masked: Record<string, any> = { ...slots };
    if (masked.email) masked.email = this.maskEmail(masked.email);
    if (masked.phone) masked.phone = this.maskPhone(masked.phone);
    if (masked.fullName) {
      const parts = String(masked.fullName).trim().split(/\s+/);
      masked.fullName = parts.map(p => `${p[0]}***`).join(" ");
    }
    return masked;
  }

  /**
   * Output structured internal log
   */
  public static log(entry: ConversationLogEntry): void {
    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
      extractedSlots: this.maskSlots(entry.extractedSlots)
    };

    console.log(`[ConversationEngineTrace] ${JSON.stringify(payload)}`);
  }
}
