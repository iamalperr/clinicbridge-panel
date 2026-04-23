"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Clinic } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

const TABS = [
  { label: "Overview",      path: "" },
  { label: "Prompt Studio", path: "/ai-settings" },
  { label: "Voice",         path: "/voice" },
  { label: "Widget",        path: "/widget" },
  { label: "Training",      path: "/training" },
  { label: "Notes",         path: "/notes" },
  { label: "Usage",         path: "/usage" },
  { label: "Logs",          path: "/logs" },
  { label: "Appointments",  path: "/appointments" },
  { label: "Settings",      path: "/settings" },
];

import { useI18n } from "@/lib/i18n-context";
import { useAuth } from "@/lib/auth-context";

export default function ClinicShell({
  clinicId,
  children,
}: {
  clinicId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { profile } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const base = `/clinics/${clinicId}`;

  const TABS = [
    { label: t("clinics.tabs.overview"),      path: "" },
    { label: t("clinics.tabs.promptStudio"), path: "/ai-settings" },
    { label: t("clinics.tabs.voice"),         path: "/voice" },
    { label: t("clinics.tabs.widget"),        path: "/widget" },
    { label: t("clinics.tabs.training"),      path: "/training" },
    ...(profile?.role === "admin" ? [{ label: t("clinics.tabs.notes"), path: "/notes" }] : []),
    { label: t("clinics.tabs.usage"),         path: "/usage" },
    { label: t("clinics.tabs.logs"),          path: "/logs" },
    { label: t("clinics.tabs.appointments"),  path: "/appointments" },
    { label: t("clinics.tabs.settings"),      path: "/settings" },
  ];

  useEffect(() => {
    getDoc(doc(db, "clinics", clinicId))
      .then((snap) => {
        if (snap.exists()) setClinic({ id: snap.id, ...(snap.data() as Omit<Clinic, "id">) });
        else setClinic({ id: clinicId, name: "Clinic Workspace", plan: "pro", status: "active" });
      })
      .catch(() => {
        setClinic({ id: clinicId, name: "Clinic Workspace", plan: "pro", status: "active" });
      });
  }, [clinicId]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Workspace Header */}
      <div style={{ padding: "24px 40px 0", borderBottom: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)" }}>
        <Link href="/clinics" style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 18 }}>
          ← {t("clinics.allClinics")}
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: UI_COMMON_STYLES.brandGradient,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "white", flexShrink: 0,
            boxShadow: UI_COMMON_STYLES.logoShadow,
          }}>
            {clinic?.name?.[0] ?? "C"}
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              {clinic?.name ?? t("common.loading")}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              {clinic?.plan && <Badge variant={clinic.plan} />}
              {clinic?.status && <Badge variant={clinic.status} dot />}
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: -1 }}>
          {TABS.map((tab) => {
            const href = base + tab.path;
            const active = tab.path === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={tab.label}
                href={href}
                style={{
                  padding: "10px 16px",
                  fontSize: 13.5, fontWeight: 600,
                  color: active ? UI_COLORS.brand : UI_COLORS.textSecondary,
                  borderBottom: `2px solid ${active ? UI_COLORS.brand : "transparent"}`,
                  textDecoration: "none", whiteSpace: "nowrap",
                  transition: UI_COMMON_STYLES.transition,
                  opacity: active ? 1 : 0.7,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        {children}
      </main>
    </div>
  );
}
