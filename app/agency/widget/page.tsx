"use client";

import { useAuth } from "@/lib/auth-context";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Code, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function AgencyWidgetPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;
  const [copied, setCopied] = useState(false);

  const embedCode = `<script src="https://widget.clinicbridge-ai.com/widget.js" data-agency-id="${agencyId || "YOUR_AGENCY_ID"}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Widget Integration</h1>
        <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
          Embed the ClinicBridge AI widget on your agency website
        </p>
      </div>

      <SectionCard title="Embed Code">
        <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginBottom: 16 }}>
          Add this code to your website&apos;s HTML, just before the closing <code>&lt;/body&gt;</code> tag.
        </p>
        <div style={{
          background: "var(--bg-app)",
          borderRadius: 10,
          padding: 16,
          fontFamily: "monospace",
          fontSize: 13,
          color: UI_COLORS.textPrimary,
          border: `1px solid ${UI_COLORS.border}`,
          position: "relative",
          wordBreak: "break-all",
        }}>
          <code>{embedCode}</code>
          <button
            onClick={handleCopy}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${UI_COLORS.border}`,
              background: "var(--bg-card)",
              color: UI_COLORS.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {copied ? <><CheckCircle2 size={12} color="#10b981" /> Copied!</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </SectionCard>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="How It Works">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Step number={1} title="Paste the embed code" description="Add the script tag to your FeelinHealthy website HTML." />
            <Step number={2} title="Widget appears" description="Patients will see the ClinicBridge AI chat widget on your site." />
            <Step number={3} title="Lead collection" description="Patient conversations are automatically captured as leads in your dashboard." />
            <Step number={4} title="Assign to clinics" description="Review leads and manually assign them to the most suitable clinic." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "rgba(16, 185, 129, 0.1)",
        color: "#10b981",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 800,
        flexShrink: 0,
      }}>
        {number}
      </div>
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>{title}</p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted, #64748b)", marginTop: 2 }}>{description}</p>
      </div>
    </div>
  );
}
