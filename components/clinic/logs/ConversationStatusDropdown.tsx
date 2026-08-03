"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Loader2, Check, Tag, Shield } from "lucide-react";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import Badge from "@/components/ui/Badge";
import { useI18n } from "@/lib/i18n-context";
import { useAuth } from "@/lib/auth-context";
import {
  normalizeConversationStatus,
  getConversationStatusLabel,
  getConversationStatusVariant,
  isConversationManuallyConverted,
} from "@/lib/services/conversations/conversationStatusResolver";
import {
  resolveLabelErrorMessage,
  shouldSendLabelUpdate,
} from "@/lib/services/conversations/customLabelClient";
import type { ConversationLog, CustomLabel } from "./types";

interface Props {
  log: ConversationLog;
  clinicId: string;
  customLabels?: CustomLabel[];
  canEdit: boolean;
  onLabelUpdated: (logId: string, labelId: string | null, labelName: string | null) => void;
}

export default function ConversationStatusDropdown({
  log,
  clinicId,
  customLabels = [],
  canEdit,
  onLabelUpdated,
}: Props) {
  const { t, language } = useI18n();
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  const normalizedStatus = normalizeConversationStatus(log.status, {
    convertedToAppointment: log.convertedToAppointment,
    appointmentId: log.appointmentId,
  });
  const systemLabel = getConversationStatusLabel(normalizedStatus, language);
  const systemVariant = getConversationStatusVariant(normalizedStatus);

  const isManuallyConverted = isConversationManuallyConverted(log);

  // Close dropdown on click outside or ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row click (detail modal)
      if (!canEdit) return;
      setIsOpen((prev) => !prev);
      setError(null);
    },
    [canEdit]
  );

  const handleSelectLabel = useCallback(
    async (labelId: string | null) => {
      const isSelectingConverted = labelId === "converted_to_appointment";

      // Guards a no-op re-selection and, via the ref, a double-click that would
      // otherwise fire twice before `disabled` is committed.
      const proceed = shouldSendLabelUpdate({
        selectedLabelId: labelId,
        currentlyManuallyConverted: isConversationManuallyConverted(log),
        currentCustomLabelId: log.customLabelId,
        inFlight: inFlightRef.current,
      });

      if (!proceed) {
        if (!inFlightRef.current) setIsOpen(false);
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      setError(null);

      const previousLabelId = log.customLabelId;
      const previousLabelName = log.customLabelName;

      const newLabelId = isSelectingConverted ? "converted_to_appointment" : null;
      const newLabelName = isSelectingConverted
        ? language === "en"
          ? "Converted to Appointment"
          : "Randevuya Dönüştü"
        : null;

      // Optimistic UI update
      onLabelUpdated(log.id, newLabelId, newLabelName);

      try {
        const token = await getToken();
        if (!token) throw new Error("Auth token unavailable");

        const res = await fetch(
          `/api/clinics/${clinicId}/conversations/${log.id}/custom-label`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ customLabelId: newLabelId }),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // Revert to the persisted value; never auto-retry.
          onLabelUpdated(log.id, previousLabelId || null, previousLabelName || null);
          setError(resolveLabelErrorMessage(data?.code, language));
          return;
        }

        setIsOpen(false);
      } catch (err: any) {
        console.error("[ConversationStatusDropdown] Update failed:", err);
        onLabelUpdated(log.id, previousLabelId || null, previousLabelName || null);
        setError(resolveLabelErrorMessage(null, language));
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [log, clinicId, language, getToken, onLabelUpdated]
  );

  return (
    <div style={{ position: "relative", display: "inline-flex", flexDirection: "column", gap: 4 }}>
      {/* Trigger: Badge(s) */}
      <div
        ref={triggerRef}
        onClick={handleToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: canEdit ? "pointer" : "default",
          borderRadius: 99,
          transition: UI_COMMON_STYLES.transition,
          padding: "1px 2px",
        }}
        onMouseEnter={(e) => {
          if (canEdit) {
            e.currentTarget.style.background = "var(--bg-app)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        title={canEdit ? (language === "en" ? "Click to change custom label" : "Özel etiket değiştirmek için tıklayın") : ""}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
          <Badge variant={systemVariant} label={systemLabel} />
          {isManuallyConverted && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 10.5,
                fontWeight: 600,
                background: "rgba(139, 92, 246, 0.1)",
                color: "#8b5cf6",
                border: "1px solid rgba(139, 92, 246, 0.2)",
              }}
            >
              <Tag size={10} />
              {language === "en" ? "Converted to Appointment" : "Randevuya Dönüştü"}
            </span>
          )}
        </div>
        {canEdit && (
          <ChevronDown
            size={13}
            color={UI_COLORS.textMuted}
            style={{
              transition: "transform 0.15s ease",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          />
        )}
        {loading && (
          <Loader2
            size={13}
            color={UI_COLORS.brand}
            style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
          />
        )}
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            zIndex: 999,
            background: UI_COLORS.bgCard,
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            minWidth: 230,
            overflow: "hidden",
          }}
        >
          {/* Section 1: Current System Status (Read-Only) */}
          <div
            style={{
              padding: "10px 14px 6px",
              borderBottom: `1px solid ${UI_COLORS.border}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: UI_COLORS.textMuted,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Shield size={10} />
              {t("common.systemStatus") || (language === "en" ? "System Status" : "Sistem Durumu")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 6px" }}>
              <Badge variant={systemVariant} label={systemLabel} />
              <span style={{ fontSize: 10, color: UI_COLORS.textMuted, fontStyle: "italic" }}>
                {language === "en" ? "(auto)" : "(otomatik)"}
              </span>
            </div>
          </div>

          {/* Section 2: Custom Labels (Selectable) - ONLY "Etiket Yok" and "Randevuya Dönüştü" */}
          <div style={{ padding: "8px 6px" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: UI_COLORS.textMuted,
                padding: "2px 8px 6px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Tag size={10} />
              {t("common.customLabel") || (language === "en" ? "Custom Label" : "Özel Etiket")}
            </div>

            {/* "No Label" option */}
            <button
              onClick={() => handleSelectLabel(null)}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 8px",
                border: "none",
                borderRadius: 6,
                background: !isManuallyConverted ? "var(--bg-app)" : "transparent",
                cursor: loading ? "wait" : "pointer",
                fontSize: 12.5,
                fontWeight: 500,
                color: UI_COLORS.textSecondary,
                transition: UI_COMMON_STYLES.transition,
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (!isManuallyConverted) return;
                e.currentTarget.style.background = "var(--bg-app)";
              }}
              onMouseLeave={(e) => {
                if (!isManuallyConverted) return;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `2px solid ${!isManuallyConverted ? UI_COLORS.brand : UI_COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {!isManuallyConverted && (
                  <Check size={10} color={UI_COLORS.brand} strokeWidth={3} />
                )}
              </span>
              {t("common.noLabel") || (language === "en" ? "No Label" : "Etiket Yok")}
            </button>

            {/* "Randevuya Dönüştü" manual conversion option */}
            <button
              onClick={() => handleSelectLabel("converted_to_appointment")}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 8px",
                border: "none",
                borderRadius: 6,
                background: isManuallyConverted ? "var(--bg-app)" : "transparent",
                cursor: loading ? "wait" : "pointer",
                fontSize: 12.5,
                fontWeight: 500,
                color: UI_COLORS.textPrimary,
                transition: UI_COMMON_STYLES.transition,
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (isManuallyConverted) return;
                e.currentTarget.style.background = "var(--bg-app)";
              }}
              onMouseLeave={(e) => {
                if (isManuallyConverted) return;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `2px solid ${isManuallyConverted ? "#8b5cf6" : UI_COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isManuallyConverted && (
                  <Check size={10} color="#8b5cf6" strokeWidth={3} />
                )}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#8b5cf6",
                  flexShrink: 0,
                }}
              />
              {language === "en" ? "Converted to Appointment" : "Randevuya Dönüştü"}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: "6px 14px 10px",
                fontSize: 11,
                color: UI_COLORS.danger,
                fontWeight: 500,
                borderTop: `1px solid ${UI_COLORS.border}`,
              }}
            >
              ⚠ {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
