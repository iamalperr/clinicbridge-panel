"use client";

/**
 * Shared Prompt Studio temperature control (clinic + agency).
 * Numeric value is the source of truth; presets only update that number.
 */

import {
  AI_TEMPERATURE_DEFAULT,
  AI_TEMPERATURE_HELPER_EN,
  AI_TEMPERATURE_HELPER_TR,
  AI_TEMPERATURE_MAX,
  AI_TEMPERATURE_MIN,
  AI_TEMPERATURE_PRESETS,
  AI_TEMPERATURE_STEP,
  formatAITemperatureDisplay,
  matchAITemperaturePreset,
  modelSupportsChatTemperature,
  quantizeAITemperature,
} from "@/lib/ai/temperaturePolicy";
import { UI_COLORS } from "@/components/ui/ui-shared";

export interface TemperatureControlProps {
  value: number;
  onChange: (next: number) => void;
  locale?: string;
  model?: string | null;
  /** Show reset-to-default control. */
  showReset?: boolean;
  onReset?: () => void;
  disabled?: boolean;
}

export function TemperatureControl({
  value,
  onChange,
  locale = "tr",
  model,
  showReset = true,
  onReset,
  disabled = false,
}: TemperatureControlProps) {
  const isEn = String(locale).toLowerCase().startsWith("en");
  const display = formatAITemperatureDisplay(value);
  const activePreset = matchAITemperaturePreset(value);
  const helper = isEn ? AI_TEMPERATURE_HELPER_EN : AI_TEMPERATURE_HELPER_TR;
  const unsupported = model ? !modelSupportsChatTemperature(model) : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
          {isEn ? "Temperature / Response Flexibility" : "Temperature / Yanıt Esnekliği"}
        </label>
        <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.brand, fontVariantNumeric: "tabular-nums" }}>
          {display}
        </span>
      </div>

      <input
        type="range"
        min={AI_TEMPERATURE_MIN}
        max={AI_TEMPERATURE_MAX}
        step={AI_TEMPERATURE_STEP}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(quantizeAITemperature(Number(e.target.value)))}
        style={{ width: "100%", accentColor: "var(--brand)" }}
        aria-label={isEn ? "Temperature" : "Temperature"}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: UI_COLORS.textMuted }}>
        <span>{formatAITemperatureDisplay(AI_TEMPERATURE_MIN)}</span>
        <span>{formatAITemperatureDisplay(AI_TEMPERATURE_MAX)}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {AI_TEMPERATURE_PRESETS.map((preset) => {
          const active = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${active ? "rgba(16,185,129,0.45)" : UI_COLORS.border}`,
                background: active ? "rgba(16,185,129,0.12)" : "transparent",
                color: active ? "#10b981" : UI_COLORS.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {isEn ? preset.labelEn : preset.labelTr} ({formatAITemperatureDisplay(preset.value)})
            </button>
          );
        })}
        {showReset && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => (onReset ? onReset() : onChange(AI_TEMPERATURE_DEFAULT))}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${UI_COLORS.border}`,
              background: "transparent",
              color: UI_COLORS.textMuted,
              fontSize: 12,
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {isEn ? `Reset (${formatAITemperatureDisplay(AI_TEMPERATURE_DEFAULT)})` : `Sıfırla (${formatAITemperatureDisplay(AI_TEMPERATURE_DEFAULT)})`}
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, lineHeight: 1.45, margin: 0 }}>
        {helper}
      </p>

      {unsupported && (
        <p style={{ fontSize: 12, color: "#f59e0b", lineHeight: 1.45, margin: 0 }}>
          {isEn
            ? "Selected model does not support temperature. The setting is saved for compatible models but omitted for this model’s requests."
            : "Seçili model temperature parametresini desteklemiyor. Ayar kaydedilir; bu modelin isteklerinde parametre gönderilmez."}
        </p>
      )}
    </div>
  );
}
