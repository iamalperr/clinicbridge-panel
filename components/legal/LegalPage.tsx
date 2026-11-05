"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";

export const SELLER = {
  name: "Yusuf Alper Özgül (ClinicBridge AI)",
  address: "Karacaömer Mah. Değirmenbaşı Memur TOKİ Küme Evler No: 11 D: 20 Altınordu/Ordu",
  email: "info@clinicbridge-ai.com",
  web: "https://clinicbridge-ai.com",
};

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 16 }}>{title}</h1>
      <p style={{ color: UI_COLORS.textSecondary, marginBottom: 32 }}>Son güncellenme: {updated}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, color: UI_COLORS.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

export function SellerInfo() {
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      <li>Unvan: {SELLER.name}</li>
      <li>Adres: {SELLER.address}</li>
      <li>E-posta: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a></li>
      <li>Web: {SELLER.web}</li>
    </ul>
  );
}
