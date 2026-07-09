"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import {
  LayoutDashboard,
  Users2,
  Building2,
  Settings,
  LogOut,
  Globe,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function NavItem({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname();
  const active =
    href === "/agency"
      ? pathname === "/agency"
      : pathname.startsWith(href);

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
        color: active ? "#10b981" : UI_COLORS.textSecondary,
        background: active ? "rgba(16, 185, 129, 0.08)" : "transparent",
        textDecoration: "none",
        transition: UI_COMMON_STYLES.transition,
        position: "relative",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            background: "#10b981",
            borderRadius: 99,
            boxShadow: "0 0 10px rgba(16, 185, 129, 0.4)",
          }}
        />
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: active ? 1 : 0.7,
          transition: "opacity 0.2s",
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: "#10b981",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 10,
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: UI_COLORS.textMuted,
        padding: "16px 16px 8px",
        marginTop: 8,
      }}
    >
      {children}
    </p>
  );
}

export default function AgencySidebar() {
  const { profile } = useAuth();

  return (
    <aside
      style={{
        width: "var(--sidebar-w)",
        minWidth: "var(--sidebar-w)",
        height: "100dvh",
        background: "var(--bg-sidebar)",
        borderRight: `1px solid ${UI_COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Logo Area */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: `1px solid ${UI_COLORS.border}`,
        }}
      >
        <Link href="/agency" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Globe size={18} color="#fff" />
            </div>
            <div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: UI_COLORS.textPrimary,
                  letterSpacing: "-0.02em",
                }}
              >
                Agency Portal
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: UI_COLORS.textMuted,
                  marginTop: -1,
                }}
              >
                ClinicBridge AI
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <SectionLabel>Management</SectionLabel>
        <NavItem
          href="/agency"
          label="Dashboard"
          icon={<LayoutDashboard size={18} />}
        />
        <NavItem
          href="/agency/leads"
          label="Leads"
          icon={<Users2 size={18} />}
        />
        <NavItem
          href="/agency/clinics"
          label="Clinics"
          icon={<Building2 size={18} />}
        />

        <SectionLabel>Configuration</SectionLabel>
        <NavItem
          href="/agency/widget"
          label="Widget"
          icon={<MessageSquare size={18} />}
        />
        <NavItem
          href="/agency/settings"
          label="Settings"
          icon={<Settings size={18} />}
        />
      </nav>

      {/* User & Auth Section */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255, 255, 255, 0.01)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #10b981, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 800,
                color: "white",
              }}
            >
              {(
                profile?.name?.[0] ||
                profile?.email?.[0] ||
                "U"
              ).toUpperCase()}
            </div>
            <div>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: UI_COLORS.textPrimary,
                }}
              >
                {profile?.name || "User"}
              </p>
              <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>
                {profile?.role === "agencyAdmin"
                  ? "Agency Admin"
                  : "Agency User"}
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
            transition: UI_COMMON_STYLES.transition,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)";
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
