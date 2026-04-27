"use client";

import { use, useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, Save, PlayCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import type { PromptSettings } from "@/lib/types";
import AITestModal from "./AITestModal";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

const DEFAULT_SETTINGS: PromptSettings = {
  systemPrompt: "You are a helpful AI assistant for this clinic...",
  welcomeMessage: "Hello! How can I assist you today?",
  fallbackMessage: "I'm not sure I understood that. Could you rephrase? Or call us directly at our clinic number.",
  model: "gpt-4o",
  temperature: 0.7,
  qualityCriteria: {
    accuracy: true,
    noGuessing: true,
    appointmentRouting: true,
    patientSatisfaction: true,
    consistency: true,
    fastResolution: true,
  }
};

const CRITERIA_UI = [
  { id: "accuracy", label: "Doğru ve Net Yanıt", desc: "Kullanıcıya karmaşık olmayan, doğrudan ve anlaşılır cevaplar verir." },
  { id: "noGuessing", label: "Gereksiz Tahmin Yapmaz", desc: "Emin olmadığı veya tıbbi teşhis gerektiren durumlarda varsayım yapmaz." },
  { id: "appointmentRouting", label: "Randevuya Yönlendirir", desc: "Uygun durumlarda hastayı kliniğe gelmesi veya randevu alması için teşvik eder." },
  { id: "patientSatisfaction", label: "Hasta Memnuniyeti", desc: "Empatik, kibar ve hastanın endişelerini anlayan profesyonel bir üslup kullanır." },
  { id: "consistency", label: "Tutarlılık", desc: "Klinik politikaları ve kurallar konusunda çelişkili bilgiler vermez." },
  { id: "fastResolution", label: "Hızlı Çözüm", desc: "Sorunu uzatmadan, en kısa yoldan çözüme kavuşturacak yönlendirmeleri yapar." },
] as const;

export default function PromptStudioPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();

  const [settings, setSettings] = useState<PromptSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "promptSettings", clinicId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as PromptSettings;
          setSettings({ 
            ...DEFAULT_SETTINGS, 
            ...data,
            qualityCriteria: {
              ...(DEFAULT_SETTINGS.qualityCriteria as any),
              ...(data.qualityCriteria || {})
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch prompt settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [clinicId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, "promptSettings", clinicId);
      
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCriteria = (id: "accuracy" | "noGuessing" | "appointmentRouting" | "patientSatisfaction" | "consistency" | "fastResolution") => {
    setSettings(prev => ({
      ...prev,
      qualityCriteria: {
        ...(prev.qualityCriteria as any),
        [id]: !prev.qualityCriteria?.[id]
      }
    }));
  };

  const modelOptions = [
    { value: "gpt-4o", label: "GPT-4o (Recommended)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ];

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <>
      <SectionCard
        title="AI Karakteri ve Üslubu (System Prompt)"
        subtitle="Asistanın temel kişiliğini, kliniğin uzmanlık alanını ve iletişim dilini belirleyin."
      >
        <Textarea 
          label="Sistem Talimatı" 
          value={settings.systemPrompt} 
          onChange={e => setSettings({ ...settings, systemPrompt: e.target.value })} 
          rows={6} 
          style={{ minHeight: 120 }}
          placeholder="Örn: Sen bu klinik için çalışan profesyonel ve yardımsever bir yapay zeka asistanısın..."
        />
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          {settings.systemPrompt.length} karakter · Bu alan sadece asistanın kimliğini belirler. Davranış kuralları için aşağıdaki bölümü kullanın.
        </p>
      </SectionCard>

      <SectionCard
        title="Davranış ve Kalite Ayarları"
        subtitle="Yapay zekanın hastalarla kuracağı iletişimin sınırlarını ve hedeflerini belirleyin."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {CRITERIA_UI.map((criteria) => {
            const isActive = settings.qualityCriteria?.[criteria.id as keyof typeof settings.qualityCriteria];
            return (
              <div 
                key={criteria.id}
                onClick={() => handleToggleCriteria(criteria.id as any)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "16px",
                  background: isActive ? "rgba(99, 102, 241, 0.04)" : UI_COLORS.bgCard,
                  border: `1px solid ${isActive ? "rgba(99, 102, 241, 0.3)" : UI_COLORS.border}`,
                  borderRadius: 16,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: isActive ? "0 4px 12px rgba(99, 102, 241, 0.05)" : "none"
                }}
              >
                {/* Custom Toggle Switch */}
                <div style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: isActive ? UI_COLORS.brand : "rgba(255,255,255,0.1)",
                  position: "relative",
                  transition: "background 0.3s ease",
                  border: isActive ? "none" : `1px solid ${UI_COLORS.border}`,
                  marginTop: 2
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    background: "#fff",
                    position: "absolute", top: isActive ? 3 : 2,
                    left: isActive ? 19 : 2,
                    transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                  }} />
                </div>
                
                <div>
                  <h4 style={{ fontSize: 14.5, fontWeight: 700, color: isActive ? UI_COLORS.brand : UI_COLORS.textPrimary, marginBottom: 4, transition: "color 0.2s" }}>
                    {criteria.label}
                  </h4>
                  <p style={{ fontSize: 12.5, color: UI_COLORS.textSecondary, lineHeight: 1.4 }}>
                    {criteria.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Messages">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Input 
            label="Welcome Message" 
            value={settings.welcomeMessage} 
            onChange={e => setSettings({ ...settings, welcomeMessage: e.target.value })} 
            placeholder="Hello! How can I assist you today?" 
          />
          <Input 
            label="Fallback Message" 
            value={settings.fallbackMessage} 
            onChange={e => setSettings({ ...settings, fallbackMessage: e.target.value })} 
            placeholder="I didn't understand that. Could you rephrase?" 
          />
        </div>
      </SectionCard>

      <SectionCard title="Model & Behavior">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Select 
            label="AI Model" 
            value={settings.model} 
            onChange={e => setSettings({ ...settings, model: e.target.value })} 
            options={modelOptions}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Temperature: {settings.temperature}
            </label>
            <input type="range" min="0" max="1" step="0.1" value={settings.temperature}
              onChange={e => setSettings({ ...settings, temperature: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--brand)", marginTop: 10 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
              <span>Precise</span><span>Creative</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
        <Button 
          variant="secondary"
          onClick={() => setIsTestModalOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <PlayCircle size={18} />
          {t("aiSettings.testAI")}
        </Button>
        <Button 
          onClick={handleSave} 
          isLoading={isSaving}
          variant={saveSuccess ? "secondary" : "primary"}
          style={{ 
            minWidth: 160,
            ...(saveSuccess ? { color: "#34d399", background: "rgba(16,185,129,0.2)", border: "none" } : {})
          }}
        >
          {saveSuccess ? (
            "✓ Saved"
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Save size={18} />
              Save Prompt Settings
            </div>
          )}
        </Button>
      </div>

      <AITestModal 
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        clinicId={clinicId}
        settings={settings}
      />

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}