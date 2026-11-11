"use client";

import type { ReactNode } from "react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { setupCard, setupCardHeader, setupHelper, setupIconWrap } from "@/components/setup/setupStyles";

export default function SetupSectionCard({
  icon,
  title,
  helper,
  children,
}: {
  icon: ReactNode;
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <section style={setupCard}>
      <div style={setupCardHeader}>
        <div style={setupIconWrap}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: UI_COLORS.textPrimary }}>{title}</h3>
          {helper ? <p style={setupHelper}>{helper}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
