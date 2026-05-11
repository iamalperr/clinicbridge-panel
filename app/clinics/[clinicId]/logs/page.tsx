"use client";

import { use } from "react";
import ConversationLogsTab from "@/components/clinic/logs/ConversationLogsTab";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { useI18n } from "@/lib/i18n-context";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function LogsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
          {t("clinics.tabs.logs") || "Görüşme Kayıtları"}
        </h1>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("logs.subtitle") || "Sanal asistan ve hastalar arasındaki tüm görüşmeleri buradan inceleyebilirsiniz."}
        </p>
      </div>

      <ConversationLogsTab clinicId={clinicId} />
    </div>
  );
}
