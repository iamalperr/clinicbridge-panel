"use client";

import { use, useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import SectionCard from "@/components/ui/SectionCard";
import { Loader2, Save, Layout, Palette, MessageCircle, Settings2 } from "lucide-react";
import type { WidgetSettings } from "@/lib/types";
import WidgetPreview from "./WidgetPreview";
import WidgetIntegration from "./WidgetIntegration";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

const DEFAULT_SETTINGS: WidgetSettings = {
  title: "Clinic Assistant",
  welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
  primaryColor: "#6366f1",
  position: "bottom-right",
  showAvatar: true,
  showOnlineStatus: true,
  placeholder: "Bir mesaj yazın...",
};

export default function WidgetPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "widgetSettings", clinicId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() } as WidgetSettings);
        }
      } catch (err) {
        console.error("Failed to fetch widget settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [clinicId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, "widgetSettings", clinicId);
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

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
            Widget Configuration
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
            Customize how your chatbot looks and behaves on your website.
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          isLoading={isSaving} 
          variant={saveSuccess ? "ghost" : "primary"}
          style={{ 
            minWidth: 160, 
            background: saveSuccess ? "#10b98120" : undefined,
            color: saveSuccess ? "#10b981" : undefined,
            borderColor: saveSuccess ? "#10b98140" : undefined
          }}
        >
          {saveSuccess ? (
            "Settings Saved!"
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Save size={18} />
              Save Settings
            </div>
          )}
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 32, alignItems: "start" }}>
        {/* Left Column: Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <SectionCard title="General Appearance" icon={<Palette size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Input 
                label="Widget Title" 
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="e.g. Clinic Assistant"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Primary Color
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input 
                    type="color" 
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{
                      width: 42, height: 42, border: "none", borderRadius: 8, padding: 0, 
                      background: "none", cursor: "pointer", overflow: "hidden"
                    }}
                  />
                  <input 
                    type="text" 
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 10,
                      background: "rgba(255, 255, 255, 0.03)", border: `1px solid ${UI_COLORS.border}`,
                      fontSize: 13.5, color: UI_COLORS.textPrimary, outline: "none", textTransform: "uppercase"
                    }}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Messages & Content" icon={<MessageCircle size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Input 
                label="Welcome Message" 
                value={settings.welcomeMessage}
                onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                placeholder="How can I help you today?"
              />
              <Input 
                label="Input Placeholder" 
                value={settings.placeholder}
                onChange={(e) => setSettings({ ...settings, placeholder: e.target.value })}
                placeholder="Type a message..."
              />
            </div>
          </SectionCard>

          <SectionCard title="Layout & Behavior" icon={<Layout size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Select 
                label="Position"
                value={settings.position}
                onChange={(e) => setSettings({ ...settings, position: e.target.value as any })}
                options={[
                  { label: "Bottom Right", value: "bottom-right" },
                  { label: "Bottom Left", value: "bottom-left" },
                ]}
              />
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
                <label style={{ 
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary 
                }}>
                  <input 
                    type="checkbox" 
                    checked={settings.showAvatar}
                    onChange={(e) => setSettings({ ...settings, showAvatar: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: UI_COLORS.brand }}
                  />
                  Show Assistant Avatar
                </label>
                <label style={{ 
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary 
                }}>
                  <input 
                    type="checkbox" 
                    checked={settings.showOnlineStatus}
                    onChange={(e) => setSettings({ ...settings, showOnlineStatus: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: UI_COLORS.brand }}
                  />
                  Show Online Status
                </label>
              </div>
            </div>
          </SectionCard>

          <WidgetIntegration clinicId={clinicId} />
        </div>

        {/* Right Column: Sticky Preview */}
        <div style={{ position: "sticky", top: 32 }}>
          <WidgetPreview settings={settings} />
        </div>
      </div>

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

