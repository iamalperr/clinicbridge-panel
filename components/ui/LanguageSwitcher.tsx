"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";
import { ChevronDown } from "lucide-react";

const languages = [
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "es", name: "Español", flag: "🇪🇸" },
] as const;

export default function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === language) || languages[1];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "rgba(255, 255, 255, 0.05)",
          border: `1px solid ${UI_COLORS.border}`,
          borderRadius: 10,
          color: UI_COLORS.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: UI_COMMON_STYLES.transition,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
      >
        <span style={{ fontSize: 16 }}>{currentLang.flag}</span>
        <span style={{ textTransform: "uppercase" }}>{currentLang.code}</span>
        <ChevronDown size={14} style={{ 
          opacity: 0.5, 
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s" 
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 160,
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.08)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 2
        }}>
          {languages.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isSelected ? "#EEF2FF" : "transparent",
                  border: "none",
                  color: isSelected ? "#4F46E5" : "#111827",
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "#F3F4F6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span style={{ fontSize: 16, display: "flex", alignItems: "center" }}>{lang.flag}</span>
                <span style={{ flex: 1, color: isSelected ? "#4F46E5" : "#111827" }}>{lang.name}</span>
                {isSelected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4F46E5" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
