"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToAgency } from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Code, Copy, CheckCircle2, Globe, Building2, AlertCircle, Loader2 } from "lucide-react";
import type { Agency } from "@/lib/types/agency";

export default function AgencyWidgetPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;
  const [copied, setCopied] = useState(false);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToAgency(agencyId, (a) => {
      setAgency(a);
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // No agency selected — show empty state
  if (!agencyId || !agency) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 800 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Widget Integration</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Embed the ClinicBridge AI widget on your agency website.
          </p>
        </div>
        <div style={{
          padding: 48,
          textAlign: "center",
          background: "var(--bg-card)",
          borderRadius: 14,
          border: `1px solid ${UI_COLORS.border}`,
        }}>
          <AlertCircle size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.4 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>
            No Agency Selected
          </h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8, maxWidth: 400, margin: "8px auto 0" }}>
            {isSuperAdmin(profile?.role)
              ? "Please select an agency from the Agencies page to generate its widget integration code."
              : "Your account is not linked to any agency. Contact your administrator."}
          </p>
        </div>
      </div>
    );
  }

  const agencySlug = agency.slug || agency.id;
  const embedCode = `<script src="https://widget.clinicbridge-ai.com/widget.js" data-agency-id="${agencySlug}" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Widget Integration</h1>
        <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
          Embed the ClinicBridge AI widget on your agency website.
        </p>
      </div>

      {/* Agency Context Card */}
      <div style={{
        padding: "16px 20px",
        borderRadius: 12,
        border: `1px solid ${UI_COLORS.border}`,
        background: "rgba(16, 185, 129, 0.03)",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Building2 size={20} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>{agency.name} Widget</p>
            <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
              {agency.domain || "No domain"} · Agency ID: {agencySlug}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {agency.supportedLanguages?.length > 0 && (
            <span style={{ fontSize: 11, color: UI_COLORS.textMuted, padding: "3px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}` }}>
              {agency.supportedLanguages.map(l => l.toUpperCase()).join(", ")}
            </span>
          )}
          <Badge label={agency.status === "active" ? "Active" : "Inactive"} variant={agency.status === "active" ? "success" : "warning"} />
        </div>
      </div>

      {/* Embed Code */}
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

      {/* Allowed Domains */}
      {agency.allowedDomains && agency.allowedDomains.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionCard title="Allowed Domains">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {agency.allowedDomains.map((d, i) => (
                <span key={i} style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${UI_COLORS.border}`,
                  fontSize: 13,
                  color: UI_COLORS.textSecondary,
                  background: "var(--bg-app)",
                }}>
                  <Globe size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  {d}
                </span>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* How It Works */}
      <div style={{ marginTop: 20 }}>
        <SectionCard title="How It Works">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Step number={1} title="Paste the embed code" description="Add the script tag to your website HTML." />
            <Step number={2} title="Widget appears" description="Patients will see the ClinicBridge AI chat widget on your site." />
            <Step number={3} title="Lead collection" description="Patient conversations are automatically captured as leads in your dashboard." />
            <Step number={4} title="Assign to clinics" description="Review leads and assign them to the most suitable clinic." />
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
        width: 28, height: 28, borderRadius: "50%",
        background: "rgba(16, 185, 129, 0.1)",
        color: "#10b981",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 800, flexShrink: 0,
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
