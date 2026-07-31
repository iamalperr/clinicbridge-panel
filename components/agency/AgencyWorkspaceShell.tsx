"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { AgencyWorkspaceProvider } from "./AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import type { Agency } from "@/lib/types/agency";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin, DEFAULT_PERMISSIONS } from "@/lib/types";
import type { PermissionTab } from "@/lib/types";
import {
  LayoutDashboard, Rocket, Stethoscope, Building2, DollarSign,
  Brain, MessageSquare, Code, Users2, FileText, Settings, Bot, Database
} from "lucide-react";

interface WorkspaceCounts {
  clinics: number;
  treatments: number;
  leads: number;
}

export default function AgencyWorkspaceShell({
  agencyId,
  children,
}: {
  agencyId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { profile } = useAuth();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [counts, setCounts] = useState<WorkspaceCounts>({ clinics: 0, treatments: 0, leads: 0 });
  const base = `/agency/agencies/${agencyId}`;

  const hasPermission = (tab: PermissionTab) => {
    if (!profile) return false;
    if (isSuperAdmin(profile.role)) return true;
    if (profile.permissions && profile.permissions.length > 0) {
      return profile.permissions.includes(tab);
    }
    return DEFAULT_PERMISSIONS[profile.role]?.includes(tab);
  };

  const TABS = [
    { labelKey: "portal.tabs.overview",        path: "",              icon: <LayoutDashboard size={14} />, perm: "agency_portal" },
    { labelKey: "portal.tabs.setup",           path: "/setup",        icon: <Rocket size={14} />, perm: "agency_portal" },
    { labelKey: "portal.tabs.treatments",      path: "/treatments",   icon: <Stethoscope size={14} />, perm: "clinic_overview" },
    { labelKey: "portal.tabs.clinics",         path: "/clinics",      icon: <Building2 size={14} />, perm: "clinic_overview" },
    { labelKey: "portal.tabs.aiMatching",      path: "/matching",     icon: <Brain size={14} />, perm: "clinic_prompt" },
    { labelKey: "portal.tabs.widget",          path: "/widget",       icon: <Code size={14} />, perm: "clinic_widget" },
    { labelKey: "portal.tabs.leads",           path: "/leads",        icon: <Users2 size={14} />, perm: "clinic_overview" },
    { labelKey: "portal.tabs.quoteRequests",   path: "/quotes",       icon: <FileText size={14} />, perm: "clinic_overview" },
    { labelKey: "portal.tabs.aiKnowledgeBase", path: "/knowledge",    icon: <Database size={14} />, perm: "clinic_training" },
    { labelKey: "portal.tabs.aiPromptStudio",  path: "/ai-prompt",    icon: <Bot size={14} />, perm: "clinic_prompt" },
    { labelKey: "portal.tabs.settings",        path: "/settings",     icon: <Settings size={14} />, perm: "clinic_settings" },
  ].filter(tab => hasPermission(tab.perm as PermissionTab));

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "agencies", agencyId),
      (snap) => {
        if (snap.exists()) {
          setAgency({ id: snap.id, ...snap.data() } as Agency);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) return;
    
    const unsubClinics = onSnapshot(collection(db, "agencies", agencyId, "clinics"), (snap) => {
      setCounts(prev => ({ ...prev, clinics: snap.size }));
    });
    
    const unsubTreatments = onSnapshot(collection(db, "agencies", agencyId, "treatments"), (snap) => {
      setCounts(prev => ({ ...prev, treatments: snap.size }));
    });
    
    const unsubLeads = onSnapshot(collection(db, "agencies", agencyId, "leads"), (snap) => {
      setCounts(prev => ({ ...prev, leads: snap.size }));
    });

    return () => {
      unsubClinics();
      unsubTreatments();
      unsubLeads();
    };
  }, [agencyId]);

  const statusLabel = agency?.status === "active" ? t("portal.status.active")
    : agency?.status === "trial" ? t("portal.status.trial")
    : t("portal.status.inactive");
  const statusVariant = agency?.status === "active" ? "success" : agency?.status === "trial" ? "warning" : "default";

  return (
    <AgencyWorkspaceProvider agencyId={agencyId}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Workspace Header */}
        <div style={{
          padding: "20px 40px 0",
          borderBottom: `1px solid ${UI_COLORS.border}`,
          background: "var(--bg-app)",
        }}>
          {/* Breadcrumb */}
          <Link
            href="/agency/agencies"
            style={{
              fontSize: 12, color: UI_COLORS.textMuted, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#10b981"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = UI_COLORS.textMuted; }}
          >
            {t("portal.workspace.backToAgencies")}
          </Link>

          {/* Agency Info */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: UI_COMMON_STYLES.brandGradient,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "white", flexShrink: 0,
                boxShadow: UI_COMMON_STYLES.logoShadow,
              }}>
                {agency?.name?.[0] ?? "A"}
              </div>
              <div>
                <h1 style={{
                  fontSize: 19, fontWeight: 800, color: UI_COLORS.textPrimary,
                  letterSpacing: "-0.5px", lineHeight: 1.2,
                }}>
                  {agency?.name ?? "Loading..."} <span style={{ fontWeight: 400, fontSize: 14, color: UI_COLORS.textMuted }}>{t("portal.workspace.title")}</span>
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                  {agency?.status && <Badge label={statusLabel} variant={statusVariant} dot />}
                  {agency?.domain && (
                    <span style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>
                      {agency.domain}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: UI_COLORS.textMuted, opacity: 0.6 }}>·</span>
                  <span style={{ fontSize: 11, color: UI_COLORS.textMuted }}>
                    ID: {agency?.slug || agencyId}
                  </span>
                </div>
                {/* Stats row */}
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {[
                    { label: t("portal.workspace.clinic"), count: counts.clinics },
                    { label: t("portal.workspace.treatment"), count: counts.treatments },
                    { label: t("portal.workspace.lead"), count: counts.leads },
                  ].map(({ label, count }) => (
                    <span key={label} style={{ fontSize: 11, color: UI_COLORS.textMuted }}>
                      <strong style={{ color: UI_COLORS.textSecondary }}>{count}</strong> {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: -1 }}>
            {TABS.map((tab) => {
              const href = base + tab.path;
              const active = tab.path === ""
                ? pathname === base
                : pathname.startsWith(href);
              return (
                <Link
                  key={tab.labelKey}
                  href={href}
                  style={{
                    padding: "9px 14px",
                    fontSize: 13, fontWeight: 600,
                    color: active ? "#10b981" : UI_COLORS.textSecondary,
                    borderBottom: `2px solid ${active ? "#10b981" : "transparent"}`,
                    textDecoration: "none", whiteSpace: "nowrap",
                    transition: UI_COMMON_STYLES.transition,
                    opacity: active ? 1 : 0.7,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  {tab.icon}
                  {t(tab.labelKey)}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Workspace Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 40px 40px" }}>
          {children}
        </main>
      </div>
    </AgencyWorkspaceProvider>
  );
}
