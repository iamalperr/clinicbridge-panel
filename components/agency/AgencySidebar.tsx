"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { isSuperAdmin, isAgencyRole, getRoleDisplayName } from "@/lib/types";
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
  Bot,
  Code,
  Briefcase,
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
  const superAdmin = isSuperAdmin(profile?.role);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = subscribeToAgency(agencyId, setAgency);
    return () => unsub();
  }, [agencyId]);

  // Naming logic
  const agencyName = agency?.name;
  const headerTitle = superAdmin && !agencyId ? "ClinicBridge Network" : agencyName ? `${agencyName}` : "Network Portal";
  const headerSubtitle = superAdmin ? "Agency SaaS Platform" : "ClinicBridge Network";
  const roleName = getRoleDisplayName(profile?.role);
  const orgName = superAdmin ? "ClinicBridge" : agencyName || "Network";

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
                {headerTitle}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: UI_COLORS.textMuted,
                  marginTop: -1,
                  letterSpacing: "0.02em",
                }}
              >
                {headerSubtitle}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Back to Admin Panel */}
      {superAdmin && (
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
              e.currentTarget.style.color = "#6366f1";
              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
              e.currentTarget.style.color = UI_COLORS.textMuted;
              e.currentTarget.style.borderColor = UI_COLORS.border;
            }}
          >
            <ArrowLeft size={14} />
            Admin Panel
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
        <SectionLabel>Overview</SectionLabel>
        <NavItem href="/agency" label="Dashboard" icon={<LayoutDashboard size={18} />} />

        {/* SuperAdmin-only items */}
        {superAdmin && (
          <NavItem href="/agency/agencies" label="Agencies" icon={<Briefcase size={18} />} />
        )}

        <SectionLabel>Management</SectionLabel>
        <NavItem href="/agency/leads" label="Leads" icon={<Users2 size={18} />} />
        <NavItem href="/agency/clinics" label="Clinics" icon={<Building2 size={18} />} />

        <SectionLabel>Configuration</SectionLabel>
        <NavItem href="/agency/ai-config" label="AI Assistant" icon={<Bot size={18} />} />
        <NavItem href="/agency/widget" label="Widget" icon={<Code size={18} />} />
        <NavItem href="/agency/settings" label="Settings" icon={<Settings size={18} />} />
      </nav>

      {/* User & Auth Section */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255, 255, 255, 0.01)",
        }}
      >
        {/* User Info */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: menuOpen ? "rgba(16, 185, 129, 0.06)" : "transparent",
            border: `1px solid ${menuOpen ? "rgba(16, 185, 129, 0.15)" : "transparent"}`,
            cursor: "pointer",
            transition: UI_COMMON_STYLES.transition,
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) e.currentTarget.style.background = "transparent";
          }}
        >
          <div
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "white", flexShrink: 0,
            }}
          >
            {(profile?.name?.[0] || profile?.email?.[0] || "U").toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 13.5, fontWeight: 700, color: UI_COLORS.textPrimary,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {profile?.name || "User"}
            </p>
            <p style={{
              fontSize: 11, color: UI_COLORS.textMuted,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {orgName} · {roleName}
            </p>
          </div>
          {menuOpen ? <ChevronUp size={14} color={UI_COLORS.textMuted} /> : <ChevronDown size={14} color={UI_COLORS.textMuted} />}
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div style={{
            marginTop: 8, padding: "6px", borderRadius: 12,
            background: "var(--bg-card)", border: `1px solid ${UI_COLORS.border}`,
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            <MenuLink href="/agency/settings" icon={<User size={14} />} label="My Profile" onClick={() => setMenuOpen(false)} />
            <MenuLink href="/agency/settings" icon={<Settings size={14} />} label="Agency Settings" onClick={() => setMenuOpen(false)} />

            {superAdmin && (
              <>
                <div style={{ height: 1, background: UI_COLORS.border, margin: "4px 8px" }} />
                <MenuLink href="/clinics" icon={<ArrowLeft size={14} />} label="Back to Admin Panel" onClick={() => setMenuOpen(false)} brand />
              </>
            )}

            <div style={{ height: 1, background: UI_COLORS.border, margin: "4px 8px" }} />

            <button
              onClick={() => signOut(auth)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                color: UI_COLORS.danger, background: "transparent", border: "none",
                cursor: "pointer", width: "100%", textAlign: "left", transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function MenuLink({ href, icon, label, onClick, brand }: { href: string; icon: React.ReactNode; label: string; onClick: () => void; brand?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
        color: brand ? "#6366f1" : UI_COLORS.textSecondary,
        textDecoration: "none", transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = brand ? "rgba(99, 102, 241, 0.06)" : "rgba(255, 255, 255, 0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon}
      {label}
    </Link>
  );
}
