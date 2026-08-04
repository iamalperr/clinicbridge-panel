"use client";

import { useState, useEffect, useMemo } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import { subscribeToAgencyAIConfig, updateAgencyAIConfig, subscribeToAgency } from "@/lib/services/agencyService";
import type { AgencyAIConfig } from "@/lib/types/agency";
import { Brain, Save, Plus, X, MessageSquare, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { AIIntakeInstruction } from "@/lib/types/agency";
import {
  FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS,
  validateAgencyAIConfigConflicts,
} from "@/lib/agency/assistantPolicy";

const DEFAULT_INTAKE_INSTRUCTIONS: AIIntakeInstruction[] =
  (FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.intakeInstructions as AIIntakeInstruction[]) || [];

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: `1px solid ${UI_COLORS.border}`, marginBottom: 20 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: "rgba(16, 185, 129, 0.1)",
        color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {icon}
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>{title}</h2>
    </div>
  );
}

const DEFAULT_RESPONSE_RULES = FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.responseRules || [];
const DEFAULT_FORBIDDEN_CLAIMS = FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.forbiddenClaims || [];
const DEFAULT_SYSTEM_PROMPT = FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.customSystemPrompt || "";
const DEFAULT_PERSONA = FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.persona || "";

export default function AgencyAIPromptPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t } = useI18n();
  const [agencySlug, setAgencySlug] = useState<string>("");
  const [config, setConfig] = useState<Partial<AgencyAIConfig>>({
    assistantName: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.assistantName,
    persona: DEFAULT_PERSONA,
    tone: "Professional",
    greetingMessageTR: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageTR,
    greetingMessageEN: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageEN,
    responseRules: DEFAULT_RESPONSE_RULES,
    forbiddenClaims: DEFAULT_FORBIDDEN_CLAIMS,
    leadCollectionMode: "moderate",
    pricingBehavior: "show_range",
    recommendationBehavior: "direct_recommend",
    languageBehavior: "user_lang",
    intakeInstructions: DEFAULT_INTAKE_INSTRUCTIONS,
    customSystemPrompt: DEFAULT_SYSTEM_PROMPT,
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
          setConfig(prev => ({
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgencyAIConfig(agencyId, config);
      showToast("success", "AI ayarları başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      showToast("error", "AI ayarları kaydedilirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = (type: "responseRules" | "forbiddenClaims") => {
    setConfig(prev => ({
      ...prev,
      [type]: [...(prev[type] || []), ""]
    }));
  };

  const handleUpdateRule = (type: "responseRules" | "forbiddenClaims", index: number, value: string) => {
    setConfig(prev => {
      const arr = [...(prev[type] || [])];
      arr[index] = value;
      return { ...prev, [type]: arr };
    });
  };

  const handleRemoveRule = (type: "responseRules" | "forbiddenClaims", index: number) => {
    setConfig(prev => {
      const arr = [...(prev[type] || [])];
      arr.splice(index, 1);
      return { ...prev, [type]: arr };
    });
  };

  const handleUpdateIntake = (index: number, field: keyof AIIntakeInstruction, value: any) => {
    setConfig(prev => {
      const arr = [...(prev.intakeInstructions || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, intakeInstructions: arr };
    });
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textPrimary }}>
          AI Prompt Studio
        </h1>
        <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, marginTop: 8 }}>
          Acenta adına hastalarla konuşacak AI asistanın karakterini, tonunu ve yönlendirme davranışını buradan yönetin.
          Backend konuşma state’i, zorunlu intake ve klinik limiti özel prompt’tan önce gelir.
        </p>
      </div>

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color={policyWarnings.some((w) => w.severity === "error") ? "#DC2626" : "#D97706"} />
            <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>
              Yapılandırma uyarıları ({policyWarnings.length})
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {policyWarnings.map((w) => (
              <li key={w.code} style={{ fontSize: 12, color: UI_COLORS.textSecondary, lineHeight: 1.45 }}>
                <strong style={{ color: w.severity === "error" ? "#B91C1C" : "#B45309" }}>
                  {w.severity === "error" ? "Kritik" : "Uyarı"}:
                </strong>{" "}
                {w.messageTr}
              </li>
            ))}
          </ul>
          {isFeelinHealthy && (
            <p style={{ margin: "10px 0 0", fontSize: 11, color: UI_COLORS.textMuted }}>
              FeelinHealthy’de bütçe kapalıdır; yaş, cinsiyet, ülke ve seyahat tarihi zorunludur. Kayıt engellenmez ancak üretimde backend kuralları geçerlidir.
            </p>
          )}
        </div>
      )}

      <div style={{ background: "var(--bg-app)", borderRadius: 12, padding: 24, border: `1px solid ${UI_COLORS.border}` }}>
        <SectionTitle icon={<Brain size={18} />} title="Asistan Kimliği ve Üslubu" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <Input 
            label="Asistan Adı" 
            value={config.assistantName || ""} 
            onChange={(e) => setConfig(p => ({ ...p, assistantName: e.target.value }))} 
            placeholder="Örn: FeelinHealthy AI Assistant" 
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Karakter / Üslup</label>
            <select
              value={config.tone || "Professional"}
              onChange={(e) => setConfig(p => ({ ...p, tone: e.target.value }))}
              style={{
                padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, width: "100%"
              }}
            >
              <option value="Professional">Profesyonel & Kurumsal</option>
              <option value="Friendly">Samimi & Yardımsever</option>
              <option value="Premium">Premium Sağlık Danışmanı</option>
              <option value="HealthTourism">Sağlık Turizmi Odaklı</option>
              <option value="Short">Kısa ve Net</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Karakter / Persona Tanımı</label>
          </div>
          <Textarea 
            value={config.persona || ""} 
            onChange={(e) => setConfig(p => ({ ...p, persona: e.target.value }))} 
            rows={3} 
            placeholder="Sen FeelinHealthy adına çalışan, sağlık turizmi hastalarına doğru klinik ve tedavi yönlendirmesi yapan profesyonel bir AI asistansın..." 
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Karşılama Mesajı (TR)</label>
            </div>
            <Textarea 
              value={config.greetingMessageTR || ""} 
              onChange={(e) => setConfig(p => ({ ...p, greetingMessageTR: e.target.value }))} 
              rows={3} 
              placeholder="Merhaba 👋 Ben FeelinHealthy AI asistanınızım..." 
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Karşılama Mesajı (EN)</label>
            </div>
            <Textarea 
              value={config.greetingMessageEN || ""} 
              onChange={(e) => setConfig(p => ({ ...p, greetingMessageEN: e.target.value }))} 
              rows={3} 
              placeholder="Hello 👋 I’m your FeelinHealthy AI assistant..." 
            />
          </div>
        </div>

        <SectionTitle icon={<Brain size={18} />} title="Asistan Davranış Kuralları" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Lead Toplama Modu</label>
            <select
              value={config.leadCollectionMode || "moderate"}
              onChange={(e) => setConfig(p => ({ ...p, leadCollectionMode: e.target.value as any }))}
              style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13, width: "100%" }}
            >
              <option value="light">Hafif (Esnek, nadiren sor)</option>
              <option value="moderate">Orta (Bilgi verdikten sonra iste)</option>
              <option value="aggressive">Güçlü (Detay için zorunlu kıl)</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Fiyat Gösterim Davranışı</label>
            <select
              value={config.pricingBehavior || "show_exact"}
              onChange={(e) => setConfig(p => ({ ...p, pricingBehavior: e.target.value as any }))}
              style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13, width: "100%" }}
            >
              <option value="show_exact">Net Fiyatı Göster (Eğer varsa)</option>
              <option value="show_range">Fiyat Aralığını Göster</option>
              <option value="fallback_quote">Önce bilgi ver, sonra teklif iste</option>
              <option value="quote_only">Sadece "Teklif alarak öğrenin" de</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Klinik Önerme Davranışı</label>
            <select
              value={config.recommendationBehavior || "direct_recommend"}
              onChange={(e) => setConfig(p => ({ ...p, recommendationBehavior: e.target.value as any }))}
              style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13, width: "100%" }}
            >
              <option value="ask_first">Önce soru sor, sonra öner</option>
              <option value="direct_recommend">Yeterli bilgi varsa direkt öner</option>
              <option value="always_alternatives">2-3 en uygun kliniği göster</option>
              <option value="strict_match">Tüm uygun klinikleri listele</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Dil Davranışı</label>
            <select
              value={config.languageBehavior || "user_lang"}
              onChange={(e) => setConfig(p => ({ ...p, languageBehavior: e.target.value as any }))}
              style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13, width: "100%" }}
            >
              <option value="user_lang">Kullanıcının diliyle yanıt ver</option>
              <option value="default_tr">Varsayılan TR</option>
              <option value="default_en">Varsayılan EN</option>
            </select>
          </div>
        </div>

        <SectionTitle icon={<MessageSquare size={18} />} title="Hasta Bilgisi Toplama Akışı (Intake Instructions)" />
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 16 }}>
            AI asistanı bu bilgileri zorla form doldurtur gibi sormaz. Kullanıcının ilk mesajından anlayabildiklerini çeker, eksik kalan kritik bilgileri ise sohbetin doğal akışı içinde sorar.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {config.intakeInstructions?.map((item, idx) => (
              <div key={idx} style={{ padding: 16, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, background: "var(--bg-app)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{item.labelTR}</span>
                    <span style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4, color: UI_COLORS.textMuted }}>{item.key}</span>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                    <input 
                      type="checkbox" 
                      checked={item.required} 
                      onChange={(e) => handleUpdateIntake(idx, "required", e.target.checked)} 
                    />
                    Zorunlu Sor
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 4, display: "block" }}>Örnek Soru (TR)</label>
                    <input 
                      type="text" 
                      value={item.questionTR} 
                      onChange={(e) => handleUpdateIntake(idx, "questionTR", e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.02)", color: UI_COLORS.textPrimary, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 4, display: "block" }}>Örnek Soru (EN)</label>
                    <input 
                      type="text" 
                      value={item.questionEN} 
                      onChange={(e) => handleUpdateIntake(idx, "questionEN", e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.02)", color: UI_COLORS.textPrimary, fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* Response Rules */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>AI Yanıt Kuralları</label>
              <button 
                onClick={() => handleAddRule("responseRules")}
                style={{ background: "transparent", border: "none", color: "#10b981", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}
              >
                <Plus size={14} /> Ekle
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {config.responseRules?.map((rule, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input 
                    type="text" 
                    value={rule} 
                    onChange={(e) => handleUpdateRule("responseRules", idx, e.target.value)}
                    placeholder="Örn: Fiyatları yalnızca backend verilerinden göster."
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)", color: UI_COLORS.textPrimary, fontSize: 13 }}
                  />
                  <button onClick={() => handleRemoveRule("responseRules", idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {(!config.responseRules || config.responseRules.length === 0) && (
                <div style={{ padding: 12, border: `1px dashed ${UI_COLORS.border}`, borderRadius: 8, textAlign: "center", fontSize: 13, color: UI_COLORS.textMuted }}>
                  Henüz bir yanıt kuralı eklenmedi.
                </div>
              )}
            </div>
          </div>

          {/* Forbidden Claims */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>Söylenmemesi Gerekenler</label>
              <button 
                onClick={() => handleAddRule("forbiddenClaims")}
                style={{ background: "transparent", border: "none", color: "#10b981", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}
              >
                <Plus size={14} /> Ekle
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {config.forbiddenClaims?.map((claim, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input 
                    type="text" 
                    value={claim} 
                    onChange={(e) => handleUpdateRule("forbiddenClaims", idx, e.target.value)}
                    placeholder="Örn: Kesin iyileşme garantisi verme."
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)", color: UI_COLORS.textPrimary, fontSize: 13 }}
                  />
                  <button onClick={() => handleRemoveRule("forbiddenClaims", idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {(!config.forbiddenClaims || config.forbiddenClaims.length === 0) && (
                <div style={{ padding: 12, border: `1px dashed ${UI_COLORS.border}`, borderRadius: 8, textAlign: "center", fontSize: 13, color: UI_COLORS.textMuted }}>
                  Henüz yasaklı kural eklenmedi.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted }}>Özel Sistem Prompt'u (Gelişmiş)</label>
          </div>
          <Textarea 
            value={config.customSystemPrompt || ""} 
            onChange={(e) => setConfig(p => ({ ...p, customSystemPrompt: e.target.value }))} 
            rows={4} 
            placeholder="Asistana özel ekstra sistem yönlendirmeleri eklemek için..." 
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={handleSave} isLoading={saving}>
            <Save size={16} style={{ marginRight: 6 }} /> {t("portal.buttons.saveChanges")}
          </Button>
        </div>
      </div>
      
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          background: toast.type === "success" ? "#10b981" : "#ef4444",
          color: "#fff", padding: "12px 20px", borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          fontSize: 14, fontWeight: 600, zIndex: 9999
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
