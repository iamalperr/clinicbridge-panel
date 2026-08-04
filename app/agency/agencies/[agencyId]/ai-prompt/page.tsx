"use client";

/**
 * AI Prompt Studio — UI-only reorganization.
 * Does NOT change matching-chat / intake / consent / matching runtime.
 * Saves the same AgencyAIConfig shape to agencies/{id}/aiConfig/main.
 */

import { useState, useEffect, useMemo } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import { subscribeToAgencyAIConfig, updateAgencyAIConfig, subscribeToAgency } from "@/lib/services/agencyService";
import type { AgencyAIConfig, AIIntakeInstruction } from "@/lib/types/agency";
import {
  Brain,
  Save,
  Plus,
  X,
  MessageSquare,
  AlertTriangle,
  Lock,
  Sparkles,
  Shield,
  Wand2,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS,
  validateAgencyAIConfigConflicts,
} from "@/lib/agency/assistantPolicy";

type StudioTab = "brand" | "policy" | "advanced";

const DEFAULT_INTAKE_INSTRUCTIONS: AIIntakeInstruction[] =
  (FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.intakeInstructions as AIIntakeInstruction[]) || [];

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${UI_COLORS.border}`,
  background: "rgba(255,255,255,0.03)",
  color: UI_COLORS.textPrimary,
  fontSize: 13,
  width: "100%",
};

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-app)",
        borderRadius: 12,
        padding: 24,
        border: `1px solid ${UI_COLORS.border}`,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          paddingBottom: 12,
          borderBottom: `1px solid ${UI_COLORS.border}`,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(16, 185, 129, 0.1)",
            color: "#10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary, margin: 0 }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, margin: "4px 0 0", lineHeight: 1.45 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Align stored intake flags with FeelinHealthy backend truth — does not change runtime code. */
function normalizeFeelinHealthyIntake(intake: AIIntakeInstruction[] | undefined): AIIntakeInstruction[] {
  const source = intake?.length ? intake : DEFAULT_INTAKE_INSTRUCTIONS;
  const requiredKeys = new Set(["treatmentNeed", "patientAge", "patientGender", "patientCountry", "travelDate", "preferredLocation"]);
  return source.map((row) => {
    if (row.key === "budget") {
      return { ...row, required: false, questionTR: "", questionEN: "" };
    }
    if (requiredKeys.has(row.key) || (row.key === "patientLocation" && !source.some((r) => r.key === "patientCountry"))) {
      return { ...row, required: true };
    }
    if (row.key === "hasXrayOrDiagnosis" || row.key === "supportNeeds") {
      return { ...row, required: false };
    }
    return row;
  });
}

export default function AgencyAIPromptPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t } = useI18n();
  const [agencySlug, setAgencySlug] = useState<string>("");
  const [tab, setTab] = useState<StudioTab>("brand");
  const [config, setConfig] = useState<Partial<AgencyAIConfig>>({
    assistantName: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.assistantName,
    persona: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.persona,
    tone: "Professional",
    greetingMessageTR: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageTR,
    greetingMessageEN: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageEN,
    responseRules: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.responseRules || [],
    forbiddenClaims: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.forbiddenClaims || [],
    leadCollectionMode: "moderate",
    pricingBehavior: "show_range",
    recommendationBehavior: "direct_recommend",
    languageBehavior: "user_lang",
    intakeInstructions: DEFAULT_INTAKE_INSTRUCTIONS,
    customSystemPrompt: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.customSystemPrompt,
  });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const unsubs = [
      subscribeToAgency(agencyId, (a) => {
        if (a?.slug) setAgencySlug(a.slug);
      }),
      subscribeToAgencyAIConfig(agencyId, (cfg) => {
        if (cfg) {
          setConfig((prev) => ({
            ...prev,
            ...cfg,
            intakeInstructions: cfg.intakeInstructions?.length ? cfg.intakeInstructions : DEFAULT_INTAKE_INSTRUCTIONS,
          }));
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  const isFeelinHealthy = agencySlug === "feelinhealthy" || agencyId === "feelinhealthy";

  const policyWarnings = useMemo(
    () =>
      validateAgencyAIConfigConflicts(config, {
        isFeelinHealthy,
        clinicLimit: isFeelinHealthy ? 2 : undefined,
      }),
    [config, isFeelinHealthy]
  );

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const applyFeelinHealthyRecommended = () => {
    setConfig((prev) => ({
      ...prev,
      persona: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.persona,
      greetingMessageTR: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageTR,
      greetingMessageEN: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageEN,
      responseRules: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.responseRules || prev.responseRules,
      forbiddenClaims: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.forbiddenClaims || prev.forbiddenClaims,
      customSystemPrompt: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.customSystemPrompt,
      leadCollectionMode: "moderate",
      pricingBehavior: "show_range",
      recommendationBehavior: "direct_recommend",
      intakeInstructions: normalizeFeelinHealthyIntake(
        FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.intakeInstructions as AIIntakeInstruction[]
      ),
    }));
    showToast("success", "Önerilen FeelinHealthy ayarları forma uygulandı. Kaydetmeyi unutmayın.");
    setTab("brand");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<AgencyAIConfig> = isFeelinHealthy
        ? {
            ...config,
            intakeInstructions: normalizeFeelinHealthyIntake(config.intakeInstructions),
          }
        : config;
      await updateAgencyAIConfig(agencyId, payload);
      if (isFeelinHealthy) setConfig((p) => ({ ...p, ...payload }));
      showToast("success", "AI ayarları başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      showToast("error", "AI ayarları kaydedilirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = (type: "responseRules" | "forbiddenClaims") => {
    setConfig((prev) => ({
      ...prev,
      [type]: [...(prev[type] || []), ""],
    }));
  };

  const handleUpdateRule = (type: "responseRules" | "forbiddenClaims", index: number, value: string) => {
    setConfig((prev) => {
      const arr = [...(prev[type] || [])];
      arr[index] = value;
      return { ...prev, [type]: arr };
    });
  };

  const handleRemoveRule = (type: "responseRules" | "forbiddenClaims", index: number) => {
    setConfig((prev) => {
      const arr = [...(prev[type] || [])];
      arr.splice(index, 1);
      return { ...prev, [type]: arr };
    });
  };

  const handleUpdateIntake = (index: number, field: keyof AIIntakeInstruction, value: unknown) => {
    setConfig((prev) => {
      const arr = [...(prev.intakeInstructions || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, intakeInstructions: arr };
    });
  };

  const tabs: { id: StudioTab; label: string; hint: string }[] = [
    { id: "brand", label: "Marka & Üslup", hint: "Nasıl konuşur" },
    { id: "policy", label: "Politika", hint: "Ne sorulur / ne yasak" },
    { id: "advanced", label: "Gelişmiş", hint: "Ton & özel prompt" },
  ];

  const lockedPolicyRows = [
    { label: "KVKK / onay", value: "Zorunlu — backend state", note: "Özel prompt baypas edemez" },
    { label: "Bütçe", value: "Kapalı", note: "Asla sorulmaz" },
    { label: "Grup 1", value: "Ad, soyad, yaş, cinsiyet", note: "Zorunlu" },
    { label: "Grup 2", value: "E-posta, telefon, ikamet ülkesi", note: "Zorunlu" },
    { label: "Grup 3", value: "Seyahat tarihi", note: "Zorunlu" },
    { label: "Tedavi şehri / İstanbul yakası", value: "Şehir & yaka kartları", note: "İkamet ülkesinden ayrı" },
    { label: "Misafir klinik limiti", value: "En fazla 2", note: "Curated matching" },
    { label: "Opsiyonel (röntgen, destek)", value: "Eşleşmeyi engellemez", note: "Bloklamaz" },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textPrimary, margin: 0 }}>AI Prompt Studio</h1>
        <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, marginTop: 8, lineHeight: 1.5, maxWidth: 720 }}>
          Bu ekran asistanın <strong>nasıl konuşacağını</strong> ayarlar.{" "}
          <strong>Ne soracağını</strong>, onayını, şehir/yaka akışını ve klinik limitini sistem yönetir.
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "rgba(0,0,0,0.03)",
          borderRadius: 10,
          marginBottom: 16,
          border: `1px solid ${UI_COLORS.border}`,
        }}
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: active ? "#fff" : "transparent",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? UI_COLORS.textPrimary : UI_COLORS.textSecondary }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2 }}>{item.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Conflicts — compact, with one-click fix for FH */}
      {policyWarnings.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${policyWarnings.some((w) => w.severity === "error") ? "#FCA5A5" : "#FCD34D"}`,
            background: policyWarnings.some((w) => w.severity === "error") ? "#FEF2F2" : "#FFFBEB",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <AlertTriangle
                size={16}
                color={policyWarnings.some((w) => w.severity === "error") ? "#DC2626" : "#D97706"}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                  Kayıtlı metin backend politikasıyla çelişiyor ({policyWarnings.length})
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: UI_COLORS.textSecondary, lineHeight: 1.45 }}>
                  Canlı asistan zaten backend kurallarını uygular. Uyarılar kayıttaki Studio metnini düzeltmeniz için.
                </p>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {policyWarnings.slice(0, 4).map((w) => (
                    <li key={w.code} style={{ fontSize: 12, color: UI_COLORS.textSecondary, marginBottom: 4 }}>
                      {w.messageTr}
                    </li>
                  ))}
                  {policyWarnings.length > 4 && (
                    <li style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
                      +{policyWarnings.length - 4} uyarı daha
                    </li>
                  )}
                </ul>
              </div>
            </div>
            {isFeelinHealthy && (
              <button
                type="button"
                onClick={applyFeelinHealthyRecommended}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #86EFAC",
                  background: "#F0FDF4",
                  color: "#166534",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Wand2 size={14} /> Önerileni uygula
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB: Brand */}
      {tab === "brand" && (
        <SectionCard
          icon={<Sparkles size={18} />}
          title="Marka & üslup"
          subtitle="Hasta bu alanları görür ve duyar. Operasyonel kuralları buradan değiştirmezsiniz."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Input
              label="Asistan Adı"
              value={config.assistantName || ""}
              onChange={(e) => setConfig((p) => ({ ...p, assistantName: e.target.value }))}
              placeholder="Örn: FeelinHealthy AI Assistant"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Karakter / Üslup</label>
              <select
                value={config.tone || "Professional"}
                onChange={(e) => setConfig((p) => ({ ...p, tone: e.target.value }))}
                style={selectStyle}
              >
                <option value="Professional">Profesyonel & Kurumsal</option>
                <option value="Friendly">Samimi & Yardımsever</option>
                <option value="Premium">Premium Sağlık Danışmanı</option>
                <option value="HealthTourism">Sağlık Turizmi Odaklı</option>
                <option value="Short">Kısa ve Net</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, display: "block", marginBottom: 6 }}>
              Persona
            </label>
            <Textarea
              value={config.persona || ""}
              onChange={(e) => setConfig((p) => ({ ...p, persona: e.target.value }))}
              rows={4}
              placeholder="Asistan kimliği ve üslubu..."
            />
            {isFeelinHealthy && (
              <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 6 }}>
                Bütçe istemeyin. Zorunlu alanları burada yeniden tanımlamayın — Politika sekmesi geçerlidir.
              </p>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, display: "block", marginBottom: 6 }}>
                Karşılama (TR)
              </label>
              <Textarea
                value={config.greetingMessageTR || ""}
                onChange={(e) => setConfig((p) => ({ ...p, greetingMessageTR: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, display: "block", marginBottom: 6 }}>
                Karşılama (EN)
              </label>
              <Textarea
                value={config.greetingMessageEN || ""}
                onChange={(e) => setConfig((p) => ({ ...p, greetingMessageEN: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, display: "block", marginBottom: 6 }}>
              Dil davranışı
            </label>
            <select
              value={config.languageBehavior || "user_lang"}
              onChange={(e) => setConfig((p) => ({ ...p, languageBehavior: e.target.value as AgencyAIConfig["languageBehavior"] }))}
              style={{ ...selectStyle, maxWidth: 320 }}
            >
              <option value="user_lang">Kullanıcının diliyle yanıt ver</option>
              <option value="default_tr">Varsayılan TR</option>
              <option value="default_en">Varsayılan EN</option>
            </select>
          </div>
        </SectionCard>
      )}

      {/* TAB: Policy */}
      {tab === "policy" && (
        <>
          {isFeelinHealthy ? (
            <SectionCard
              icon={<Lock size={18} />}
              title="FeelinHealthy — kilitli politika"
              subtitle="Bu kurallar üretim asistanında zaten zorunlu. Buradan kapatılamaz; yalnızca görünür kılınır."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lockedPolicyRows.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${UI_COLORS.border}`,
                      background: "rgba(0,0,0,0.015)",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textPrimary }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>{row.value}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#047857",
                        background: "#ECFDF5",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {row.note}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
                  Soru metinleri (üslup)
                </div>
                <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, marginBottom: 12 }}>
                  Zorunluluk kilitli. İsterseniz yalnızca örnek soru cümlelerini düzenleyebilirsiniz. Bütçe sorusu boş bırakılır.
                </p>
                <div style={{ overflowX: "auto", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(0,0,0,0.03)", textAlign: "left" }}>
                        <th style={{ padding: "8px 10px", fontWeight: 700 }}>Alan</th>
                        <th style={{ padding: "8px 10px", fontWeight: 700 }}>Durum</th>
                        <th style={{ padding: "8px 10px", fontWeight: 700 }}>Soru TR</th>
                        <th style={{ padding: "8px 10px", fontWeight: 700 }}>Soru EN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(config.intakeInstructions || []).map((item, idx) => {
                        const lockedRequired =
                          item.key === "budget"
                            ? false
                            : ["treatmentNeed", "patientAge", "patientGender", "patientCountry", "preferredLocation", "travelDate"].includes(
                                item.key
                              );
                        const isBudget = item.key === "budget";
                        return (
                          <tr key={item.key} style={{ borderTop: `1px solid ${UI_COLORS.border}` }}>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 600 }}>{item.labelTR}</div>
                              <div style={{ color: UI_COLORS.textMuted, fontSize: 10 }}>{item.key}</div>
                            </td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                              {isBudget ? (
                                <span style={{ color: "#B91C1C", fontWeight: 700 }}>Kapalı</span>
                              ) : lockedRequired ? (
                                <span style={{ color: "#047857", fontWeight: 700 }}>Zorunlu</span>
                              ) : (
                                <span style={{ color: UI_COLORS.textMuted }}>Opsiyonel</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <input
                                type="text"
                                disabled={isBudget}
                                value={item.questionTR}
                                onChange={(e) => handleUpdateIntake(idx, "questionTR", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${UI_COLORS.border}`,
                                  background: isBudget ? "rgba(0,0,0,0.04)" : "transparent",
                                  color: UI_COLORS.textPrimary,
                                  fontSize: 12,
                                }}
                              />
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <input
                                type="text"
                                disabled={isBudget}
                                value={item.questionEN}
                                onChange={(e) => handleUpdateIntake(idx, "questionEN", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${UI_COLORS.border}`,
                                  background: isBudget ? "rgba(0,0,0,0.04)" : "transparent",
                                  color: UI_COLORS.textPrimary,
                                  fontSize: 12,
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
                  Soft davranış ipuçları
                </div>
                <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, marginBottom: 12 }}>
                  Bu dropdown’lar prompt’a yumuşak ipucu olarak gider. FeelinHealthy’de intake sırası, klinik limiti ve matching
                  backend tarafından uygulanır.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Lead ipucu</label>
                    <select
                      value={config.leadCollectionMode || "moderate"}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, leadCollectionMode: e.target.value as AgencyAIConfig["leadCollectionMode"] }))
                      }
                      style={selectStyle}
                    >
                      <option value="light">Hafif</option>
                      <option value="moderate">Orta</option>
                      <option value="aggressive">Güçlü</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Fiyat ipucu</label>
                    <select
                      value={config.pricingBehavior || "show_range"}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, pricingBehavior: e.target.value as AgencyAIConfig["pricingBehavior"] }))
                      }
                      style={selectStyle}
                    >
                      <option value="show_exact">Net fiyat</option>
                      <option value="show_range">Aralık</option>
                      <option value="fallback_quote">Önce bilgi</option>
                      <option value="quote_only">Teklif ile öğrenin</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Öneri ipucu</label>
                    <select
                      value={config.recommendationBehavior || "direct_recommend"}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          recommendationBehavior: e.target.value as AgencyAIConfig["recommendationBehavior"],
                        }))
                      }
                      style={selectStyle}
                    >
                      <option value="ask_first">Önce sor</option>
                      <option value="direct_recommend">Direkt öner</option>
                      <option value="always_alternatives">2–3 alternatif</option>
                      <option value="strict_match">Uygunları listele</option>
                    </select>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              icon={<Shield size={18} />}
              title="Politika & intake"
              subtitle="Bu acentede intake alanları düzenlenebilir. FeelinHealthy dışı ajanlar için geçerlidir."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Lead</label>
                  <select
                    value={config.leadCollectionMode || "moderate"}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, leadCollectionMode: e.target.value as AgencyAIConfig["leadCollectionMode"] }))
                    }
                    style={selectStyle}
                  >
                    <option value="light">Hafif</option>
                    <option value="moderate">Orta</option>
                    <option value="aggressive">Güçlü</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Fiyat</label>
                  <select
                    value={config.pricingBehavior || "show_exact"}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, pricingBehavior: e.target.value as AgencyAIConfig["pricingBehavior"] }))
                    }
                    style={selectStyle}
                  >
                    <option value="show_exact">Net</option>
                    <option value="show_range">Aralık</option>
                    <option value="fallback_quote">Önce bilgi</option>
                    <option value="quote_only">Teklif</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Öneri</label>
                  <select
                    value={config.recommendationBehavior || "direct_recommend"}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        recommendationBehavior: e.target.value as AgencyAIConfig["recommendationBehavior"],
                      }))
                    }
                    style={selectStyle}
                  >
                    <option value="ask_first">Önce sor</option>
                    <option value="direct_recommend">Direkt</option>
                    <option value="always_alternatives">Alternatifler</option>
                    <option value="strict_match">Listele</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted }}>Dil</label>
                  <select
                    value={config.languageBehavior || "user_lang"}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, languageBehavior: e.target.value as AgencyAIConfig["languageBehavior"] }))
                    }
                    style={selectStyle}
                  >
                    <option value="user_lang">Kullanıcı dili</option>
                    <option value="default_tr">TR</option>
                    <option value="default_en">EN</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(config.intakeInstructions || []).map((item, idx) => (
                  <div
                    key={item.key}
                    style={{ padding: 14, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{item.labelTR}</span>
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            background: "rgba(0,0,0,0.05)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            color: UI_COLORS.textMuted,
                          }}
                        >
                          {item.key}
                        </span>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(e) => handleUpdateIntake(idx, "required", e.target.checked)}
                        />
                        Zorunlu
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        type="text"
                        value={item.questionTR}
                        onChange={(e) => handleUpdateIntake(idx, "questionTR", e.target.value)}
                        placeholder="Soru TR"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${UI_COLORS.border}`,
                          fontSize: 12,
                          background: "transparent",
                          color: UI_COLORS.textPrimary,
                        }}
                      />
                      <input
                        type="text"
                        value={item.questionEN}
                        onChange={(e) => handleUpdateIntake(idx, "questionEN", e.target.value)}
                        placeholder="Soru EN"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${UI_COLORS.border}`,
                          fontSize: 12,
                          background: "transparent",
                          color: UI_COLORS.textPrimary,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* TAB: Advanced */}
      {tab === "advanced" && (
        <SectionCard
          icon={<MessageSquare size={18} />}
          title="Gelişmiş — ton, kurallar ve özel prompt"
          subtitle="Buradaki metin yalnızca iletişim stilini etkiler. Onay, intake sırası, şehir/yaka ve klinik limiti override edilemez."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Yanıt kuralları</label>
                <button
                  type="button"
                  onClick={() => handleAddRule("responseRules")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#10b981",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} /> Ekle
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(config.responseRules || []).map((rule, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => handleUpdateRule("responseRules", idx, e.target.value)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: `1px solid ${UI_COLORS.border}`,
                        background: "var(--bg-app)",
                        color: UI_COLORS.textPrimary,
                        fontSize: 13,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRule("responseRules", idx)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>Söylenmemesi gerekenler</label>
                <button
                  type="button"
                  onClick={() => handleAddRule("forbiddenClaims")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#10b981",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} /> Ekle
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(config.forbiddenClaims || []).map((claim, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={claim}
                      onChange={(e) => handleUpdateRule("forbiddenClaims", idx, e.target.value)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: `1px solid ${UI_COLORS.border}`,
                        background: "var(--bg-app)",
                        color: UI_COLORS.textPrimary,
                        fontSize: 13,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRule("forbiddenClaims", idx)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, display: "block", marginBottom: 6 }}>
              Özel sistem prompt (gelişmiş)
            </label>
            <Textarea
              value={config.customSystemPrompt || ""}
              onChange={(e) => setConfig((p) => ({ ...p, customSystemPrompt: e.target.value }))}
              rows={6}
              placeholder="Ton, güven dili, seçili klinik sohbet üslubu..."
            />
            <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 8, lineHeight: 1.45 }}>
              KVKK’yı atlamayın, klinik limitini artırmayın, bütçe sormayın, teşhis koymayın. Bu tür ifadeler uyarı üretir;
              canlı akışta backend state kazanır.
            </p>
          </div>
        </SectionCard>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          bottom: 12,
          padding: "12px 14px",
          borderRadius: 10,
          background: "var(--bg-app)",
          border: `1px solid ${UI_COLORS.border}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: 12, color: UI_COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          <Brain size={14} />
          {isFeelinHealthy
            ? "FeelinHealthy: konuşma akışı backend’de; bu ekran üslubu yönetir."
            : "Değişiklikler agencies/{id}/aiConfig/main belgesine yazılır."}
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <Save size={16} style={{ marginRight: 6 }} /> {t("portal.buttons.saveChanges")}
        </Button>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
