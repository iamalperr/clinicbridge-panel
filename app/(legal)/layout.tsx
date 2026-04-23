"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";
import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "20px 32px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: UI_COLORS.bgCard }}>
        <Link href="/" style={{ textDecoration: "none" }}><Logo size="md" /></Link>
        <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textSecondary, textDecoration: "none" }}>Platforma Dön</Link>
      </header>
      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", padding: "64px 24px", width: "100%" }}>
        {children}
      </main>
      <footer style={{ padding: "32px", borderTop: `1px solid ${UI_COLORS.border}`, textAlign: "center", display: "flex", justifyContent: "center", gap: 24, background: UI_COLORS.bgCard }}>
        <Link href="/privacy" style={{ color: UI_COLORS.textMuted, fontSize: 13, textDecoration: "none" }}>Gizlilik Politikası</Link>
        <Link href="/terms" style={{ color: UI_COLORS.textMuted, fontSize: 13, textDecoration: "none" }}>Kullanım Şartları</Link>
        <Link href="/kvkk" style={{ color: UI_COLORS.textMuted, fontSize: 13, textDecoration: "none" }}>KVKK Aydınlatma Metni</Link>
      </footer>
    </div>
  );
}
