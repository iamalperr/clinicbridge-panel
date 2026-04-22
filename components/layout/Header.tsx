"use client";

import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Search, Bell, HelpCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

export default function Header() {
  const { profile } = useAuth();
  const { t } = useI18n();

  return (
    <header style={{
      height: 64,
      background: "linear-gradient(to right, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1), rgba(59, 130, 246, 0.1))",
      backdropFilter: "blur(24px)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      zIndex: 50
    }}>
      {/* Search area - placeholder */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 10, 
        background: "rgba(255, 255, 255, 0.03)", 
        padding: "8px 16px", 
        borderRadius: 10,
        border: `1px solid ${UI_COLORS.border}`,
        width: 320
      }}>
        <Search size={16} color={UI_COLORS.textMuted} />
        <input 
          type="text" 
          placeholder={t("header.searchPlaceholder")} 
          style={{ 
            background: "none", 
            border: "none", 
            fontSize: 13, 
            color: UI_COLORS.textPrimary,
            outline: "none",
            width: "100%"
          }} 
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <LanguageSwitcher />
        
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRight: `1px solid ${UI_COLORS.border}`, paddingRight: 18 }}>
          <button style={{ background: "none", border: "none", color: UI_COLORS.textMuted, cursor: "pointer", display: "flex" }}>
            <Bell size={19} />
          </button>
          <button style={{ background: "none", border: "none", color: UI_COLORS.textMuted, cursor: "pointer", display: "flex" }}>
            <HelpCircle size={19} />
          </button>
        </div>

        {/* Mini profile info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>{profile?.name || "User"}</p>
            <p style={{ fontSize: 11, color: UI_COLORS.brand, fontWeight: 600, textTransform: "uppercase" }}>{profile?.role || "Admin"}</p>
          </div>
          <div style={{ 
            width: 34, 
            height: 34, 
            borderRadius: "50%", 
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800
          }}>
            {(profile?.name?.[0] || "U").toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
