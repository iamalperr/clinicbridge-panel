"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import SectionCard from "@/components/ui/SectionCard";
import { Loader2, Save, Layout, Palette, MessageCircle, Sparkles, Plus, Trash2, GripVertical } from "lucide-react";
import type { WidgetSettings, ShowBubblesConfig, QuickAction, QuickActionType } from "@/lib/types";
import WidgetPreview from "./WidgetPreview";
import WidgetIntegration from "./WidgetIntegration";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const ACTION_TYPE_OPTIONS: { value: QuickActionType; label: string }[] = [
  { value: "appointment_request",  label: "📅 Randevu Talebi" },
  { value: "treatment_info",       label: "🦷 Tedavi Bilgisi" },
  { value: "describe_complaint",   label: "💬 Şikayet/Belirti" },
  { value: "clinic_services",      label: "🏥 Klinik Hizmetleri" },
  { value: "pricing_info",         label: "💰 Fiyat Bilgisi" },
  { value: "contact_request",      label: "📞 İletişim / Destek" },
  { value: "custom_prompt",        label: "✏️ Özel Mesaj" },
];

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa_1", emoji: "📅", labelTR: "Randevu talebi oluştur",        labelEN: "Create appointment request", actionType: "appointment_request", isActive: true, sortOrder: 0 },
  { id: "qa_2", emoji: "🦷", labelTR: "Tedaviler hakkında bilgi al",   labelEN: "Learn about treatments",      actionType: "treatment_info",       isActive: true, sortOrder: 1 },
  { id: "qa_3", emoji: "💬", labelTR: "Şikayetimi anlatmak istiyorum", labelEN: "Describe my concern",         actionType: "describe_complaint",   isActive: true, sortOrder: 2 },
];

/* ── Sortable Quick Action Row ── */
function SortableQuickActionItem({
  action, onUpdate, onDelete, actionTypeOptions,
}: {
  action: QuickAction;
  onUpdate: (updated: QuickAction) => void;
  onDelete: () => void;
  actionTypeOptions: { value: QuickActionType; label: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: action.id });

  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${isDragging ? UI_COLORS.brand : action.isActive ? "rgba(99,102,241,0.3)" : UI_COLORS.border}`,
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    opacity: isDragging ? 0.85 : action.isActive ? 1 : 0.55,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,.2)" : "none",
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
  };

  const inpStyle: React.CSSProperties = {
    flex: 1, padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)",
    color: UI_COLORS.textPrimary, fontSize: 13, outline: "none",
  };

  return (
    <div ref={setNodeRef} style={containerStyle}>
      {/* Row 1: drag + emoji + labels + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span {...attributes} {...listeners}
          style={{ cursor: "grab", color: UI_COLORS.textMuted, flexShrink: 0, touchAction: "none" }}>
          <GripVertical size={15} />
        </span>
        <input
          value={action.emoji}
          onChange={e => onUpdate({ ...action, emoji: e.target.value })}
          style={{ ...inpStyle, flex: "0 0 44px", textAlign: "center", fontSize: 18 }}
          placeholder="📅"
        />
        <input
          value={action.labelTR}
          onChange={e => onUpdate({ ...action, labelTR: e.target.value })}
          style={inpStyle}
          placeholder="Türkçe etiket"
        />
        <input
          value={action.labelEN}
          onChange={e => onUpdate({ ...action, labelEN: e.target.value })}
          style={inpStyle}
          placeholder="English label"
        />
        {/* Active toggle */}
        <button
          onClick={() => onUpdate({ ...action, isActive: !action.isActive })}
          title={action.isActive ? "Devre dışı bırak" : "Etkinleştir"}
          style={{
            width: 34, height: 20, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0,
            background: action.isActive ? UI_COLORS.brand : "rgba(255,255,255,0.1)",
            position: "relative", transition: "background .2s",
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: action.isActive ? 17 : 3,
            width: 14, height: 14, borderRadius: "50%", background: "white",
            transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }} />
        </button>
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, flexShrink: 0 }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {/* Row 2: action type + optional custom prompt */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 26 }}>
        <select
          value={action.actionType}
          onChange={e => onUpdate({ ...action, actionType: e.target.value as QuickActionType })}
          style={{
            flex: "0 0 220px", padding: "7px 10px", borderRadius: 8,
            border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)",
            color: UI_COLORS.textPrimary, fontSize: 13, outline: "none", cursor: "pointer",
          }}
        >
          {actionTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {action.actionType === "custom_prompt" && (
          <input
            value={action.customPrompt ?? ""}
            onChange={e => onUpdate({ ...action, customPrompt: e.target.value })}
            placeholder="Özel mesaj metni…"
            style={{ ...inpStyle }}
          />
        )}
      </div>
    </div>
  );
}


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

/* ── Sortable bubble row ── */
function SortableBubbleItem({
  id, value, onChange, onDelete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: isDragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: "8px 12px",
    border: `1px solid ${isDragging ? UI_COLORS.brand : UI_COLORS.border}`,
    fontSize: 13.5,
    color: UI_COLORS.textPrimary,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,.25)" : "none",
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
    cursor: "default",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        title="Sürükle"
        style={{
          cursor: "grab",
          color: UI_COLORS.textMuted,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          touchAction: "none",
          padding: "2px 0",
        }}
      >
        <GripVertical size={15} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "none",
          border: "none",
          flex: 1,
          color: UI_COLORS.textPrimary,
          fontSize: 13.5,
          outline: "none",
          minWidth: 0,
        }}
      />
      <button
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: UI_COLORS.textMuted,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ── Sortable bubble list ── */
function SortableBubbleList({
  lang, items, onUpdate, onDelete, onReorder,
  newVal, onNewValChange, onAdd,
}: {
  lang: "tr" | "en";
  items: string[];
  onUpdate: (idx: number, val: string) => void;
  onDelete: (idx: number) => void;
  onReorder: (newItems: string[]) => void;
  newVal: string;
  onNewValChange: (v: string) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Stable IDs: index-based prefixed with lang
  const ids = items.map((_, i) => `${lang}-${i}`);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx));
    }
  }, [ids, items, onReorder]);

  const inputRowStyle: React.CSSProperties = { display: "flex", gap: 8, marginTop: 4 };
  const msgInputStyle: React.CSSProperties = {
    flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((msg, i) => (
            <SortableBubbleItem
              key={ids[i]}
              id={ids[i]}
              value={msg}
              onChange={(v) => onUpdate(i, v)}
              onDelete={() => onDelete(i)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div style={inputRowStyle}>
        <input
          value={newVal}
          onChange={(e) => onNewValChange(e.target.value)}
          placeholder={lang === "tr" ? "Yeni Türkçe balon ekle…" : "Add new English bubble…"}
          style={msgInputStyle}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
        />
        <button
          onClick={onAdd}
          style={{ background: UI_COLORS.brand, border: "none", borderRadius: 10, padding: "0 14px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 4 }}
        >
          <Plus size={16} />
        </button>
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
          if (data.quickActions && data.quickActions.length > 0) {
            setQuickActions(data.quickActions);
          }
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
      await setDoc(doc(db, "widgetSettings", clinicId), { ...settings, quickActions, updatedAt: serverTimestamp() });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Kaydedilemedi.");
      setSaveStatus("error");
    } finally { setIsSaving(false); }
  };

  /* ── Quick actions state ── */
  const [quickActions, setQuickActions] = useState<QuickAction[]>(DEFAULT_QUICK_ACTIONS);

  const qaIds = quickActions.map(a => a.id);
  const qaSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleQaDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = qaIds.indexOf(active.id as string);
    const newIdx = qaIds.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      setQuickActions(qs => arrayMove(qs, oldIdx, newIdx).map((q, i) => ({ ...q, sortOrder: i })));
    }
  }, [qaIds]);

  const addQuickAction = () => {
    const newAction: QuickAction = {
      id: `qa_${Date.now()}`,
      emoji: "💬",
      labelTR: "",
      labelEN: "",
      actionType: "custom_prompt",
      isActive: true,
      sortOrder: quickActions.length,
    };
    setQuickActions(qs => [...qs, newAction]);
  };

  const updateQuickAction = (id: string, updated: QuickAction) =>
    setQuickActions(qs => qs.map(q => q.id === id ? updated : q));

  const deleteQuickAction = (id: string) =>
    setQuickActions(qs => qs.filter(q => q.id !== id).map((q, i) => ({ ...q, sortOrder: i })));
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

  const reorderMsg = (lang: "tr" | "en", newItems: string[]) =>
    setBubbles({ messages: { ...bubbles.messages, [lang]: newItems } });

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
                <SortableBubbleList
                  lang="tr"
                  items={bubbles.messages.tr}
                  onUpdate={(idx, val) => updateMsg("tr", idx, val)}
                  onDelete={(idx) => deleteMsg("tr", idx)}
                  onReorder={(items) => reorderMsg("tr", items)}
                  newVal={newBubbleTr}
                  onNewValChange={setNewBubbleTr}
                  onAdd={() => addMsg("tr")}
                />
              </div>

              {/* Messages — English */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  İngilizce Balonlar
                </p>
                <SortableBubbleList
                  lang="en"
                  items={bubbles.messages.en}
                  onUpdate={(idx, val) => updateMsg("en", idx, val)}
                  onDelete={(idx) => deleteMsg("en", idx)}
                  onReorder={(items) => reorderMsg("en", items)}
                  newVal={newBubbleEn}
                  onNewValChange={setNewBubbleEn}
                  onAdd={() => addMsg("en")}
                />
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

          {/* ── Quick Actions Section ── */}
          <SectionCard
            title="Başlangıç Hızlı Komutları"
            subtitle="Ziyaretçilere widgetin açılışında sunulan hazır aksiyonlar."
            icon={<Sparkles size={18} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, lineHeight: 1.6, marginBottom: 4 }}>
                Her klinik için başlangıç hızlı aksiyon butonlarını özelleştirin. WhatsApp, canlı destek talebi veya acil semptom durumlarında görünür — başlangıç listesine eklemeyin.
              </p>

              <DndContext sensors={qaSensors} collisionDetection={closestCenter} onDragEnd={handleQaDragEnd}>
                <SortableContext items={qaIds} strategy={verticalListSortingStrategy}>
                  {quickActions.map(action => (
                    <SortableQuickActionItem
                      key={action.id}
                      action={action}
                      onUpdate={(updated) => updateQuickAction(action.id, updated)}
                      onDelete={() => deleteQuickAction(action.id)}
                      actionTypeOptions={ACTION_TYPE_OPTIONS}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={addQuickAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 16px", borderRadius: 10, border: `1.5px dashed ${UI_COLORS.border}`,
                  background: "none", color: UI_COLORS.textMuted, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "border-color .2s, color .2s", alignSelf: "flex-start",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = UI_COLORS.brand; (e.currentTarget as HTMLButtonElement).style.borderColor = UI_COLORS.brand; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = UI_COLORS.textMuted; (e.currentTarget as HTMLButtonElement).style.borderColor = UI_COLORS.border; }}
              >
                <Plus size={16} /> Yeni Hızlı Komut Ekle
              </button>

              {/* Column headers */}
              <div style={{ display: "flex", gap: 8, paddingLeft: 26, fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span style={{ flex: "0 0 44px", textAlign: "center" }}>Emoji</span>
                <span style={{ flex: 1 }}>Türkçe</span>
                <span style={{ flex: 1 }}>İngilizce</span>
                <span style={{ flex: "0 0 60px" }}>Aktif</span>
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
