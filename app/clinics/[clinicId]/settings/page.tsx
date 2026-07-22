"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, MessageCircle, Phone, Sparkles, Layout, Mic, Bell } from "lucide-react";
import type { Clinic, Plan } from "@/lib/types";
import Link from "next/link";

/** Normalises any Telegram input to a canonical https://t.me/… link */
function normalizeTelegram(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  // Already a full URL
  if (v.startsWith("https://t.me/") || v.startsWith("http://t.me/")) {
    const handle = v.replace(/^https?:\/\/t\.me\//, "").replace(/\/+$/, "");
    return `https://t.me/${handle}`;
  }
  // @handle or plain handle
  const handle = v.replace(/^@/, "").replace(/\/+$/, "");
  return `https://t.me/${handle}`;
}

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

interface SettingsForm {
  name: string;
  domain: string;
  aiEnabled: "active" | "inactive";
  language: string;
  welcomeMessage: string;
  kvkkRequired: boolean;
  enableHumanHandoff: boolean;
  whatsappNumber: string;
  telegramUsername: string;
  // Paket & Modül
  plan: Plan | "starter";
  modules: { ai: boolean; widget: boolean; voice: boolean; sms?: boolean };
  // AI Bütçe ve Limit Ayarları
  aiUsageSettings: {
    budgetLimitUsd: number;
    showCostToClinicUsers: boolean;
    notifyOnLimits: boolean;
  };
}

const DEFAULT_FORM: SettingsForm = {
  name: "",
  domain: "",
  aiEnabled: "active",
  language: "tr",
  welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
  kvkkRequired: true,
  enableHumanHandoff: false,
  whatsappNumber: "",
  telegramUsername: "",
  plan: "trial",
  modules: { ai: true, widget: true, voice: false },
  aiUsageSettings: {
    budgetLimitUsd: 0,
    showCostToClinicUsers: false,
    notifyOnLimits: true,
  },
};

export default function ClinicSettingsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { profile } = useAuth();

  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  /* ── Load clinic data from Firestore ── */
  const loadClinic = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "clinics", clinicId));
      if (snap.exists()) {
        const data = snap.data() as Clinic;
        setForm({
          name: data.name ?? "",
          domain: data.domain ?? "",
          aiEnabled: data.aiEnabled ?? "active",
          language: data.language ?? "tr",
          welcomeMessage: data.welcomeMessage ?? DEFAULT_FORM.welcomeMessage,
          kvkkRequired: data.kvkkRequired ?? true,
          enableHumanHandoff: data.enableHumanHandoff ?? false,
          whatsappNumber: data.whatsappNumber ?? "",
          telegramUsername: data.telegramUsername ?? "",
          // Paket & Modül — fallback: trial + AI+Widget aktif
          plan: (data.plan as Plan | "starter") ?? "trial",
          modules: data.modules ?? { ai: true, widget: true, voice: false },
          // AI Bütçe ve Limit Ayarları
          aiUsageSettings: {
            budgetLimitUsd: data.aiUsageSettings?.budgetLimitUsd ?? 0,
            showCostToClinicUsers: data.aiUsageSettings?.showCostToClinicUsers ?? false,
            notifyOnLimits: data.aiUsageSettings?.notifyOnLimits ?? true,
          },
        });
      }
    } catch (err) {
      console.error("Settings load error:", err);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { loadClinic(); }, [loadClinic]);

  /* ── Permission guard ── */
  const canEdit = profile?.role === "admin" || profile?.clinicId === clinicId;

  /* ── Save to Firestore ── */
  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");
    try {
      const normalizedTelegram = normalizeTelegram(form.telegramUsername);
      const payload: Partial<Clinic> = {
        name: form.name.trim(),
        domain: form.domain.trim(),
        aiEnabled: form.aiEnabled,
        language: form.language,
        welcomeMessage: form.welcomeMessage.trim(),
        kvkkRequired: form.kvkkRequired,
        enableHumanHandoff: form.enableHumanHandoff,
        whatsappNumber: form.whatsappNumber.trim(),
        telegramUsername: normalizedTelegram,
        // Paket & Modül
        plan: form.plan as Plan,
        modules: form.modules,
        // AI Limit Ayarları
        aiUsageSettings: form.aiUsageSettings,
      };
      // Also update local form so the preview reflects the normalised value
      setForm(prev => ({ ...prev, telegramUsername: normalizedTelegram }));
      await updateDoc(doc(db, "clinics", clinicId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      console.error("Settings save error:", err);
      setErrorMsg(err?.message ?? "Kaydedilemedi. Lütfen tekrar deneyin.");
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14 }}>Yükleniyor…</p>
      </div>
    );
  }

  const field = (key: keyof SettingsForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const check = (key: keyof SettingsForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.checked }));

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>Klinik Ayarları</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
          Klinik profilinizi ve temel asistan yapılandırmalarınızı yönetin.
        </p>
      </div>

      {/* ── İletişim Kanalları ── */}
      <SectionCard title="İletişim Kanalları">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Input
            label="WhatsApp Numarası (Opsiyonel)"
            value={form.whatsappNumber}
            onChange={field("whatsappNumber")}
            placeholder="örn: +905551234567"
          />
          <Input
            label="Telegram Kullanıcı Adı (Opsiyonel)"
            value={form.telegramUsername}
            onChange={field("telegramUsername")}
            placeholder="örn: novadental"
            onBlur={() => {
              if (form.telegramUsername) {
                setForm((prev) => ({ ...prev, telegramUsername: normalizeTelegram(prev.telegramUsername) }));
              }
            }}
          />
        </div>
      </SectionCard>

      {/* ── Bildirim Ayarları ── */}
      <SectionCard title="Bildirim Ayarları">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ color: UI_COLORS.textSecondary, fontSize: 14 }}>
            Hastalarınıza gönderilecek otomatik e-posta bildirimlerini, şablonları ve aktif iletişim kanallarını yapılandırın.
          </p>
          <div style={{ marginTop: 8 }}>
            <Link 
              href={`/clinics/${clinicId}/settings/notifications`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                background: "rgba(99, 102, 241, 0.1)",
                color: UI_COLORS.brand,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              <Bell size={16} style={{ marginRight: 8 }} />
              Hasta Bildirimleri Ayarları
            </Link>
          </div>
        </div>
      </SectionCard>

      {/* ── Genel Bilgiler ── */}
      <SectionCard title="Genel Bilgiler">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Input
            label="Klinik Adı"
            value={form.name}
            onChange={field("name")}
            placeholder="örn: Nova Dental Kliniği"
          />
          <Input
            label="Klinik Domain"
            value={form.domain}
            onChange={field("domain")}
            placeholder="örn: novadentalclinic.com"
          />
        </div>
      </SectionCard>

      {/* ── AI Asistan Konfigürasyonu ── */}
      <SectionCard title="AI Asistan Konfigürasyonu">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Select
            label="Asistan Durumu"
            value={form.aiEnabled}
            onChange={field("aiEnabled")}
            options={[
              { label: "Aktif (Kullanıcılarla Etkileşimde)", value: "active" },
              { label: "Pasif (Kapalı)", value: "inactive" },
            ]}
          />
          <Select
            label="Birincil Dil"
            value={form.language}
            onChange={field("language")}
            options={[
              { label: "Türkçe", value: "tr" },
              { label: "İngilizce", value: "en" },
            ]}
          />
          <Textarea
            label="Karşılama Mesajı"
            value={form.welcomeMessage}
            onChange={field("welcomeMessage")}
            rows={3}
          />
        </div>
      </SectionCard>

      {/* ── Güvenlik ve KVKK ── */}
      <SectionCard title="Güvenlik ve KVKK">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <input
            type="checkbox"
            id="kvkk"
            checked={form.kvkkRequired}
            onChange={check("kvkkRequired")}
            style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
          />
          <div>
            <label htmlFor="kvkk" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
              KVKK Onayı Zorunlu
            </label>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
              Hastalar AI asistanıyla sohbet etmeye başlamadan önce KVKK aydınlatma metnini onaylamak zorundadır.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Paket ve Modül Ayarları ── */}
      <SectionCard
        title="Paket ve Modül Ayarları"
        subtitle="Kliniğin abonelik paketi ve aktif modülleri buradan yönetilebilir."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Paket Seçimi */}
          <Select
            label="Abonelik Paketi"
            value={form.plan}
            onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value as Plan | "starter" }))}
            options={[
              { label: "Trial", value: "trial" },
              { label: "Pro", value: "pro" },
              { label: "Enterprise", value: "enterprise" },
            ]}
          />

          {/* Modüller */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Aktif Modüller
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                { id: "ai",     label: "AI Assistant",    icon: <Sparkles size={18} />,  disabled: false },
                { id: "widget", label: "Web Widget",      icon: <Layout size={18} />,    disabled: false },
                { id: "voice",  label: "Voice Agent",     icon: <Mic size={18} />,       disabled: false },
                { id: "sms",    label: "SMS / Bildirim",  icon: <Bell size={18} />,      disabled: true  },
              ] as const).map((m) => {
                const isChecked = m.disabled
                  ? false
                  : !!(form.modules as Record<string, boolean>)[m.id];
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      if (m.disabled) return;
                      setForm((prev) => ({
                        ...prev,
                        modules: { ...prev.modules, [m.id]: !isChecked },
                      }));
                    }}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1px solid ${
                        m.disabled
                          ? UI_COLORS.border
                          : isChecked
                          ? "var(--brand)"
                          : UI_COLORS.border
                      }`,
                      background: m.disabled
                        ? "rgba(255,255,255,0.01)"
                        : isChecked
                        ? "rgba(99,102,241,0.06)"
                        : "rgba(255,255,255,0.01)",
                      cursor: m.disabled ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      opacity: m.disabled ? 0.45 : 1,
                      transition: "all 0.2s ease",
                      color: m.disabled
                        ? UI_COLORS.textMuted
                        : isChecked
                        ? "var(--brand)"
                        : UI_COLORS.textSecondary,
                    }}
                  >
                    {m.icon}
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, display: "block" }}>{m.label}</span>
                      {m.disabled && (
                        <span style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2, display: "block" }}>
                          Yakında
                        </span>
                      )}
                    </div>
                    {/* Toggle switch */}
                    {!m.disabled && (
                      <div style={{
                        width: 36, height: 20, borderRadius: 99,
                        background: isChecked ? "var(--brand)" : UI_COLORS.border,
                        position: "relative",
                        transition: "background 0.2s ease",
                        flexShrink: 0,
                      }}>
                        <div style={{
                          position: "absolute",
                          top: 3, left: isChecked ? 18 : 3,
                          width: 14, height: 14, borderRadius: "50%",
                          background: "white",
                          transition: "left 0.2s ease",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                        }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── AI Bütçe ve Limit Ayarları ── */}
      {profile?.role === "superAdmin" || profile?.role === "admin" ? (
        <SectionCard 
          title="AI Bütçe ve Limit Ayarları (Sadece Süper Admin)" 
          subtitle="Kliniğin aylık AI maliyet limitini belirleyin ve görünürlük ayarlarını yapılandırın."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <Input
              type="number"
              label="Aylık Bütçe Limiti (USD)"
              value={form.aiUsageSettings.budgetLimitUsd || ""}
              onChange={(e) => setForm(prev => ({
                ...prev,
                aiUsageSettings: { ...prev.aiUsageSettings, budgetLimitUsd: parseFloat(e.target.value) || 0 }
              }))}
              placeholder="0 (Sınırsız)"
            />
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <input
                  type="checkbox"
                  id="showCost"
                  checked={form.aiUsageSettings.showCostToClinicUsers}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    aiUsageSettings: { ...prev.aiUsageSettings, showCostToClinicUsers: e.target.checked }
                  }))}
                  style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
                />
                <div>
                  <label htmlFor="showCost" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
                    Maliyetleri Kliniğe Göster
                  </label>
                  <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                    Klinik kullanıcıları Kullanım sekmesinde tahmini maliyetleri görebilir.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <input
                  type="checkbox"
                  id="notifyLimits"
                  checked={form.aiUsageSettings.notifyOnLimits}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    aiUsageSettings: { ...prev.aiUsageSettings, notifyOnLimits: e.target.checked }
                  }))}
                  style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
                />
                <div>
                  <label htmlFor="notifyLimits" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
                    Limit Uyarıları Açık
                  </label>
                  <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                    Bütçe limiti %70 ve %90'a ulaştığında uyarı gönderilir.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* ── Canlı Destek ── */}
      <SectionCard title="Canlı Destek & İletişim">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <input
              type="checkbox"
              id="handoff"
              checked={form.enableHumanHandoff}
              onChange={check("enableHumanHandoff")}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
            />
            <div>
              <label htmlFor="handoff" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
                Canlı Desteğe Aktarım (Human Handoff)
              </label>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                Kullanıcı &quot;canlı destek, insana bağla, whatsapp&quot; gibi ifadeler kullanırsa asistan otomatik olarak canlı destek butonları sunar.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: form.enableHumanHandoff ? 1 : 0.45, pointerEvents: form.enableHumanHandoff ? "auto" : "none", transition: "opacity .2s" }}>
            {/* WhatsApp */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Phone size={15} color="#25D366" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: UI_COLORS.textSecondary }}>WhatsApp Numarası</span>
              </div>
              <Input
                value={form.whatsappNumber}
                onChange={field("whatsappNumber")}
                placeholder="+90 555 123 45 67"
              />
              {form.whatsappNumber.trim() && (
                <div style={{ fontSize: 12, color: "#25D366", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  <span>✓</span>
                  <span>Bağlantı: wa.me/{form.whatsappNumber.trim().replace(/[^0-9]/g, "")}</span>
                </div>
              )}
            </div>

            {/* Telegram */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MessageCircle size={15} color="#26A5E4" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: UI_COLORS.textSecondary }}>Telegram Kullanıcı Adı veya Linki</span>
              </div>
              <Input
                value={form.telegramUsername}
                onChange={field("telegramUsername")}
                placeholder="@clinicbridge · clinicbridge · https://t.me/clinicbridge"
              />
              <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
                Desteklenen formatlar: <code style={{ background: "rgba(38,165,228,.08)", padding: "1px 5px", borderRadius: 4 }}>@clinicbridge</code>&nbsp;
                <code style={{ background: "rgba(38,165,228,.08)", padding: "1px 5px", borderRadius: 4 }}>clinicbridge</code>&nbsp;
                <code style={{ background: "rgba(38,165,228,.08)", padding: "1px 5px", borderRadius: 4 }}>https://t.me/clinicbridge</code><br />
                Kaydettiğinizde sistem otomatik olarak t.me linkine dönüştürür.
              </p>
              {form.telegramUsername.trim() && (
                <div style={{ fontSize: 12, color: "#26A5E4", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  <span>✓</span>
                  <span>Normalize edilecek link: {normalizeTelegram(form.telegramUsername)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Channel preview */}
          {form.enableHumanHandoff && (form.whatsappNumber.trim() || form.telegramUsername.trim()) && (
            <div style={{
              padding: "14px 18px",
              borderRadius: 10,
              background: "rgba(99,102,241,0.04)",
              border: `1px solid rgba(99,102,241,0.15)`,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 2 }}>Kullanıcıya gösterilecek butonlar:</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {form.whatsappNumber.trim() && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 8,
                    background: "#25D366", color: "white",
                    fontSize: 13, fontWeight: 600
                  }}>
                    <Phone size={14} /> WhatsApp ile İletişime Geç
                  </div>
                )}
                {form.telegramUsername.trim() && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 8,
                    background: "#26A5E4", color: "white",
                    fontSize: 13, fontWeight: 600
                  }}>
                    <MessageCircle size={14} /> Telegram ile İletişime Geç
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Save Bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Button onClick={handleSave} isLoading={isSaving} disabled={!canEdit || isSaving}>
          Değişiklikleri Kaydet
        </Button>
        {saveStatus === "success" && (
          <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            ✓ Klinik ayarları güncellendi. Paket ve modül değişiklikleri anında yansıtıldı.
          </span>
        )}
        {saveStatus === "error" && (
          <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
            ✗ {errorMsg}
          </span>
        )}
        {!canEdit && (
          <span style={{ color: UI_COLORS.textMuted, fontSize: 12 }}>
            Bu kliniği düzenleme yetkiniz yok.
          </span>
        )}
      </div>

      <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
