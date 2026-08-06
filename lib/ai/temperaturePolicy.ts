/**
 * Canonical LLM temperature policy for ClinicBridge Prompt Studio.
 *
 * Temperature may only influence conversational wording. It must never drive
 * matching, consent, intake progression, lead/quote/appointment decisions,
 * retrieval ranking, or other deterministic business rules.
 */

export const AI_TEMPERATURE_MIN = 0.0;
export const AI_TEMPERATURE_MAX = 0.9;
export const AI_TEMPERATURE_DEFAULT = 0.45;
export const AI_TEMPERATURE_STEP = 0.05;

export type AITemperatureSource =
  | "tenant_config"
  | "product_default"
  | "model_unsupported";

export type AITemperaturePresetId =
  | "precise"
  | "balanced"
  | "natural"
  | "expressive";

export interface AITemperaturePreset {
  id: AITemperaturePresetId;
  value: number;
  labelTr: string;
  labelEn: string;
}

export const AI_TEMPERATURE_PRESETS: readonly AITemperaturePreset[] = [
  { id: "precise", value: 0.2, labelTr: "Hassas", labelEn: "Precise" },
  { id: "balanced", value: 0.45, labelTr: "Dengeli", labelEn: "Balanced" },
  { id: "natural", value: 0.65, labelTr: "Doğal", labelEn: "Natural" },
  { id: "expressive", value: 0.8, labelTr: "Daha Esnek", labelEn: "Expressive" },
] as const;

export const AI_TEMPERATURE_HELPER_TR =
  "Düşük değerler daha tutarlı, kısa ve öngörülebilir yanıtlar üretir. Yüksek değerler ifadeleri daha sıcak, doğal ve çeşitli hale getirebilir. Bu ayar klinik eşleştirme, KVKK, fiyat, teklif, randevu veya diğer iş kurallarını değiştirmez.";

export const AI_TEMPERATURE_HELPER_EN =
  "Lower values produce more consistent and predictable wording. Higher values can make responses warmer, more natural and varied. This setting does not change matching, consent, pricing, quote, appointment or other business rules.";

export interface ResolvedAITemperature {
  /** Value to send to OpenAI when supported; omit when `omitFromRequest` is true. */
  temperature: number;
  /** Always the intended effective value for UI / usage metadata. */
  effectiveTemperature: number;
  source: AITemperatureSource;
  omitFromRequest: boolean;
  warning?: string;
}

export interface ValidateAITemperatureResult {
  ok: true;
  value: number;
}

export interface ValidateAITemperatureError {
  ok: false;
  error: string;
  errorTr: string;
  errorEn: string;
}

/**
 * Models known to reject or ignore chat `temperature` in this stack.
 * Keep conservative — only omit when clearly unsupported.
 */
export function modelSupportsChatTemperature(model?: string | null): boolean {
  const m = String(model || "")
    .trim()
    .toLowerCase();
  if (!m) return true;
  // OpenAI reasoning-family chat models generally reject temperature.
  if (/^o[0-9]/.test(m)) return false;
  if (m.includes("o1-") || m.includes("o3-") || m.includes("o4-")) return false;
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Round to nearest step (0.05) without discarding exact 0. */
export function quantizeAITemperature(value: number): number {
  const stepped =
    Math.round(value / AI_TEMPERATURE_STEP) * AI_TEMPERATURE_STEP;
  // Avoid float noise (e.g. 0.30000000004)
  return Number(stepped.toFixed(2));
}

/**
 * Admin write validation — prefer reject over silent store of invalid values.
 * Preserves explicit 0. Does not use `value || default`.
 */
export function validateAITemperatureForAdminWrite(
  value: unknown
): ValidateAITemperatureResult | ValidateAITemperatureError {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: AI_TEMPERATURE_DEFAULT,
    };
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: "temperature_invalid_type",
        errorTr: "Temperature sayısal bir değer olmalıdır.",
        errorEn: "Temperature must be a numeric value.",
      };
    }
    return validateAITemperatureForAdminWrite(parsed);
  }
  if (!isFiniteNumber(value)) {
    return {
      ok: false,
      error: "temperature_invalid_type",
      errorTr: "Temperature sayısal bir değer olmalıdır (NaN/Infinity kabul edilmez).",
      errorEn: "Temperature must be a finite number (NaN/Infinity rejected).",
    };
  }
  if (value < AI_TEMPERATURE_MIN || value > AI_TEMPERATURE_MAX) {
    return {
      ok: false,
      error: "temperature_out_of_range",
      errorTr: `Temperature ${AI_TEMPERATURE_MIN}–${AI_TEMPERATURE_MAX} aralığında olmalıdır.`,
      errorEn: `Temperature must be between ${AI_TEMPERATURE_MIN} and ${AI_TEMPERATURE_MAX}.`,
    };
  }
  return { ok: true, value: quantizeAITemperature(value) };
}

/**
 * Runtime normalization for legacy / malformed stored configs.
 * Never throws — always returns a safe conversational temperature.
 * Preserves explicit 0.
 */
export function normalizeAITemperature(
  raw: unknown,
  fallback: number = AI_TEMPERATURE_DEFAULT
): { value: number; source: AITemperatureSource } {
  const safeFallback =
    isFiniteNumber(fallback) &&
    fallback >= AI_TEMPERATURE_MIN &&
    fallback <= AI_TEMPERATURE_MAX
      ? quantizeAITemperature(fallback)
      : AI_TEMPERATURE_DEFAULT;

  if (raw === undefined || raw === null || raw === "") {
    return { value: safeFallback, source: "product_default" };
  }

  let num: number | null = null;
  if (isFiniteNumber(raw)) num = raw;
  else if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) num = parsed;
  }

  if (num === null) {
    return { value: safeFallback, source: "product_default" };
  }

  // Clamp at runtime for legacy out-of-range docs (admin writes should reject).
  const clamped = Math.min(
    AI_TEMPERATURE_MAX,
    Math.max(AI_TEMPERATURE_MIN, num)
  );
  return {
    value: quantizeAITemperature(clamped),
    source: "tenant_config",
  };
}

/**
 * Resolve temperature for a user-facing NL OpenAI request.
 */
export function resolveEffectiveAITemperature(params: {
  rawTemperature?: unknown;
  model?: string | null;
  productDefault?: number;
}): ResolvedAITemperature {
  const normalized = normalizeAITemperature(
    params.rawTemperature,
    params.productDefault ?? AI_TEMPERATURE_DEFAULT
  );

  if (!modelSupportsChatTemperature(params.model)) {
    return {
      temperature: normalized.value,
      effectiveTemperature: normalized.value,
      source: "model_unsupported",
      omitFromRequest: true,
      warning:
        "Configured model does not support chat temperature; parameter omitted for this request.",
    };
  }

  return {
    temperature: normalized.value,
    effectiveTemperature: normalized.value,
    source: normalized.source,
    omitFromRequest: false,
  };
}

/** Match nearest preset for UI highlighting (numeric value remains source of truth). */
export function matchAITemperaturePreset(
  value: number
): AITemperaturePreset | undefined {
  const q = quantizeAITemperature(value);
  return AI_TEMPERATURE_PRESETS.find((p) => p.value === q);
}

export function formatAITemperatureDisplay(value: number): string {
  return quantizeAITemperature(value).toFixed(2);
}
