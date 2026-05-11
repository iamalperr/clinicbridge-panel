export interface SendSmsParams {
  to: string;
  message: string;
  clinicId: string;
  appointmentId: string;
  type: string;
}

export interface SendSmsResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  reason?: string;
}

function normalizePhone(phone: string): string | null {
  // Remove spaces, parentheses, dashes
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  
  // If it's a valid looking length
  if (cleaned.length < 10) return null;

  // Handle Turkish numbers formatting
  if (cleaned.startsWith("05") && cleaned.length === 11) {
    cleaned = "+90" + cleaned.substring(1);
  } else if (cleaned.startsWith("5") && cleaned.length === 10) {
    cleaned = "+90" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    // Basic fallback, assume + needs to be prepended if it looks international but missing +
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const normalizedPhone = normalizePhone(params.to);
  
  if (!normalizedPhone) {
    return { success: false, reason: "invalid_phone", error: "Geçersiz telefon numarası" };
  }

  const SMS_PROVIDER = process.env.SMS_PROVIDER;

  if (!SMS_PROVIDER) {
    console.info(`[SMS] Provider not configured. Skipping SMS to ${normalizedPhone}`);
    return { success: false, skipped: true, reason: "provider_not_configured" };
  }

  try {
    // Here we would implement the specific provider logic (Twilio, Netgsm, etc)
    // For now, if SMS_PROVIDER is set but not implemented, we simulate success
    console.info(`[SMS] Sending via ${SMS_PROVIDER} to ${normalizedPhone}: ${params.message}`);
    
    // Simulate API call
    // const res = await fetch(...)
    
    return { success: true };
  } catch (err: any) {
    console.error("[SMS] Error sending SMS:", err.message);
    return { success: false, error: err.message };
  }
}
