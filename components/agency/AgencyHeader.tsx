"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin, getRoleDisplayName } from "@/lib/types";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { subscribeToAgency } from "@/lib/services/agencyService";
import type { Agency } from "@/lib/types/agency";

export default function AgencyHeader() {
  const { profile } = useAuth();
  const [agency, setAgency] = useState<Agency | null>(null);

  const agencyId = profile?.agencyId;
  const superAdmin = isSuperAdmin(profile?.role);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = subscribeToAgency(agencyId, setAgency);
    return () => unsub();
  }, [agencyId]);

  const agencyName = agency?.name;
  const headerTitle = superAdmin && !agencyId ? "Network Portal" : agencyName ? `${agencyName} Portal` : "Network Portal";
  const badgeText = superAdmin ? "SaaS" : "Network";
  const roleName = getRoleDisplayName(profile?.role);

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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          fontSize: 15, fontWeight: 700,
          color: UI_COLORS.textPrimary, letterSpacing: "-0.01em",
        }}>
          {headerTitle}
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          color: "#10b981",
          padding: "2px 8px", borderRadius: 6,
          background: "rgba(16, 185, 129, 0.08)",
          border: "1px solid rgba(16, 185, 129, 0.15)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {badgeText}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, lineHeight: 1.2 }}>
            {profile?.name || "User"}
          </p>
          <p style={{ fontSize: 11, color: UI_COLORS.textMuted, lineHeight: 1.2 }}>
            {roleName}
          </p>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #10b981, #059669)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "white",
        }}>
          {(profile?.name?.[0] || profile?.email?.[0] || "U").toUpperCase()}
        </div>
      </div>
    </header>
  );
}
