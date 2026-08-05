"use client";

import React from "react";
import { MapPin, CheckCircle2, ChevronRight } from "lucide-react";

export interface CityOption {
  id: string;
  city: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

export interface CitySelectionCardProps {
  title?: string;
  message?: string;
  options?: CityOption[];
  lang?: string;
  isResolved?: boolean;
  selectedOptionId?: string;
  disabled?: boolean;
  onSelectCity: (city: string, optionId: string) => void;
  primaryColor?: string;
  navyColor?: string;
  borderColor?: string;
}

export const CitySelectionCard: React.FC<CitySelectionCardProps> = ({
  title,
  message,
  options = [],
  lang = "tr",
  isResolved = false,
  selectedOptionId,
  disabled = false,
  onSelectCity,
  primaryColor = "#0D9488",
  navyColor = "#0F172A",
  borderColor = "#E2E8F0",
}) => {
  const isEn = lang.toLowerCase().startsWith("en");
  const defaultTitle = isEn ? "Preferred City" : "Tercih Edilen Şehir";

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
            flexShrink: 0,
          }}
        >
          <MapPin size={16} color={primaryColor} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: navyColor, margin: 0 }}>
            {title || defaultTitle}
          </p>
        </div>
      </div>

      {message ? (
        <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, margin: "0 0 12px" }}>
          {message}
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((opt) => {
          const selected = isResolved && selectedOptionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || isResolved}
              onClick={() => onSelectCity(opt.city, opt.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 12,
                border: selected
                  ? `1.5px solid ${primaryColor}`
                  : `1px solid ${borderColor}`,
                background: selected ? "rgba(13, 148, 136, 0.06)" : "#FFFFFF",
                cursor: disabled || isResolved ? "default" : "pointer",
                opacity: isResolved && !selected ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(13, 148, 136, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {selected ? (
                  <CheckCircle2 size={15} color={primaryColor} />
                ) : (
                  <MapPin size={15} color={primaryColor} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: navyColor, margin: 0 }}>
                  {opt.title}
                </p>
                {opt.subtitle ? (
                  <p style={{ fontSize: 11, color: "#64748B", margin: "2px 0 0" }}>
                    {opt.subtitle}
                  </p>
                ) : null}
              </div>
              {opt.badge ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: primaryColor,
                    background: "rgba(13, 148, 136, 0.1)",
                    borderRadius: 999,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.badge}
                </span>
              ) : (
                !isResolved && <ChevronRight size={16} color="#94A3B8" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
