"use client";

import { use, useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import SectionCard from "@/components/ui/SectionCard";
import { Loader2, Save, Layout, Palette, MessageCircle, Sparkles, Plus, Trash2 } from "lucide-react";
import type { WidgetSettings, ShowBubblesConfig } from "@/lib/types";
import WidgetPreview from "./WidgetPreview";
import WidgetIntegration from "./WidgetIntegration";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

const DEFAULT_BUBBLES: ShowBubblesConfig = {
  enabled: true,
  displayMode: "rotate",
  messages: {
    tr: [
      "Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?",
      "İmplant seçenekleri hakkında bilgi alabilirsiniz",
      "Randevu almak ister misiniz?",
      "Nereden başlayacağınızı bilmiyor musunuz?",
    ],
    en: [
      "Need help choosing a treatment?",
      "Ask me about implant options",
      "Want to book an appointment?",
      "Not sure where to start?",
    ],
  },
  timing: { initialDelaySeconds: 3, rotationIntervalSeconds: 6, autoHideSeconds: 12 },
  behavior: { hideAfterOpen: true, showOncePerSession: false, disableOnMobile: false },
};

const DEFAULT_SETTINGS: WidgetSettings = {
  title: "Clinic Assistant",
  welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
  primaryColor: "#6366f1",
  position: "bottom-right",
  showAvatar: true,
  showOnlineStatus: true,
  placeholder: "Bir mesaj yazın...",
  showBubbles: DEFAULT_BUBBLES,
};

/* ── Toggle helper ── */
function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, borderRadius: 99, border: "none", cursor: "pointer",
          background: checked ? UI_COLORS.brand : "rgba(255,255,255,0.1)",
          position: "relative", flexShrink: 0, transition: "background .2s", marginTop: 2,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18,
          borderRadius: "50%", background: "white", transition: "left .2s",
          boxShadow: "0 1px 4px rgba(0,0,0,.25)",
        }} />
      </button>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>{label}</p>
        {description && <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginTop: 3, lineHeight: 1.5 }}>{description}</p>}
      </div>
    </div>
  );
}

/* ── Number field ── */
function NumInput({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
        style={{
          padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14,
          outline: "none", width: "100%",
        }}
      />
    </div>
  );
}

export default function WidgetPage({ params }: PageProps) {
  const { clinicId } = use(params);

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  /* ── New bubble inputs ── */
  const [newBubbleTr, setNewBubbleTr] = useState("");
  const [newBubbleEn, setNewBubbleEn] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "widgetSettings", clinicId));
        if (snap.exists()) {
          const data = snap.data() as WidgetSettings;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data,
            showBubbles: { ...DEFAULT_BUBBLES, ...data.showBubbles,
              messages: { ...DEFAULT_BUBBLES.messages, ...data.showBubbles?.messages },
              timing: { ...DEFAULT_BUBBLES.timing, ...data.showBubbles?.timing },
              behavior: { ...DEFAULT_BUBBLES.behavior, ...data.showBubbles?.behavior },
            },
          });
        }
      } catch (err) { console.error("Widget settings fetch error:", err); }
      finally { setLoading(false); }
    })();
  }, [clinicId]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    setErrMsg("");
    try {
      await setDoc(doc(db, "widgetSettings", clinicId), { ...settings, updatedAt: serverTimestamp() });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Kaydedilemedi.");
      setSaveStatus("error");
    } finally { setIsSaving(false); }
  };

  /* ── Bubble helpers ── */
  const bubbles = settings.showBubbles ?? DEFAULT_BUBBLES;

  const setBubbles = (partial: Partial<ShowBubblesConfig>) =>
    setSettings(s => ({ ...s, showBubbles: { ...(s.showBubbles ?? DEFAULT_BUBBLES), ...partial } }));

  const setTiming = (key: keyof ShowBubblesConfig["timing"], val: number) =>
    setBubbles({ timing: { ...bubbles.timing, [key]: val } });

  const setBehavior = (key: keyof ShowBubblesConfig["behavior"], val: boolean) =>
    setBubbles({ behavior: { ...bubbles.behavior, [key]: val } });

  const updateMsg = (lang: "tr" | "en", idx: number, val: string) => {
    const msgs = [...(bubbles.messages[lang] ?? [])];
    msgs[idx] = val;
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
  };

  const deleteMsg = (lang: "tr" | "en", idx: number) => {
    const msgs = (bubbles.messages[lang] ?? []).filter((_, i) => i !== idx);
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
  };

  const addMsg = (lang: "tr" | "en") => {
    const val = lang === "tr" ? newBubbleTr.trim() : newBubbleEn.trim();
    if (!val) return;
    const msgs = [...(bubbles.messages[lang] ?? []), val];
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
    lang === "tr" ? setNewBubbleTr("") : setNewBubbleEn("");
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14 }}>Yükleniyor…</p>
      </div>
    );
  }

  const inputRowStyle: React.CSSProperties = { display: "flex", gap: 8 };
  const msgInputStyle: React.CSSProperties = {
    flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none",
  };
  const msgTagStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px",
    border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary,
  };

  return (
    <div style={{ padding: "8px 0" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
            Web Widget Yapılandırması
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
            Chatbot'un web sitenizde nasıl görüneceğini ve davranacağını özelleştirin.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saveStatus === "success" && (
            <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>✓ Kaydedildi!</span>
          )}
          {saveStatus === "error" && (
            <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>✗ {errMsg}</span>
          )}
          <Button
            onClick={handleSave}
            isLoading={isSaving}
            style={{
              minWidth: 160,
              background: saveStatus === "success" ? "#10b98120" : undefined,
              color: saveStatus === "success" ? "#10b981" : undefined,
            }}
          >
            <Save size={16} style={{ marginRight: 6 }} />
            Ayarları Kaydet
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 32, alignItems: "start" }}>
        {/* ── Left: Settings ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Görünüm */}
          <SectionCard title="Genel Görünüm" icon={<Palette size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Input
                label="Widget Başlığı"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="örn: Klinik Asistanı"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ana Renk
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{ width: 42, height: 42, border: "none", borderRadius: 8, padding: 0, background: "none", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary, outline: "none" }}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Mesajlar */}
          <SectionCard title="Mesajlar ve İçerik" icon={<MessageCircle size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Input
                label="Karşılama Mesajı"
                value={settings.welcomeMessage}
                onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                placeholder="Size nasıl yardımcı olabilirim?"
              />
              <Input
                label="Giriş Alanı Metni"
                value={settings.placeholder}
                onChange={(e) => setSettings({ ...settings, placeholder: e.target.value })}
                placeholder="Bir mesaj yazın..."
              />
            </div>
          </SectionCard>

          {/* Düzen */}
          <SectionCard title="Düzen ve Davranış" icon={<Layout size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Select
                label="Konum"
                value={settings.position}
                onChange={(e) => setSettings({ ...settings, position: e.target.value as any })}
                options={[
                  { label: "Sağ Alt", value: "bottom-right" },
                  { label: "Sol Alt", value: "bottom-left" },
                ]}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
                <Toggle
                  checked={settings.showAvatar}
                  onChange={(v) => setSettings({ ...settings, showAvatar: v })}
                  label="Avatar Göster"
                />
                <Toggle
                  checked={settings.showOnlineStatus}
                  onChange={(v) => setSettings({ ...settings, showOnlineStatus: v })}
                  label="Çevrimiçi Durumu Göster"
                />
              </div>
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════
              SHOW BUBBLES SECTION
          ═══════════════════════════════════════ */}
          <SectionCard title="Öneri Balonları (Show Bubbles)" icon={<Sparkles size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

              {/* Enable toggle */}
              <Toggle
                checked={bubbles.enabled}
                onChange={(v) => setBubbles({ enabled: v })}
                label="Öneri Balonlarını Etkinleştir"
                description="Widget açılmadan önce küçük öneri balonları gösterir ve ziyaretçiyi etkileşime yönlendirir."
              />

              {/* Display mode */}
              <Select
                label="Gösterim Modu"
                value={bubbles.displayMode}
                onChange={(e) => setBubbles({ displayMode: e.target.value as ShowBubblesConfig["displayMode"] })}
                options={[
                  { label: "Sırayla Göster (Rotate)", value: "rotate" },
                  { label: "Tümünü Göster", value: "show-all" },
                  { label: "Devre Dışı", value: "disabled" },
                ]}
              />

              {/* Messages — Turkish */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Türkçe Balonlar
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bubbles.messages.tr.map((msg, i) => (
                    <div key={i} style={msgTagStyle}>
                      <input
                        value={msg}
                        onChange={(e) => updateMsg("tr", i, e.target.value)}
                        style={{ background: "none", border: "none", flex: 1, color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none" }}
                      />
                      <button onClick={() => deleteMsg("tr", i)} style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div style={inputRowStyle}>
                    <input value={newBubbleTr} onChange={e => setNewBubbleTr(e.target.value)} placeholder="Yeni Türkçe balon ekle…" style={msgInputStyle}
                      onKeyDown={e => e.key === "Enter" && addMsg("tr")} />
                    <button onClick={() => addMsg("tr")} style={{ background: UI_COLORS.brand, border: "none", borderRadius: 10, padding: "0 14px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages — English */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  İngilizce Balonlar
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bubbles.messages.en.map((msg, i) => (
                    <div key={i} style={msgTagStyle}>
                      <input
                        value={msg}
                        onChange={(e) => updateMsg("en", i, e.target.value)}
                        style={{ background: "none", border: "none", flex: 1, color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none" }}
                      />
                      <button onClick={() => deleteMsg("en", i)} style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div style={inputRowStyle}>
                    <input value={newBubbleEn} onChange={e => setNewBubbleEn(e.target.value)} placeholder="Add new English bubble…" style={msgInputStyle}
                      onKeyDown={e => e.key === "Enter" && addMsg("en")} />
                    <button onClick={() => addMsg("en")} style={{ background: UI_COLORS.brand, border: "none", borderRadius: 10, padding: "0 14px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Timing */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Zamanlama Ayarları (saniye)
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <NumInput label="İlk Gecikme" value={bubbles.timing.initialDelaySeconds} onChange={(v) => setTiming("initialDelaySeconds", v)} />
                  <NumInput label="Döngü Süresi" value={bubbles.timing.rotationIntervalSeconds} onChange={(v) => setTiming("rotationIntervalSeconds", v)} min={1} />
                  <NumInput label="Otomatik Gizle" value={bubbles.timing.autoHideSeconds} onChange={(v) => setTiming("autoHideSeconds", v)} />
                </div>
              </div>

              {/* Behavior */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
                  Davranış Ayarları
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Toggle
                    checked={bubbles.behavior.hideAfterOpen}
                    onChange={(v) => setBehavior("hideAfterOpen", v)}
                    label="Widget Açılınca Gizle"
                    description="Kullanıcı asistanı açtığında balonlar kaybolur."
                  />
                  <Toggle
                    checked={bubbles.behavior.showOncePerSession}
                    onChange={(v) => setBehavior("showOncePerSession", v)}
                    label="Oturum Başına Bir Kez Göster"
                    description="Balonlar her oturumda yalnızca bir kez gösterilir."
                  />
                  <Toggle
                    checked={bubbles.behavior.disableOnMobile}
                    onChange={(v) => setBehavior("disableOnMobile", v)}
                    label="Mobilde Devre Dışı Bırak"
                    description="Mobil cihazlarda balonlar gösterilmez."
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <WidgetIntegration clinicId={clinicId} />
        </div>

        {/* ── Right: Preview ── */}
        <div style={{ position: "sticky", top: 32 }}>
          <WidgetPreview settings={settings} />
        </div>
      </div>

      <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
