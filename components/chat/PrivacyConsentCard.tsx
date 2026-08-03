"use client";

import React from "react";
import {
  validatePrivacyNoticeUrl,
  getStructuredConsentData,
  type StructuredConsentData
} from "@/lib/utils/privacyNotice";

export interface PrivacyConsentCardProps {
  lang: "tr" | "en";
  agencyConfig?: any;
  structuredConsent?: Partial<StructuredConsentData>;
  privacyNoticeUrl?: string;
  privacyNoticeLabel?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  disabled?: boolean;
  isResolved?: boolean;
  primaryColor?: string;
  navyColor?: string;
  borderColor?: string;
}

export const PrivacyConsentCard: React.FC<PrivacyConsentCardProps> = ({
  lang = "tr",
  agencyConfig,
  structuredConsent,
  privacyNoticeUrl: propUrl,
  privacyNoticeLabel: propLabel,
  onAccept,
  onDecline,
  disabled = false,
  isResolved = false,
  primaryColor = "#00b2a9",
  navyColor = "#0f172a",
  borderColor = "#e2e8f0"
}) => {
  console.info("CONSENT COMPONENT V2 ACTIVE");
  const fallback = getStructuredConsentData(agencyConfig, lang);
  const beforeText = structuredConsent?.consentTextBeforeLink ?? fallback.consentTextBeforeLink;
  const labelText = propLabel || structuredConsent?.privacyNoticeLabel || fallback.privacyNoticeLabel;
  const afterText = structuredConsent?.consentTextAfterLink ?? fallback.consentTextAfterLink;

  const rawUrl = propUrl || structuredConsent?.privacyNoticeUrl || fallback.privacyNoticeUrl;
  const validUrl = validatePrivacyNoticeUrl(rawUrl);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        boxSizing: "border-box"
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: navyColor,
          wordBreak: "break-word"
        }}
      >
        {beforeText}
        {validUrl ? (
          <a
            href={validUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
              }
            }}
            tabIndex={0}
            style={{
              color: primaryColor,
              textDecoration: "underline",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline",
              outline: "none",
              transition: "opacity 0.15s ease-in-out"
            }}
            className="privacy-consent-inline-link hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 rounded-sm"
          >
            {labelText}
          </a>
        ) : (
          <span style={{ fontWeight: 600, color: navyColor }}>{labelText}</span>
        )}
        {afterText}
      </p>

      {!isResolved && onAccept && onDecline && (
        <div style={{ display: "flex", gap: 8, marginTop: 4, width: "100%" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            disabled={disabled}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              background: `linear-gradient(135deg, ${primaryColor}, ${navyColor})`,
              color: "#ffffff",
              border: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "opacity 0.2s ease"
            }}
          >
            {lang === "tr" ? "Kabul Ediyorum" : "I Accept"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDecline();
            }}
            disabled={disabled}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              background: "#ffffff",
              color: navyColor,
              border: `1px solid ${borderColor}`,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "opacity 0.2s ease"
            }}
          >
            {lang === "tr" ? "Reddediyorum" : "I Decline"}
          </button>
        </div>
      )}
    </div>
  );
};
