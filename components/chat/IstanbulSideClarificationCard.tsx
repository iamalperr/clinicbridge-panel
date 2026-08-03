"use client";

import React from "react";
import { Compass, MapPin, Plane, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";

export interface SideOption {
  id: string;
  side: string;
  title: string;
  subtitle?: string;
  badge?: string;
  action?: "confirm" | "reject";
}

export interface IstanbulSideClarificationCardProps {
  type?: "side_clarification" | "side_clarification_single" | string;
  title?: string;
  message?: string;
  options?: SideOption[];
  branchKey?: string;
  lang?: string;
  isResolved?: boolean;
  selectedOptionId?: string;
  disabled?: boolean;
  onSelectSide: (side: string, optionId: string, action?: "confirm" | "reject") => void;
  primaryColor?: string;
  navyColor?: string;
  borderColor?: string;
}

export const IstanbulSideClarificationCard: React.FC<IstanbulSideClarificationCardProps> = ({
  type = "side_clarification",
  title,
  message,
  options = [],
  lang = "tr",
  isResolved = false,
  selectedOptionId,
  disabled = false,
  onSelectSide,
  primaryColor = "#0D9488",
  navyColor = "#0F172A",
  borderColor = "#E2E8F0",
}) => {
  const isEn = lang.toLowerCase().startsWith("en");

  const defaultTitle = type === "side_clarification_single"
    ? (isEn ? "Location Clarification" : "Tedavi Lokasyon Bilgisi")
    : (isEn ? "Istanbul Side Selection" : "İstanbul Yaka Tercihi");

  const defaultMessage = type === "side_clarification_single"
    ? (isEn
        ? "Our specialized partner clinics for this treatment are located on one side of Istanbul. Would you like to proceed with options in this location?"
        : "Bu tedavi için anlaşmalı uzman merkezlerimiz İstanbul'un belirli bir yakasında bulunmaktadır. Bu lokasyondaki seçenekleri değerlendirmek ister misiniz?")
    : (isEn
        ? "Istanbul is divided into the European Side and the Anatolian Side. Which side do you prefer for your treatment?"
        : "İstanbul, Avrupa ve Anadolu Yakası olmak üzere iki ana bölgeden oluşur. Ulaşım ve konaklama kolaylığınız için hangi yakayı tercih edersiniz?");

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 16,
        border: `1px solid ${borderColor}`,
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.06)",
        padding: "16px 18px",
        marginTop: 10,
        marginBottom: 8,
        maxWidth: 540,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(13, 148, 136, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: primaryColor,
            flexShrink: 0,
          }}
        >
          <Compass size={18} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: navyColor }}>
            {title || defaultTitle}
          </h4>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            {isEn ? "Health Tourism Location Guide" : "Sağlık Turizmi Lokasyon Rehberi"}
          </span>
        </div>
      </div>

      {/* Message */}
      <p
        style={{
          margin: "0 0 14px 0",
          fontSize: 13,
          lineHeight: 1.55,
          color: "#334155",
        }}
      >
        {message || defaultMessage}
      </p>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((opt) => {
          const isSelected = isResolved && selectedOptionId === opt.id;
          const isUnsure = opt.side === "unsure";
          const isReject = opt.action === "reject";

          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || isResolved}
              onClick={() => onSelectSide(opt.side, opt.id, opt.action)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: 12,
                border: isSelected
                  ? `2px solid ${primaryColor}`
                  : `1px solid ${isUnsure ? "#CBD5E1" : borderColor}`,
                background: isSelected
                  ? "rgba(13, 148, 136, 0.06)"
                  : (isUnsure ? "#F8FAFC" : "#FFFFFF"),
                cursor: (disabled || isResolved) ? "default" : "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
                opacity: (isResolved && !isSelected) ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isResolved) {
                  e.currentTarget.style.borderColor = primaryColor;
                  e.currentTarget.style.background = "rgba(13, 148, 136, 0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isResolved) {
                  e.currentTarget.style.borderColor = isUnsure ? "#CBD5E1" : borderColor;
                  e.currentTarget.style.background = isUnsure ? "#F8FAFC" : "#FFFFFF";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: isSelected
                      ? primaryColor
                      : (isUnsure ? "#E2E8F0" : isReject ? "#FEE2E2" : "rgba(13, 148, 136, 0.08)"),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isSelected
                      ? "#FFFFFF"
                      : (isUnsure ? "#64748B" : isReject ? "#DC2626" : primaryColor),
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {isUnsure ? (
                    <HelpCircle size={15} />
                  ) : opt.side === "european" ? (
                    <Plane size={15} />
                  ) : (
                    <MapPin size={15} />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: navyColor }}>
                      {opt.title}
                    </span>
                    {opt.badge && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: isSelected
                            ? "rgba(13, 148, 136, 0.15)"
                            : (isReject ? "#FEE2E2" : "rgba(13, 148, 136, 0.08)"),
                          color: isSelected
                            ? primaryColor
                            : (isReject ? "#B91C1C" : primaryColor),
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  {opt.subtitle && (
                    <p style={{ margin: "3px 0 0 0", fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>
                      {opt.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ marginLeft: 8, flexShrink: 0, color: isSelected ? primaryColor : "#94A3B8" }}>
                {isSelected ? (
                  <CheckCircle2 size={18} color={primaryColor} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {isResolved && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: primaryColor, fontWeight: 600 }}>
          <CheckCircle2 size={13} />
          <span>{isEn ? "Location selection saved" : "Yaka tercihi kaydedildi"}</span>
        </div>
      )}
    </div>
  );
};
