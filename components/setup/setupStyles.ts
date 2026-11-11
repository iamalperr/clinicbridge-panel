import type { CSSProperties } from "react";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

export const setupCard: CSSProperties = {
  background: UI_COLORS.bgCard,
  border: `1px solid ${UI_COLORS.border}`,
  borderRadius: 20,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const setupCardHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

export const setupIconWrap: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: "rgba(99, 102, 241, 0.12)",
  color: UI_COLORS.brand,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export const setupHelper: CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: UI_COLORS.textMuted,
  lineHeight: 1.5,
};

export const setupListItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgInput,
};

export const setupIconBtn: CSSProperties = {
  border: 0,
  background: "transparent",
  color: UI_COLORS.textMuted,
  cursor: "pointer",
  padding: 8,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const setupChip: CSSProperties = {
  border: `1px solid ${UI_COLORS.border}`,
  background: "transparent",
  color: UI_COLORS.textPrimary,
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: UI_COMMON_STYLES.transition,
};

export const setupChipActive: CSSProperties = {
  ...setupChip,
  borderColor: UI_COLORS.brand,
  background: "rgba(99, 102, 241, 0.12)",
  color: UI_COLORS.brand,
};

export const setupAddBtn: CSSProperties = {
  width: "100%",
  border: `1px dashed ${UI_COLORS.border}`,
  background: "transparent",
  color: UI_COLORS.brand,
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const setupStickyBar: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  display: "flex",
  gap: 10,
  padding: "12px 16px",
  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
  background: UI_COLORS.bgCard,
  borderTop: `1px solid ${UI_COLORS.border}`,
  boxShadow: "0 -8px 24px rgba(0,0,0,0.12)",
};
