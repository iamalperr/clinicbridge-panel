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
  systemPrompt: "You are a helpful AI assistant for this clinic. You assist patients with appointment scheduling, general inquiries about services, pricing information, and basic medical guidance. Always be professional, empathetic, and clear. Do not provide specific medical diagnoses. If the patient's question is urgent or medical, advise them to contact the clinic directly.",
  welcomeMessage: "Hello! How can I assist you today?",
  fallbackMessage: "I'm not sure I understood that. Could you rephrase? Or call us directly at our clinic number.",
  model: "gpt-4o",
  temperature: 0.7,
};

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
          setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() } as PromptSettings);
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
        title="System Prompt"
        subtitle="The core instruction set that defines your AI assistant's persona and behavior."
      >
        <Textarea 
          label="System Prompt" 
          value={settings.systemPrompt} 
          onChange={e => setSettings({ ...settings, systemPrompt: e.target.value })} 
          rows={8} 
          style={{ minHeight: 140 }}
        />
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          {settings.systemPrompt.length} characters · Be specific about the clinic&apos;s specialty, tone, and limitations.
        </p>
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