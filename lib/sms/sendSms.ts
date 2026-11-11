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
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");

  if (cleaned.length < 10) return null;

  if (cleaned.startsWith("05") && cleaned.length === 11) {
    cleaned = "+90" + cleaned.substring(1);
  } else if (cleaned.startsWith("5") && cleaned.length === 10) {
    cleaned = "+90" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

/**
 * SMS is not wired to a live provider. Always returns a clear not-configured /
 * not-implemented failure — never a fake success.
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const normalizedPhone = normalizePhone(params.to);

  if (!normalizedPhone) {
    return { success: false, reason: "invalid_phone", error: "Geçersiz telefon numarası" };
  }

  const SMS_PROVIDER = process.env.SMS_PROVIDER;

  if (!SMS_PROVIDER) {
    console.info("[SMS] Provider not configured. Skipping SMS.", JSON.stringify({ clinicId: params.clinicId }));
    return { success: false, skipped: true, reason: "not_configured" };
  }

  console.info(
    "[SMS] Provider configured but not implemented. Refusing fake success.",
    JSON.stringify({ clinicId: params.clinicId, provider: SMS_PROVIDER })
  );
  return {
    success: false,
    skipped: true,
    reason: "not_configured",
    error: `SMS provider '${SMS_PROVIDER}' is not implemented`,
  };
}
