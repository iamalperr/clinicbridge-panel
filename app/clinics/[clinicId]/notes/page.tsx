"use client";

import { useAuth } from "@/lib/auth-context";
import UnauthorizedScreen from "@/components/auth/UnauthorizedScreen";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { useI18n } from "@/lib/i18n-context";
import { Star, MessageSquare, ClipboardList, CalendarPlus, Bell, CalendarMinus, PhoneCall, AlertCircle, Search, FileText, ChevronDown } from "lucide-react";

type SkillStatus = "active" | "always_active" | "disabled";

interface Skill {
  id: string;
  categoryId: string;
  status: SkillStatus;
  icon: any;
  channels?: string[];
}

const CATEGORIES = [
  "patient_experience",
  "appointments",
  "communication",
  "knowledge",
] as const;

const SKILLS: Skill[] = [
  { id: "send_patient_satisfaction_survey", categoryId: "patient_experience", status: "active", icon: Star, channels: ["whatsapp", "chat"] },
  { id: "collect_appointment_feedback", categoryId: "patient_experience", status: "active", icon: MessageSquare, channels: ["whatsapp"] },
  { id: "follow_up_treatment_interest", categoryId: "patient_experience", status: "active", icon: ClipboardList, channels: ["whatsapp", "voice"] },
  { id: "create_appointment_request", categoryId: "appointments", status: "active", icon: CalendarPlus, channels: ["chat", "whatsapp", "voice"] },
  { id: "send_appointment_reminder", categoryId: "appointments", status: "active", icon: Bell, channels: ["whatsapp"] },
  { id: "follow_up_missed_appointment", categoryId: "appointments", status: "active", icon: CalendarMinus, channels: ["whatsapp", "voice"] },
  { id: "human_handoff", categoryId: "communication", status: "active", icon: PhoneCall, channels: ["chat", "whatsapp", "voice"] },
  { id: "emergency_guidance", categoryId: "communication", status: "always_active", icon: AlertCircle, channels: ["chat", "whatsapp", "voice"] },
  { id: "knowledge_lookup", categoryId: "knowledge", status: "always_active", icon: Search, channels: ["chat", "whatsapp", "voice"] },
  { id: "clinic_policy_lookup", categoryId: "knowledge", status: "active", icon: FileText, channels: ["chat", "whatsapp", "voice"] },
];

export default function ClinicSkillsPage() {
  const { profile, loading } = useAuth();
  const { t } = useI18n();

  if (loading) return null;
  
  if (profile?.role !== "admin") {
    return <UnauthorizedScreen />;
  }

  const renderStatusBadge = (status: SkillStatus) => {
    switch (status) {
      case "active":
        return <span style={{ padding: "4px 8px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{t("aiSkills.status.active")}</span>;
      case "always_active":
        return <span style={{ padding: "4px 8px", background: "rgba(99, 102, 241, 0.1)", color: "#6366f1", borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{t("aiSkills.status.always_active")}</span>;
      case "disabled":
        return <span style={{ padding: "4px 8px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{t("aiSkills.status.disabled")}</span>;
    }
  };

  return (
    <div style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 32, paddingBottom: 40 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("aiSkills.title")}</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14.5, marginTop: 6 }}>
          {t("aiSkills.subtitle")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {CATEGORIES.map(categoryId => {
          const categorySkills = SKILLS.filter(s => s.categoryId === categoryId);
          if (categorySkills.length === 0) return null;
          
          return (
            <div key={categoryId} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: UI_COLORS.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {t(`aiSkills.categories.${categoryId}`)}
              </h3>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
                {categorySkills.map(skill => {
                  const Icon = skill.icon;
                  return (
                    <div 
                      key={skill.id}
                      style={{
                        background: UI_COLORS.bgCard,
                        border: `1px solid ${UI_COLORS.border}`,
                        borderRadius: 16,
                        padding: 20,
                        display: "flex",
                        gap: 16,
                        transition: "all 0.2s ease",
                        cursor: "pointer",
                        position: "relative"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = UI_COLORS.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: "rgba(99, 102, 241, 0.08)", color: UI_COLORS.brand,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        <Icon size={20} strokeWidth={2.5} />
                      </div>
                      
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                            {t(`aiSkills.skills.${skill.id}.title`)}
                          </h4>
                          {renderStatusBadge(skill.status)}
                        </div>
                        <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
                          {t(`aiSkills.skills.${skill.id}.description`)}
                        </p>
                        
                        {skill.channels && skill.channels.length > 0 && (
                          <div style={{ display: "flex", gap: 8, marginTop: 6, opacity: 0.6 }}>
                            {skill.channels.map(ch => (
                              <span key={ch} style={{ fontSize: 10.5, fontWeight: 600, background: UI_COLORS.bgPage, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                                {ch}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ alignSelf: "center", color: UI_COLORS.border, marginLeft: 4 }}>
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
