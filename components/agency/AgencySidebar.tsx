"use client";

import { useEffect, useState } from "react";
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
  ArrowLeft,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { subscribeToAgency } from "@/lib/services/agencyService";
import type { Agency } from "@/lib/types/agency";

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
  const [agency, setAgency] = useState<Agency | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const agencyId = profile?.agencyId;
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!agencyId) return;
    const unsub = subscribeToAgency(agencyId, setAgency);
    return () => unsub();
  }, [agencyId]);

  const agencyName = agency?.name || "Portal";
  const roleName =
    profile?.role === "admin"
      ? "Super Admin"
      : profile?.role === "agencyAdmin"
      ? "Agency Admin"
      : "Agency User";

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
          padding: "24px 20px 16px",
          borderBottom: `1px solid ${UI_COLORS.border}`,
        }}
      >
        <Link href="/agency" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
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
                {agencyName} Portal
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: UI_COLORS.textMuted,
                  marginTop: -1,
                  letterSpacing: "0.02em",
                }}
              >
                ClinicBridge Network
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Back to Admin Panel */}
      {isAdmin && (
        <div style={{ padding: "8px 12px 0" }}>
          <Link
            href="/clinics"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 600,
              color: UI_COLORS.textMuted,
              background: "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${UI_COLORS.border}`,
              textDecoration: "none",
              transition: UI_COMMON_STYLES.transition,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(99, 102, 241, 0.06)";
              e.currentTarget.style.color = UI_COLORS.brand;
              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
              e.currentTarget.style.color = UI_COLORS.textMuted;
              e.currentTarget.style.borderColor = UI_COLORS.border;
            }}
          >
            <ArrowLeft size={14} />
            ← Admin Panel
          </Link>
        </div>
      )}

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
        <SectionLabel>Yönetim</SectionLabel>
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

        <SectionLabel>Yapılandırma</SectionLabel>
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
          padding: "12px 16px 16px",
          borderTop: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255, 255, 255, 0.01)",
        }}
      >
        {/* User Info — clickable to toggle menu */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: menuOpen
              ? "rgba(16, 185, 129, 0.06)"
              : "transparent",
            border: `1px solid ${menuOpen ? "rgba(16, 185, 129, 0.15)" : "transparent"}`,
            cursor: "pointer",
            transition: UI_COMMON_STYLES.transition,
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
            }
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              color: "white",
              flexShrink: 0,
            }}
          >
            {(
              profile?.name?.[0] ||
              profile?.email?.[0] ||
              "U"
            ).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: UI_COLORS.textPrimary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile?.name || "User"}
            </p>
            <p
              style={{
                fontSize: 11,
                color: UI_COLORS.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {agencyName} · {roleName}
            </p>
          </div>
          {menuOpen ? (
            <ChevronUp size={14} color={UI_COLORS.textMuted} />
          ) : (
            <ChevronDown size={14} color={UI_COLORS.textMuted} />
          )}
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div
            style={{
              marginTop: 8,
              padding: "6px",
              borderRadius: 12,
              background: "var(--bg-card)",
              border: `1px solid ${UI_COLORS.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Link
              href="/agency/settings"
              onClick={() => setMenuOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: UI_COLORS.textSecondary,
                textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <User size={14} />
              Profilim
            </Link>

            <Link
              href="/agency/settings"
              onClick={() => setMenuOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: UI_COLORS.textSecondary,
                textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Settings size={14} />
              Agency Ayarları
            </Link>

            {isAdmin && (
              <>
                <div
                  style={{
                    height: 1,
                    background: UI_COLORS.border,
                    margin: "4px 8px",
                  }}
                />
                <Link
                  href="/clinics"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: UI_COLORS.brand,
                    textDecoration: "none",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(99, 102, 241, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <ArrowLeft size={14} />
                  Ana Panele Dön
                </Link>
              </>
            )}

            <div
              style={{
                height: 1,
                background: UI_COLORS.border,
                margin: "4px 8px",
              }}
            />

            <button
              onClick={() => signOut(auth)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: UI_COLORS.danger,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <LogOut size={14} />
              Çıkış Yap
            </button>
          </div>
        )}

        {/* Theme Toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
