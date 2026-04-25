"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Grid, BarChart3, Settings, Users, LogOut, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import Logo from "@/components/ui/Logo";

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  
  return (
    <Link
      href={href}
      style={{
        display: "flex", 
        alignItems: "center", 
        gap: 12,
        padding: "10px 16px", 
        borderRadius: 12,
        fontSize: 14, 
        fontWeight: active ? 700 : 500,
        color: active ? UI_COLORS.brand : UI_COLORS.textSecondary,
        background: active ? "rgba(99, 102, 241, 0.08)" : "transparent",
        textDecoration: "none",
        transition: UI_COMMON_STYLES.transition,
        position: "relative",
      }}
    >
      {active && (
        <span style={{ 
          position: "absolute", 
          left: 0, 
          top: 10, 
          bottom: 10, 
          width: 3, 
          background: UI_COLORS.brand, 
          borderRadius: 99,
          boxShadow: "0 0 10px rgba(99, 102, 241, 0.4)"
        }} />
      )}
      <span style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        opacity: active ? 1 : 0.7,
        transition: "opacity 0.2s"
      }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ 
      fontSize: 11, 
      fontWeight: 700, 
      letterSpacing: "0.1em", 
      textTransform: "uppercase", 
      color: UI_COLORS.textMuted, 
      padding: "16px 16px 8px", 
      marginTop: 8 
    }}>
      {children}
    </p>
  );
}

export default function Sidebar() {
  const { profile } = useAuth();
  const { t } = useI18n();

  return (
    <aside style={{
      width: "var(--sidebar-w)", 
      minWidth: "var(--sidebar-w)",
      height: "100dvh",
      background: "var(--bg-sidebar)",
      borderRight: `1px solid ${UI_COLORS.border}`,
      display: "flex", 
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Logo Area */}
      <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${UI_COLORS.border}` }}>
        <Link href="/clinics" style={{ textDecoration: "none" }}>
          <Logo size="md" />
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ 
        flex: 1, 
        padding: "12px", 
        display: "flex", 
        flexDirection: "column", 
        gap: 2,
        overflowY: "auto" 
      }}>
        <SectionLabel>{t("nav.platform")}</SectionLabel>
        <NavItem href="/clinics" label={t("nav.clinics")} icon={<Grid size={18} />} />
        <NavItem href="/analytics" label={t("nav.analytics")} icon={<BarChart3 size={18} />} />
        {profile?.role === "admin" && (
          <NavItem href="/demo-requests" label="Demo Talepleri" icon={<ClipboardList size={18} />} />
        )}
        
        <SectionLabel>{t("nav.system")}</SectionLabel>
        {profile?.role === "admin" && (
          <NavItem href="/users" label={t("nav.users")} icon={<Users size={18} />} />
        )}
        <NavItem href="/settings" label={t("nav.settings")} icon={<Settings size={18} />} />
      </nav>

      {/* User & Auth Section */}
      <div style={{ 
        padding: "16px 20px", 
        borderTop: `1px solid ${UI_COLORS.border}`, 
        background: "rgba(255, 255, 255, 0.01)" 
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: "50%", 
              background: UI_COMMON_STYLES.brandGradient, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: 12, 
              fontWeight: 800, 
              color: "white" 
            }}>
              {(profile?.name?.[0] || profile?.email?.[0] || "U").toUpperCase()}
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                {profile?.name || "User"}
              </p>
              <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>
                {profile?.role === "admin" ? t("users.roles.admin") : t("users.roles.clinicUser")}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        
        <button 
          onClick={() => signOut(auth)}
          style={{ 
            width: "100%",
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            gap: 8,
            padding: "9px",
            borderRadius: 10,
            background: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.1)",
            color: UI_COLORS.danger,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: UI_COMMON_STYLES.transition
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)";
          }}
        >
          <LogOut size={14} />
          {t("common.signOut")}
        </button>
      </div>
    </aside>
  );
}
