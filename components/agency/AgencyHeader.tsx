"use client";

import { useAuth } from "@/lib/auth-context";
import { UI_COLORS } from "@/components/ui/ui-shared";

export default function AgencyHeader() {
  const { profile } = useAuth();

  return (
    <header
      style={{
        height: 56,
        minHeight: 56,
        borderBottom: `1px solid ${UI_COLORS.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: UI_COLORS.textPrimary,
          }}
        >
          {profile?.name || "Agency Portal"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontSize: 12,
            color: UI_COLORS.textMuted,
            padding: "4px 10px",
            borderRadius: 6,
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
            fontWeight: 600,
          }}
        >
          Agency Portal
        </span>
      </div>
    </header>
  );
}
