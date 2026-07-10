"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { AgencyWorkspaceProvider } from "./AgencyWorkspaceContext";
import type { Agency } from "@/lib/types/agency";
import {
  LayoutDashboard, Rocket, Stethoscope, Building2, DollarSign,
  Brain, MessageSquare, Code, Users2, FileText, Settings,
} from "lucide-react";

const TABS = [
  { label: "Genel Bakış",               path: "",              icon: <LayoutDashboard size={14} /> },
  { label: "Kurulum",                   path: "/setup",        icon: <Rocket size={14} /> },
  { label: "Tedaviler",                 path: "/treatments",   icon: <Stethoscope size={14} /> },
  { label: "Klinikler",                 path: "/clinics",      icon: <Building2 size={14} /> },
  { label: "Fiyatlandırma",             path: "/pricing",      icon: <DollarSign size={14} /> },
  { label: "AI Eşleştirme",             path: "/matching",     icon: <Brain size={14} /> },
  { label: "Ön Değerlendirme",          path: "/intake-flow",  icon: <MessageSquare size={14} /> },
  { label: "Widget",                    path: "/widget",       icon: <Code size={14} /> },
  { label: "Lead'ler",                  path: "/leads",        icon: <Users2 size={14} /> },
  { label: "Teklif Talepleri",          path: "/quotes",       icon: <FileText size={14} /> },
  { label: "Ayarlar",                   path: "/settings",     icon: <Settings size={14} /> },
];

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
  const [agency, setAgency] = useState<Agency | null>(null);
  const [counts, setCounts] = useState<WorkspaceCounts>({ clinics: 0, treatments: 0, leads: 0 });
  const base = `/agency/agencies/${agencyId}`;

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

  // Fetch counts for header badges
  useEffect(() => {
    async function fetchCounts() {
      try {
        const [clinicSnap, treatmentSnap, leadSnap] = await Promise.all([
          getCountFromServer(collection(db, "agencies", agencyId, "clinics")),
          getCountFromServer(collection(db, "agencies", agencyId, "treatments")),
          getCountFromServer(collection(db, "agencies", agencyId, "leads")),
        ]);
        setCounts({
          clinics: clinicSnap.data().count,
          treatments: treatmentSnap.data().count,
          leads: leadSnap.data().count,
        });
      } catch {
        // silently fail
      }
    }
    fetchCounts();
  }, [agencyId]);

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
            ← Acentalara Dön
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
                  {agency?.name ?? "Loading..."} <span style={{ fontWeight: 400, fontSize: 14, color: UI_COLORS.textMuted }}>Workspace</span>
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                  {agency?.status && <Badge label={agency.status === "active" ? "Active" : agency.status === "trial" ? "Trial" : "Inactive"} variant={statusVariant} dot />}
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
                    { label: "Klinik", count: counts.clinics },
                    { label: "Tedavi", count: counts.treatments },
                    { label: "Lead", count: counts.leads },
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
                  key={tab.label}
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
                  {tab.label}
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
