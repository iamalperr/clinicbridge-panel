import { useState } from "react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Copy, Check, Code2, Link as LinkIcon, Globe, QrCode } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

interface WidgetIntegrationProps {
  clinicId: string;
}

export default function WidgetIntegration({ clinicId }: WidgetIntegrationProps) {
  const { t } = useI18n();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // TODO: Replace with actual production script
  const embedCode = `<script src="https://widget.clinicbridge.ai/widget.js" data-clinic-id="${clinicId}"></script>`;
  const shareableLink = `https://clinicbridge.ai/widget/${clinicId}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 40 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.4px" }}>
          {t("widget.integrationTitle") || "Widget Integration"}
        </h2>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("widget.integrationSubtitle") || "Embed your ClinicBridge assistant into your website in a few steps."}
        </p>
      </div>

      {/* Embed Code Section */}
      <div style={{ 
        background: UI_COLORS.bgCard, 
        border: `1px solid ${UI_COLORS.border}`, 
        borderRadius: 16, 
        overflow: "hidden" 
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI_COLORS.textPrimary, fontWeight: 600, fontSize: 15 }}>
            <Code2 size={18} color={UI_COLORS.brand} />
            {t("widget.embedCodeTitle") || "Website Embed Code"}
          </div>
          <button 
            onClick={handleCopyCode}
            style={{ 
              display: "flex", alignItems: "center", gap: 6, 
              background: copiedCode ? "#10b98120" : "transparent", 
              color: copiedCode ? "#10b981" : UI_COLORS.brand,
              border: `1px solid ${copiedCode ? "#10b98140" : UI_COLORS.border}`,
              padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s"
            }}
          >
            {copiedCode ? <Check size={14} /> : <Copy size={14} />}
            {copiedCode ? (t("widget.copied") || "Copied!") : (t("widget.copyCode") || "Copy Code")}
          </button>
        </div>
        <div style={{ padding: 20, background: "var(--bg-page)" }}>
          <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 12 }}>
            {t("widget.installNote") || "Paste this code before the closing </body> tag on your website."}
          </p>
          <pre style={{ 
            margin: 0, padding: 16, background: UI_COLORS.bgCard, borderRadius: 8, 
            border: `1px solid ${UI_COLORS.border}`, overflowX: "auto",
            fontSize: 13, color: UI_COLORS.textPrimary, fontFamily: "monospace",
            lineHeight: 1.5
          }}>
            {embedCode}
          </pre>
        </div>
      </div>

      {/* Shareable Link Section */}
      <div style={{ 
        background: UI_COLORS.bgCard, 
        border: `1px solid ${UI_COLORS.border}`, 
        borderRadius: 16, 
        padding: 20,
        display: "flex", flexDirection: "column", gap: 16
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI_COLORS.textPrimary, fontWeight: 600, fontSize: 15 }}>
              <LinkIcon size={18} color={UI_COLORS.brand} />
              {t("widget.shareableLinkTitle") || "Kiosk / Shareable Link"}
            </div>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4 }}>
              {t("widget.shareableLinkNote") || "Share this direct link with patients or use it on lobby tablets."}
            </p>
          </div>
          <button 
            onClick={handleCopyLink}
            style={{ 
              display: "flex", alignItems: "center", gap: 6, 
              background: copiedLink ? "#10b98120" : UI_COLORS.bgPage, 
              color: copiedLink ? "#10b981" : UI_COLORS.textPrimary,
              border: `1px solid ${copiedLink ? "#10b98140" : UI_COLORS.border}`,
              padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s"
            }}
          >
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            {copiedLink ? (t("widget.copied") || "Copied!") : (t("widget.copyLink") || "Copy Link")}
          </button>
        </div>
        <div style={{ 
          padding: "10px 14px", background: UI_COLORS.bgPage, borderRadius: 8, 
          border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary,
          fontFamily: "monospace"
        }}>
          {shareableLink}
        </div>
      </div>

      {/* Premium / Custom Domain Section */}
      <div style={{ 
        background: `linear-gradient(135deg, ${UI_COLORS.bgCard} 0%, rgba(99, 102, 241, 0.05) 100%)`, 
        border: `1px solid ${UI_COLORS.brand}30`, 
        borderRadius: 16, 
        padding: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 20
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(99, 102, 241, 0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Globe size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                {t("widget.customDomainTitle") || "Custom Domain"}
              </h3>
              <span style={{ 
                background: "rgba(245, 158, 11, 0.15)", color: "#d97706", 
                padding: "2px 8px", borderRadius: 100, fontSize: 11, fontWeight: 700, textTransform: "uppercase" 
              }}>
                Premium
              </span>
            </div>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
              {t("widget.customDomainNote") || "Use your own branded domain (e.g., ai.yourclinic.com) instead of the default link. Perfect for professional branding."}
            </p>
          </div>
        </div>
        <button style={{ 
          background: UI_COLORS.bgPage, color: UI_COLORS.textPrimary, border: `1px solid ${UI_COLORS.border}`,
          padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "not-allowed",
          opacity: 0.7, whiteSpace: "nowrap"
        }}>
          {t("widget.comingSoon") || "Coming Soon"}
        </button>
      </div>

    </div>
  );
}
