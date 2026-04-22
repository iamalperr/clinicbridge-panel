import React from "react";

export const UI_COLORS = {
  border: "var(--border)",
  danger: "var(--danger)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  bgCard: "var(--bg-card)",
  bgInput: "var(--bg-input)",
  brand: "var(--brand)",
};

export const UI_COMMON_STYLES = {
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  radius: 12,
  fontSize: 14,
  labelSize: 12.5,
  errorSize: 12,
  cardPadding: "22px 24px",
  brandGradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  logoShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
};

export function getBorderColor(error?: string) {
  return error ? UI_COLORS.danger : UI_COLORS.border;
}

export interface BaseFormFieldProps {
  label?: string;
  error?: string;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
}
